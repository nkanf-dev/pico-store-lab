package dev.nkanf.picostore

import dev.nkanf.picostore.sdk.DownloadInfo
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.file.Files
import java.security.MessageDigest

class ApkDownloadTest {
    private val bytes = javaClass.getResourceAsStream("/apk/identity.apk")!!.use { it.readBytes() }
    private val info = DownloadInfo("123", "org.picolab.fixture", (1L shl 32) + 42, "1", bytes.size.toLong(),
        MessageDigest.getInstance("MD5").digest(bytes).hex(), "https://example.test/app.apk")

    private fun connection(body: ByteArray = bytes, length: Long = body.size.toLong(), status: Int = 200) =
        object : HttpURLConnection(URL(info.url)) {
            override fun connect() {}
            override fun disconnect() {}
            override fun usingProxy() = false
            override fun getResponseCode() = status
            override fun getContentLengthLong() = length
            override fun getInputStream() = body.inputStream()
        }

    private fun inDirectory(block: (File) -> Unit) {
        val directory = Files.createTempDirectory("apk-download-test").toFile()
        try { block(directory) } finally { directory.deleteRecursively() }
    }

    private fun failure(code: String, action: () -> Unit) {
        try { action(); fail("Expected $code") }
        catch (error: ApkDownloadException) { assertEquals(code, error.code) }
    }

    @Test fun originalDownloadsAndReusesExactBytesWithoutPlatformOrProfileParser() = inDirectory { dir ->
        var calls = 0
        val downloader = ApkDownload(dir, { calls++; connection() })
        val progress = mutableListOf<Long>()
        val file = downloader.download(info) { received, _ -> progress += received }
        assertArrayEquals(bytes, file.readBytes())
        assertEquals(info.size, progress.last())
        assertEquals(ApkIdentity.Identity(info.packageName, info.versionCode), ApkIdentity.read(file))
        assertEquals(file, downloader.download(info) { _, _ -> })
        assertEquals(1, calls)
        assertEquals(listOf(file), dir.listFiles()!!.toList())
    }

    @Test fun wrongPackageAndVersionAreDistinctAndNeverBecomeCachedApks() = inDirectory { dir ->
        val downloader = ApkDownload(dir, { connection() })
        failure("apk_package") { downloader.download(info.copy(packageName = "org.other.app")) { _, _ -> } }
        failure("apk_version") { downloader.download(info.copy(versionCode = 42)) { _, _ -> } }
        assertTrue(dir.listFiles()!!.isEmpty())
    }

    @Test fun truncatedOversizedAndWrongDigestDownloadsNeverReachIdentityOrInstall() = inDirectory { dir ->
        for (body in listOf(bytes.dropLast(1).toByteArray(), bytes + byteArrayOf(0), bytes.copyOf().also { it[0] = 0 })) {
            val downloader = ApkDownload(dir, { connection(body, -1) }, { _, _ -> fail("Invalid bytes reached identity") })
            failure("apk_integrity") { downloader.download(info) { _, _ -> } }
            assertTrue(dir.listFiles()!!.isEmpty())
        }
    }

    @Test fun malformedArchiveIsNotReportedAsVersionMismatch() = inDirectory { dir ->
        val body = "not an APK".toByteArray()
        val candidate = info.copy(size = body.size.toLong(), md5 = MessageDigest.getInstance("MD5").digest(body).hex())
        failure("apk_invalid") { ApkDownload(dir, { connection(body) }).download(candidate) { _, _ -> } }
        assertTrue(dir.listFiles()!!.isEmpty())
    }

    @Test fun stalePartialAndCorruptCacheAreReplacedButOtherAppsArePreserved() = inDirectory { dir ->
        val downloader = ApkDownload(dir, { connection() })
        val file = downloader.download(info) { _, _ -> }
        file.writeText("incomplete")
        val partial = File(dir, file.name + ".part").apply { writeText("interrupted") }
        val unrelated = File(dir, "org.other.app-1-${"0".repeat(32)}.apk").apply { writeText("other") }
        val older = File(dir, "${info.packageName}-1-${"0".repeat(32)}.apk").apply { writeText("old") }
        assertArrayEquals(bytes, downloader.download(info) { _, _ -> }.readBytes())
        assertFalse(partial.exists())
        assertFalse(older.exists())
        assertTrue(unrelated.exists())
    }

    @Test fun failedReplacementKeepsPreviouslyVerifiedDownload() = inDirectory { dir ->
        val original = ApkDownload(dir, { connection() }).download(info) { _, _ -> }
        failure("apk_integrity") {
            ApkDownload(dir, { connection(bytes.dropLast(1).toByteArray(), -1) })
                .download(info.copy(versionCode = info.versionCode + 1)) { _, _ -> }
        }
        assertArrayEquals(bytes, original.readBytes())
        assertEquals(1, dir.listFiles()!!.size)
    }

    @Test fun explicitOriginalSkipsInspectionAndAutomaticInspectionFailureAllowsOriginal() {
        assertNull(inspectForAdaptation(InstallVariant.ORIGINAL) { error("Must never call Profile") })
        assertNull(inspectForAdaptation(null) { error("Profile unavailable") })
        val expected = IllegalStateException("Profile unavailable")
        try {
            inspectForAdaptation(InstallVariant.ADAPTED) { throw expected }
            fail("Explicit adaptation must not silently become original")
        } catch (error: IllegalStateException) { assertSame(expected, error) }
    }
}
