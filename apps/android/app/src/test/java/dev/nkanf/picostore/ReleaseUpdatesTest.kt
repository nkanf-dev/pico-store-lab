package dev.nkanf.picostore

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ReleaseUpdatesTest {
    private val digest = "ab".repeat(32)
    private val apkName = "pico-store-android.apk"
    private val tag = "v0.2.0"
    private fun asset(name: String = apkName, size: Long = 1234) = JSONObject()
        .put("name", name).put("size", size).put("state", "uploaded")
        .put("browser_download_url", "https://github.com/nkanf-dev/pico-store-lab/releases/download/$tag/$name")
        .put("digest", "sha256:$digest")
    private fun release(vararg assets: JSONObject) = JSONObject().put("tag_name", tag)
        .put("draft", false).put("prerelease", false).put("assets", JSONArray(assets.toList()))

    @Test fun choosesExactAndroidAssetAndUsesGithubDigestWithoutFetchingChecksums() {
        val json = release(asset("pico-store-android-0.2.0-debug.apk"), asset(), asset("desktop.zip"))
        val update = ReleaseUpdates.parseRelease("0.1.3", json.toString()) { _, _ -> error("Unneeded download") }!!
        assertEquals("0.2.0", update.version)
        assertEquals(digest, update.sha256)
        assertEquals(1234L, update.size)
        assertTrue(update.url.endsWith("/$apkName"))
    }

    @Test fun rejectsAmbiguousAssetIdentityAndWrongDownloadLocation() {
        assertCode("update_metadata") { ReleaseUpdates.parseRelease("0.1.3", release(asset(), asset()).toString()) }
        for (url in listOf(
            "http://github.com/nkanf-dev/pico-store-lab/releases/download/$tag/$apkName",
            "https://github.com/other/repo/releases/download/$tag/$apkName",
            "https://github.com/nkanf-dev/pico-store-lab/releases/download/v0.3.0/$apkName",
            "https://github.com/nkanf-dev/pico-store-lab/releases/download/$tag/$apkName?anything=1",
        )) {
            assertCode("update_metadata") {
                ReleaseUpdates.parseRelease("0.1.3", release(asset().put("browser_download_url", url)).toString())
            }
        }
    }

    @Test fun ignoresOldEqualDraftAndPreviewReleases() {
        assertNull(ReleaseUpdates.parseRelease("0.2.0", release(asset()).toString()))
        assertNull(ReleaseUpdates.parseRelease("0.3.0", release(asset()).toString()))
        assertNull(ReleaseUpdates.parseRelease("0.1.3", release(asset()).put("draft", true).toString()))
        assertNull(ReleaseUpdates.parseRelease("0.1.3", release(asset()).put("prerelease", true).toString()))
        assertCode("update_metadata") {
            ReleaseUpdates.parseRelease("0.1.3", release(asset()).put("tag_name", "v0.2.0-beta.1").toString())
        }
    }

    @Test fun comparesNumericVersionsWithoutOverflow() {
        assertTrue(ReleaseUpdates.isNewer("0.10.0", "0.9.99"))
        assertTrue(ReleaseUpdates.isNewer("999999999999999.0.0", "1.0.0"))
        assertFalse(ReleaseUpdates.isNewer("1.99.99", "2.0.0"))
        for (version in listOf("01.2.0", "1.2", "1.2.3+local", "-1.2.3", "1.2.3-beta")) {
            assertCode("update_metadata") { ReleaseUpdates.isNewer(version, "0.1.3") }
        }
    }

    @Test fun fallsBackToExactChecksumEntryAndVerifiesChecksumAssetDigest() {
        val text = "${"cd".repeat(32)}  desktop.zip\n$digest *$apkName\n".toByteArray()
        val sums = asset("SHA256SUMS", text.size.toLong()).put("digest", "sha256:${text.sha256()}")
        val json = release(asset().put("digest", JSONObject.NULL), sums).toString()
        val update = ReleaseUpdates.parseRelease("0.1.3", json) { url, size ->
            assertTrue(url.endsWith("/$tag/SHA256SUMS"))
            assertEquals(text.size.toLong(), size)
            text
        }
        assertEquals(digest, update!!.sha256)
        assertCode("update_integrity") {
            ReleaseUpdates.parseRelease("0.1.3", json) { _, _ -> text.copyOf().also { it[0] = '0'.code.toByte() } }
        }
    }

    @Test fun missingMalformedDuplicateOrForeignChecksumsCannotAuthorizeDownload() {
        assertCode("update_metadata") {
            ReleaseUpdates.parseRelease("0.1.3", release(asset().put("digest", JSONObject.NULL)).toString())
        }
        assertCode("update_metadata") {
            ReleaseUpdates.parseRelease("0.1.3", release(asset().put("digest", "md5:abcd")).toString())
        }
        for (text in listOf("$digest  other.apk\n", "$digest  $apkName\n$digest  $apkName\n", "$digest  ../$apkName\n")) {
            assertCode("update_metadata") { ReleaseUpdates.checksumForApk(text) }
        }
    }

    @Test fun boundsAssetSizesAndMetadataBytes() {
        for (size in listOf(-1L, 0L, ReleaseUpdates.MAX_APK_BYTES + 1)) {
            assertCode("update_metadata") { ReleaseUpdates.parseRelease("0.1.3", release(asset(size = size)).toString()) }
        }
        assertCode("update_metadata") { ReleaseUpdates.parseRelease("0.1.3", " ".repeat(1_048_577)) }
    }

    @Test fun redirectedDownloadsStayOnGitHubHttpsHosts() {
        assertTrue(UpdateHttp.permitted("https://release-assets.githubusercontent.com/path?sig=value", true))
        for (url in listOf("http://github.com/file", "https://github.com.evil.test/file", "https://user@github.com/file",
            "https://github.com:444/file", "https://127.0.0.1/file", "https://github.com/file#fragment")) {
            assertFalse(url, UpdateHttp.permitted(url, true))
        }
        assertTrue(UpdateHttp.permitted("https://api.github.com/repos/nkanf-dev/pico-store-lab/releases/latest", false))
        assertFalse(UpdateHttp.permitted("https://api.github.com/repos/other/repo/releases/latest", false))
    }

    private fun assertCode(expected: String, action: () -> Unit) {
        try { action(); fail("Expected $expected") }
        catch (error: SelfUpdateException) { assertEquals(expected, error.code) }
    }
}
