package dev.nkanf.picostore

import dev.nkanf.picostore.sdk.DownloadInfo
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.file.Files
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

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

    @Test fun stalePackageVersionSizeAndDigestAreAdvisoryForReadableOriginals() = inDirectory { dir ->
        val codes = mutableListOf<String>()
        val metadata = info.copy(packageName = "org.other.app", versionCode = 999, size = info.size + 10, md5 = "0".repeat(32))
        val downloader = ApkDownload(dir, { connection() }, diagnostic = { code, _ -> codes += code })
        val file = downloader.download(metadata) { _, _ -> }
        assertArrayEquals(bytes, file.readBytes())
        assertTrue(codes.contains("apk_package"))
        assertTrue(codes.contains("metadata_difference"))
        assertEquals(info.versionCode, ApkIdentity.read(file).versionCode)
    }

    @Test fun truncatedArchivesNeverBecomeInstallableAndRetryBeforeGivingUp() = inDirectory { dir ->
        var calls = 0
        val downloader = ApkDownload(dir, { calls++; connection(bytes.copyOf(20), -1) })
        failure("apk_invalid") { downloader.download(info) { _, _ -> } }
        assertEquals(3, calls)
        assertTrue(dir.listFiles()!!.isEmpty())
    }

    @Test fun transientDownloadFailureRecoversWithoutUserAction() = inDirectory { dir ->
        var calls = 0
        val downloader = ApkDownload(dir, { if (++calls == 1) connection(status = 503) else connection() })
        assertArrayEquals(bytes, downloader.download(info) { _, _ -> }.readBytes())
        assertEquals(2, calls)
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
        failure("apk_invalid") {
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

    @Test fun insufficientSpaceDoesNotWriteBodyOrDeletePreviousVersion() = inDirectory { dir ->
        val older = File(dir, "${info.packageName}-1-${"0".repeat(32)}.apk").apply { writeText("previous") }
        val downloader = ApkDownload(dir, { connection() }, availableBytes = { 0 })
        failure("apk_space") { downloader.download(info) { _, _ -> } }
        assertEquals("previous", older.readText())
    }

    @Test fun verifiedCacheDoesNotRequireSpaceForAnotherCopy() = inDirectory { dir ->
        val file = ApkDownload(dir, { connection() }).download(info) { _, _ -> }
        val downloader = ApkDownload(dir, { fail("Cache should be reused"); connection() }, availableBytes = { 0 })
        assertEquals(file, downloader.download(info) { _, _ -> })
    }

    @Test fun cancellationLeavesNoInstallablePartial() = inDirectory { dir ->
        Thread.currentThread().interrupt()
        try {
            failure("apk_cancelled") { ApkDownload(dir, { fail("Network must not start"); connection() }).download(info) { _, _ -> } }
        } finally { Thread.interrupted() }
        assertTrue(dir.listFiles()!!.isEmpty())
    }

    @Test fun failedLocalWriteIsStorageFailureWithoutNetworkRetries() = inDirectory { dir ->
        var calls = 0
        File(dir, "${info.packageName}-${info.versionCode}-${info.md5}.apk.part").mkdir()
        failure("apk_storage") { ApkDownload(dir, { calls++; connection() }).download(info) { _, _ -> } }
        assertEquals(1, calls)
    }

    @Test fun recreatedActivityDownloaderCannotRaceThePreviousWorkerOnSharedPartial() = inDirectory { dir ->
        val reading = CountDownLatch(1)
        val release = CountDownLatch(1)
        val secondStarted = CountDownLatch(1)
        val secondNetwork = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        val first = ApkDownload(dir, {
            object : HttpURLConnection(URL(info.url)) {
                override fun connect() {}
                override fun disconnect() {}
                override fun usingProxy() = false
                override fun getResponseCode() = 200
                override fun getContentLengthLong() = info.size
                override fun getInputStream(): java.io.InputStream {
                    reading.countDown()
                    check(release.await(5, TimeUnit.SECONDS))
                    return bytes.inputStream()
                }
            }
        })
        val second = ApkDownload(dir, { secondNetwork.countDown(); connection() })
        try {
            val a = executor.submit<File> { first.download(info) { _, _ -> } }
            assertTrue(reading.await(5, TimeUnit.SECONDS))
            val b = executor.submit<File> { secondStarted.countDown(); second.download(info) { _, _ -> } }
            assertTrue(secondStarted.await(5, TimeUnit.SECONDS))
            assertFalse(secondNetwork.await(100, TimeUnit.MILLISECONDS))
            release.countDown()
            assertArrayEquals(bytes, a.get(5, TimeUnit.SECONDS).readBytes())
            assertEquals(a.get(), b.get(5, TimeUnit.SECONDS))
            assertEquals(1L, secondNetwork.count)
            assertEquals(1, dir.listFiles()!!.size)
        } finally { release.countDown(); executor.shutdownNow() }
    }
}
