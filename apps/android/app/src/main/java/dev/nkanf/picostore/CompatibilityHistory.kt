package dev.nkanf.picostore

/** Non-secret detection knowledge, scoped to one upstream application version. */
internal class CompatibilityHistory(
    private val read: (String) -> String?,
    private val write: (String, String) -> Boolean,
) {
    private fun key(packageName: String, version: Long) = "$packageName@$version"

    fun remember(app: InspectedApp) {
        require(app.packageName.isNotBlank() && app.versionCode > 0)
        require(app.compatibility != AppCompatibility.UNKNOWN)
        require(app.sha256.isEmpty() || app.sha256.matches(Regex("[a-f0-9]{64}")))
        check(write(key(app.packageName, app.versionCode), "${app.compatibility.name}|${app.sha256}"))
    }

    fun recorded(packageName: String, version: Long): AppCompatibility? {
        val raw = read(key(packageName, version)) ?: return null
        return runCatching { AppCompatibility.valueOf(raw.substringBefore('|')) }
            .getOrNull()?.takeUnless { it == AppCompatibility.UNKNOWN }
    }

    fun resolve(packageName: String, version: Long, knownProfile: Boolean): AppCompatibility =
        recorded(packageName, version)
            ?: if (knownProfile) AppCompatibility.PROFILE else AppCompatibility.UNKNOWN
}
