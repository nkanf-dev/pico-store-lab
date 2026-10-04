package dev.nkanf.picostore.sdk

import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.file.Files
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ApkDownloadTest {
    private fun info(body: ByteArray, size: Long = body.size.toLong()): DownloadInfo {
        val md5 = MessageDigest.getInstance("MD5").digest(body).joinToString("") {
            "%02x".format(it.toInt() and 0xff)
        }
        return DownloadInfo("1", "dev.example.synthetic", 1, "1", size, md5,
            "https://cdn.example.invalid/synthetic.apk")
    }

    private class Response(private val input: InputStream) :
        HttpURLConnection(URL("https://cdn.example.invalid/synthetic.apk")) {
        override fun connect() {}
        override fun disconnect() {}
        override fun usingProxy(): Boolean = false
        override fun getResponseCode(): Int = 200
        override fun getContentLengthLong(): Long = 9999
        override fun getInputStream(): InputStream = input
    }

    private fun directory(action: (File, File) -> Unit) {
        val directory = Files.createTempDirectory("sdk-apk-test-").toFile()
        try { action(directory, File(directory, "sample.apk")) }
        finally { directory.deleteRecursively() }
    }

    private fun download(info: DownloadInfo, output: File, input: () -> InputStream,
        retries: Int = 1): File = downloadVerifiedApk(info, output, retries, { Response(input()) }, {})

    @Test fun successPreservesAnUnownedLegacyPartial() {
        val body = "synthetic APK".toByteArray()
        directory { directory, output ->
            val legacy = File(directory, "sample.apk.part").apply { writeText("unowned file") }
            assertEquals(output, download(info(body), output, { ByteArrayInputStream(body) }))
            assertArrayEquals(body, output.readBytes())
            assertEquals("unowned file", legacy.readText())
            assertEquals(2, directory.listFiles()!!.size)
        }
    }

    @Test fun metadataSizeDifferencesDoNotBlockVerifiedContent() {
        val body = "synthetic APK".toByteArray()
        for (size in listOf(body.size - 1L, body.size + 1L)) {
            directory { directory, output ->
                assertEquals(output, download(info(body, size), output, { ByteArrayInputStream(body) }))
                assertArrayEquals(body, output.readBytes())
                assertEquals(listOf("sample.apk"), directory.list()!!.toList())
            }
        }
    }

    @Test fun digestMismatchPreservesTheExistingFailureBehavior() {
        val body = "synthetic APK".toByteArray()
        directory { directory, output ->
            val error = assertThrows(IllegalArgumentException::class.java) {
                download(info(body), output, { ByteArrayInputStream("wrong content".toByteArray()) })
            }
            assertEquals("APK digest mismatch", error.message)
            assertTrue(directory.listFiles()!!.isEmpty())
        }
    }

    @Test fun exhaustedRetriesRemoveThePartial() {
        val body = "synthetic APK".toByteArray()
        directory { directory, output ->
            var requests = 0
            assertThrows(IllegalStateException::class.java) {
                download(info(body), output, {
                    requests++
                    object : ByteArrayInputStream(body) {
                        override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                            if (pos > 0) throw IOException("synthetic interruption")
                            return super.read(buffer, offset, minOf(2, length))
                        }
                    }
                }, retries = 2)
            }
            assertEquals(2, requests)
            assertTrue(directory.listFiles()!!.isEmpty())
        }
    }

    @Test fun anExistingOutputIsPreservedWithoutConnecting() {
        directory { _, output ->
            output.writeText("last known good")
            assertThrows(IllegalArgumentException::class.java) {
                download(info("replacement".toByteArray()), output, { error("must not connect") })
            }
            assertEquals("last known good", output.readText())
        }
    }

    @Test fun aCompetingWriterCannotAlterTheCompletedWinner() {
        val firstBody = ByteArray(128) { 65 }
        val secondBody = ByteArray(128) { 66 }
        val firstReady = CountDownLatch(1)
        val secondReady = CountDownLatch(1)
        val prefixWritten = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            directory { directory, output ->
                val first = executor.submit<File> {
                    download(info(firstBody), output, {
                        object : ByteArrayInputStream(firstBody) {
                            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                                check(firstReady.await(5, TimeUnit.SECONDS))
                                return super.read(buffer, offset, length)
                            }
                        }
                    })
                }
                val second = executor.submit<File> {
                    download(info(secondBody), output, {
                        object : ByteArrayInputStream(secondBody) {
                            override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
                                if (pos == 0) return super.read(buffer, offset, minOf(1, length))
                                prefixWritten.countDown()
                                check(secondReady.await(5, TimeUnit.SECONDS))
                                return super.read(buffer, offset, length)
                            }
                        }
                    })
                }
                try {
                    assertTrue(prefixWritten.await(5, TimeUnit.SECONDS))
                    firstReady.countDown()
                    assertEquals(output, first.get(5, TimeUnit.SECONDS))
                    secondReady.countDown()
                    val failure = assertThrows(ExecutionException::class.java) {
                        second.get(5, TimeUnit.SECONDS)
                    }
                    assertTrue(failure.cause is java.nio.file.FileAlreadyExistsException)
                    assertArrayEquals(firstBody, output.readBytes())
                    assertEquals(listOf("sample.apk"), directory.list()!!.toList())
                } finally {
                    firstReady.countDown()
                    secondReady.countDown()
                }
            }
        } finally { executor.shutdownNow() }
    }
}
