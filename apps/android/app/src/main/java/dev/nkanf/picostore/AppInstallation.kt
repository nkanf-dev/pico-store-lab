package dev.nkanf.picostore

import java.io.File

enum class AppCompatibility { UNKNOWN, PROFILE, PROFILE_CANDIDATE, MATRIX, ORDINARY }
enum class InstallVariant { ORIGINAL, ADAPTED }

data class InstalledCopy(val versionCode: Long, val versionName: String)
data class InstalledCopies(val original: InstalledCopy? = null, val adapted: InstalledCopy? = null) {
    fun hasUpdate(latest: Long): Boolean =
        listOfNotNull(original, adapted).any { it.versionCode < latest }
    fun copyFor(variant: InstallVariant) = if (variant == InstallVariant.ORIGINAL) original else adapted
}

internal data class InspectedApp(
    val compatibility: AppCompatibility,
    val packageName: String,
    val versionCode: Long,
    val sha256: String,
)

internal interface AppInstallation : AutoCloseable {
    fun knownProfile(packageName: String, versionCode: Long): Boolean = false
    fun profileCandidate(packageName: String): Boolean = false
    fun profileVersion(): Long? = null
    fun activateProfile(apk: File, sha256: String, version: Long): Long = error("profile_unavailable")
    fun inspect(apk: File): InspectedApp
    fun install(apk: File, variant: InstallVariant)
    fun installed(packageName: String): InstalledCopies
    fun open(packageName: String, variant: InstallVariant): Boolean
    fun recover() {}
    override fun close() {}
}
