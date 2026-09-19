package dev.nkanf.picostore

import android.graphics.BitmapFactory
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.URL

enum class ThemeMode { SYSTEM, LIGHT, DARK }

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
    email: String, signedIn: Boolean, favorites: Set<String>,
    updateVersion: String?, onCheckUpdate: () -> Unit, onOpenUpdate: () -> Unit,
    onSearch: (String) -> Unit, onSelect: (StoreTarget) -> Unit,
    onFavorite: (String) -> Unit, onSendCode: (String) -> Unit,
    onLogin: (String, String) -> Unit, onLogout: () -> Unit,
    onGet: (PublicItem) -> Unit, onBack: () -> Unit, onThemeChange: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var onlyFavorites by remember { mutableStateOf(false) }
    var accountOpen by remember { mutableStateOf(false) }
    val dark = when (themeMode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    LaunchedEffect(signedIn) { if (signedIn) accountOpen = false }
    BackHandler(selected != null && !accountOpen) { if (!busy) onBack() }
    MaterialTheme(colorScheme = if (dark) darkScheme else lightScheme) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding()) {
                val wide = maxWidth >= 820.dp
                val gutter = if (wide) 36.dp else 20.dp
                Column(Modifier.fillMaxSize()) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = gutter, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Brand(Modifier.weight(1f))
                        val themeDescription = themeLabel(themeMode)
                        IconButton(onClick = onThemeChange,
                            modifier = Modifier.semantics { contentDescription = themeDescription }) {
                            Text(if (dark) "◑" else "◐", fontSize = 24.sp)
                        }
                        OutlinedButton(onClick = { accountOpen = true }, shape = Edge,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)) {
                            Text(stringResource(if (signedIn) R.string.account else R.string.sign_in),
                                fontWeight = FontWeight.SemiBold)
                        }
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    if (selected == null) {
                        val visible = if (onlyFavorites) entries.filter { it.target.itemId in favorites } else entries
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
                                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                                        SectionTab(stringResource(R.string.all_apps), !onlyFavorites) { onlyFavorites = false }
                                        SectionTab(stringResource(R.string.favorites), onlyFavorites) { onlyFavorites = true }
                                        Spacer(Modifier.weight(1f))
                                        Text(visible.size.toString().padStart(2, '0'), fontSize = 13.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                            items(visible, key = { it.target.itemId }) { entry ->
                                AppCard(entry, entry.target.itemId in favorites, !busy,
                                    onOpen = { onSelect(entry.target) },
                                    onFavorite = { onFavorite(entry.target.itemId) })
                            }
                            if (visible.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) {
                                Column(Modifier.fillMaxWidth().padding(vertical = 48.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text(stringResource(if (onlyFavorites) R.string.empty_favorites else R.string.empty_search),
                                        fontSize = 24.sp, fontWeight = FontWeight.Bold)
                                    Text(stringResource(if (onlyFavorites) R.string.empty_favorites_hint else R.string.empty_search_hint),
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
                            AppDetail(selected, selected.itemId in favorites, wide, signedIn,
                                onFavorite = { onFavorite(selected.itemId) },
                                onGet = { if (signedIn) onGet(selected) else accountOpen = true }, busy = busy)
                        }
                    }
                    if (message.isNotBlank() || busy) StatusStrip(message, busy, downloadProgress, gutter)
                }
                if (accountOpen) AccountDialog(email, signedIn, busy, message,
                    onDismiss = { accountOpen = false }, onSendCode = onSendCode,
                    onLogin = onLogin, onLogout = onLogout, updateVersion = updateVersion,
                    onCheckUpdate = onCheckUpdate, onOpenUpdate = onOpenUpdate)
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
private fun AppCard(entry: StoreEntry, favorite: Boolean, enabled: Boolean, onOpen: () -> Unit, onFavorite: () -> Unit) {
    Surface(onClick = onOpen, enabled = enabled, shape = Edge,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column {
            StoreImage(entry.info?.coverUrl, Modifier.fillMaxWidth().aspectRatio(16f / 9f), entry.target.name)
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
                    Text(price(entry.info), fontSize = 13.sp, fontWeight = FontWeight.Bold)
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
    onFavorite: () -> Unit, onGet: () -> Unit, busy: Boolean) {
    var expanded by remember(item.itemId) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
        StoreImage(item.coverUrl, Modifier.fillMaxWidth().height(if (wide) 260.dp else 180.dp), item.name)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            StoreImage(item.iconUrl, Modifier.size(72.dp), item.name)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(item.name, fontSize = if (wide) 36.sp else 28.sp, lineHeight = 39.sp, fontWeight = FontWeight.Black)
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
                    Spacer(Modifier.width(16.dp))
                    val label = stringResource(when {
                        !signedIn -> R.string.sign_in
                        item.entitlementStatus == 1 -> R.string.download
                        item.price.toDoubleOrNull() == 0.0 -> R.string.get_free
                        else -> R.string.view_official_offer
                    })
                    ActionButton(label, !busy, onGet)
                }
                Text(stringResource(R.string.install_hint), fontSize = 12.sp, lineHeight = 18.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (item.summary.isNotBlank()) Text(item.summary, fontSize = 18.sp, lineHeight = 28.sp, fontWeight = FontWeight.Medium)
        if (item.screenshots.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            rowItems(item.screenshots.take(8)) { screenshot -> StoreImage(screenshot, Modifier.width(280.dp).aspectRatio(16f / 9f), item.name) }
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
    updateVersion: String?, onCheckUpdate: () -> Unit, onOpenUpdate: () -> Unit) {
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
                TextButton(onClick = { uri.openUri("https://sso-global.picoxr.com/") }, contentPadding = PaddingValues(0.dp)) {
                    Text(stringResource(R.string.register_account) + " ↗", fontWeight = FontWeight.SemiBold)
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("PICO Store Lab  ${BuildConfig.VERSION_NAME}", Modifier.weight(1f), fontSize = 12.sp)
                TextButton(onClick = if (updateVersion != null) onOpenUpdate else onCheckUpdate, enabled = !busy) {
                    Text(stringResource(if (updateVersion != null) R.string.download_update else R.string.check_update))
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
private fun StoreImage(url: String?, modifier: Modifier, name: String) {
    val bitmap by produceState<android.graphics.Bitmap?>(null, url) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                val uri = android.net.Uri.parse(url ?: return@runCatching null)
                val host = uri.host.orEmpty()
                if (uri.scheme != "https" || !(host == "picovr.com" || host.endsWith(".picovr.com") ||
                    host == "picoxr.com" || host.endsWith(".picoxr.com"))) return@runCatching null
                val connection = URL(url).openConnection()
                connection.connectTimeout = 10_000
                connection.readTimeout = 10_000
                connection.getInputStream().use { BitmapFactory.decodeStream(it, null,
                    BitmapFactory.Options().apply { inSampleSize = 4 }) }
            }.getOrNull()
        }
    }
    Box(modifier.background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
        if (bitmap != null) Image(bitmap!!.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else Text(name.take(1).uppercase(), color = MaterialTheme.colorScheme.primary.copy(alpha = .5f),
            fontSize = 42.sp, fontWeight = FontWeight.Black)
    }
}
