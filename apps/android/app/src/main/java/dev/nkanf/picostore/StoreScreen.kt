package dev.nkanf.picostore

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items as rowItems
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.nkanf.picostore.sdk.PublicItem
import dev.nkanf.picostore.sdk.StoreTarget

enum class ThemeMode { SYSTEM, LIGHT, DARK }
private enum class CatalogFilter { ALL, FAVORITES, UPDATES }

private val Brick = Color(0xFFB43B23)
private val Paper = Color(0xFFF2F0E8)
private val Ink = Color(0xFF1B1D18)
private val Edge = RoundedCornerShape(4.dp)
private val lightScheme = lightColorScheme(
    primary = Brick, onPrimary = Color.White,
    background = Paper, onBackground = Ink,
    surface = Color(0xFFF9F7F0), onSurface = Ink,
    surfaceVariant = Color(0xFFE8E6DC), onSurfaceVariant = Color(0xFF62655C),
    outline = Color(0xFF92958B), outlineVariant = Color(0xFFD2D3C7),
    secondary = Ink, onSecondary = Paper,
)
private val darkScheme = darkColorScheme(
    primary = Color(0xFFF18768), onPrimary = Color(0xFF2C170F),
    background = Color(0xFF191C17), onBackground = Paper,
    surface = Color(0xFF22261F), onSurface = Paper,
    surfaceVariant = Color(0xFF2F342A), onSurfaceVariant = Color(0xFFB8BBAE),
    outline = Color(0xFF858C7B), outlineVariant = Color(0xFF404638),
    secondary = Paper, onSecondary = Ink,
)

