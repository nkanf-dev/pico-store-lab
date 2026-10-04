package dev.nkanf.picostore

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.os.Environment
import androidx.core.content.ContextCompat
import dev.nkanf.picostore.sdk.DownloadInfo
import java.io.File

internal class StoreInstaller(private val context: Context, private val onInstalled: () -> Unit = {},
    private val diagnostic: (String, Map<String, String>) -> Unit = { _, _ -> },
    private val failed: (Int, Int) -> Unit = { _, _ -> }, private val report: (String) -> Unit) {
    private val action = "${context.packageName}.INSTALL_RESULT"
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
            val legacy = intent.getIntExtra("android.content.pm.extra.LEGACY_STATUS", 0)
            diagnostic("system_install_result", mapOf("status" to status.toString(), "legacyStatus" to legacy.toString()))
            when (status) {
                PackageInstaller.STATUS_SUCCESS -> {
                    report(context.getString(R.string.installed))
                    onInstalled()
                }
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    @Suppress("DEPRECATION")
                    val confirmation = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                    confirmation?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    if (confirmation == null) {
                        diagnostic("confirmation_missing", emptyMap())
                        failed(PackageInstaller.STATUS_FAILURE, legacy)
                        report(context.getString(R.string.installation_interrupted))
                    }
                    else try { context.startActivity(confirmation) }
                    catch (_: RuntimeException) {
                        diagnostic("confirmation_blocked", emptyMap())
                        failed(PackageInstaller.STATUS_FAILURE_BLOCKED, legacy)
                        report(context.getString(R.string.installation_blocked))
                    }
                }
                else -> {
                    // Record numeric codes only: the system message can contain private paths.
                    android.util.Log.w("StoreInstaller", "Install failed: status=$status legacy=${intent.getIntExtra("android.content.pm.extra.LEGACY_STATUS", 0)}")
                    failed(status, intent.getIntExtra("android.content.pm.extra.LEGACY_STATUS", 0))
                    report(context.getString(installFailureResource(status)))
                }
            }
        }
    }

    init {
        ContextCompat.registerReceiver(context, receiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    fun close() = context.unregisterReceiver(receiver)

    private val downloads = ApkDownload(File(
        context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir, "original-apks"), diagnostic = diagnostic)

    fun download(info: DownloadInfo, onProgress: (Long, Long?) -> Unit): File =
        try { downloads.download(info, onProgress) }
        catch (error: ApkDownloadException) {
            val message = when (error.code) {
                "apk_package" -> R.string.apk_package_mismatch
                "apk_version" -> R.string.apk_version_mismatch
                "apk_integrity" -> R.string.apk_integrity_failed
                "apk_invalid" -> R.string.apk_invalid
                "apk_network" -> R.string.apk_network_failed
                "apk_space" -> R.string.not_enough_storage
                "apk_storage" -> R.string.apk_storage_failed
                "apk_cancelled" -> R.string.apk_cancelled
                else -> R.string.apk_transfer_failed
            }
            throw IllegalStateException(context.getString(message), error)
        }

    fun install(apk: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setSize(apk.length())
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
