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
import org.json.JSONObject
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private val client = PicoStoreClient()
    private val worker = Executors.newSingleThreadExecutor()
    private val prefs by lazy { getSharedPreferences("store", MODE_PRIVATE) }
    private val account by lazy { AccountStore(this) }
    private val auth = mutableStateOf<PicoAuth?>(null)
    private val email = mutableStateOf("")
    private val items = mutableStateOf<List<StoreEntry>>(emptyList())
    private val selected = mutableStateOf<PublicItem?>(null)
    private val busy = mutableStateOf(false)
    private val downloadProgress = mutableStateOf<Pair<Long, Long?>?>(null)
    private val themeMode = mutableStateOf(ThemeMode.SYSTEM)
    private val updateVersion = mutableStateOf<String?>(null)
    private val message = mutableStateOf("")
    private val favorites = mutableStateOf<Set<String>>(emptySet())
    private var seedEntries: List<StoreEntry> = emptyList()
    private var pendingPurchase: StoreTarget? = null
    private lateinit var installer: StoreInstaller

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        installer = StoreInstaller(this) { text -> runOnUiThread { message.value = text } }
        restoreSession()
        favorites.value = prefs.getStringSet("favorites", emptySet()).orEmpty().toSet()
        themeMode.value = runCatching { ThemeMode.valueOf(prefs.getString("theme", "SYSTEM")!!) }
            .getOrDefault(ThemeMode.SYSTEM)
        val catalog = JSONArray(assets.open("catalog.json").bufferedReader().use { it.readText() })
        seedEntries = (0 until catalog.length()).map { index ->
            val entry = catalog.getJSONObject(index)
            StoreEntry(StoreTarget(entry.getString("itemId"), entry.getString("packageName"), entry.getString("name")))
        }
        items.value = seedEntries
        setContent {
            StoreScreen(
                entries = items.value,
                selected = selected.value,
                busy = busy.value,
                downloadProgress = downloadProgress.value,
                themeMode = themeMode.value,
                message = message.value,
                email = email.value,
                signedIn = auth.value != null,
                favorites = favorites.value,
                updateVersion = updateVersion.value,
                onCheckUpdate = ::checkUpdate,
                onOpenUpdate = { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(ReleaseUpdates.DOWNLOAD_URL))) },
                onSearch = ::search,
                onSelect = ::select,
                onFavorite = ::toggleFavorite,
                onSendCode = ::sendCode,
                onLogin = ::login,
                onLogout = ::logout,
                onGet = ::getApp,
                onBack = { selected.value = null },
                onThemeChange = {
                    themeMode.value = ThemeMode.entries[(themeMode.value.ordinal + 1) % ThemeMode.entries.size]
                    prefs.edit().putString("theme", themeMode.value.name).apply()
                },
            )
        }
        refreshCatalog()
    }

    private fun restoreSession() {
        runCatching {
            val raw = account.load() ?: return
            val data = JSONObject(raw)
            val cookies = data.getJSONObject("cookies")
            val session = PicoAuth(data.getString("uid"), data.getString("token"),
                cookies.keys().asSequence().associateWith { cookies.getString(it) })
            require(session.token.isNotEmpty() || session.cookies.isNotEmpty())
            auth.value = session
            email.value = data.optString("email")
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
                runCatching { client.item(entry.target) }.onSuccess { info ->
                    runOnUiThread { items.value = items.value.map { if (it.target == entry.target) it.copy(info = info) else it } }
                }
            }
        }
    }

    private fun search(query: String) {
        if (query.isBlank()) { items.value = seedEntries; refreshCatalog(); return }
        work {
            val results = client.search(query).map { result ->
                StoreEntry(StoreTarget(result.itemId, result.packageName, result.name))
            }
            runOnUiThread { items.value = results }
            results.forEach { entry ->
                runCatching { client.item(entry.target) }.onSuccess { info ->
                    runOnUiThread { items.value = items.value.map { if (it.target == entry.target) it.copy(info = info) else it } }
                }
            }
        }
    }

    private fun select(target: StoreTarget) = work {
        val detail = auth.value?.let { client.item(target, it) } ?: client.item(target)
        runOnUiThread { selected.value = detail }
    }

    private fun checkUpdate() = work {
        try {
            val version = ReleaseUpdates.newerVersion(BuildConfig.VERSION_NAME)
            runOnUiThread {
                updateVersion.value = version
                message.value = if (version == null) getString(R.string.up_to_date)
                    else getString(R.string.update_available, version)
            }
        } catch (_: Exception) { error(getString(R.string.update_check_failed)) }
    }

    private fun toggleFavorite(itemId: String) {
        favorites.value = if (itemId in favorites.value) favorites.value - itemId else favorites.value + itemId
        prefs.edit().putStringSet("favorites", favorites.value).apply()
    }

    private fun sendCode(address: String) = work {
        client.sendCode(address)
        runOnUiThread { message.value = getString(R.string.code_sent) }
    }

    private fun login(address: String, code: String) = work {
        val session = client.login(address, code)
        val data = JSONObject().put("uid", session.uid).put("token", session.token)
            .put("cookies", JSONObject(session.cookies)).put("email", address)
        try { account.save(data.toString()) }
        catch (_: Exception) { error(getString(R.string.session_save_failed)) }
        val previous = selected.value
        val refreshed = previous?.let {
            runCatching { client.item(StoreTarget(it.itemId, it.packageName, it.name), session) }.getOrNull()
        }
        runOnUiThread {
            auth.value = session; email.value = address; selected.value = refreshed
            message.value = getString(R.string.signed_in)
        }
    }

    private fun logout() = work {
        try { account.clear() }
        catch (_: Exception) { error(getString(R.string.sign_out_failed)) }
        runOnUiThread {
            auth.value = null
            email.value = ""
            selected.value = null
        }
    }

    private fun getApp(detail: PublicItem) {
        val session = auth.value ?: run { message.value = getString(R.string.sign_in_first); return }
        work {
            val target = StoreTarget(detail.itemId, detail.packageName, detail.name)
            val current = client.item(target, session)
            runOnUiThread { selected.value = current }
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
            runOnUiThread {
                downloadProgress.value = null
                message.value = getString(R.string.ready_to_install)
            }
            installer.install(apk)
        }
    }

    override fun onResume() {
        super.onResume()
        val target = pendingPurchase ?: return
        val session = auth.value ?: return
        pendingPurchase = null
        worker.execute {
            runCatching { client.item(target, session) }.onSuccess { current ->
                runOnUiThread {
                    selected.value = current
                    message.value = if (current.entitlementStatus == 1) getString(R.string.purchase_ready)
                    else getString(R.string.purchase_not_confirmed)
                }
            }
        }
    }

    override fun onDestroy() {
        installer.close()
        worker.shutdown()
        super.onDestroy()
    }
}

data class StoreEntry(val target: StoreTarget, val info: PublicItem? = null)
