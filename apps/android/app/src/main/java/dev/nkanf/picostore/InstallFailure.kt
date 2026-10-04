package dev.nkanf.picostore

import android.content.pm.PackageInstaller

/** Keep system compatibility, conflicts and storage failures separate from download damage. */
internal fun installFailureResource(status: Int): Int = when (status) {
    PackageInstaller.STATUS_FAILURE_ABORTED -> R.string.installation_cancelled
    PackageInstaller.STATUS_FAILURE_BLOCKED -> R.string.installation_blocked
    PackageInstaller.STATUS_FAILURE_CONFLICT -> R.string.installation_conflict
    PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> R.string.installation_incompatible
    PackageInstaller.STATUS_FAILURE_INVALID -> R.string.installation_invalid
    PackageInstaller.STATUS_FAILURE_STORAGE -> R.string.not_enough_storage
    else -> R.string.install_failed
}
