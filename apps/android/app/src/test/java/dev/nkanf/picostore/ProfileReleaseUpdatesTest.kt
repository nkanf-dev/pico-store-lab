package dev.nkanf.picostore

import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.time.Instant

class ProfileReleaseUpdatesTest {
    private val hash = "a".repeat(64)
    private fun release(key: String, stamp: String, digest: String = "sha256:$hash", url: String? = null): String {
        val tag = "$key-profile-$stamp"
        val assetName = ProjectLinks.profileAssetName(key)
        val asset = url ?: ProjectLinks.profileAsset(key, tag)
        return """{"draft":false,"prerelease":false,"tag_name":"$tag","assets":[{"name":"$assetName","state":"uploaded","browser_download_url":"$asset","size":2048,"digest":"$digest"}]}"""
    }

    @Test fun discoversNewestUpdatesForIndependentProfileKeys() {
        val other = """{"draft":false,"prerelease":false,"tag_name":"runtime-v9","assets":[]}"""
        val older = "20260923T123455Z"
        val newer = "20260923T123456Z"
        val version = Instant.parse("2026-09-23T12:34:56Z").epochSecond
        val releases = "[$other,${release("vd",newer)},${release("vd",older)},${release("community",older)}]"
        val found = ProfileReleaseUpdates.parseReleases(emptyMap(), releases)
        assertEquals(version, found["vd"]?.version)
        assertEquals("community", found["community"]?.key)
        assertEquals(hash, found["vd"]?.sha256)
        assertEquals("2026-09-23T12:34:56Z", ProfileReleaseUpdates.display(version))
        assertEquals(setOf("community"), ProfileReleaseUpdates.parseReleases(mapOf("vd" to version), releases).keys)
    }

    @Test fun rejectsTamperedAssetLocationAndMissingDigest() {
        val stamp = "20260923T123456Z"
        assertThrows(IOException::class.java) {
            ProfileReleaseUpdates.parseRelease(emptyMap(), release("community", stamp, url="https://evil.example/profile.apk"))
        }
        assertThrows(IOException::class.java) {
            ProfileReleaseUpdates.parseRelease(emptyMap(), release("community", stamp, digest=""))
        }
        assertTrue(ProfileReleaseUpdates.parseReleases(emptyMap(), "[${release("community", "20260230T123456Z")}] ").isEmpty())
    }
}
