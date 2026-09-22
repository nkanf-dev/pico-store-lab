package dev.nkanf.picostore

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.nio.file.Files

class SelfUpdatePolicyTest {
    private val packageName = "dev.nkanf.picostore"
    private val signers = setOf("ab".repeat(32))

    @Test fun onlyANewerVersionWithTheInstalledIdentityCanReplaceLab() {
        SelfUpdatePolicy.requireReplacement(packageName, packageName, 7, 8, signers, signers)
        assertCode("update_package") {
            SelfUpdatePolicy.requireReplacement(packageName, "another.app", 7, 8, signers, signers)
        }
        for (version in listOf(6L, 7L)) assertCode("update_not_newer") {
            SelfUpdatePolicy.requireReplacement(packageName, packageName, 7, version, signers, signers)
        }
        assertCode("update_signature") {
            SelfUpdatePolicy.requireReplacement(packageName, packageName, 7, 8, signers, setOf("cd".repeat(32)))
        }
        assertCode("update_signature") {
            SelfUpdatePolicy.requireReplacement(packageName, packageName, 7, 8, emptySet(), emptySet())
        }
    }

    @Test fun allCurrentSignersMustMatchNotJustOne() {
        val multiple = signers + "cd".repeat(32)
        SelfUpdatePolicy.requireReplacement(packageName, packageName, 7, 8, multiple, multiple.reversed().toSet())
        assertCode("update_signature") {
            SelfUpdatePolicy.requireReplacement(packageName, packageName, 7, 8, multiple, signers)
        }
    }

    @Test fun rejectsTruncatedAppendedAndSameLengthModifiedCachedFiles() {
        val bytes = "verified release bytes".toByteArray()
        val update = AvailableUpdate("0.2.0", "unused", bytes.size.toLong(), bytes.sha256())
        val file = File.createTempFile("lab-update-unit-", ".apk")
        try {
            file.writeBytes(bytes)
            UpdateFileIntegrity.verify(file, update)
            file.appendText("x")
            assertCode("update_integrity") { UpdateFileIntegrity.verify(file, update) }
            file.writeBytes(bytes.copyOf(bytes.size - 1))
            assertCode("update_integrity") { UpdateFileIntegrity.verify(file, update) }
            file.writeBytes(bytes.copyOf().also { it[0] = 'x'.code.toByte() })
            assertCode("update_integrity") { UpdateFileIntegrity.verify(file, update) }
        } finally { file.delete() }
    }

    @Test fun streamingVerificationRequiresBothExactSizeAndDigest() {
        val update = AvailableUpdate("0.2.0", "unused", 100, "ab".repeat(32))
        UpdateFileIntegrity.requireMatch(update, 100, "AB".repeat(32))
        assertCode("update_integrity") { UpdateFileIntegrity.requireMatch(update, 101, update.sha256) }
        assertCode("update_integrity") { UpdateFileIntegrity.requireMatch(update, 100, "cd".repeat(32)) }
    }

    @Test fun successfulDownloadOnlyPrunesOlderUpdaterApks() {
        val directory = Files.createTempDirectory("lab-update-cache-unit-").toFile()
        try {
            val old = File(directory, "pico-store-0.1.3-${"ab".repeat(32)}.apk").apply { writeText("old") }
            val verified = File(directory, "pico-store-0.2.0-${"cd".repeat(32)}.apk").apply { writeText("verified") }
            val unrelated = File(directory, "other.apk").apply { writeText("unrelated") }
            UpdateFileIntegrity.pruneOlderDownloads(directory, verified)
            assertFalse(old.exists())
            assertEquals("verified", verified.readText())
            assertTrue(unrelated.exists())
        } finally { directory.deleteRecursively() }
    }

    private fun assertCode(expected: String, action: () -> Unit) {
        try { action(); fail("Expected $expected") }
        catch (error: SelfUpdateException) { assertEquals(expected, error.code) }
    }
}
