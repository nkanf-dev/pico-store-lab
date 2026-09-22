package dev.nkanf.picostore

import org.junit.Assert.*
import org.junit.Test

class InstalledCopiesTest {
    @Test fun originalAndAdaptedCopiesHaveIndependentUpdates() {
        val copies = InstalledCopies(InstalledCopy(12, "1.2"), InstalledCopy(10, "1.0"))
        assertTrue(copies.hasUpdate(12))
        assertEquals(12L, copies.copyFor(InstallVariant.ORIGINAL)?.versionCode)
        assertEquals(10L, copies.copyFor(InstallVariant.ADAPTED)?.versionCode)
    }

    @Test fun currentOrNewerInstalledVersionsAreNeverOfferedADowngrade() {
        assertFalse(InstalledCopies(InstalledCopy(12, "1.2"), InstalledCopy(13, "1.3")).hasUpdate(12))
    }

    @Test fun uninstalledAppsAreNotUpdatesAndRemovalClearsOnlyThatCopy() {
        assertFalse(InstalledCopies().hasUpdate(20))
        val oneCopy = InstalledCopies(adapted = InstalledCopy(12, "1.2"))
        assertNull(oneCopy.copyFor(InstallVariant.ORIGINAL))
        assertTrue(oneCopy.hasUpdate(13))
        assertFalse(oneCopy.hasUpdate(12))
    }
}
