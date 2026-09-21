package dev.nkanf.picostore.sdk

import java.math.BigInteger
import java.net.URI
import java.net.URLEncoder
import org.json.JSONObject

const val PICO_ITEM_ID: String = "7288745304105664518"
const val PICO_PACKAGE: String = "com.vrchat.android"
const val OFFICIAL_STORE_URL: String =
    "https://store-global.picoxr.com/jp/detail/1/7288745304105664518"
data class StoreTarget(val itemId: String, val packageName: String, val name: String = packageName) {
    init {
        require(Regex("^[0-9]{1,20}$").matches(itemId)) { "valid PICO item ID required" }
        require(Regex("^[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+$").matches(packageName)) {
            "valid PICO package name required"
        }
    }
}
val DEFAULT_TARGET = StoreTarget(PICO_ITEM_ID, PICO_PACKAGE, "VRChat")

data class PicoStoreConfig(
    val storeHost: String = "https://appstore-us.picoxr.com",
    val accountHost: String = "https://matrix-us.picovr.com",
    val webStoreHost: String = "https://store-global.picoxr.com",
    val webRegion: String = "global",
    val manifestVersionCode: String = "401200000",
    val deviceName: String = "A9210",
    val appId: String = "314431",
    val clientType: String = "1",
    val language: String = "ja",
    val zone: String = "Asia/Shanghai",
    val passportAid: String = "308733",
    val devicePlatform: String = "android",
)

data class RequestSpec(val url: String, val headers: Map<String, String>, val body: String)

data class PicoAuth(
    val uid: String = "0",
    val token: String = "",
    val cookies: Map<String, String> = emptyMap(),
)

data class PublicItem(
    val itemId: String,
    val packageName: String,
    val name: String,
    val versionCode: Long,
    val price: String,
    val officialUrl: String,
    val iconUrl: String? = null,
    val coverUrl: String? = null,
    val summary: String = "",
    val description: String = "",
    val screenshots: List<String> = emptyList(),
    val score: Double? = null,
    val ageRating: String = "",
    val genres: String = "",
    val publisher: String = "",
    val supportedPlatforms: String = "",
    val appVersion: String = "",
    val currency: String = "",
    val entitlementStatus: Int? = null,
    val offerExists: Boolean? = null,
)

data class DownloadInfo(
    val itemId: String,
    val packageName: String,
    val versionCode: Long,
    val version: String,
    val size: Long,
    val md5: String,
    val url: String,
)

data class SearchItem(
    val itemId: String,
    val packageName: String,
    val name: String,
    val versionCode: Long,
    val coverUrl: String? = null,
    val summary: String = "",
    val price: String = "",
)

data class MirrorPolicy(
    val enabled: Boolean = true,
    val freeOnly: Boolean = true,
    val maxBytes: Long = 512L * 1024 * 1024,
)

enum class MirrorReason { ELIGIBLE, DISABLED, NOT_FREE, OVER_SIZE_LIMIT }

object PicoProtocol {
    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")
    private fun imageUrl(value: String?): String? {
        if (value.isNullOrBlank()) return null
        val uri = runCatching { URI(value) }.getOrNull() ?: return null
        return value.takeIf {
            uri.scheme?.lowercase() in setOf("http", "https") && !uri.host.isNullOrBlank()
        }
    }
    private fun authHeaders(auth: PicoAuth, config: PicoStoreConfig): Map<String, String> {
        require(auth.token.isNotEmpty() || auth.cookies.isNotEmpty()) { "authenticated PICO session required" }
        return buildMap {
            put("Content-Type", "application/json")
            put("Locale", config.language)
            if (auth.token.isNotEmpty()) put("X-Tt-Token", auth.token)
            if (auth.cookies.isNotEmpty()) put("Cookie", auth.cookies.entries.joinToString("; ") { (key, value) -> "$key=$value" })
        }
    }

    private fun storeUrl(path: String, uid: String = "0", timestamp: Long = System.currentTimeMillis() / 1000,
        config: PicoStoreConfig = PicoStoreConfig()): String {
        val query = linkedMapOf(
            "manifest_version_code" to config.manifestVersionCode,
            "device_name" to config.deviceName,
            "uid" to uid,
            "app_id" to config.appId,
            "app_language" to config.language,
            "client_type" to config.clientType,
            "zone_name" to config.zone,
            "timestamp" to timestamp.toString(),
        ).entries.joinToString("&") { (key, value) -> "$key=${encode(value)}" }
        return "${config.storeHost.trimEnd('/')}$path?$query"
    }

