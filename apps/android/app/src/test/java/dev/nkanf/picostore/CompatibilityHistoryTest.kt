package dev.nkanf.picostore

import org.junit.Assert.*
import org.junit.Test

class CompatibilityHistoryTest {
    private val saved = mutableMapOf<String, String>()
    private fun history() = CompatibilityHistory(saved::get) { key, value -> saved[key] = value; true }
    private val digest = "ab".repeat(32)

    @Test fun decliningOrDismissingDoesNotLoseTheTwoInstallationChoices() {
        history().remember(InspectedApp(AppCompatibility.MATRIX, "example.app", 7, digest))
        // A new Activity/process reads the same record; no acceptance flag is required.
        assertEquals(AppCompatibility.MATRIX, history().resolve("example.app", 7, false))
    }

    @Test fun newVersionMustBeDetectedAgain() {
        history().remember(InspectedApp(AppCompatibility.MATRIX, "example.app", 7, digest))
        assertEquals(AppCompatibility.UNKNOWN, history().resolve("example.app", 8, false))
        assertEquals(AppCompatibility.PROFILE_CANDIDATE, history().resolve("example.app", 8, false, true))
        assertEquals(AppCompatibility.UNKNOWN, history().resolve("another.app", 7, false))
    }

    @Test fun inspectedVersionAttemptRemainsAvailableAfterRestart() {
        history().remember(InspectedApp(AppCompatibility.PROFILE_CANDIDATE, "example.app", 8, digest))
        assertEquals(AppCompatibility.PROFILE_CANDIDATE, history().resolve("example.app", 8, false, true))
    }

    @Test fun downloadedIdentityOverridesACatalogProfilePrediction() {
        assertEquals(AppCompatibility.PROFILE, history().resolve("example.app", 7, true))
        history().remember(InspectedApp(AppCompatibility.MATRIX, "example.app", 7, digest))
        assertEquals(AppCompatibility.MATRIX, history().resolve("example.app", 7, true))
    }

    @Test fun ordinaryAppsRetainOneInstallActionAndCorruptRecordsAreIgnored() {
        history().remember(InspectedApp(AppCompatibility.ORDINARY, "example.app", 7, digest))
        assertEquals(AppCompatibility.ORDINARY, history().resolve("example.app", 7, false))
        saved["example.app@7"] = "garbled"
        assertEquals(AppCompatibility.UNKNOWN, history().resolve("example.app", 7, false))
    }
}
