package dev.nkanf.picostore

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import dev.nkanf.picostore.sdk.DownloadInfo
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

internal class StoreInstaller(private val context: Context, private val onInstalled: () -> Unit = {}, private val report: (String) -> Unit) {
    private val action = "${context.packageName}.INSTALL_RESULT"
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
                PackageInstaller.STATUS_SUCCESS -> {
                    report(context.getString(R.string.installed))
                    onInstalled()
                }
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    @Suppress("DEPRECATION")
                    val confirmation = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                    confirmation?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    if (confirmation != null) context.startActivity(confirmation)
                }
                else -> report(intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                    ?: context.getString(R.string.install_failed))
            }
        }
    }

    init {
        ContextCompat.registerReceiver(context, receiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    fun close() = context.unregisterReceiver(receiver)

    fun download(info: DownloadInfo, onProgress: (Long, Long?) -> Unit): File {
        val name = "${info.packageName}-${info.versionCode}.apk"
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "PICO Store Lab")
        val preferredFile = File(dir, name)
        if (preferredFile.exists() && isVerified(preferredFile, info)) {
            onProgress(preferredFile.length(), preferredFile.length())
            return preferredFile
        }
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, "application/vnd.android.package-archive")
            put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/PICO Store Lab/")
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val resolver = context.contentResolver
        val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        var failure: Exception? = null
        repeat(3) { attempt ->
            val row = resolver.insert(collection, values) ?: error("Unable to create Downloads entry")
            try {
                val digest = MessageDigest.getInstance("MD5")
                val connection = URL(info.url).openConnection() as HttpURLConnection
                try {
                    connection.connectTimeout = 60_000
                    connection.readTimeout = 60_000
                    check(connection.responseCode in 200..299) { "APK HTTP ${connection.responseCode}" }
                    val total = connection.contentLengthLong.takeIf { it > 0 }
                    var received = 0L
                    var reported = 0L
                    onProgress(0, total)
                    resolver.openOutputStream(row, "w")!!.use { output ->
                        connection.inputStream.use { input ->
                            val buffer = ByteArray(65_536)
                            while (true) {
                                val size = input.read(buffer)
                                if (size < 0) break
                                digest.update(buffer, 0, size)
                                output.write(buffer, 0, size)
                                received += size
                                if (received - reported >= 1_048_576 || received == total) {
                                    onProgress(received, total)
                                    reported = received
                                }
                            }
                        }
                        output.flush()
                    }
                    onProgress(received, total)
                } finally { connection.disconnect() }
                check(digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) } == info.md5) {
                    "APK checksum mismatch"
                }
                resolver.update(row, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
                val path = resolver.query(row, arrayOf(MediaStore.MediaColumns.DATA), null, null, null)
                    ?.use { cursor ->
                        if (cursor.moveToFirst()) cursor.getString(0) else null
                    } ?: error("Downloaded APK path unavailable")
                val downloadedFile = File(path)
                check(isVerified(downloadedFile, info)) { "Downloaded APK package or version mismatch" }
                return downloadedFile
            } catch (error: Exception) {
                resolver.delete(row, null, null)
                failure = error
                if (error.message == "APK checksum mismatch" || error.message == "Downloaded APK package or version mismatch") throw error
                if (attempt < 2) Thread.sleep((attempt + 1) * 1_000L)
            }
        }
        error("APK download failed: ${failure?.message}")
    }

    private fun isVerified(file: File, info: DownloadInfo): Boolean {
        if (!file.exists() || file.length() == 0L) return false
        val packageInfo = context.packageManager.getPackageArchiveInfo(file.absolutePath, 0) ?: return false
        if (packageInfo.packageName != info.packageName || packageInfo.longVersionCode != info.versionCode) return false
        val digest = MessageDigest.getInstance("MD5")
        file.inputStream().use { stream ->
            val buffer = ByteArray(65_536)
            while (true) {
                val size = stream.read(buffer)
                if (size < 0) break
                digest.update(buffer, 0, size)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) } == info.md5
    }

    fun install(apk: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        val sessionId = installer.createSession(params)
        val session = installer.openSession(sessionId)
        try {
            apk.inputStream().use { input ->
                session.openWrite("base.apk", 0, apk.length()).use { output ->
                    input.copyTo(output)
                    session.fsync(output)
                }
            }
            val intent = Intent(action).setPackage(context.packageName)
            val sender = PendingIntent.getBroadcast(context, sessionId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE).intentSender
            session.commit(sender)
        } catch (error: Exception) {
            session.abandon()
            throw error
        } finally { session.close() }
    }
}
