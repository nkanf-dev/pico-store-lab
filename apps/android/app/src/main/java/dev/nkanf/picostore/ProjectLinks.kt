package dev.nkanf.picostore

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** Repository identities and release URL formats used by Lab update flows. */
internal object ProjectLinks {
    private val owner = BuildConfig.GITHUBOWNER
    private val storeRepo = BuildConfig.STOREREPOSITORY
    private val bridgeRepo = BuildConfig.BRIDGEREPOSITORY
    val githubHost = BuildConfig.GITHUBHOST
    val apiHost = BuildConfig.GITHUBAPIHOST
    private val github = "https://$githubHost"
    private val api = "https://$apiHost"
    val githubAssetHosts = setOf(githubHost, "release-assets.githubusercontent.com", "objects.githubusercontent.com")
    private val timestamp = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC)
    const val profileKeySyntax = "[a-z][a-z0-9_]{0,63}"
    val profileKeyPattern = Regex(profileKeySyntax)
    val profileAssetPattern = Regex("matrix-profile-($profileKeySyntax)\\.apk")
    const val profilePackagePrefix = "org.picomatrix.bridge.profile."
    const val profileStorageDirectory = "matrix-profiles"
    val picoRegistrationUrl = BuildConfig.PICOREGISTRATIONURL

    val storeLatestApiPath = "/repos/$owner/$storeRepo/releases/latest"
    val bridgeReleasesApiPath = "/repos/$owner/$bridgeRepo/releases"
    const val profileReleasePageSize = 100
    const val profileReleaseMaxPages = 20
    private const val bridgeReleasesQuery = "per_page=$profileReleasePageSize"
    val storeLatestApi = "$api$storeLatestApiPath"
    val bridgeReleasesApi = "$api$bridgeReleasesApiPath?$bridgeReleasesQuery"
    val storeAssetRoot = "$github/$owner/$storeRepo/releases/download/"
    val bridgeAssetRoot = "$github/$owner/$bridgeRepo/releases/download/"

    fun profileAssetName(key: String): String = "matrix-profile-$key.apk"
    fun bridgeReleasesPage(page: Int): String = "$bridgeReleasesApi&page=$page"
    fun permittedBridgeReleasesQuery(query: String?): Boolean =
        query == bridgeReleasesQuery || (query?.startsWith("$bridgeReleasesQuery&page=") == true &&
            query.removePrefix("$bridgeReleasesQuery&page=").toIntOrNull()?.let { it in 2..profileReleaseMaxPages } == true)
    fun profilePackageName(key: String): String = "$profilePackagePrefix$key"
    fun profileTag(key: String, version: Long): String = "$key-profile-${timestamp.format(Instant.ofEpochSecond(version))}"
    fun profileAsset(key: String, tag: String): String = "$bridgeAssetRoot$tag/${profileAssetName(key)}"
}