    @JvmStatic @JvmOverloads
    fun publicItemRequest(timestamp: Long = System.currentTimeMillis() / 1000, target: StoreTarget = DEFAULT_TARGET,
        config: PicoStoreConfig = PicoStoreConfig()): RequestSpec = RequestSpec(
        storeUrl("/api/app/v1/item/info", timestamp = timestamp, config = config),
        mapOf("Content-Type" to "application/json", "Locale" to config.language),
        JSONObject().put("package_name", target.packageName).toString(),
    )

    @JvmStatic
    fun accountItemRequest(auth: PicoAuth, target: StoreTarget = DEFAULT_TARGET,
        config: PicoStoreConfig = PicoStoreConfig()): RequestSpec = RequestSpec(
        storeUrl("/api/app/v1/item/info", auth.uid, config = config), authHeaders(auth, config),
        JSONObject().put("package_name", target.packageName).toString(),
    )

    @JvmStatic
    fun freeAcquisitionRequest(auth: PicoAuth, item: PublicItem, config: PicoStoreConfig = PicoStoreConfig()): RequestSpec {
        require(Regex("^0(?:\\.0+)?$").matches(item.price) && item.currency.isNotBlank()) {
            "free app price and currency required"
        }
        val body = JSONObject().put("item_id", BigInteger(item.itemId))
            .put("is_free_entitlment", true).put("currency", item.currency)
            .put("amount", item.price).put("support_cross_pay", false)
        return RequestSpec(storeUrl("/api/app/v1/item/price", auth.uid, config = config), authHeaders(auth, config), body.toString())
    }

    @JvmStatic
    fun parseFreeAcquisition(text: String): String {
        val root = JSONObject(text)
        check(root.optInt("code", -1) == 0) { "PICO free acquisition failed: ${root.optInt("code", -1)}" }
        val data = root.optJSONObject("data") ?: error("PICO free acquisition returned no order")
        check(data.optBoolean("free", false)) { "PICO did not confirm a free order" }
        val orderId = data.opt("order_id")?.toString().orEmpty()
        check(orderId.toBigIntegerOrNull()?.let { it > BigInteger.ZERO } == true) {
            "PICO free acquisition returned no order"
        }
        return orderId
    }

    @JvmStatic
    fun searchRequest(word: String, config: PicoStoreConfig = PicoStoreConfig()): RequestSpec {
        require(word.isNotBlank() && word.length <= 100) { "search word required" }
        val body = JSONObject().put("word", word.trim()).put(
            "pageable", JSONObject().put("next_id", 1).put("size", 20),
        )
        return RequestSpec(
            storeUrl("/api/app/v2/search/aggregation", config = config),
            mapOf("Content-Type" to "application/json", "Locale" to config.language), body.toString(),
        )
    }

    @JvmStatic
    fun parseSearchResults(text: String): List<SearchItem> {
        val root = JSONObject(text)
        require(root.getInt("code") == 0) { "PICO search failed" }
        val groups = root.getJSONObject("data").getJSONArray("search_list")
        val results = linkedMapOf<String, SearchItem>()
        for (groupIndex in 0 until groups.length()) {
            val items = groups.getJSONObject(groupIndex).optJSONArray("items") ?: continue
            for (index in 0 until items.length()) {
                val item = items.getJSONObject(index)
                val itemId = item.opt("item_id")?.toString() ?: continue
                val packageName = item.optString("package_name")
                val target = runCatching { StoreTarget(itemId, packageName) }.getOrNull() ?: continue
                results.putIfAbsent(itemId, SearchItem(
                    target.itemId, target.packageName, item.optString("name", packageName),
                    item.optLong("version_code", 0),
                    imageUrl(item.optJSONObject("cover")?.optString("square")),
                    item.optString("abstract"), item.opt("price")?.toString() ?: "",
                ))
            }
        }
        return results.values.toList()
    }

    @JvmStatic @JvmOverloads
    fun parsePublicItem(text: String, target: StoreTarget = DEFAULT_TARGET,
        config: PicoStoreConfig = PicoStoreConfig()): PublicItem {
        val root = JSONObject(text)
        require(root.getInt("code") == 0) { "PICO item lookup failed" }
        val data = root.getJSONObject("data")
        require(data.get("item_id").toString() == target.itemId && data.getString("package_name") == target.packageName) {
            "PICO returned an unexpected item or package"
        }
        val version = data.getLong("version_code")
        require(version > 0) { "PICO returned an invalid version code" }
        val cover = data.optJSONObject("cover")
        val detail = data.optJSONObject("detail")
        val screenshots = buildList {
            val images = data.optJSONArray("images")
            if (images != null) for (index in 0 until images.length()) {
                imageUrl(images.optJSONObject(index)?.optString("image_url"))?.let(::add)
            }
        }
        val score = data.optDouble("score", Double.NaN).takeIf { it.isFinite() && it > 0 }
        return PublicItem(
            target.itemId, target.packageName, data.optString("name", target.name).ifBlank { target.name },
            version, data.opt("price")?.toString() ?: "",
            "${config.webStoreHost.trimEnd('/')}/${config.webRegion}/detail/1/${target.itemId}",
            imageUrl(data.optString("icon")),
            imageUrl(cover?.optString("landscape")) ?: imageUrl(cover?.optString("square")),
            data.optString("abstract"),
            data.optJSONObject("description")?.optString("app_description").orEmpty(),
            screenshots, score, data.optJSONObject("age_rating")?.optString("name").orEmpty(),
            detail?.optString("app_genres").orEmpty(), detail?.optString("app_publisher").orEmpty(),
            detail?.optString("app_supported_platforms").orEmpty(), detail?.optString("app_version").orEmpty(),
            data.optString("currency"),
            data.optInt("entitlement_status", -1).takeIf { data.has("entitlement_status") },
            data.optBoolean("is_offer_exist").takeIf { data.has("is_offer_exist") },
        )
    }

