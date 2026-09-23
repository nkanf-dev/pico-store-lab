package dev.nkanf.picostore

import android.content.Context
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest
import java.time.Instant

internal data class AvailableProfile(val key: String, val version: Long, val url: String, val size: Long, val sha256: String)

/** Separate release stream; a profile update does not install or replace Lab. */
internal object ProfileReleaseUpdates {
    private const val MAX_JSON = 8 * 1_048_576
    private val digestPattern = Regex("sha256:([a-fA-F0-9]{64})")
    private val tagPattern = Regex("(${ProjectLinks.profileKeySyntax})-profile-([0-9]{8}T[0-9]{6}Z)")

    internal fun display(version: Long): String = Instant.ofEpochSecond(version).toString()

    private fun tagVersion(tag: String): Pair<String, Long>? {
        val match = tagPattern.matchEntire(tag) ?: return null
        val key = match.groupValues[1]
        val stamp = match.groupValues[2]
        return try {
            val iso = "${stamp.substring(0, 4)}-${stamp.substring(4, 6)}-${stamp.substring(6, 8)}T" +
                "${stamp.substring(9, 11)}:${stamp.substring(11, 13)}:${stamp.substring(13, 15)}Z"
            val version = Instant.parse(iso).epochSecond
            if (version !in 1..2_100_000_000 || stamp != iso.replace("-", "").replace(":", "")) null else key to version
        } catch (_: Exception) { null }
    }

    fun findUpdates(current: Map<String, Long>): Map<String, AvailableProfile> {
        val newest = mutableMapOf<String, AvailableProfile>()
        for (page in 1..ProjectLinks.profileReleaseMaxPages) {
            val url = if (page == 1) ProjectLinks.bridgeReleasesApi else ProjectLinks.bridgeReleasesPage(page)
            val connection = UpdateHttp.open(url, asset = false)
            val json = try { UpdateHttp.read(connection, MAX_JSON).toString(Charsets.UTF_8) }
                finally { connection.disconnect() }
            val releases = try { JSONArray(json) } catch (error: Exception) { throw IOException("profile_metadata", error) }
            for ((key, update) in parseReleases(current, json)) {
                if (update.version > (newest[key]?.version ?: 0L)) newest[key] = update
            }
            if (releases.length() < ProjectLinks.profileReleasePageSize) return newest
        }
        throw IOException("profile_metadata")
    }

    internal fun parseReleases(current: Map<String, Long>, json: String): Map<String, AvailableProfile> {
        if (json.toByteArray(Charsets.UTF_8).size > MAX_JSON) throw IOException("profile_metadata")
        val releases = try { JSONArray(json) } catch (error: Exception) { throw IOException("profile_metadata", error) }
        return (0 until releases.length()).map { releases.getJSONObject(it) }
            .mapNotNull { release ->
                try { parseRelease(current, release.toString()) } catch (_: IOException) { null }
            }.groupBy { it.key }.mapValues { (_, entries) -> entries.maxBy { it.version } }
    }

    internal fun parseRelease(current: Map<String, Long>, json: String): AvailableProfile? {
      try {
        if (json.toByteArray(Charsets.UTF_8).size > MAX_JSON) throw IOException("profile_metadata")
        val release = JSONObject(json)
        if (release.getBoolean("draft") || release.getBoolean("prerelease")) return null
        val tag = release.getString("tag_name")
        val (key, version) = tagVersion(tag) ?: return null
        if (version <= current.getOrDefault(key, 0L)) return null
        val assets = release.getJSONArray("assets")
        val assetName = ProjectLinks.profileAssetName(key)
        val matches = (0 until assets.length()).map { assets.getJSONObject(it) }.filter { it.optString("name") == assetName }
        val asset = matches.singleOrNull() ?: throw IOException("profile_metadata")
        val url = ProjectLinks.profileAsset(key, tag)
        if (asset.getString("state") != "uploaded" || asset.getString("browser_download_url") != url)
            throw IOException("profile_metadata")
        val size = asset.getLong("size")
        if (size !in 1..32L * 1024 * 1024) throw IOException("profile_size")
        val hash = digestPattern.matchEntire(asset.getString("digest"))?.groupValues?.get(1)?.lowercase()
            ?: throw IOException("profile_metadata")
        return AvailableProfile(key, version, url, size, hash)
      } catch (error: IOException) { throw error }
        catch (error: Exception) { throw IOException("profile_metadata", error) }
    }

    fun download(context: Context, update: AvailableProfile, progress: (Long, Long) -> Unit): File {
        if (!ProjectLinks.profileKeyPattern.matches(update.key)) throw IOException("profile_metadata")
        if (update.version < 1 || update.size !in 1..32L * 1024 * 1024 ||
            update.url != ProjectLinks.profileAsset(update.key, ProjectLinks.profileTag(update.key, update.version)) ||
            !update.sha256.matches(Regex("[a-f0-9]{64}"))) throw IOException("profile_metadata")
        val file = File.createTempFile("matrix-profile-", ".apk", context.cacheDir)
        try {
            val connection = UpdateHttp.open(update.url, asset = true)
            try {
                if (connection.contentLengthLong > update.size) throw IOException("profile_size")
                val digest = MessageDigest.getInstance("SHA-256")
                var received = 0L
                connection.inputStream.use { input -> FileOutputStream(file).use { output ->
                    val buffer = ByteArray(65_536)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        received += count
                        if (received > update.size) throw IOException("profile_size")
                        digest.update(buffer, 0, count)
                        output.write(buffer, 0, count)
                        progress(received, update.size)
                    }
                    output.fd.sync()
                } }
                if (received != update.size || digest.digest().hex() != update.sha256) throw IOException("profile_digest")
            } finally { connection.disconnect() }
            return file
        } catch (error: Exception) { file.delete(); throw error }
    }
}
