package dev.nkanf.picostore

import com.android.apksig.apk.ApkUtils
import dev.nkanf.picostore.sdk.DownloadInfo
import java.io.File
import java.io.FileOutputStream
import java.io.DataInputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.zip.ZipFile

internal class ApkDownloadException(val code: String, cause: Throwable? = null) : Exception(code, cause)

/** Reads identity without running this device's install-compatibility parser. */
internal object ApkIdentity {
    data class Identity(val packageName: String, val versionCode: Long)

    fun read(file: File): Identity = try {
        ZipFile(file).use { zip ->
            val entry = zip.getEntry("AndroidManifest.xml") ?: throw ApkDownloadException("apk_invalid")
            if (entry.size !in 1..1_048_576) throw ApkDownloadException("apk_invalid")
            val bytes = ByteArray(entry.size.toInt())
            DataInputStream(zip.getInputStream(entry)).use {
                it.readFully(bytes)
                if (it.read() != -1) throw ApkDownloadException("apk_invalid")
            }
            Identity(ApkUtils.getPackageNameFromBinaryAndroidManifest(ByteBuffer.wrap(bytes)),
                ApkUtils.getLongVersionCodeFromBinaryAndroidManifest(ByteBuffer.wrap(bytes)))
        }
    } catch (error: ApkDownloadException) { throw error }
    catch (error: Exception) { throw ApkDownloadException("apk_invalid", error) }

    fun requireMatch(file: File, info: DownloadInfo) {
        val actual = read(file)
        if (actual.packageName != info.packageName) throw ApkDownloadException("apk_package")
        if (actual.versionCode != info.versionCode) throw ApkDownloadException("apk_version")
    }
}

