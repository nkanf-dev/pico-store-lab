package dev.nkanf.picostore

import com.android.apksig.apk.ApkUtils
import dev.nkanf.picostore.sdk.DownloadInfo
import java.io.File
import java.io.FileOutputStream
import java.io.DataInputStream
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

/** One verified original per app, in app-owned storage accessible on Android 10+. */
internal class ApkDownload(
    private val directory: File,
    private val open: (String) -> HttpURLConnection = { URL(it).openConnection() as HttpURLConnection },
    private val verifyIdentity: (File, DownloadInfo) -> Unit = ApkIdentity::requireMatch,
) {
    @Synchronized
    fun download(info: DownloadInfo, progress: (Long, Long?) -> Unit): File {
        require(Regex("[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+").matches(info.packageName))
        require(info.versionCode > 0 && info.size > 0 && Regex("[a-fA-F0-9]{32}").matches(info.md5))
        require(info.url.startsWith("https://"))
        if (!directory.isDirectory && !directory.mkdirs()) throw ApkDownloadException("apk_storage")
        val output = File(directory, "${info.packageName}-${info.versionCode}-${info.md5.lowercase()}.apk")
        if (output.isFile) {
            if (matches(output, info)) {
                verifyIdentity(output, info)
                progress(info.size, info.size)
                return output
            }
            if (!output.delete()) throw ApkDownloadException("apk_storage")
        }
        val partial = File(directory, output.name + ".part")
        var failure: Exception? = null
        repeat(3) { attempt ->
            try {
                val digest = MessageDigest.getInstance("MD5")
                var received = 0L
                var reported = 0L
                val connection = open(info.url)
                try {
                    connection.connectTimeout = 60_000
                    connection.readTimeout = 60_000
                    if (connection.responseCode != 200) throw ApkDownloadException("apk_network")
                    if (connection.contentLengthLong >= 0 && connection.contentLengthLong != info.size)
                        throw ApkDownloadException("apk_integrity")
                    progress(0, info.size)
                    FileOutputStream(partial).use { outputStream ->
                        connection.inputStream.use { input ->
                            val buffer = ByteArray(65_536)
                            while (true) {
                                val count = input.read(buffer)
                                if (count < 0) break
                                received += count
                                if (received > info.size) throw ApkDownloadException("apk_integrity")
                                digest.update(buffer, 0, count)
                                outputStream.write(buffer, 0, count)
                                if (received - reported >= 1_048_576 || received == info.size) {
                                    progress(received, info.size)
                                    reported = received
                                }
                            }
                        }
                        outputStream.fd.sync()
                    }
                } finally { connection.disconnect() }
                if (received != info.size || !digest.digest().hex().equals(info.md5, ignoreCase = true))
                    throw ApkDownloadException("apk_integrity")
                verifyIdentity(partial, info)
                Files.move(partial.toPath(), output.toPath(), StandardCopyOption.ATOMIC_MOVE)
                // Only discard this app's superseded verified downloads after the new one is ready.
                val older = Regex("${Regex.escape(info.packageName)}-[0-9]+-[a-f0-9]{32}\\.apk")
                directory.listFiles()?.filter { it != output && older.matches(it.name) }?.forEach { it.delete() }
                progress(received, info.size)
                return output
            } catch (error: ApkDownloadException) { throw error }
            catch (error: Exception) {
                failure = error
                if (attempt < 2) Thread.sleep((attempt + 1) * 1_000L)
            } finally { partial.delete() }
        }
        throw ApkDownloadException("apk_transfer", failure)
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
}

/** Optional adaptation cannot prevent installation of a verified original. */
internal fun inspectForAdaptation(choice: InstallVariant?, inspect: () -> InspectedApp): InspectedApp? {
    if (choice == InstallVariant.ORIGINAL) return null
    return try { inspect() } catch (error: Exception) {
        if (choice == InstallVariant.ADAPTED) throw error
        null
    }
}