    @JvmStatic
    fun encodeAccountField(value: String): String = value.toByteArray(Charsets.UTF_8).joinToString("") {
        "%02x".format((it.toInt() and 0xff) xor 5)
    }

    @JvmStatic
    fun accountRequest(kind: String, email: String, code: String? = null,
        config: PicoStoreConfig = PicoStoreConfig()): RequestSpec {
        require(Regex("^\\S+@\\S+\\.\\S+$").matches(email)) { "valid email required" }
        require(kind == "send-code" || kind == "login") { "unknown account action" }
        require(kind != "login" || !code.isNullOrEmpty()) { "verification code required" }
        val path = if (kind == "send-code") "/passport/email/send_code/" else "/passport/app/email/code_login/"
        val query = linkedMapOf(
            "multi_login" to "1", "account_sdk_source" to "app", "passport-sdk-version" to "30490",
            "aid" to config.passportAid, "device_platform" to config.devicePlatform,
        ).entries.joinToString("&") { (key, value) -> "$key=${encode(value)}" }
        val fields = if (kind == "send-code") linkedMapOf(
            "email" to encodeAccountField(email), "type" to encodeAccountField("13"),
            "email_logic_type" to "0", "mix_mode" to "1",
        ) else linkedMapOf(
            "email" to encodeAccountField(email), "ect_type" to "13",
            "code" to encodeAccountField(code.orEmpty()), "mix_mode" to "1", "email_logic_type" to "0",
        )
        return RequestSpec(
            "${config.accountHost.trimEnd('/')}$path?$query",
            mapOf("Content-Type" to "application/x-www-form-urlencoded"),
            fields.entries.joinToString("&") { (key, value) -> "$key=${encode(value)}" },
        )
    }

    @JvmStatic @JvmOverloads
    fun downloadInfoRequest(auth: PicoAuth, target: StoreTarget = DEFAULT_TARGET,
        config: PicoStoreConfig = PicoStoreConfig()): RequestSpec {
        return RequestSpec(
            storeUrl("/api/app/v1/download/info", auth.uid, config = config), authHeaders(auth, config),
            "{\"item_id\":${target.itemId},\"package_name\":\"${target.packageName}\"}",
        )
    }

    @JvmStatic @JvmOverloads
    fun parseDownloadInfo(text: String, target: StoreTarget = DEFAULT_TARGET): DownloadInfo {
        val root = JSONObject(text)
        require(root.getInt("code") == 0) { "PICO download info failed" }
        val data = root.getJSONObject("data")
        val pkg = data.getJSONObject("package")
        require(data.get("item_id").toString() == target.itemId && pkg.getString("package_name") == target.packageName) {
            "PICO returned an unexpected download package"
        }
        val version = pkg.getLong("version_code")
        val size = pkg.getLong("size")
        val md5 = pkg.getString("md5")
        val url = pkg.getString("path")
        require(version > 0 && size > 0 && Regex("^[a-fA-F0-9]{32}$").matches(md5) && url.startsWith("https://")) {
            "PICO returned incomplete APK metadata"
        }
        return DownloadInfo(target.itemId, target.packageName, version, pkg.optString("version"), size, md5.lowercase(), url)
    }

    @JvmStatic
    fun mirrorDecision(price: String, size: Long, policy: MirrorPolicy = MirrorPolicy()): MirrorReason {
        require(size > 0 && policy.maxBytes >= 0) { "invalid APK size or mirror policy" }
        if (!policy.enabled) return MirrorReason.DISABLED
        if (policy.freeOnly && !Regex("^0(?:\\.0+)?$").matches(price)) return MirrorReason.NOT_FREE
        if (size > policy.maxBytes) return MirrorReason.OVER_SIZE_LIMIT
        return MirrorReason.ELIGIBLE
    }
}
