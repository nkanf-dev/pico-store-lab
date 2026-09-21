package dev.nkanf.picostore

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.MessageDigest
import java.util.LinkedHashMap

private const val MAX_IMAGE_BYTES = 10 * 1024 * 1024
private const val MAX_DISK_BYTES = 64L * 1024 * 1024
private const val CONNECT_TIMEOUT_MS = 10_000
private const val READ_TIMEOUT_MS = 10_000
private const val MAX_IMAGE_DIMENSION = 2048

internal fun normalizedImageUrl(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    val uri = runCatching { URI(raw) }.getOrNull() ?: return null
    val host = uri.host?.lowercase() ?: return null
    if (uri.scheme?.lowercase() !in setOf("http", "https") || host.isBlank()) return null
    return uri.normalize().toASCIIString().substringBefore('#')
}

internal fun imageCacheKey(url: String): String = MessageDigest.getInstance("SHA-256")
    .digest(url.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte) }

internal class ImageBytesCache(
    private val directory: File,
    private val fetcher: suspend (String) -> ByteArray?,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO + CoroutineName("pico-image-cache")),
    private val maxMemoryBytes: Long = 8L * 1024 * 1024,
    private val maxDiskBytes: Long = MAX_DISK_BYTES,
    private val validator: (ByteArray) -> Boolean = { true },
) : Closeable {
    private val lock = Any()
    private val memory = LinkedHashMap<String, ByteArray>(16, .75f, true)
    private val inFlight = HashMap<String, Deferred<ByteArray?>>()
    private var memoryBytes = 0L

    init {
        directory.mkdirs()
    }

    suspend fun load(rawUrl: String): ByteArray? {
        val url = normalizedImageUrl(rawUrl) ?: return null
        val key = imageCacheKey(url)
        var cached: ByteArray? = null
        var deferred: Deferred<ByteArray?>? = null
        synchronized(lock) {
            cached = memory[key]
            if (cached == null) {
                deferred = inFlight[key] ?: scope.async(start = CoroutineStart.LAZY) {
                    try {
                        loadUncached(key, url)
                    } finally {
                        synchronized(lock) { inFlight.remove(key) }
                    }
                }.also { inFlight[key] = it }
            }
        }
        cached?.let { return it }
        return deferred!!.await()
    }

    private suspend fun loadUncached(key: String, url: String): ByteArray? {
        readDisk(key)?.let { bytes ->
            if (validator(bytes)) {
                putMemory(key, bytes)
                return bytes
            }
            diskFile(key).delete()
        }
        val bytes = fetcher(url)?.takeIf {
            it.isNotEmpty() && it.size <= MAX_IMAGE_BYTES && validator(it)
        } ?: return null
        putMemory(key, bytes)
        writeDisk(key, bytes)
        return bytes
    }

    private fun putMemory(key: String, bytes: ByteArray) {
        synchronized(lock) {
            memory.remove(key)?.let { memoryBytes -= it.size }
            if (bytes.size > maxMemoryBytes) return
            memory[key] = bytes
            memoryBytes += bytes.size
            val iterator = memory.entries.iterator()
            while (memoryBytes > maxMemoryBytes && iterator.hasNext()) {
                val removed = iterator.next().value
                iterator.remove()
                memoryBytes -= removed.size
            }
        }
    }

    private fun diskFile(key: String): File = File(directory, "$key.bin")

    private fun readDisk(key: String): ByteArray? {
        val file = diskFile(key)
        if (!file.isFile || file.length() <= 0 || file.length() > MAX_IMAGE_BYTES) {
            if (file.exists()) file.delete()
            return null
        }
        return runCatching {
            file.readBytes().also { file.setLastModified(System.currentTimeMillis()) }
        }.getOrNull()
    }

    private fun writeDisk(key: String, bytes: ByteArray) {
        val temporary = File(directory, "$key.${System.nanoTime()}.tmp")
        runCatching {
            temporary.writeBytes(bytes)
            synchronized(lock) {
                val destination = diskFile(key)
                if (destination.exists()) destination.delete()
                if (!temporary.renameTo(destination)) temporary.delete()
                trimDisk()
            }
        }.onFailure { temporary.delete() }
    }

    private fun trimDisk() {
        val files = directory.listFiles { file -> file.isFile && file.name.endsWith(".bin") }
            ?.sortedBy { it.lastModified() }
            .orEmpty()
        var total = files.sumOf { it.length() }
        for (file in files) {
            if (total <= maxDiskBytes) break
            val size = file.length()
            if (file.delete()) total -= size
        }
    }

    override fun close() {
        scope.cancel()
        synchronized(lock) {
            inFlight.clear()
            memory.clear()
            memoryBytes = 0
        }
    }
}

class StoreImageLoader(context: Context) : Closeable {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO + CoroutineName("pico-image-loader"))
    private val bytes = ImageBytesCache(
        File(context.cacheDir, "store-images"),
        ::fetchImageBytes,
        scope,
        validator = ::isDecodableImage,
    )
    private val bitmapCache = object : LruCache<String, Bitmap>(bitmapCacheSize()) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.allocationByteCount
    }

    suspend fun load(rawUrl: String?): Bitmap? {
        val url = normalizedImageUrl(rawUrl) ?: return null
        val key = imageCacheKey(url)
        bitmapCache.get(key)?.let { return it }
        val data = bytes.load(url) ?: return null
        val bitmap = decode(data) ?: return null
        bitmapCache.put(key, bitmap)
        return bitmap
    }

    override fun close() {
        bytes.close()
        scope.cancel()
        bitmapCache.evictAll()
    }

    private fun decode(data: ByteArray): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth / sample > MAX_IMAGE_DIMENSION || bounds.outHeight / sample > MAX_IMAGE_DIMENSION) {
            sample *= 2
        }
        return BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        })
    }

    private fun bitmapCacheSize(): Int {
        val eighth = (Runtime.getRuntime().maxMemory() / 8).coerceAtMost(32L * 1024 * 1024)
        return eighth.coerceAtLeast(8L * 1024 * 1024).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    }
}

private suspend fun fetchImageBytes(url: String): ByteArray? = withContext(Dispatchers.IO) {
    val connection = runCatching { URL(url).openConnection() as HttpURLConnection }.getOrNull() ?: return@withContext null
    try {
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = READ_TIMEOUT_MS
        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "image/*")
        if (connection.responseCode !in 200..299 || connection.contentLengthLong > MAX_IMAGE_BYTES) return@withContext null
        connection.inputStream.use { input ->
            val output = ByteArrayOutputStream(minOf(connection.contentLength.coerceAtLeast(0), MAX_IMAGE_BYTES))
            val buffer = ByteArray(16 * 1024)
            var total = 0
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                if (total > MAX_IMAGE_BYTES) return@withContext null
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        }
    } catch (_: Exception) {
        null
    } finally {
        connection.disconnect()
    }
}

private fun isDecodableImage(data: ByteArray): Boolean {
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(data, 0, data.size, options)
    return options.outWidth > 0 && options.outHeight > 0
}
