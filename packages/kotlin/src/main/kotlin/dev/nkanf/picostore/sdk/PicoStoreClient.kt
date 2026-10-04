package dev.nkanf.picostore.sdk

import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.file.Files
import java.security.MessageDigest
import org.json.JSONObject

data class StoreResponse(val body: String, val headers: Map<String, List<String>> = emptyMap()) {
    fun header(name: String): String = headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }
        ?.value?.firstOrNull().orEmpty()
    fun headerValues(name: String): List<String> = headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }
        ?.value.orEmpty()
}

fun interface StoreTransport {
    fun post(request: RequestSpec, retries: Int): StoreResponse
}

object HttpStoreTransport : StoreTransport {
    override fun post(request: RequestSpec, retries: Int): StoreResponse {
        require(retries > 0) { "at least one request attempt required" }
        var lastError: Exception? = null
        repeat(retries) { attempt ->
            try {
                val connection = URL(request.url).openConnection() as HttpURLConnection
                try {
                    connection.requestMethod = "POST"
                    connection.connectTimeout = 25_000
                    connection.readTimeout = 25_000
                    connection.doOutput = true
                    request.headers.forEach { (key, value) -> connection.setRequestProperty(key, value) }
                    connection.outputStream.use { it.write(request.body.toByteArray(Charsets.UTF_8)) }
                    val status = connection.responseCode
                    if (status !in 200..299) {
                        if (status < 500 && status != 429) error("PICO HTTP $status")
                        throw java.io.IOException("PICO HTTP $status")
                    }
                    val body = connection.inputStream.bufferedReader().use { it.readText() }
                    require(body.length <= 4 * 1024 * 1024) { "PICO response exceeds 4 MiB" }
                    return StoreResponse(body, connection.headerFields.filterKeys { !it.isNullOrEmpty() })
                } finally { connection.disconnect() }
            } catch (error: Exception) {
                if (error is IllegalStateException && error.message?.startsWith("PICO HTTP 4") == true &&
                    error.message != "PICO HTTP 429") throw error
                lastError = error
                if (attempt + 1 < retries) Thread.sleep((attempt + 1).coerceAtMost(5) * 1_000L)
            }
        }
        throw IllegalStateException("PICO request failed: ${lastError?.message}", lastError)
    }
}

class PicoStoreClient(val transport: StoreTransport = HttpStoreTransport,
    val config: PicoStoreConfig = PicoStoreConfig()) {
    fun search(word: String): List<SearchItem> = PicoProtocol.parseSearchResults(
        transport.post(PicoProtocol.searchRequest(word, config), 3).body,
    )

    fun item(target: StoreTarget): PublicItem = PicoProtocol.parsePublicItem(
        transport.post(PicoProtocol.publicItemRequest(target = target, config = config), 3).body, target, config,
    )

    fun item(target: StoreTarget, auth: PicoAuth): PublicItem = PicoProtocol.parsePublicItem(
        transport.post(PicoProtocol.accountItemRequest(auth, target, config), 3).body, target, config,
    )

    fun acquireFree(item: PublicItem, auth: PicoAuth): String = PicoProtocol.parseFreeAcquisition(
        transport.post(PicoProtocol.freeAcquisitionRequest(auth, item, config), 1).body,
    )

    fun ensureEntitlement(target: StoreTarget, auth: PicoAuth): PublicItem {
        val current = item(target, auth)
        if (current.entitlementStatus == 1) return current
        check(current.offerExists == true) { "PICO has no offer for this account region" }
        check(Regex("^0(?:\\.0+)?$").matches(current.price)) { "PICO app is not free or already owned" }
        val acquisitionError = runCatching { acquireFree(current, auth) }.exceptionOrNull()
        repeat(3) { attempt ->
            val updated = try { item(target, auth) } catch (error: Exception) {
                if (attempt == 2) throw (acquisitionError ?: error)
                Thread.sleep(400)
                return@repeat
            }
            if (updated.entitlementStatus == 1) return updated
            if (attempt < 2) Thread.sleep(400)
        }
        if (acquisitionError != null) throw acquisitionError
        error("PICO entitlement was not confirmed after free acquisition")
    }

    fun entitledDownloadInfo(target: StoreTarget, auth: PicoAuth): DownloadInfo {
        ensureEntitlement(target, auth)
        return downloadInfo(target, auth)
    }

    fun sendCode(email: String) {
        accountData(transport.post(PicoProtocol.accountRequest("send-code", email, config = config), 1).body)
    }

    fun login(email: String, code: String): PicoAuth {
        val response = transport.post(PicoProtocol.accountRequest("login", email, code, config), 1)
        val data = accountData(response.body)
        val cookies = response.headerValues("Set-Cookie").mapNotNull { line ->
            line.substringBefore(';').split('=', limit = 2).takeIf { it.size == 2 }
                ?.let { it[0] to it[1] }
        }.toMap()
        val auth = PicoAuth(
            data.optString("user_id_str").ifBlank { data.opt("user_id")?.toString() ?: "0" },
            response.header("x-tt-token"), cookies,
        )
        require(auth.token.isNotEmpty() || auth.cookies.isNotEmpty()) { "PICO login returned no usable session" }
        return auth
    }

    fun downloadInfo(target: StoreTarget, auth: PicoAuth): DownloadInfo = PicoProtocol.parseDownloadInfo(
        transport.post(PicoProtocol.downloadInfoRequest(auth, target, config), 3).body, target,
    )

    fun download(target: StoreTarget, auth: PicoAuth, output: File): File =
        downloadVerifiedApk(entitledDownloadInfo(target, auth), output)

    private fun accountData(body: String): JSONObject {
        val root = JSONObject(body)
        require(root.optString("message") == "success") { "PICO account request rejected" }
        return root.optJSONObject("data") ?: JSONObject()
    }
}

