package dev.nkanf.picostore

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import org.json.JSONObject
import java.util.zip.ZipFile

internal object InstalledApplications {
    fun read(context: Context, packageName: String, expectedOriginal: String? = null,
        legacyProfile: (Long) -> Boolean = { false }): InstalledCopy? {
        return try {
            val info = context.packageManager.getPackageInfo(packageName, 0)
            if (expectedOriginal != null) {
                val origin = ZipFile(checkNotNull(info.applicationInfo).sourceDir).use { apk ->
                    val entry = apk.getEntry("assets/matrix-embedded.json") ?: return null
                    apk.getInputStream(entry).use { input ->
                        val bytes = ByteArray(65_537)
                        var size = 0
                        while (size < bytes.size) {
                            val count = input.read(bytes, size, bytes.size - size)
                            if (count < 0) break
                            size += count
                        }
                        require(size <= 65_536)
                        JSONObject(String(bytes, 0, size, Charsets.UTF_8)).optString("originalPackage")
                    }
                }
                if (origin != expectedOriginal && !(origin.isEmpty() && legacyProfile(info.longVersionCode))) return null
            }
            InstalledCopy(info.longVersionCode, info.versionName.orEmpty())
        } catch (_: PackageManager.NameNotFoundException) { null }
          catch (_: Exception) { null }
    }

    fun open(context: Context, packageName: String): Boolean = runCatching {
        val launch = context.packageManager.getLaunchIntentForPackage(packageName) ?: return false
        context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    }.getOrDefault(false)
}
