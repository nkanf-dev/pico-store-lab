package dev.nkanf.picostore

import android.content.Context
import java.io.File

internal object InstallationFactory {
    fun create(context: Context, downloader: StoreInstaller, changed: () -> Unit = {}, report: (String) -> Unit): AppInstallation =
        object : AppInstallation {
            override fun inspect(apk: File): InspectedApp {
                val info = checkNotNull(context.packageManager.getPackageArchiveInfo(apk.absolutePath, 0))
                return InspectedApp(AppCompatibility.ORDINARY, info.packageName, info.longVersionCode, "")
            }
            override fun install(apk: File, variant: InstallVariant) = downloader.install(apk)
            override fun installed(packageName: String) = InstalledCopies(InstalledApplications.read(context, packageName))
            override fun open(packageName: String, variant: InstallVariant): Boolean =
                variant == InstallVariant.ORIGINAL && InstalledApplications.open(context, packageName)
        }
}
