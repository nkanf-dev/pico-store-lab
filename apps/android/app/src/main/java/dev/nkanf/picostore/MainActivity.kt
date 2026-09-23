package dev.nkanf.picostore

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.mutableStateOf
import dev.nkanf.picostore.sdk.PicoAuth
import dev.nkanf.picostore.sdk.PicoStoreClient
import dev.nkanf.picostore.sdk.PublicItem
import dev.nkanf.picostore.sdk.StoreTarget
import org.json.JSONArray
import java.io.File
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private val client = PicoStoreClient()
    private val worker = Executors.newSingleThreadExecutor()
    private val announcementWorker = Executors.newSingleThreadExecutor()
    private val prefs by lazy { getSharedPreferences("store", MODE_PRIVATE) }
    private val imageLoader by lazy { StoreImageLoader(this) }
    private val account by lazy { StoreAccountFactory.create(this) }
    private val auth = mutableStateOf<PicoAuth?>(null)
    private val email = mutableStateOf("")
    private val items = mutableStateOf<List<StoreEntry>>(emptyList())
    private val selected = mutableStateOf<PublicItem?>(null)
    private val compatibility = mutableStateOf(AppCompatibility.UNKNOWN)
    private val noAdaptationReason = mutableStateOf<String?>(null)
    private val noAdaptation by lazy {
        NoAdaptationPolicy.parse(assets.open("no-adaptation.json").bufferedReader().use { it.readText() })
    }
    private val installPromptName = mutableStateOf<String?>(null)
    private val originalWarningName = mutableStateOf<String?>(null)
    private val installedCopies = mutableStateOf(InstalledCopies())
    private val trackedApplications by lazy {
        TrackedApplications(getSharedPreferences("tracked_applications", MODE_PRIVATE))
    }
    private val compatibilityHistory by lazy {
        val records = getSharedPreferences("app_compatibility", MODE_PRIVATE)
        CompatibilityHistory({ key -> records.getString(key, null) }) { key, value ->
            records.edit().putString(key, value).commit()
        }
    }
    private data class PendingInstallation(val apk: File, val packageName: String)
    private var pendingInstallation: PendingInstallation? = null
    private val busy = mutableStateOf(false)
    private val downloadProgress = mutableStateOf<Pair<Long, Long?>?>(null)
    private val themeMode = mutableStateOf(ThemeMode.SYSTEM)
    private val updateVersion = mutableStateOf<String?>(null)
    private var availableUpdate: AvailableUpdate? = null
    private val announcement = mutableStateOf<ReleaseAnnouncement?>(null)
    private val announcementOpen = mutableStateOf(false)
    private val announcementLoading = mutableStateOf(false)
    private val profileVersions = mutableStateOf<Map<String, Long>>(emptyMap())
    private val profileUpdateVersions = mutableStateOf<Map<String, Long>>(emptyMap())
    private val availableProfiles = mutableMapOf<String, AvailableProfile>()
    private val message = mutableStateOf("")
    private val favorites = mutableStateOf<Set<String>>(emptySet())
    private var seedEntries: List<StoreEntry> = emptyList()
    private var pendingPurchase: StoreTarget? = null
    private lateinit var installer: StoreInstaller
    private lateinit var installation: AppInstallation

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        installer = StoreInstaller(this, onInstalled = ::refreshInstalled) { text -> runOnUiThread { message.value = text } }
        installation = InstallationFactory.create(this, installer, changed = ::refreshInstalled) { text -> runOnUiThread { message.value = text } }
        restoreSession()
        installation.recover()
        favorites.value = prefs.getStringSet("favorites", emptySet()).orEmpty().toSet()
        themeMode.value = runCatching { ThemeMode.valueOf(prefs.getString("theme", "SYSTEM")!!) }
            .getOrDefault(ThemeMode.SYSTEM)
        val cachedVersion = prefs.getString("announcement_version", null)
        val cachedBody = prefs.getString("announcement_body", null)
        if (cachedVersion != null && !cachedBody.isNullOrBlank()) {
            announcement.value = runCatching {
                if (ReleaseUpdates.isNewer(BuildConfig.VERSION_NAME, cachedVersion)) null
                else ReleaseAnnouncement(cachedVersion, cachedBody)
            }.getOrNull()
        }
        val catalog = JSONArray(assets.open("catalog.json").bufferedReader().use { it.readText() })
        seedEntries = (0 until catalog.length()).map { index ->
            val entry = catalog.getJSONObject(index)
            StoreEntry(StoreTarget(entry.getString("itemId"), entry.getString("packageName"), entry.getString("name")))
        }
        seedEntries = (seedEntries + trackedApplications.all().map(::StoreEntry)).distinctBy { it.target.itemId }
        items.value = seedEntries
        setContent {
            StoreScreen(
                entries = items.value,
                selected = selected.value,
                compatibility = compatibility.value,
                noAdaptationReason = noAdaptationReason.value,
                installPromptName = installPromptName.value,
                originalWarningName = originalWarningName.value,
                installedCopies = installedCopies.value,
                busy = busy.value,
                downloadProgress = downloadProgress.value,
                themeMode = themeMode.value,
                imageLoader = imageLoader,
                message = message.value,
                email = email.value,
                signedIn = auth.value != null,
                favorites = favorites.value,
                updateVersion = updateVersion.value,
                announcement = announcement.value,
                announcementOpen = announcementOpen.value,
                announcementLoading = announcementLoading.value,
                profileVersions = profileVersions.value,
                profileUpdateVersions = profileUpdateVersions.value,
                onCheckUpdate = ::checkUpdate,
                onOpenUpdate = ::downloadSelfUpdate,
                onShowAnnouncement = ::showAnnouncement,
                onRetryAnnouncement = { loadAnnouncement(false) },
                onDismissAnnouncement = ::dismissAnnouncement,
                onCheckProfileUpdate = ::checkProfileUpdates,
                onOpenProfileUpdate = ::downloadProfileUpdate,
                onCheckAppUpdates = ::checkAppUpdates,
                onOpenApp = ::openApp,
                onSearch = ::search,
                onSelect = ::select,
                onFavorite = ::toggleFavorite,
                onSendCode = ::sendCode,
                onLogin = ::login,
                onLogout = ::logout,
                onGet = ::getApp,
                onInstallChoice = ::chooseInstallation,
                onConfirmOriginal = ::confirmOriginalInstallation,
                onDismissOriginalWarning = {
                    pendingInstallation = null
                    originalWarningName.value = null
                },
                onDismissInstallChoice = {
                    pendingInstallation = null
                    installPromptName.value = null
                },
                onBack = { selected.value = null },
                onThemeChange = { mode ->
                    themeMode.value = mode
                    prefs.edit().putString("theme", mode.name).apply()
                },
            )
        }
        loadAnnouncement(true)
        refreshCatalog()
        worker.execute {
            val versions = installation.profileKeys().mapNotNull { key -> installation.profileVersion(key)?.let { key to it } }.toMap()
            runOnUiThread { profileVersions.value = versions }
        }
    }

    private fun restoreSession() {
        runCatching {
            val session = account.restore() ?: return
            auth.value = session.auth
            email.value = session.email
        }.onFailure { message.value = getString(R.string.session_unavailable) }
    }

    private fun work(block: () -> Unit) {
        if (busy.value) return
        busy.value = true
        message.value = ""
        downloadProgress.value = null
        worker.execute {
            try { block() }
            catch (error: Exception) { runOnUiThread {
                downloadProgress.value = null
                message.value = error.message ?: "Request failed"
            } }
            finally { runOnUiThread { busy.value = false } }
        }
    }

    private fun refreshCatalog() {
        worker.execute {
            items.value.forEach { entry ->
                val copies = installation.installed(entry.target.packageName)
                runCatching { client.item(entry.target) }.onSuccess { info ->
                    runOnUiThread { items.value = items.value.map { if (it.target == entry.target) it.copy(info = info, installed = copies) else it } }
                }
            }
        }
    }

    private fun refreshInstalled() {
        if (!::installation.isInitialized || worker.isShutdown) return
        val snapshot = items.value
        val detail = selected.value
        worker.execute {
            val copies = snapshot.associate { it.target.itemId to installation.installed(it.target.packageName) }
            val selectedCopies = detail?.let { copies[it.itemId] ?: installation.installed(it.packageName) }
            runOnUiThread {
                items.value = items.value.map { it.copy(installed = copies[it.target.itemId] ?: it.installed) }
                if (selected.value?.itemId == detail?.itemId && selectedCopies != null) installedCopies.value = selectedCopies
            }
        }
    }

    private fun checkAppUpdates() = work {
        runOnUiThread { message.value = getString(R.string.checking_app_updates) }
        val targets = (seedEntries.map { it.target } + trackedApplications.all()).distinctBy { it.itemId }
        val previous = items.value.associateBy { it.target.itemId }
        var checked = 0
        var failedInstalled = 0
        val results = targets.map { target ->
            val copies = installation.installed(target.packageName)
            val info = runCatching { client.item(target) }.onSuccess { checked++ }.getOrNull()
            if (info == null && (copies.original != null || copies.adapted != null)) failedInstalled++
            StoreEntry(target, info ?: previous[target.itemId]?.info, copies)
        }
        check(checked > 0) { getString(R.string.update_check_failed) }
        val count = results.count { it.info?.let { info -> it.installed.hasUpdate(info.versionCode) } == true }
        runOnUiThread {
            items.value = results
            message.value = when {
                failedInstalled > 0 -> getString(R.string.app_updates_partial)
                count == 0 -> getString(R.string.apps_up_to_date)
                else -> getString(R.string.app_updates_available, count)
            }
        }
    }

    private fun openApp(detail: PublicItem, variant: InstallVariant) = work {
        check(installation.open(detail.packageName, variant)) { getString(R.string.open_app_failed) }
    }

    private fun search(query: String) {
        if (query.isBlank()) { items.value = seedEntries; refreshCatalog(); return }
        work {
            val results = client.search(query).map { result ->
                StoreEntry(StoreTarget(result.itemId, result.packageName, result.name))
            }
            runOnUiThread { items.value = results }
            results.forEach { entry ->
                val copies = installation.installed(entry.target.packageName)
                runCatching { client.item(entry.target) }.onSuccess { info ->
                    runOnUiThread { items.value = items.value.map { if (it.target == entry.target) it.copy(info = info, installed = copies) else it } }
                }
            }
        }
    }

    private fun select(target: StoreTarget) = work {
        val detail = currentAuth()?.let { client.item(target, it) } ?: client.item(target)
        showDetail(detail)
    }

    private fun showDetail(detail: PublicItem) {
        val excluded = noAdaptation.reason(detail.packageName)
        val support = if (excluded != null) AppCompatibility.ORDINARY else
            compatibilityHistory.resolve(detail.packageName, detail.versionCode,
                installation.knownProfile(detail.packageName, detail.versionCode),
                installation.profileCandidate(detail.packageName))
        val copies = installation.installed(detail.packageName)
        runOnUiThread {
            selected.value = detail
            compatibility.value = support
            noAdaptationReason.value = excluded?.forLanguage(resources.configuration.locales[0].language)
            installedCopies.value = copies
        }
    }

    private fun checkUpdate() = work {
        try {
            val update = ReleaseUpdates.findUpdate(BuildConfig.VERSION_NAME)
            availableUpdate = update
            val version = update?.version
            runOnUiThread {
                updateVersion.value = version
                message.value = if (version == null) getString(R.string.up_to_date)
                    else getString(R.string.update_available, version)
            }
        } catch (_: Exception) { error(getString(R.string.update_check_failed)) }
    }

    private fun loadAnnouncement(showOnNew: Boolean) {
        if (announcementLoading.value) return
        announcementLoading.value = true
        announcementWorker.execute {
            val result = runCatching { ReleaseUpdates.findAnnouncement(BuildConfig.VERSION_NAME) }
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                announcementLoading.value = false
                result.onSuccess { latest ->
                    announcement.value = latest
                    prefs.edit().apply {
                        if (latest == null) {
                            remove("announcement_version")
                            remove("announcement_body")
                        } else {
                            putString("announcement_version", latest.version)
                            putString("announcement_body", latest.body)
                        }
                    }.apply()
                    if (showOnNew && latest != null &&
                        prefs.getString("announcement_seen_version", null) != latest.version) {
                        announcementOpen.value = true
                    }
                }
            }
        }
    }

    private fun showAnnouncement() {
        announcementOpen.value = true
        if (announcement.value == null) loadAnnouncement(false)
    }

    private fun dismissAnnouncement() {
        announcement.value?.let { prefs.edit().putString("announcement_seen_version", it.version).apply() }
        announcementOpen.value = false
    }

    private fun downloadSelfUpdate() = work {
        val update = availableUpdate ?: error(getString(R.string.self_update_unavailable))
        runOnUiThread { message.value = getString(R.string.self_update_download) }
        val apk = try {
            SelfUpdateDownloader(this).download(update) { received, total ->
                runOnUiThread { downloadProgress.value = received to total }
            }
        } catch (failure: SelfUpdateException) {
            val resource = when (failure.code) {
                "update_signature", "update_package" -> R.string.self_update_identity_mismatch
                "update_metadata", "update_not_newer" -> R.string.self_update_unavailable
                "update_space" -> R.string.not_enough_storage
                else -> R.string.self_update_download_failed
            }
            error(getString(resource))
        }
        runOnUiThread { downloadProgress.value = null }
        installation.install(apk, InstallVariant.ORIGINAL)
    }

    private fun checkProfileUpdates() = work {
        val current = installation.profileKeys().mapNotNull { key -> installation.profileVersion(key)?.let { key to it } }.toMap()
        val updates = try { ProfileReleaseUpdates.findUpdates(current) }
            catch (_: Exception) { error(getString(R.string.profile_check_failed)) }
        availableProfiles.clear()
        availableProfiles.putAll(updates)
        runOnUiThread {
            profileVersions.value = current
            profileUpdateVersions.value = updates.mapValues { it.value.version }
            message.value = if (updates.isEmpty()) getString(R.string.profile_up_to_date)
                else getString(R.string.profile_updates_available, updates.size)
        }
    }

    private fun downloadProfileUpdate(key: String) = work {
        val update = availableProfiles[key] ?: error(getString(R.string.profile_unavailable))
        runOnUiThread { message.value = getString(R.string.profile_downloading) }
        val file = try {
            ProfileReleaseUpdates.download(this, update) { received, total ->
                runOnUiThread { downloadProgress.value = received to total }
            }
        } catch (_: Exception) { error(getString(R.string.profile_download_failed)) }
        try {
            val installed = installation.activateProfile(key, file, update.sha256, update.version)
            runOnUiThread {
                profileVersions.value = profileVersions.value + (key to installed)
                profileUpdateVersions.value = profileUpdateVersions.value - key
                availableProfiles.remove(key)
                downloadProgress.value = null
                message.value = getString(R.string.profile_updated, ProfileReleaseUpdates.display(installed))
            }
            refreshInstalled()
            selected.value?.let(::showDetail)
        } catch (_: Exception) { error(getString(R.string.profile_verify_failed)) }
        finally { file.delete() }
    }

    private fun toggleFavorite(itemId: String) {
        favorites.value = if (itemId in favorites.value) favorites.value - itemId else favorites.value + itemId
        prefs.edit().putStringSet("favorites", favorites.value).apply()
    }

    private fun sendCode(address: String) = work {
        account.sendCode(address)
        runOnUiThread { message.value = getString(R.string.code_sent) }
    }

    private fun login(address: String, code: String) = work {
        val session = account.login(address, code).auth
        val previous = selected.value
        val refreshed = previous?.let {
            runCatching { client.item(StoreTarget(it.itemId, it.packageName, it.name), session) }.getOrNull()
        }
        if (refreshed != null) showDetail(refreshed)
        runOnUiThread {
            auth.value = session; email.value = address; selected.value = refreshed
            message.value = getString(R.string.signed_in)
        }
    }

    private fun logout() = work {
        try { account.logout() }
        catch (_: Exception) { error(getString(R.string.sign_out_failed)) }
        runOnUiThread {
            auth.value = null
            email.value = ""
            selected.value = null
        }
    }

    private fun getApp(detail: PublicItem, variant: InstallVariant?) {
        work {
            val session = currentAuth() ?: error(getString(R.string.sign_in_first))
            val target = StoreTarget(detail.itemId, detail.packageName, detail.name)
            val installationChoice = noAdaptation.installationChoice(target.packageName, variant)
            val current = client.item(target, session)
            showDetail(current)
            if (current.entitlementStatus != 1 && current.price.toDoubleOrNull()?.let { it > 0.0 } == true) {
                pendingPurchase = target
                runOnUiThread {
                    selected.value = current
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(current.officialUrl)))
                    message.value = getString(R.string.complete_purchase)
                }
                return@work
            }
            val info = client.entitledDownloadInfo(target, session)
            runOnUiThread { message.value = getString(R.string.downloading) }
            val apk = installer.download(info) { received, total ->
                runOnUiThread { downloadProgress.value = received to total }
            }
            trackedApplications.remember(target)
            runOnUiThread {
                downloadProgress.value = null
                message.value = getString(R.string.checking_application)
            }
            if (installationChoice == InstallVariant.ORIGINAL) {
                // Keep detection history while honoring an explicit original install or a no-adaptation rule.
                val inspected = runCatching {
                    val inspected = installation.inspect(apk)
                    check(inspected.packageName == target.packageName && inspected.versionCode == info.versionCode)
                    compatibilityHistory.remember(inspected)
                    inspected
                }.getOrNull()
                showDetail(current.copy(versionCode = info.versionCode, appVersion = info.version))
                if (noAdaptation.reason(target.packageName) == null &&
                    inspected?.compatibility in setOf(AppCompatibility.PROFILE, AppCompatibility.PROFILE_CANDIDATE, AppCompatibility.MATRIX)) {
                    runOnUiThread {
                        pendingInstallation = PendingInstallation(apk, target.packageName)
                        originalWarningName.value = current.name
                        message.value = ""
                    }
                } else installDownloaded(apk, target.packageName, InstallVariant.ORIGINAL)
                return@work
            }
            val inspected = installation.inspect(apk)
            check(inspected.packageName == target.packageName && inspected.versionCode == info.versionCode) {
                getString(R.string.install_failed)
            }
            // Persist the detection before showing a choice, including when it is declined.
            compatibilityHistory.remember(inspected)
            val downloaded = current.copy(versionCode = info.versionCode, appVersion = info.version)
            showDetail(downloaded)
            when {
                installationChoice != null -> installDownloaded(apk, target.packageName, installationChoice)
                inspected.compatibility == AppCompatibility.PROFILE -> installDownloaded(apk, target.packageName, InstallVariant.ADAPTED)
                inspected.compatibility == AppCompatibility.MATRIX ||
                    inspected.compatibility == AppCompatibility.PROFILE_CANDIDATE -> runOnUiThread {
                    pendingInstallation = PendingInstallation(apk, target.packageName)
                    installPromptName.value = downloaded.name
                    message.value = ""
                }
                else -> installDownloaded(apk, target.packageName, InstallVariant.ORIGINAL)
            }
        }
    }

    private fun chooseInstallation(variant: InstallVariant) {
        val pending = pendingInstallation ?: return
        if (busy.value) return
        installPromptName.value = null
        if (variant == InstallVariant.ORIGINAL) {
            originalWarningName.value = selected.value?.name ?: pending.packageName
        } else {
            pendingInstallation = null
            work { installDownloaded(pending.apk, pending.packageName, variant) }
        }
    }

    private fun confirmOriginalInstallation() {
        val pending = pendingInstallation ?: return
        if (busy.value) return
        pendingInstallation = null
        originalWarningName.value = null
        work { installDownloaded(pending.apk, pending.packageName, InstallVariant.ORIGINAL) }
    }

    private fun installDownloaded(apk: File, packageName: String, variant: InstallVariant) {
        val updating = installation.installed(packageName).copyFor(variant) != null
        try { installation.install(apk, variant) }
        catch (failure: Exception) {
            val reason = failure.message ?: getString(R.string.install_failed)
            error(if (updating) "$reason\n${getString(R.string.current_version_retained)}" else reason)
        }
    }

    override fun onResume() {
        super.onResume()
        refreshInstalled()
        val target = pendingPurchase ?: return
        pendingPurchase = null
        worker.execute {
            runCatching {
                val session = currentAuth() ?: error(getString(R.string.sign_in_first))
                client.item(target, session)
            }.onSuccess { current ->
                showDetail(current)
                runOnUiThread {
                    message.value = if (current.entitlementStatus == 1) getString(R.string.purchase_ready)
                    else getString(R.string.purchase_not_confirmed)
                }
            }
        }
    }

    /** Grant requests can rotate Passport credentials outside this Activity. */
    private fun currentAuth(): PicoAuth? {
        val session = account.restore()
        runOnUiThread {
            auth.value = session?.auth
            email.value = session?.email.orEmpty()
        }
        return session?.auth
    }

    override fun onDestroy() {
        imageLoader.close()
        installer.close()
        installation.close()
        worker.shutdown()
        announcementWorker.shutdown()
        super.onDestroy()
    }
}

data class StoreEntry(val target: StoreTarget, val info: PublicItem? = null, val installed: InstalledCopies = InstalledCopies())
