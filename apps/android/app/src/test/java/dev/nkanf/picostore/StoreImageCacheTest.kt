package dev.nkanf.picostore

import java.nio.file.Files
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StoreImageCacheTest {
    @Test
    fun repeatedLoadsUseMemoryAndDiskWithoutRefetching() = runBlocking {
        val directory = Files.createTempDirectory("pico-image-cache").toFile()
        val calls = AtomicInteger()
        val cache = ImageBytesCache(directory, { calls.incrementAndGet(); byteArrayOf(1, 2, 3) })
        try {
            assertTrue(cache.load("https://cdn.picovr.com/image.png")!!.contentEquals(byteArrayOf(1, 2, 3)))
            assertTrue(cache.load("https://cdn.picovr.com/image.png")!!.contentEquals(byteArrayOf(1, 2, 3)))
            assertEquals(1, calls.get())
        } finally {
            cache.close()
        }

        val secondCache = ImageBytesCache(directory, { calls.incrementAndGet(); byteArrayOf(9) })
        try {
            assertTrue(secondCache.load("https://cdn.picovr.com/image.png")!!.contentEquals(byteArrayOf(1, 2, 3)))
            assertEquals(1, calls.get())
        } finally {
            secondCache.close()
            directory.deleteRecursively()
        }
    }

    @Test
    fun concurrentSameUrlLoadsAreCoalesced() = runBlocking {
        val directory = Files.createTempDirectory("pico-image-cache").toFile()
        val calls = AtomicInteger()
        val cache = ImageBytesCache(directory, {
            calls.incrementAndGet()
            kotlinx.coroutines.delay(20)
            byteArrayOf(7)
        })
        try {
            val results = (1..8).map { async { cache.load("https://cdn.picoxr.com/image.png") } }.awaitAll()
            assertEquals(1, calls.get())
            assertTrue(results.all { it!!.contentEquals(byteArrayOf(7)) })
        } finally {
            cache.close()
            directory.deleteRecursively()
        }
    }

    @Test
    fun unsupportedUrlsAndFailedFetchesAreNotCached() = runBlocking {
        assertEquals(
            "http://example.com/image.png",
            normalizedImageUrl("http://example.com/image.png"),
        )
        assertEquals(
            "https://user:pass@example.com:8443/image.png",
            normalizedImageUrl("https://user:pass@example.com:8443/image.png"),
        )
        assertNull(normalizedImageUrl("file:///tmp/image.png"))
        assertNull(normalizedImageUrl("not a URL"))

        val directory = Files.createTempDirectory("pico-image-cache").toFile()
        val calls = AtomicInteger()
        val cache = ImageBytesCache(directory, { calls.incrementAndGet(); null })
        try {
            assertNull(cache.load("https://cdn.picovr.com/missing.png"))
            assertNull(cache.load("https://cdn.picovr.com/missing.png"))
            assertEquals(2, calls.get())
        } finally {
            cache.close()
            directory.deleteRecursively()
        }
    }

    @Test
    fun invalidPayloadsAreNotPersisted() = runBlocking {
        val directory = Files.createTempDirectory("pico-image-cache").toFile()
        val calls = AtomicInteger()
        val cache = ImageBytesCache(
            directory,
            { calls.incrementAndGet(); byteArrayOf(4) },
            validator = { it.contentEquals(byteArrayOf(9)) },
        )
        try {
            assertNull(cache.load("https://cdn.picovr.com/broken.png"))
            assertNull(cache.load("https://cdn.picovr.com/broken.png"))
            assertEquals(2, calls.get())
        } finally {
            cache.close()
            directory.deleteRecursively()
        }
    }
}
