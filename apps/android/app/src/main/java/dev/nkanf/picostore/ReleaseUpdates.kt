package dev.nkanf.picostore

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.MessageDigest

internal data class AvailableUpdate(val version: String, val url: String, val size: Long, val sha256: String)
data class ReleaseAnnouncement(val version: String, val body: String)

internal class SelfUpdateException(val code: String, cause: Throwable? = null) : IOException(code, cause)

internal object ReleaseUpdates {
    private const val APK_NAME = "pico-store-android.apk"
    private const val JSON_LIMIT = 1_048_576
    private const val CHECKSUM_LIMIT = 262_144
    internal const val MAX_APK_BYTES = 2_147_483_648L
    private val stableVersion = Regex("(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)")
    private val sha256 = Regex("[a-fA-F0-9]{64}")

    fun newerVersion(current: String): String? = findUpdate(current)?.version

    fun findAnnouncement(current: String): ReleaseAnnouncement? {
        val connection = UpdateHttp.open(ProjectLinks.storeLatestApi, asset = false)
        val json = try {
            UpdateHttp.read(connection, JSON_LIMIT).toString(Charsets.UTF_8)
        } finally { connection.disconnect() }
        return parseAnnouncement(current, json)
    }

    internal fun parseAnnouncement(current: String, json: String): ReleaseAnnouncement? = metadata {
        if (json.toByteArray(Charsets.UTF_8).size > JSON_LIMIT) throw SelfUpdateException("update_metadata")
        val release = JSONObject(json)
        if (release.getBoolean("draft") || release.getBoolean("prerelease")) return@metadata null
        val version = release.getString("tag_name").removePrefix("v")
        if (isNewer(current.removePrefix("v"), version)) return@metadata null
        val body = release.optString("body").trim()
        if (body.isEmpty()) return@metadata null
        ReleaseAnnouncement(version, body.take(32_768))
    }

    fun findUpdate(current: String): AvailableUpdate? {
        val connection = UpdateHttp.open(ProjectLinks.storeLatestApi, asset = false)
        val json = try {
            UpdateHttp.read(connection, JSON_LIMIT).toString(Charsets.UTF_8)
        } finally { connection.disconnect() }
        return parseRelease(current, json) { url, size ->
            val checksums = UpdateHttp.open(url, asset = true)
            try {
                UpdateHttp.read(checksums, CHECKSUM_LIMIT).also {
                    if (it.size.toLong() != size) throw SelfUpdateException("update_metadata")
                }
            } finally { checksums.disconnect() }
        }
    }

    /** Pure parser: download only the checksum asset when GitHub has no APK digest. */
    internal fun parseRelease(
        current: String,
        json: String,
        readChecksums: (String, Long) -> ByteArray = { _, _ -> throw SelfUpdateException("update_metadata") },
    ): AvailableUpdate? = metadata {
        if (json.toByteArray(Charsets.UTF_8).size > JSON_LIMIT) throw SelfUpdateException("update_metadata")
        val release = JSONObject(json)
        if (release.getBoolean("draft") || release.getBoolean("prerelease")) return@metadata null
        val tag = release.getString("tag_name")
        val version = tag.removePrefix("v")
        if (!isNewer(version, current.removePrefix("v"))) return@metadata null
        val assets = release.getJSONArray("assets")
        val candidates = (0 until assets.length()).map { assets.getJSONObject(it) }
        val apk = candidates.filter { it.optString("name") == APK_NAME }.singleOrNull()
            ?: throw SelfUpdateException("update_metadata")
        val url = checkedAsset(apk, tag, APK_NAME)
        val size = apk.getLong("size")
        if (size !in 1..MAX_APK_BYTES) throw SelfUpdateException("update_metadata")
        val digest = githubDigest(apk) ?: run {
            val sums = candidates.filter { it.optString("name") == "SHA256SUMS" }.singleOrNull()
                ?: throw SelfUpdateException("update_metadata")
            val sumsUrl = checkedAsset(sums, tag, "SHA256SUMS")
            val sumsSize = sums.getLong("size")
            if (sumsSize !in 1..CHECKSUM_LIMIT.toLong()) throw SelfUpdateException("update_metadata")
            val bytes = readChecksums(sumsUrl, sumsSize)
            if (bytes.size.toLong() != sumsSize) throw SelfUpdateException("update_metadata")
            githubDigest(sums)?.let { expected ->
                if (bytes.sha256() != expected) throw SelfUpdateException("update_integrity")
            }
            checksumForApk(bytes.toString(Charsets.UTF_8))
        }
        AvailableUpdate(version, url, size, digest)
    }

    internal fun validate(update: AvailableUpdate) {
        val expected = listOf("v${update.version}", update.version).map { "${ProjectLinks.storeAssetRoot}$it/$APK_NAME" }
        if (!stableVersion.matches(update.version) || update.version.length > 96 ||
            update.url !in expected || update.size !in 1..MAX_APK_BYTES || !sha256.matches(update.sha256)) {
            throw SelfUpdateException("update_metadata")
        }
    }

