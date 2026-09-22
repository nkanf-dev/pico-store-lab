package dev.nkanf.picostore

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.android.apksig.ApkVerifier
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.concurrent.locks.ReentrantLock

/** Downloads a replacement for Lab. The caller still presents Android's normal installation UI. */
internal class SelfUpdateDownloader(context: Context) {
    private val context = context.applicationContext

    fun download(update: AvailableUpdate, onProgress: (Long, Long) -> Unit): File {
        ReleaseUpdates.validate(update)
        if (!downloadLock.tryLock()) throw SelfUpdateException("update_busy")
        try {
            val directory = File(context.cacheDir, "self-updates")
            if (!directory.isDirectory && !directory.mkdirs()) throw SelfUpdateException("update_storage")
            val output = File(directory, "pico-store-${update.version}-${update.sha256.lowercase()}.apk")
            val partial = File(directory, output.name + ".part")
            // A process interruption never turns a partial APK into an installable cache entry.
            directory.listFiles()?.filter { it.name.endsWith(".part") }?.forEach { it.delete() }
            if (output.isFile) {
                try {
                    UpdateFileIntegrity.verify(output, update)
                } catch (_: SelfUpdateException) {
                    if (!output.delete()) throw SelfUpdateException("update_storage")
                }
                if (output.isFile) {
                    verifyReplacement(output, update)
                    UpdateFileIntegrity.pruneOlderDownloads(directory, output)
                    onProgress(update.size, update.size)
                    return output
                }
            }
            if (directory.usableSpace < update.size + 16L * 1_048_576) throw SelfUpdateException("update_space")
            try {
                val connection = UpdateHttp.open(update.url, asset = true)
                try {
                    if (connection.contentLengthLong >= 0 && connection.contentLengthLong != update.size) {
                        throw SelfUpdateException("update_integrity")
                    }
                    val digest = MessageDigest.getInstance("SHA-256")
                    var received = 0L
                    var reported = 0L
                    onProgress(0, update.size)
                    FileOutputStream(partial).use { destination ->
                        val source = try { connection.inputStream }
                            catch (error: IOException) { throw SelfUpdateException("update_network", error) }
                        source.use { input ->
                            val buffer = ByteArray(65_536)
                            while (true) {
                                if (Thread.currentThread().isInterrupted) throw SelfUpdateException("update_cancelled")
                                val count = try { input.read(buffer) }
                                    catch (error: IOException) { throw SelfUpdateException("update_network", error) }
                                if (count < 0) break
                                received += count
                                if (received > update.size) throw SelfUpdateException("update_integrity")
                                digest.update(buffer, 0, count)
                                destination.write(buffer, 0, count)
                                if (received - reported >= 262_144 || received == update.size) {
                                    onProgress(received, update.size)
                                    reported = received
                                }
                            }
                        }
                        destination.fd.sync()
                    }
                    UpdateFileIntegrity.requireMatch(update, received, digest.digest().hex())
                } catch (error: SelfUpdateException) { throw error }
                catch (error: IOException) { throw SelfUpdateException("update_storage", error) }
                finally { connection.disconnect() }
                verifyReplacement(partial, update)
                try {
                    Files.move(partial.toPath(), output.toPath(), StandardCopyOption.ATOMIC_MOVE)
                } catch (error: IOException) { throw SelfUpdateException("update_storage", error) }
                UpdateFileIntegrity.pruneOlderDownloads(directory, output)
                onProgress(update.size, update.size)
                return output
            } finally { partial.delete() }
        } catch (error: SelfUpdateException) { throw error }
        catch (error: Exception) { throw SelfUpdateException("update_storage", error) }
        finally { downloadLock.unlock() }
    }

    private fun verifyReplacement(file: File, update: AvailableUpdate) {
        val verified = try {
            ApkVerifier.Builder(file)
                .setMinCheckedPlatformVersion(Build.VERSION.SDK_INT)
                .setMaxCheckedPlatformVersion(Build.VERSION.SDK_INT)
                .build().verify()
        } catch (error: Exception) { throw SelfUpdateException("update_signature", error) }
        if (!verified.isVerified) throw SelfUpdateException("update_signature")
        @Suppress("DEPRECATION")
        val installed = context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        @Suppress("DEPRECATION")
        val candidate = context.packageManager.getPackageArchiveInfo(file.absolutePath, 0)
            ?: throw SelfUpdateException("update_package")
        val installedSigners = installed.signingInfo?.apkContentsSigners?.map { it.toByteArray().sha256() }?.toSet()
            ?: emptySet()
        val candidateSigners = verified.signerCertificates.map { it.encoded.sha256() }.toSet()
        SelfUpdatePolicy.requireReplacement(context.packageName, candidate.packageName,
            installed.longVersionCode, candidate.longVersionCode, installedSigners, candidateSigners)
        if (candidate.versionName?.removePrefix("v") != update.version) throw SelfUpdateException("update_package")
        // Recheck bytes after both parsers, including on every cache reuse.
        UpdateFileIntegrity.verify(file, update)
    }

    private companion object { val downloadLock = ReentrantLock() }
}

internal object SelfUpdatePolicy {
    fun requireReplacement(
        installedPackage: String, candidatePackage: String, installedVersion: Long, candidateVersion: Long,
        installedSigners: Set<String>, candidateSigners: Set<String>,
    ) {
        if (installedPackage != candidatePackage) throw SelfUpdateException("update_package")
        if (candidateVersion <= installedVersion) throw SelfUpdateException("update_not_newer")
        // A different signer cannot update this installation. Never uninstall to work around it.
        if (installedSigners.isEmpty() || installedSigners != candidateSigners) throw SelfUpdateException("update_signature")
    }
}

internal object UpdateFileIntegrity {
    fun pruneOlderDownloads(directory: File, verified: File) {
        // Installation sessions stage their own bytes. Keep just the newly verified download.
        val apkName = Regex("pico-store-[0-9]+\\.[0-9]+\\.[0-9]+-[a-f0-9]{64}\\.apk")
        directory.listFiles()?.filter {
            it.isFile && it.name != verified.name && apkName.matches(it.name)
        }?.forEach { it.delete() }
    }

    fun verify(file: File, update: AvailableUpdate) {
        if (!file.isFile || file.length() != update.size) throw SelfUpdateException("update_integrity")
        val digest = MessageDigest.getInstance("SHA-256")
        var size = 0L
        file.inputStream().use { input ->
            val buffer = ByteArray(65_536)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                size += count
                if (size > update.size) throw SelfUpdateException("update_integrity")
                digest.update(buffer, 0, count)
            }
        }
        requireMatch(update, size, digest.digest().hex())
    }

    fun requireMatch(update: AvailableUpdate, bytes: Long, sha256: String) {
        if (bytes != update.size || !sha256.equals(update.sha256, ignoreCase = true)) {
            throw SelfUpdateException("update_integrity")
        }
    }
}