private val downloadPublicationLock = Any()

fun downloadVerifiedApk(info: DownloadInfo, output: File, retries: Int = 8): File =
    downloadVerifiedApk(info, output, retries,
        { URL(info.url).openConnection() as HttpURLConnection }, { Thread.sleep(it) })

internal fun downloadVerifiedApk(info: DownloadInfo, output: File, retries: Int,
    connect: () -> HttpURLConnection, pause: (Long) -> Unit): File {
    require(info.url.startsWith("https://") && output.extension.lowercase() == "apk" && retries > 0) {
        "HTTPS APK URL and new .apk output required"
    }
    require(!output.exists()) { "output APK already exists" }
    val temporary = File.createTempFile("${output.name}.", ".part", output.absoluteFile.parentFile)
    var lastError: Exception? = null
    try {
        repeat(retries) { attempt ->
            try {
                val connection = connect()
                try {
                    connection.connectTimeout = 60_000
                    connection.readTimeout = 60_000
                    require(connection.responseCode in 200..299) { "APK HTTP ${connection.responseCode}" }
                    connection.inputStream.use { input ->
                        temporary.outputStream().use { stream ->
                            val buffer = ByteArray(65_536)
                            while (true) {
                                val count = input.read(buffer)
                                if (count < 0) break
                                stream.write(buffer, 0, count)
                            }
                        }
                    }
                    val digest = MessageDigest.getInstance("MD5")
                    temporary.inputStream().use { stream ->
                        val buffer = ByteArray(65_536)
                        while (true) {
                            val count = stream.read(buffer)
                            if (count < 0) break
                            digest.update(buffer, 0, count)
                        }
                    }
                    val actual = digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
                    require(actual == info.md5) { "APK digest mismatch" }
                    synchronized(downloadPublicationLock) {
                        if (output.exists()) throw java.nio.file.FileAlreadyExistsException(output.path)
                        Files.move(temporary.toPath(), output.toPath())
                    }
                    return output
                } finally { connection.disconnect() }
            } catch (error: Exception) {
                lastError = error
                if (error is java.nio.file.FileAlreadyExistsException ||
                    error.message == "APK digest mismatch") throw error
                if (attempt + 1 < retries) pause((attempt + 1).coerceAtMost(5) * 1_000L)
            }
        }
        error("APK download failed: ${lastError?.message}")
    } finally {
        runCatching { temporary.delete() }
    }
}