    internal fun isNewer(candidate: String, current: String): Boolean {
        if (candidate.length > 96 || current.length > 96 ||
            !stableVersion.matches(candidate) || !stableVersion.matches(current)) {
            throw SelfUpdateException("update_metadata")
        }
        // Compare arbitrary-length numeric components without overflow or lexical 9 > 10 mistakes.
        for ((remote, installed) in candidate.split('.').zip(current.split('.'))) {
            val difference = if (remote.length == installed.length) remote.compareTo(installed)
                else remote.length.compareTo(installed.length)
            if (difference != 0) return difference > 0
        }
        return false
    }

    internal fun checksumForApk(text: String): String {
        val entry = Regex("^([a-fA-F0-9]{64}) [ *]" + Regex.escape(APK_NAME) + "$")
        val matches = text.lineSequence().mapNotNull { entry.matchEntire(it.removeSuffix("\r")) }.toList()
        if (matches.size != 1) throw SelfUpdateException("update_metadata")
        return matches.single().groupValues[1].lowercase()
    }

    private fun checkedAsset(asset: JSONObject, tag: String, name: String): String {
        val expected = "${ProjectLinks.storeAssetRoot}$tag/$name"
        if (asset.getString("state") != "uploaded" || asset.getString("browser_download_url") != expected) {
            throw SelfUpdateException("update_metadata")
        }
        return expected
    }

    private fun githubDigest(asset: JSONObject): String? {
        if (!asset.has("digest") || asset.isNull("digest")) return null
        val digest = asset.getString("digest")
        if (digest.isEmpty()) return null
        if (!digest.startsWith("sha256:") || !sha256.matches(digest.removePrefix("sha256:"))) {
            throw SelfUpdateException("update_metadata")
        }
        return digest.removePrefix("sha256:").lowercase()
    }

    private inline fun <T> metadata(block: () -> T): T = try { block() }
    catch (error: SelfUpdateException) { throw error }
    catch (error: Exception) { throw SelfUpdateException("update_metadata", error) }
}

/** GitHub redirects release downloads to these HTTPS asset hosts; never forward credentials. */
internal object UpdateHttp {
    private val assetHosts = ProjectLinks.githubAssetHosts
    private val apiPaths = setOf(ProjectLinks.storeLatestApiPath)

    fun open(url: String, asset: Boolean): HttpURLConnection {
        var next = url
        repeat(6) { attempt ->
            if (!permitted(next, asset)) throw SelfUpdateException("update_metadata")
            val connection = try { URL(next).openConnection() as HttpURLConnection }
            catch (error: Exception) { throw SelfUpdateException("update_network", error) }
            try {
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 15_000
                connection.readTimeout = 30_000
                connection.setRequestProperty("Accept", if (asset) "application/octet-stream" else "application/vnd.github+json")
                connection.setRequestProperty("Accept-Encoding", "identity")
                connection.setRequestProperty("User-Agent", "PICO-Store-Lab-Android")
                if (!asset) connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
                val status = connection.responseCode
                if (status == 200) return connection
                if (asset && status in setOf(301, 302, 303, 307, 308) && attempt < 5) {
                    val location = connection.getHeaderField("Location") ?: throw SelfUpdateException("update_network")
                    next = URL(URL(next), location).toExternalForm()
                    connection.disconnect()
                } else throw SelfUpdateException("update_network")
            } catch (error: Exception) {
                connection.disconnect()
                if (error is SelfUpdateException) throw error
                throw SelfUpdateException("update_network", error)
            }
        }
        throw SelfUpdateException("update_network")
    }

    internal fun permitted(url: String, asset: Boolean): Boolean = runCatching {
        val uri = URI(url)
        uri.scheme == "https" && uri.rawUserInfo == null && uri.port == -1 && uri.rawFragment == null &&
            if (asset) uri.host in assetHosts else uri.host == ProjectLinks.apiHost &&
                ((uri.rawPath in apiPaths && uri.rawQuery == null) ||
                    (uri.rawPath == ProjectLinks.bridgeReleasesApiPath && ProjectLinks.permittedBridgeReleasesQuery(uri.rawQuery)))
    }.getOrDefault(false)

    fun read(connection: HttpURLConnection, limit: Int): ByteArray = try {
        if (connection.contentLengthLong > limit) throw SelfUpdateException("update_metadata")
        connection.inputStream.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(16_384)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                if (output.size() + count > limit) throw SelfUpdateException("update_metadata")
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        }
    } catch (error: SelfUpdateException) { throw error }
    catch (error: IOException) { throw SelfUpdateException("update_network", error) }
}

internal fun ByteArray.sha256(): String = MessageDigest.getInstance("SHA-256").digest(this).hex()
internal fun ByteArray.hex(): String = joinToString("") { "%02x".format(it.toInt() and 255) }
