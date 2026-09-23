package dev.nkanf.picostore

import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.time.Instant

class ProfileReleaseUpdatesTest {
    private val hash = "a".repeat(64)
    private fun release(stamp: String, digest: String = "sha256:$hash", url: String? = null): String {
        val tag = "vd-profile-$stamp"
        val asset = url ?: "https://github.com/nkanf-dev/pico-matrix-bridge/releases/download/$tag/matrix-profile-vd.apk"
        return """{"draft":false,"prerelease":false,"tag_name":"$tag","assets":[{"name":"matrix-profile-vd.apk","state":"uploaded","browser_download_url":"$asset","size":2048,"digest":"$digest"}]}"""
    }

    @Test fun selectsNewestProfileReleaseIndependentlyOfOtherBridgeReleases() {
        val other = """{"draft":false,"prerelease":false,"tag_name":"runtime-v9","assets":[]}"""
        val older = "20260923T123455Z"
        val newer = "20260923T123456Z"
        val version = Instant.parse("2026-09-23T12:34:56Z").epochSecond
        val result = ProfileReleaseUpdates.parseReleases(1,"[$other,${release(newer)},${release(older)}]")
        assertEquals(version,result?.version)
        assertEquals("2026-09-23T12:34:56Z",ProfileReleaseUpdates.display(version))
        assertEquals(hash,result?.sha256)
        assertNull(ProfileReleaseUpdates.parseReleases(version,"[$other,${release(newer)}]"))
    }

    @Test fun rejectsTamperedAssetLocationAndMissingDigest() {
        val wrong = release("20260923T123456Z",url="https://evil.example/profile.apk")
        assertThrows(IOException::class.java) { ProfileReleaseUpdates.parseReleases(1,"[$wrong]") }
        assertThrows(IOException::class.java) { ProfileReleaseUpdates.parseReleases(1,"[${release("20260923T123456Z",digest="")}]") }
        assertNull(ProfileReleaseUpdates.parseReleases(1,"[${release("20260230T123456Z")}]") )
    }
}
