package dev.nkanf.picostore

import android.content.Context
import java.io.File
import org.picomatrix.bridge.installer.android.AssetBundle
import org.picomatrix.bridge.installer.android.MatrixInstaller
import org.picomatrix.bridge.adapter.AdapterEngine
import org.picomatrix.bridge.installer.android.ProfileStore
import org.picomatrix.bridge.adapter.ApplicationProfile
import java.util.concurrent.ConcurrentHashMap

internal object InstallationFactory {
    fun create(context: Context, downloader: StoreInstaller, changed: () -> Unit = {}, report: (String) -> Unit): AppInstallation =
        object : AppInstallation {
            private val host = context.applicationContext
            private val installer = MatrixInstaller(host)
            private val bundle by lazy { AssetBundle.open(host, "matrix-bridge") }
            private val bundled by lazy { host.assets.list("").orEmpty().mapNotNull { ProjectLinks.profileAssetPattern.matchEntire(it)?.groupValues?.get(1) }.toSet() }
            private val profileStores = ConcurrentHashMap<String, ProfileStore>()
            private fun store(key: String): ProfileStore {
                require(ProjectLinks.profileKeyPattern.matches(key))
                return profileStores.computeIfAbsent(key) {
                    ProfileStore(host, ProjectLinks.profilePackageName(key),
                        if (key in bundled) ProjectLinks.profileAssetName(key) else null,
                        BuildConfig.PROFILE_SIGNER_SHA256)
                }
            }
            override fun profileKeys(): Set<String> {
                val saved = File(host.filesDir, ProjectLinks.profileStorageDirectory).listFiles().orEmpty().mapNotNull {
                    it.name.removePrefix(ProjectLinks.profilePackagePrefix).takeIf { key ->
                        it.isDirectory && ProjectLinks.profileKeyPattern.matches(key) && it.name == ProjectLinks.profilePackageName(key)
                    }
                }
                return (bundled + saved).toSet()
            }
            private fun selectedProfiles(): List<ApplicationProfile> = profileKeys().mapNotNull { key ->
                runCatching { store(key).current().implementation }
                    .onFailure { android.util.Log.e("MatrixProfiles", "Unable to load profile $key", it) }.getOrNull()
            }
            private fun specificProfiles(packageName: String): List<ApplicationProfile> = selectedProfiles()
                .filter { it.packageMatcher() == packageName }
                .sortedWith(compareByDescending<ApplicationProfile> { it.priority() }
                    .thenByDescending { it.metadata().optLong("profileVersionCode", 0) }
                    .thenBy { it.metadata().optString("profileKey") })
            private fun message(code: String): String = host.getString(when (code) {
                "checking_application" -> R.string.checking_application
                "preparing_application", "preparing_installation" -> R.string.preparing_application
                "verifying_application" -> R.string.verifying_application
                "confirm_installation" -> R.string.confirm_installation
                "connecting_account" -> R.string.connecting_account
                "installed" -> R.string.installed
                "open_app_to_sign_in" -> R.string.open_app_to_sign_in
                "installation_cancelled" -> R.string.installation_cancelled
                "installation_busy" -> R.string.installation_busy
                "application_update_required" -> R.string.application_update_required
                "adaptation_unavailable" -> R.string.application_update_required
                "existing_signature_conflict" -> R.string.existing_signature_conflict
                "application_downgrade" -> R.string.application_downgrade
                "not_enough_storage" -> R.string.not_enough_storage
                "installation_interrupted" -> R.string.installation_interrupted
                else -> R.string.install_failed
            })
            private val observer = installer.observe {
                val retained = it.stage == "failed" && it.packageName.isNotBlank() &&
                    InstalledApplications.read(host, it.packageName) != null
                report(if (retained) message(it.code) + "\n" + host.getString(R.string.current_version_retained) else message(it.code))
                if (it.terminal()) changed()
            }
            override fun installed(packageName: String): InstalledCopies {
                val original = InstalledApplications.read(host, packageName)
                val specific = specificProfiles(packageName)
                val target = runCatching { AdapterEngine.targetPackage(specific.firstOrNull(), packageName) }.getOrNull()
                    ?: return InstalledCopies(original)
                return InstalledCopies(original,
                    InstalledApplications.read(host, target, packageName) { version ->
                        specific.any { AdapterEngine.supportsProfile(it, packageName, version) }
                    })
            }
            override fun open(packageName: String, variant: InstallVariant): Boolean {
                if (installed(packageName).copyFor(variant) == null) return false
                return InstalledApplications.open(host, if (variant == InstallVariant.ORIGINAL) packageName
                    else AdapterEngine.targetPackage(specificProfiles(packageName).firstOrNull(), packageName))
            }
            override fun knownProfile(packageName: String, versionCode: Long): Boolean =
                runCatching { specificProfiles(packageName).any { AdapterEngine.supportsProfile(it, packageName, versionCode) } }.getOrDefault(false)
            override fun profileCandidate(packageName: String): Boolean =
                runCatching { specificProfiles(packageName).isNotEmpty() }.getOrDefault(false)
            override fun profileVersion(key: String): Long? = runCatching { store(key).current().version }.getOrNull()
            override fun activateProfile(key: String, apk: File, sha256: String, version: Long): Long =
                store(key).activate(apk, sha256, version).version
            override fun inspect(apk: File): InspectedApp {
                val result = try { AdapterEngine.inspect(apk, bundle, selectedProfiles()) }
                    catch (_: Exception) { throw IllegalStateException(host.getString(R.string.application_check_failed)) }
                val compatibility = when {
                    result.route == AdapterEngine.Route.PROFILE ->
                        if (result.profileExact)
                            AppCompatibility.PROFILE else AppCompatibility.PROFILE_CANDIDATE
                    result.matrixDetected -> AppCompatibility.MATRIX
                    else -> AppCompatibility.ORDINARY
                }
                return InspectedApp(compatibility, result.packageName, result.versionCode, result.inputSha256)
            }
            override fun install(apk: File, variant: InstallVariant) {
                try {
                    val mode = if (variant == InstallVariant.ORIGINAL) MatrixInstaller.Mode.ORIGINAL
                        else MatrixInstaller.Mode.ADAPTED
                    val inputs = if (variant == InstallVariant.ORIGINAL) File(host.filesDir, "matrix-bundles") else bundle
                    installer.prepareAndInstall(apk, inputs, mode,
                        if (variant == InstallVariant.ORIGINAL) emptyList() else selectedProfiles())
                } catch (error: Exception) { throw IllegalStateException(message(error.message.orEmpty())) }
            }
            override fun recover() = installer.reconcile()
            override fun close() = observer.close()
        }
}