@Composable
fun StoreScreen(
    entries: List<StoreEntry>, selected: PublicItem?, busy: Boolean, message: String,
    downloadProgress: Pair<Long, Long?>?, themeMode: ThemeMode,
    imageLoader: StoreImageLoader,
    email: String, signedIn: Boolean, favorites: Set<String>,
    compatibility: AppCompatibility, installedCopies: InstalledCopies, installPromptName: String?, originalWarningName: String?,
    updateVersion: String?, onCheckUpdate: () -> Unit, onOpenUpdate: () -> Unit,
    announcement: ReleaseAnnouncement?, announcementOpen: Boolean, announcementLoading: Boolean,
    onShowAnnouncement: () -> Unit, onRetryAnnouncement: () -> Unit, onDismissAnnouncement: () -> Unit,
    profileVersions: Map<String, Long>, profileUpdateVersions: Map<String, Long>,
    onCheckProfileUpdate: () -> Unit, onOpenProfileUpdate: (String) -> Unit,
    onSearch: (String) -> Unit, onSelect: (StoreTarget) -> Unit,
    onFavorite: (String) -> Unit, onSendCode: (String) -> Unit,
    onLogin: (String, String) -> Unit, onLogout: () -> Unit,
    onGet: (PublicItem, InstallVariant?) -> Unit,
    onOpenApp: (PublicItem, InstallVariant) -> Unit, onCheckAppUpdates: () -> Unit,
    onInstallChoice: (InstallVariant) -> Unit, onDismissInstallChoice: () -> Unit,
    onConfirmOriginal: () -> Unit, onDismissOriginalWarning: () -> Unit,
    onBack: () -> Unit, onThemeChange: (ThemeMode) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var catalogFilter by remember { mutableStateOf(CatalogFilter.ALL) }
    var accountOpen by remember { mutableStateOf(false) }
    var settingsOpen by remember { mutableStateOf(false) }
    val dark = when (themeMode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    LaunchedEffect(signedIn) { if (signedIn) accountOpen = false }
    BackHandler((selected != null || settingsOpen) && !accountOpen && !announcementOpen && installPromptName == null && originalWarningName == null) {
        if (!busy) {
            if (settingsOpen) settingsOpen = false else onBack()
        }
    }
    MaterialTheme(colorScheme = if (dark) darkScheme else lightScheme) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding()) {
                val wide = maxWidth >= 820.dp
                val gutter = if (wide) 36.dp else 20.dp
                val settingsLabel = stringResource(R.string.settings)
                Column(Modifier.fillMaxSize()) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = gutter, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Brand(Modifier.weight(1f))
                        val themeDescription = themeLabel(themeMode)
                        IconButton(onClick = {
                            onThemeChange(ThemeMode.entries[(themeMode.ordinal + 1) % ThemeMode.entries.size])
                        },
                            modifier = Modifier.semantics { contentDescription = themeDescription }) {
                            Text(if (dark) "◑" else "◐", fontSize = 24.sp)
                        }
                        IconButton(onClick = { settingsOpen = true },
                            modifier = Modifier.semantics { contentDescription = settingsLabel }) {
                            Text("⚙", fontSize = 22.sp)
                        }
                        OutlinedButton(onClick = { accountOpen = true }, shape = Edge,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)) {
                            Text(stringResource(if (signedIn) R.string.account else R.string.sign_in),
                                fontWeight = FontWeight.SemiBold)
                        }
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    if (settingsOpen) {
                        SettingsPage(themeMode, onThemeChange, { settingsOpen = false }, gutter, Modifier.weight(1f))
                    } else if (selected == null) {
                        val visible = when (catalogFilter) {
                            CatalogFilter.ALL -> entries
                            CatalogFilter.FAVORITES -> entries.filter { it.target.itemId in favorites }
                            CatalogFilter.UPDATES -> entries.filter { entry ->
                                entry.info?.let { entry.installed.hasUpdate(it.versionCode) } == true
                            }
                        }
                        LazyVerticalGrid(
                            columns = GridCells.Adaptive(if (wide) 260.dp else 220.dp),
                            modifier = Modifier.weight(1f),
                            contentPadding = PaddingValues(start = gutter, end = gutter, bottom = 28.dp),
                            horizontalArrangement = Arrangement.spacedBy(20.dp),
                            verticalArrangement = Arrangement.spacedBy(20.dp),
                        ) {
                            item(span = { GridItemSpan(maxLineSpan) }) { Hero(wide) }
                            item(span = { GridItemSpan(maxLineSpan) }) {
                                Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        OutlinedTextField(query, { query = it }, Modifier.weight(1f),
                                            placeholder = { Text(stringResource(R.string.search_apps)) },
                                            singleLine = true, shape = Edge, enabled = !busy,
                                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                                            keyboardActions = KeyboardActions(onSearch = { if (!busy) onSearch(query) }))
                                        ActionButton(stringResource(R.string.search), !busy) { onSearch(query) }
                                    }
                                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                        Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()),
                                            horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                                            SectionTab(stringResource(R.string.all_apps), catalogFilter == CatalogFilter.ALL) { catalogFilter = CatalogFilter.ALL }
                                            SectionTab(stringResource(R.string.favorites), catalogFilter == CatalogFilter.FAVORITES) { catalogFilter = CatalogFilter.FAVORITES }
                                            SectionTab(stringResource(R.string.updates), catalogFilter == CatalogFilter.UPDATES) { catalogFilter = CatalogFilter.UPDATES }
                                        }
                                        Text(visible.size.toString().padStart(2, '0'), Modifier.padding(start = 16.dp), fontSize = 13.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    if (catalogFilter == CatalogFilter.UPDATES) OutlinedButton(
                                        onClick = onCheckAppUpdates, enabled = !busy, shape = Edge) {
                                        Text(stringResource(R.string.check_update), fontWeight = FontWeight.SemiBold)
                                    }
                                }
                            }
                            items(visible, key = { it.target.itemId }) { entry ->
                                AppCard(entry, entry.target.itemId in favorites, !busy, imageLoader,
                                    onOpen = { onSelect(entry.target) },
                                    onFavorite = { onFavorite(entry.target.itemId) })
                            }
                            if (visible.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) {
                                Column(Modifier.fillMaxWidth().padding(vertical = 48.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text(stringResource(when (catalogFilter) {
                                        CatalogFilter.FAVORITES -> R.string.empty_favorites
                                        CatalogFilter.UPDATES -> R.string.empty_updates
                                        CatalogFilter.ALL -> R.string.empty_search
                                    }),
                                        fontSize = 24.sp, fontWeight = FontWeight.Bold)
                                    Text(stringResource(when (catalogFilter) {
                                        CatalogFilter.FAVORITES -> R.string.empty_favorites_hint
                                        CatalogFilter.UPDATES -> R.string.empty_updates_hint
                                        CatalogFilter.ALL -> R.string.empty_search_hint
                                    }),
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    } else {
                        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(gutter),
                            verticalArrangement = Arrangement.spacedBy(24.dp)) {
                            TextButton(onClick = onBack, enabled = !busy, contentPadding = PaddingValues(0.dp)) {
                                Text("←  ${stringResource(R.string.back_to_store)}", fontWeight = FontWeight.SemiBold)
                            }
                            AppDetail(selected, selected.itemId in favorites, wide, signedIn, compatibility, installedCopies, imageLoader,
                                onFavorite = { onFavorite(selected.itemId) },
                                onGet = { variant -> if (signedIn) onGet(selected, variant) else accountOpen = true },
                                onOpen = { variant -> onOpenApp(selected, variant) }, busy = busy)
                        }
                    }
                    if (message.isNotBlank() || busy) StatusStrip(message, busy, downloadProgress, gutter)
                }
                if (announcementOpen) AnnouncementDialog(announcement, announcementLoading,
                    onDismiss = onDismissAnnouncement, onRetry = onRetryAnnouncement,
                    onViewUpdate = {
                        onDismissAnnouncement()
                        accountOpen = true
                        onCheckUpdate()
                    })
                else if (accountOpen) AccountDialog(email, signedIn, busy, message,
                    onDismiss = { accountOpen = false }, onSendCode = onSendCode,
                    onLogin = onLogin, onLogout = onLogout, updateVersion = updateVersion,
                    onCheckUpdate = onCheckUpdate, onOpenUpdate = onOpenUpdate,
                    onShowAnnouncement = onShowAnnouncement,
                    profileVersions = profileVersions, profileUpdateVersions = profileUpdateVersions,
                    onCheckProfileUpdate = onCheckProfileUpdate, onOpenProfileUpdate = onOpenProfileUpdate)
                else if (installPromptName != null) InstallChoiceDialog(installPromptName, busy,
                    onChoice = onInstallChoice, onDismiss = onDismissInstallChoice)
                else if (originalWarningName != null) OriginalWarningDialog(originalWarningName, busy,
                    onConfirm = onConfirmOriginal, onDismiss = onDismissOriginalWarning)
            }
        }
    }
}