/** One completed, readable original per app, in app-owned storage on Android 10+. */
internal class ApkDownload(
    private val directory: File,
    private val open: (String) -> HttpURLConnection = { URL(it).openConnection() as HttpURLConnection },
    private val verifyIdentity: (File, DownloadInfo) -> Unit = ApkIdentity::requireMatch,
    private val availableBytes: (File) -> Long = { it.usableSpace },
    private val diagnostic: (String, Map<String, String>) -> Unit = { _, _ -> },
) {
    fun download(info: DownloadInfo, progress: (Long, Long?) -> Unit): File =
        synchronized(downloadLock) { downloadLocked(info, progress) }

    // Activity recreation creates a new downloader while the old worker can still
    // run. An instance monitor cannot protect their shared cache and partial path.
    private fun downloadLocked(info: DownloadInfo, progress: (Long, Long?) -> Unit): File {
        require(Regex("[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+").matches(info.packageName))
        require(info.versionCode > 0 && info.size > 0 && Regex("[a-fA-F0-9]{32}").matches(info.md5))
        require(info.url.startsWith("https://"))
        if (!directory.isDirectory && !directory.mkdirs()) throw ApkDownloadException("apk_storage")
        val output = File(directory, "${info.packageName}-${info.versionCode}-${info.md5.lowercase()}.apk")
        if (output.isFile) {
            if (matches(output, info)) {
                verifyOriginal(output, info)
                progress(info.size, info.size)
                return output
            }
            // Keep this file until a replacement is complete.
        }
        val partial = File(directory, output.name + ".part")
        var failure: Exception? = null
        repeat(3) { attempt ->
            try {
                diagnostic("download_attempt", mapOf("attempt" to (attempt + 1).toString()))
                if (Thread.currentThread().isInterrupted) throw ApkDownloadException("apk_cancelled")
                val digest = MessageDigest.getInstance("MD5")
                var received = 0L
                var reported = 0L
                val connection = open(info.url)
                try {
                    connection.connectTimeout = 60_000
                    connection.readTimeout = 60_000
                    connection.setRequestProperty("Accept-Encoding", "identity")
                    diagnostic("cdn_response", mapOf("httpStatus" to connection.responseCode.toString()))
                    if (connection.responseCode != 200) throw ApkDownloadException("apk_network")
                    if (connection.contentLengthLong > 0 && availableBytes(directory) < connection.contentLengthLong)
                        throw ApkDownloadException("apk_space")
                    progress(0, info.size)
                    val destination = try { FileOutputStream(partial) }
                        catch (error: IOException) { throw ApkDownloadException("apk_storage", error) }
                    destination.use { outputStream ->
                        connection.inputStream.use { input ->
                            val buffer = ByteArray(65_536)
                            while (true) {
                                if (Thread.currentThread().isInterrupted) throw ApkDownloadException("apk_cancelled")
                                val count = input.read(buffer)
                                if (count < 0) break
                                received += count
                                digest.update(buffer, 0, count)
                                try { outputStream.write(buffer, 0, count) }
                                catch (error: IOException) { throw ApkDownloadException("apk_storage", error) }
                                if (received - reported >= 1_048_576 || received == info.size) {
                                    progress(received, info.size)
                                    reported = received
                                }
                            }
                        }
                        try { outputStream.fd.sync() }
                        catch (error: IOException) { throw ApkDownloadException("apk_storage", error) }
                    }
                } finally { connection.disconnect() }
                verifyOriginal(partial, info)
                val actualMd5 = digest.digest().hex()
                diagnostic(if (received != info.size || !actualMd5.equals(info.md5, ignoreCase = true)) "metadata_difference" else "download_complete",
                    mapOf("expectedSize" to info.size.toString(), "actualSize" to received.toString(), "expectedMd5" to info.md5, "actualMd5" to actualMd5))
                try { Files.move(partial.toPath(), output.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING) }
                catch (error: IOException) { throw ApkDownloadException("apk_storage", error) }
                // Only discard this app's superseded verified downloads after the new one is ready.
                val older = Regex("${Regex.escape(info.packageName)}-[0-9]+-[a-f0-9]{32}\\.apk")
                directory.listFiles()?.filter { it != output && older.matches(it.name) }?.forEach { it.delete() }
                progress(received, received)
                return output
            } catch (error: ApkDownloadException) {
                if (error.code !in setOf("apk_network", "apk_transfer", "apk_invalid") || attempt == 2) throw error
                diagnostic("retrying_download", mapOf("reason" to error.code))
                failure = error
            }
            catch (error: InterruptedException) {
                Thread.currentThread().interrupt()
                throw ApkDownloadException("apk_cancelled", error)
            }
            catch (error: Exception) {
                failure = error
                if (attempt < 2) try { Thread.sleep((attempt + 1) * 1_000L) }
                catch (interrupted: InterruptedException) {
                    Thread.currentThread().interrupt()
                    throw ApkDownloadException("apk_cancelled", interrupted)
                }
            } finally { partial.delete() }
        }
        throw ApkDownloadException("apk_transfer", failure)
    }

    private fun verifyOriginal(file: File, info: DownloadInfo) {
        try { verifyIdentity(file, info) }
        catch (error: ApkDownloadException) {
            if (error.code !in setOf("apk_package", "apk_version")) throw error
            val actual = ApkIdentity.read(file)
            diagnostic(error.code, mapOf("actualPackage" to actual.packageName, "actualVersion" to actual.versionCode.toString(),
                "expectedPackage" to info.packageName, "expectedVersion" to info.versionCode.toString()))
        }
    }

    private fun matches(file: File, info: DownloadInfo): Boolean {
        if (file.length() != info.size) return false
        val digest = MessageDigest.getInstance("MD5")
        file.inputStream().use { input ->
            val buffer = ByteArray(65_536)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().hex().equals(info.md5, ignoreCase = true)
    }

    private companion object { val downloadLock = Any() }
}

/** Optional adaptation cannot prevent installation of a verified original. */
internal fun inspectForAdaptation(choice: InstallVariant?, inspect: () -> InspectedApp): InspectedApp? {
    if (choice == InstallVariant.ORIGINAL) return null
    return try { inspect() } catch (error: Exception) {
        if (choice == InstallVariant.ADAPTED) throw error
        null
    }
}
