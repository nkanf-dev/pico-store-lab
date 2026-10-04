package dev.nkanf.picostore

import android.content.pm.PackageInstaller
import org.junit.Assert.assertEquals
import org.junit.Test

class InstallFailureTest {
    @Test fun systemInstallFailuresHaveDistinctRecoveryMessages() {
        for ((status, resource) in listOf(
            PackageInstaller.STATUS_FAILURE_INVALID to R.string.installation_invalid,
            PackageInstaller.STATUS_FAILURE_INCOMPATIBLE to R.string.installation_incompatible,
            PackageInstaller.STATUS_FAILURE_CONFLICT to R.string.installation_conflict,
            PackageInstaller.STATUS_FAILURE_STORAGE to R.string.not_enough_storage,
            PackageInstaller.STATUS_FAILURE_BLOCKED to R.string.installation_blocked,
            PackageInstaller.STATUS_FAILURE_ABORTED to R.string.installation_cancelled,
            PackageInstaller.STATUS_FAILURE to R.string.install_failed,
            999 to R.string.install_failed,
        )) assertEquals(resource, installFailureResource(status))
    }
}