@Composable
private fun Brand(modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("P/", color = MaterialTheme.colorScheme.primary, fontSize = 36.sp,
            letterSpacing = (-3).sp, fontWeight = FontWeight.Black)
        Text("PICO\nSTORE LAB", fontSize = 12.sp, lineHeight = 13.sp,
            letterSpacing = 1.5.sp, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable
private fun Hero(wide: Boolean) {
    Row(Modifier.fillMaxWidth().padding(top = 30.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(32.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Eyebrow(stringResource(R.string.catalog_label))
            Column {
                Text(stringResource(R.string.hero_title), fontSize = if (wide) 46.sp else 32.sp,
                    lineHeight = if (wide) 54.sp else 39.sp, fontWeight = FontWeight.Black,
                    letterSpacing = (-1).sp)
                Text(stringResource(R.string.hero_accent), fontSize = if (wide) 46.sp else 32.sp,
                    lineHeight = if (wide) 54.sp else 39.sp, fontWeight = FontWeight.Black,
                    letterSpacing = (-1).sp, color = MaterialTheme.colorScheme.primary)
            }
            Text(stringResource(R.string.hero_description), fontSize = 15.sp, lineHeight = 23.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (wide) Box(Modifier.size(230.dp).background(Brick), contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxSize()) {
                val line = Paper.copy(alpha = .28f)
                val points = listOf(Offset(size.width * .16f, size.height * .32f),
                    Offset(size.width * .72f, size.height * .07f),
                    Offset(size.width * .93f, size.height * .72f),
                    Offset(size.width * .3f, size.height * .93f))
                drawPath(Path().apply { moveTo(points[0].x, points[0].y); points.drop(1).forEach { lineTo(it.x, it.y) }; close() }, line, style = Stroke(1.dp.toPx()))
                drawLine(line, points[0], points[2], 1.dp.toPx())
            }
            Text("P/", color = Paper, fontSize = 116.sp, letterSpacing = (-10).sp, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun Eyebrow(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
        Box(Modifier.size(6.dp).background(MaterialTheme.colorScheme.primary))
        Text(text, fontSize = 11.sp, letterSpacing = 1.8.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SectionTab(text: String, selected: Boolean, action: () -> Unit) {
    Column(Modifier.clickable(onClick = action).heightIn(min = 48.dp),
        verticalArrangement = Arrangement.SpaceBetween) {
        Text(text, Modifier.padding(vertical = 12.dp), fontSize = 15.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            color = if (selected) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant)
        Box(Modifier.width(32.dp).height(2.dp).background(if (selected) MaterialTheme.colorScheme.primary else Color.Transparent))
    }
}

@Composable
private fun AppCard(entry: StoreEntry, favorite: Boolean, enabled: Boolean, imageLoader: StoreImageLoader,
    onOpen: () -> Unit, onFavorite: () -> Unit) {
    Surface(onClick = onOpen, enabled = enabled, shape = Edge,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column {
            StoreImage(imageLoader, entry.info?.coverUrl, Modifier.fillMaxWidth().aspectRatio(16f / 9f), entry.target.name)
            Column(Modifier.padding(start = 18.dp, end = 18.dp, bottom = 18.dp, top = 10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(entry.info?.name ?: entry.target.name, Modifier.weight(1f), fontSize = 20.sp,
                        fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    FavoriteButton(favorite, onFavorite)
                }
                if (!entry.info?.summary.isNullOrBlank()) Text(entry.info.summary,
                    maxLines = 2, minLines = 2, overflow = TextOverflow.Ellipsis,
                    fontSize = 13.sp, lineHeight = 20.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(price(entry.info), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        if (entry.info?.let { entry.installed.hasUpdate(it.versionCode) } == true)
                            Text(stringResource(R.string.app_update_available), fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                    }
                    Text("↗", fontSize = 22.sp, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
private fun price(item: PublicItem?): String = when {
    item == null -> stringResource(R.string.view_app)
    item.entitlementStatus == 1 -> stringResource(R.string.in_library)
    item.price.toDoubleOrNull() == 0.0 -> stringResource(R.string.free)
    else -> "${item.price} ${item.currency}"
}

@Composable
private fun FavoriteButton(favorite: Boolean, action: () -> Unit) {
    val label = stringResource(if (favorite) R.string.remove_favorite else R.string.add_favorite)
    IconButton(onClick = action, modifier = Modifier.semantics { contentDescription = label }) {
        Text(if (favorite) "★" else "☆", fontSize = 26.sp, color = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun AppDetail(item: PublicItem, favorite: Boolean, wide: Boolean, signedIn: Boolean,
    compatibility: AppCompatibility, installedCopies: InstalledCopies, imageLoader: StoreImageLoader,
    onFavorite: () -> Unit, onGet: (InstallVariant?) -> Unit, onOpen: (InstallVariant) -> Unit, busy: Boolean) {
    var expanded by remember(item.itemId) { mutableStateOf(false) }
    val tryAdaptation = compatibility == AppCompatibility.PROFILE_CANDIDATE || compatibility == AppCompatibility.MATRIX
    val supportsAccount = compatibility == AppCompatibility.PROFILE || tryAdaptation
    val needsPurchase = item.entitlementStatus != 1 && (item.price.toDoubleOrNull() ?: 0.0) > 0.0
    val showInstallChoices = supportsAccount || installedCopies.adapted != null
    val original = installedCopies.original
    val originalUpdate = original != null && original.versionCode < item.versionCode
    Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
        StoreImage(imageLoader, item.coverUrl, Modifier.fillMaxWidth().height(if (wide) 260.dp else 180.dp), item.name)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            StoreImage(imageLoader, item.iconUrl, Modifier.size(72.dp), item.name)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(item.name, fontSize = if (wide) 36.sp else 28.sp, lineHeight = 39.sp, fontWeight = FontWeight.Black)
                if (compatibility == AppCompatibility.PROFILE) Surface(shape = Edge,
                    color = MaterialTheme.colorScheme.primary.copy(alpha = .1f),
                    contentColor = MaterialTheme.colorScheme.primary,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = .25f))) {
                    Text(stringResource(R.string.account_support_badge), Modifier.padding(horizontal = 9.dp, vertical = 6.dp),
                        fontSize = 12.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold)
                }
                if (item.publisher.isNotBlank()) Text(item.publisher, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            FavoriteButton(favorite, onFavorite)
        }
        Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = Edge) {
            Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text(price(item), fontWeight = FontWeight.Bold, fontSize = 22.sp)
                        if (item.appVersion.isNotBlank()) Text(item.appVersion, fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (!showInstallChoices) {
                        Spacer(Modifier.width(16.dp))
                        val label = stringResource(when {
                            originalUpdate -> R.string.update_app
                            original != null -> R.string.open_app
                            !signedIn -> R.string.sign_in
                            item.entitlementStatus == 1 -> R.string.download
                            item.price.toDoubleOrNull() == 0.0 -> R.string.get_free
                            else -> R.string.view_official_offer
                        })
                        ActionButton(label, !busy) {
                            when {
                                originalUpdate -> onGet(InstallVariant.ORIGINAL)
                                original != null -> onOpen(InstallVariant.ORIGINAL)
                                else -> onGet(null)
                            }
                        }
                    }
                }
                if (showInstallChoices) InstallChoices(wide, !busy, onChoice = { onGet(it) },
                    installedCopies = installedCopies, latestCode = item.versionCode, latestName = item.appVersion,
                    purchaseRequired = needsPurchase, tryAdaptation = tryAdaptation, onOpen = onOpen)
                else if (original != null) {
                    CopyVersions(original, item.versionCode, item.appVersion)
                    if (originalUpdate) TextButton(onClick = { onOpen(InstallVariant.ORIGINAL) }, enabled = !busy,
                        contentPadding = PaddingValues(0.dp)) {
                        Text(stringResource(R.string.open_app), fontWeight = FontWeight.SemiBold)
                    }
                }
                Text(stringResource(R.string.install_hint), fontSize = 12.sp, lineHeight = 18.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (item.summary.isNotBlank()) Text(item.summary, fontSize = 18.sp, lineHeight = 28.sp, fontWeight = FontWeight.Medium)
        if (item.screenshots.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            rowItems(item.screenshots) { screenshot ->
                StoreImage(imageLoader, screenshot, Modifier.width(280.dp).aspectRatio(16f / 9f), item.name)
            }
        }
        if (item.description.isNotBlank()) {
            Text(item.description, maxLines = if (expanded) Int.MAX_VALUE else 5, overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp, lineHeight = 25.sp)
            TextButton(onClick = { expanded = !expanded }, contentPadding = PaddingValues(0.dp)) {
                Text(stringResource(if (expanded) R.string.read_less else R.string.read_more))
            }
        }
        val metadata = listOf(item.genres, item.ageRating).filter { it.isNotBlank() }.joinToString("  /  ")
        if (metadata.isNotBlank()) Text(metadata, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun InstallChoices(wide: Boolean, enabled: Boolean, onChoice: (InstallVariant) -> Unit,
    installedCopies: InstalledCopies = InstalledCopies(), latestCode: Long = 0, latestName: String = "",
    purchaseRequired: Boolean = false, tryAdaptation: Boolean = false, onOpen: (InstallVariant) -> Unit = {}) {
    val choice: @Composable (InstallVariant, Modifier) -> Unit = { variant, modifier ->
        InstallChoice(variant, enabled, modifier, installedCopies.copyFor(variant), latestCode, latestName,
            purchaseRequired, tryAdaptation, onInstall = { onChoice(variant) }, onOpen = { onOpen(variant) })
    }
    if (wide) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        choice(InstallVariant.ADAPTED, Modifier.weight(1f))
        choice(InstallVariant.ORIGINAL, Modifier.weight(1f))
    } else Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        choice(InstallVariant.ADAPTED, Modifier.fillMaxWidth())
        choice(InstallVariant.ORIGINAL, Modifier.fillMaxWidth())
    }
}

@Composable
private fun InstallChoice(variant: InstallVariant, enabled: Boolean, modifier: Modifier, installed: InstalledCopy?,
    latestCode: Long, latestName: String, purchaseRequired: Boolean, tryAdaptation: Boolean,
    onInstall: () -> Unit, onOpen: () -> Unit) {
    val adapted = variant == InstallVariant.ADAPTED
    val updateAvailable = installed != null && installed.versionCode < latestCode
    val openInstalled = installed != null && !updateAvailable
    val action = if (openInstalled) onOpen else onInstall
    val label = stringResource(when {
        updateAvailable && adapted && tryAdaptation -> R.string.try_adapted_update
        updateAvailable -> R.string.update_app
        openInstalled -> R.string.open_app
        purchaseRequired -> R.string.view_official_offer
        adapted && tryAdaptation -> R.string.try_account_adaptation
        adapted -> R.string.install_account_supported
        else -> R.string.install_original
    })
    Column(modifier, verticalArrangement = Arrangement.spacedBy(7.dp)) {
        if (latestCode > 0) {
            Text(stringResource(if (adapted) R.string.account_supported_copy else R.string.original_copy),
                fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Column(Modifier.heightIn(min = 38.dp)) {
                if (installed != null) CopyVersions(installed, latestCode, latestName)
                else Text(stringResource(R.string.copy_not_installed), fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (adapted) Button(onClick = action, enabled = enabled, shape = Edge,
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp)) {
            Text(label, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Bold)
        } else OutlinedButton(onClick = action, enabled = enabled, shape = Edge,
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp)) {
            Text(label, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Bold)
        }
        Text(stringResource(when {
            adapted && tryAdaptation -> R.string.try_account_adaptation_hint
            adapted -> R.string.install_account_supported_hint
            else -> R.string.install_original_hint
        }),
            fontSize = 13.sp, lineHeight = 20.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (updateAvailable) TextButton(onClick = onOpen, enabled = enabled, contentPadding = PaddingValues(0.dp)) {
            Text(stringResource(R.string.open_app), fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun CopyVersions(installed: InstalledCopy, latestCode: Long, latestName: String) {
    val sameName = installed.versionName.isNotBlank() && installed.versionName == latestName && installed.versionCode != latestCode
    val installedLabel = installed.versionName.ifBlank { installed.versionCode.toString() } +
        if (sameName) " (${installed.versionCode})" else ""
    val availableLabel = latestName.ifBlank { latestCode.toString() } + if (sameName) " ($latestCode)" else ""
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(stringResource(R.string.installed_version, installedLabel), fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (latestCode > 0 && installed.versionCode != latestCode)
            Text(stringResource(R.string.available_version, availableLabel), fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun InstallChoiceDialog(name: String, busy: Boolean, onChoice: (InstallVariant) -> Unit, onDismiss: () -> Unit) {
    AlertDialog(onDismissRequest = { if (!busy) onDismiss() }, shape = Edge,
        containerColor = MaterialTheme.colorScheme.background,
        title = { Text(stringResource(R.string.install_choice_title), fontWeight = FontWeight.Black) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                Text(name, fontSize = 18.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold)
                InstallChoices(wide = false, enabled = !busy, onChoice = onChoice, tryAdaptation = true)
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss, enabled = !busy) { Text(stringResource(R.string.install_later)) }
        })
}

@Composable
private fun OriginalWarningDialog(name: String, busy: Boolean, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(onDismissRequest = { if (!busy) onDismiss() }, shape = Edge,
        containerColor = MaterialTheme.colorScheme.background,
        title = { Text(stringResource(R.string.original_warning_title), fontWeight = FontWeight.Black) },
        text = { Text(stringResource(R.string.original_warning_body, name), lineHeight = 24.sp) },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = !busy) { Text(stringResource(R.string.continue_original_install)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) { Text(stringResource(R.string.back_to_app)) }
        })
}

@Composable
private fun StatusStrip(message: String, busy: Boolean, progress: Pair<Long, Long?>?, gutter: androidx.compose.ui.unit.Dp) {
    Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
        Column(Modifier.fillMaxWidth().padding(horizontal = gutter, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(message.ifBlank { stringResource(R.string.working) }, fontSize = 13.sp, lineHeight = 19.sp)
            if (progress != null) {
                val (received, total) = progress
                if (total != null && total > 0) LinearProgressIndicator(
                    progress = { (received.toFloat() / total).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
                else LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                Text(if (total != null) stringResource(R.string.download_progress, received / 1_048_576, total / 1_048_576)
                    else stringResource(R.string.download_received, received / 1_048_576), fontSize = 12.sp)
            } else if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun AccountDialog(email: String, signedIn: Boolean, busy: Boolean, message: String,
    onDismiss: () -> Unit, onSendCode: (String) -> Unit, onLogin: (String, String) -> Unit, onLogout: () -> Unit,
    updateVersion: String?, onCheckUpdate: () -> Unit, onOpenUpdate: () -> Unit, onShowAnnouncement: () -> Unit,
    profileVersions: Map<String, Long>, profileUpdateVersions: Map<String, Long>,
    onCheckProfileUpdate: () -> Unit, onOpenProfileUpdate: (String) -> Unit) {
    var address by remember(email) { mutableStateOf(email) }
    var code by remember { mutableStateOf("") }
    val uri = LocalUriHandler.current
    AlertDialog(onDismissRequest = { if (!busy) onDismiss() }, shape = Edge,
        containerColor = MaterialTheme.colorScheme.background,
        title = { Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Eyebrow("PICO GLOBAL")
            Text(stringResource(R.string.account), fontWeight = FontWeight.Black, fontSize = 28.sp)
        } },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            if (signedIn) Text(email, fontSize = 16.sp)
            else {
                Text(stringResource(R.string.account_description), fontSize = 14.sp, lineHeight = 22.sp)
                OutlinedTextField(address, { address = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.email)) },
                    enabled = !busy, singleLine = true, shape = Edge,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                OutlinedButton(onClick = { onSendCode(address.trim()) }, enabled = !busy && address.contains('@'), shape = Edge) {
                    Text(stringResource(R.string.send_code))
                }
                OutlinedTextField(code, { code = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.verification_code)) },
                    enabled = !busy, singleLine = true, shape = Edge,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text))
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Text(stringResource(R.string.register_hint), fontSize = 13.sp, lineHeight = 20.sp)
                TextButton(onClick = { uri.openUri(ProjectLinks.picoRegistrationUrl) }, contentPadding = PaddingValues(0.dp)) {
                    Text(stringResource(R.string.register_account) + " ↗", fontWeight = FontWeight.SemiBold)
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Text("PICO Store Lab", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text(stringResource(R.string.installed_version, BuildConfig.VERSION_NAME), fontSize = 12.sp)
                if (updateVersion != null) Text(stringResource(R.string.available_version, updateVersion),
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
                TextButton(onClick = onShowAnnouncement, contentPadding = PaddingValues(0.dp)) {
                    Text(stringResource(R.string.update_announcement))
                }
                OutlinedButton(onClick = if (updateVersion != null) onOpenUpdate else onCheckUpdate,
                    modifier = Modifier.fillMaxWidth(), enabled = !busy, shape = Edge) {
                    Text(stringResource(if (updateVersion != null) R.string.download_update else R.string.check_update))
                }
            }
            if (profileVersions.isNotEmpty()) Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(stringResource(R.string.profile_title), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                for (key in (profileVersions.keys + profileUpdateVersions.keys).sorted()) {
                    Text(key, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    profileVersions[key]?.let { version ->
                        Text(stringResource(R.string.profile_installed, ProfileReleaseUpdates.display(version)), fontSize = 12.sp)
                    }
                    profileUpdateVersions[key]?.let { version ->
                        Text(stringResource(R.string.profile_available, ProfileReleaseUpdates.display(version)),
                            fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
                        OutlinedButton(onClick = { onOpenProfileUpdate(key) }, modifier = Modifier.fillMaxWidth(), enabled = !busy, shape = Edge) {
                            Text(stringResource(R.string.profile_download))
                        }
                    }
                }
                OutlinedButton(onClick = onCheckProfileUpdate, modifier = Modifier.fillMaxWidth(), enabled = !busy, shape = Edge) {
                    Text(stringResource(R.string.profile_check))
                }
            }
            if (message.isNotBlank()) Text(message, fontSize = 13.sp, color = MaterialTheme.colorScheme.primary)
            if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        } },
        confirmButton = {
            if (signedIn) ActionButton(stringResource(R.string.sign_out), !busy, onLogout)
            else ActionButton(stringResource(R.string.sign_in), !busy && address.contains('@') && code.isNotBlank()) {
                onLogin(address.trim(), code.trim()); code = ""
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text(stringResource(R.string.close)) } })
}

@Composable
private fun AnnouncementDialog(announcement: ReleaseAnnouncement?, loading: Boolean,
    onDismiss: () -> Unit, onRetry: () -> Unit, onViewUpdate: () -> Unit) {
    val newer = announcement?.let { ReleaseUpdates.isNewer(it.version, BuildConfig.VERSION_NAME) } == true
    AlertDialog(onDismissRequest = onDismiss, shape = Edge,
        containerColor = MaterialTheme.colorScheme.background,
        title = { Text(stringResource(R.string.update_announcement), fontWeight = FontWeight.Black) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                if (announcement != null) {
                    Text(stringResource(R.string.announcement_version, announcement.version),
                        fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                    Text(announcement.body, fontSize = 14.sp, lineHeight = 21.sp)
                } else if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
                else {
                    Text(stringResource(R.string.announcement_unavailable))
                    TextButton(onClick = onRetry) { Text(stringResource(R.string.retry)) }
                }
            }
        },
        confirmButton = {
            if (newer) TextButton(onClick = onViewUpdate) { Text(stringResource(R.string.check_update)) }
            else TextButton(onClick = onDismiss) { Text(stringResource(R.string.close)) }
        },
        dismissButton = {
            if (newer) TextButton(onClick = onDismiss) { Text(stringResource(R.string.close)) }
        })
}

@Composable
private fun ActionButton(text: String, enabled: Boolean, action: () -> Unit) {
    Button(onClick = action, enabled = enabled, shape = Edge,
        modifier = Modifier.heightIn(min = 52.dp), contentPadding = PaddingValues(horizontal = 22.dp, vertical = 14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary,
            contentColor = MaterialTheme.colorScheme.onSecondary)) {
        Text(text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun themeLabel(mode: ThemeMode): String = stringResource(when (mode) {
    ThemeMode.SYSTEM -> R.string.theme_system
    ThemeMode.LIGHT -> R.string.theme_light
    ThemeMode.DARK -> R.string.theme_dark
})

@Composable
private fun StoreImage(imageLoader: StoreImageLoader, url: String?, modifier: Modifier, name: String) {
    val bitmap by produceState<android.graphics.Bitmap?>(null, url) {
        value = imageLoader.load(url)
    }
    Box(modifier.background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
        if (bitmap != null) Image(bitmap!!.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else Text(name.take(1).uppercase(), color = MaterialTheme.colorScheme.primary.copy(alpha = .5f),
            fontSize = 42.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun SettingsPage(themeMode: ThemeMode, onThemeChange: (ThemeMode) -> Unit, onBack: () -> Unit,
    gutter: androidx.compose.ui.unit.Dp, modifier: Modifier) {
    Column(modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(gutter),
        verticalArrangement = Arrangement.spacedBy(22.dp)) {
        TextButton(onClick = onBack, contentPadding = PaddingValues(0.dp)) {
            Text("←  ${stringResource(R.string.back_to_store)}", fontWeight = FontWeight.SemiBold)
        }
        Eyebrow("PICO STORE LAB")
        Text(stringResource(R.string.settings), fontSize = 36.sp, fontWeight = FontWeight.Black)
        Text(stringResource(R.string.settings_description), color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 15.sp, lineHeight = 24.sp)
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(stringResource(R.string.theme), fontWeight = FontWeight.Bold, fontSize = 18.sp)
            ThemeMode.entries.forEach { mode ->
                OutlinedButton(
                    onClick = { onThemeChange(mode) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = Edge,
                    border = BorderStroke(
                        if (mode == themeMode) 2.dp else 1.dp,
                        if (mode == themeMode) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                    ),
                ) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(themeLabel(mode))
                        if (mode == themeMode) Text("✓", color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        Text("PICO Store Lab  ${BuildConfig.VERSION_NAME}", fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
