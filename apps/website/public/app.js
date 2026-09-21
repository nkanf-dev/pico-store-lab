const $ = id => document.getElementById(id);
const translations = {
  "en": {
    "indexLabel": "PICO APP CATALOG",
    "catalogLabel": "01 / RECOMMENDED",
    "catalogHint": "CHOOSE AN APP",
    "currentLabel": "02 / APP DETAILS",
    "searchLabel": "Search PICO apps",
    "searchPlaceholder": "App name",
    "searchButton": "Search",
    "searching": "Searching…",
    "searchEmpty": "No apps found. Try another name.",
    "searchFailed": "Search is unavailable. Please try again later.",
    "favoritesLabel": "FAVORITES",
    "favoritesHint": "SAVED ON THIS DEVICE",
    "favoriteAdd": "Add to favorites ☆",
    "favoriteRemove": "Remove from favorites ★",
    "packageLabel": "APP",
    "versionLabel": "LATEST VERSION CODE",
    "historyLabel": "Version history",
    "trackingLabel": "RECENT UPDATES",
    "workflowLabel": "04 / GETTING STARTED",
    "communityLabel": "PICO STORE LAB / OPEN SOURCE",
    "heroLine": "Find PICO apps.",
    "heroAccent": "Download and install.",
    "intro": "Search for apps, check their versions, and download with your PICO international account. Use the website to save an APK, or install apps directly on your headset with our Android app.",
    "artCaption": "BROWSE / DOWNLOAD / INSTALL",
    "official": "View in PICO Store ↗",
    "exploreCatalog": "Browse apps ↓",
    "repositoryLink": "GitHub ↗",
    "playerGuide": "How to download",
    "getClient": "Download headset app ↗",
    "fullGuide": "Read the guide ↗",
    "loading": "Loading",
    "nativeNote": "App information from PICO Store.",
    "reading": "Loading app information",
    "readingHistory": "Loading version history…",
    "workflowOne": "Download an app.",
    "workflowTwo": "Install it on your headset.",
    "stepOne": "Search by name or choose an app from the recommendations above.",
    "stepTwo": "Sign in with your PICO international account email and the verification code sent to your inbox.",
    "stepThree": "Choose Download APK. For a free app you haven’t added to your account yet, choose Get free app first. Buy paid apps in PICO Store before downloading.",
    "stepFour": "Install the downloaded APK on your headset. You can also use our headset app to download and install without a computer.",
    "disclaimer": "An independent community project, not affiliated with PICO.",
    "downloadLabel": "03 / WEB DOWNLOAD",
    "downloadOne": "Sign in to PICO.",
    "downloadTwo": "Download this app.",
    "downloadIntro": "Use your PICO international account to download the selected app. For paid apps, purchase them in PICO Store first.",
    "registerIntro": "Need a PICO international account?",
    "registerLink": "Register on PICO’s website ↗",
    "registerHint": "Choose “Sign Up”, then return here to sign in.",
    "emailLabel": "PICO international account email",
    "codePlaceholder": "Email verification code",
    "sendCode": "Send code",
    "signIn": "Sign in",
    "signedOut": "Not signed in",
    "signedInAs": "Signed in as ",
    "signingOut": "Signing out…",
    "signOut": "Sign out",
    "sendingCode": "Sending the verification code…",
    "codeSent": "Code sent. Check your inbox, including spam.",
    "signingIn": "Signing in…",
    "checkingEntitlement": "Loading download options…",
    "acquireApk": "Get free app",
    "acquiringApk": "Adding this app to your account…",
    "freeAcquisitionRequired": "Choose Get free app to add it to your PICO account, then download it.",
    "errSignOutFailed": "Could not sign out. Please try again.",
    "apkLabel": "APK",
    "apkVersionLabel": "VERSION",
    "apkSizeLabel": "SIZE",
    "downloadApk": "Download APK",
    "directDownload": "Download from PICO ↗",
    "copyMd5": "Copy MD5",
    "md5Copied": "MD5 copied",
    "downloadHint": "Once the download starts, check its progress in your browser’s downloads.",
    "selectApp": "Choose an app above to see its download options.",
    "apkUnavailable": "This app is unavailable to download here.",
    "errNotAuthenticated": "Sign in with your PICO international account first.",
    "errRateLimited": "Too many attempts. Wait a few minutes and try again.",
    "errInvalidEmail": "Enter a valid email address.",
    "errInvalidCode": "Enter the verification code from your email.",
    "errAccountRejected": "Sign-in failed. Check your email address and code, or request a new code.",
    "errAccountUnavailable": "PICO sign-in is unavailable. Please try again later.",
    "errInvalidItemId": "Could not load this app. Please select it again.",
    "errInvalidPackage": "Could not load this app. Please select it again.",
    "errEntitlementRequired": "Get this app in PICO Store first, then return here to download it.",
    "errUnavailable": "This download is unavailable. Please try again later.",
    "errMisconfigured": "Downloads are unavailable. Please try again later.",
    "errGeneric": "Something went wrong. Please try again.",
    "never": "Not updated yet",
    "unknownTime": "Date unavailable",
    "publicDetail": "PICO Store",
    "catalogLookup": "Version listed in PICO Store",
    "lastCheck": "Updated: ",
    "stale": "Showing saved information",
    "fresh": "Updated",
    "empty": "No version history yet",
    "unavailable": "Unavailable",
    "unable": "Could not load app information. Please try again later.",
    "language": "中文",
    "languageLabel": "Switch to Chinese",
    "goDownload": "Download this app",
    "aboutApp": "About this app",
    "free": "Free",
    "publisher": "Publisher",
    "genres": "Category",
    "ageRating": "Age rating",
    "platforms": "Headsets",
    "version": "Version",
    "rating": "Rating",
    "viewApp": "View app →",
    "detailUnavailable": "Details could not be loaded. View this app in PICO Store for more information.",
    "screenshot": "App screenshot",
    "fileDetails": "File details"
  },
  "zh-CN": {
    "indexLabel": "PICO 应用目录",
    "catalogLabel": "01 / 推荐应用",
    "catalogHint": "选择应用",
    "currentLabel": "02 / 应用详情",
    "searchLabel": "搜索 PICO 应用",
    "searchPlaceholder": "输入应用名称",
    "searchButton": "搜索",
    "searching": "正在搜索…",
    "searchEmpty": "没有找到应用，试试其他名称。",
    "searchFailed": "暂时无法搜索，请稍后重试。",
    "favoritesLabel": "收藏",
    "favoritesHint": "保存在此设备",
    "favoriteAdd": "加入收藏 ☆",
    "favoriteRemove": "取消收藏 ★",
    "packageLabel": "应用",
    "versionLabel": "最新版本码",
    "historyLabel": "版本记录",
    "trackingLabel": "近期更新",
    "workflowLabel": "04 / 开始使用",
    "communityLabel": "PICO STORE LAB / 开源项目",
    "heroLine": "浏览 PICO 应用，",
    "heroAccent": "下载你需要的。",
    "intro": "搜索应用、查看版本，用 PICO 国际区账号下载。你可以在网页保存安装包，也可以用头显客户端直接下载并安装。",
    "artCaption": "浏览 / 下载 / 安装",
    "official": "前往 PICO 商店 ↗",
    "exploreCatalog": "浏览应用 ↓",
    "repositoryLink": "GitHub ↗",
    "playerGuide": "查看下载指南",
    "getClient": "下载头显客户端 ↗",
    "fullGuide": "查看完整指南 ↗",
    "loading": "加载中",
    "nativeNote": "应用信息来自 PICO 商店。",
    "reading": "正在加载应用信息",
    "readingHistory": "正在加载版本记录…",
    "workflowOne": "下载应用，",
    "workflowTwo": "安装到头显。",
    "stepOne": "按名称搜索，或从上方的推荐列表中选择一款应用。",
    "stepTwo": "填写 PICO 国际区账号邮箱，用收到的邮件验证码登录。",
    "stepThree": "点击「下载 APK」。尚未领取的免费应用，先点击「领取免费应用」；付费应用请先在 PICO 商店购买。",
    "stepFour": "把下载好的 APK 安装到头显。也可以使用头显客户端，在头显上直接下载并安装，无需电脑。",
    "disclaimer": "独立社区项目，与 PICO 无隶属关系。",
    "downloadLabel": "03 / 网页下载",
    "downloadOne": "登录 PICO 账号，",
    "downloadTwo": "下载所选应用。",
    "downloadIntro": "使用 PICO 国际区账号下载所选应用。付费应用请先在 PICO 商店购买。",
    "registerIntro": "还没有 PICO 国际区账号？",
    "registerLink": "前往 PICO 官网注册 ↗",
    "registerHint": "打开后选择「Sign Up」，完成注册后回到这里登录。",
    "emailLabel": "PICO 国际区账号邮箱",
    "codePlaceholder": "邮箱验证码",
    "sendCode": "发送验证码",
    "signIn": "登录",
    "signedOut": "尚未登录",
    "signedInAs": "已登录：",
    "signingOut": "正在退出…",
    "signOut": "退出登录",
    "sendingCode": "正在发送验证码…",
    "codeSent": "验证码已发送，请查收邮件，也可以看看垃圾邮件。",
    "signingIn": "正在登录…",
    "checkingEntitlement": "正在加载下载信息…",
    "acquireApk": "领取免费应用",
    "acquiringApk": "正在领取应用…",
    "freeAcquisitionRequired": "点击「领取免费应用」，添加到 PICO 账号后即可下载。",
    "errSignOutFailed": "退出失败，请重试。",
    "apkLabel": "APK",
    "apkVersionLabel": "版本",
    "apkSizeLabel": "大小",
    "downloadApk": "下载 APK",
    "directDownload": "从 PICO 下载 ↗",
    "copyMd5": "复制 MD5",
    "md5Copied": "已复制 MD5",
    "downloadHint": "下载开始后，可在浏览器的下载列表中查看进度。",
    "selectApp": "请先在上方选择一款应用。",
    "apkUnavailable": "暂时无法在这里下载这款应用。",
    "errNotAuthenticated": "请先登录 PICO 国际区账号。",
    "errRateLimited": "尝试次数过多，请等待几分钟后重试。",
    "errInvalidEmail": "请输入有效的邮箱地址。",
    "errInvalidCode": "请输入邮件中的验证码。",
    "errAccountRejected": "登录失败，请检查邮箱和验证码，或重新获取验证码。",
    "errAccountUnavailable": "暂时无法登录 PICO，请稍后重试。",
    "errInvalidItemId": "无法加载这款应用，请重新选择。",
    "errInvalidPackage": "无法加载这款应用，请重新选择。",
    "errEntitlementRequired": "请先在 PICO 商店获取这款应用，再回到这里下载。",
    "errUnavailable": "暂时无法下载，请稍后重试。",
    "errMisconfigured": "下载暂不可用，请稍后重试。",
    "errGeneric": "操作未完成，请重试。",
    "never": "暂无更新",
    "unknownTime": "暂无日期",
    "publicDetail": "PICO 商店",
    "catalogLookup": "PICO 商店当前版本",
    "lastCheck": "更新于：",
    "stale": "暂时显示上次更新的信息",
    "fresh": "已更新",
    "empty": "暂无版本记录",
    "unavailable": "暂不可用",
    "unable": "无法加载应用信息，请稍后重试。",
    "language": "EN",
    "languageLabel": "Switch to English",
    "goDownload": "下载此应用",
    "aboutApp": "应用介绍",
    "free": "免费",
    "publisher": "开发商",
    "genres": "类型",
    "ageRating": "年龄分级",
    "platforms": "支持的头显",
    "version": "版本",
    "rating": "评分",
    "viewApp": "查看应用 →",
    "detailUnavailable": "暂时无法加载完整介绍，可以前往 PICO 商店查看。",
    "screenshot": "应用截图",
    "fileDetails": "文件信息"
  }
};

const requested = new URL(location.href).searchParams.get('lang');
let locale = requested === 'en' || requested === 'zh-CN'
  ? requested : navigator.language.startsWith('zh') ? 'zh-CN' : 'en';
let currentState = null;
let catalogItems = [];
let searchItems = [];
let selectedId = null;
let fromSnapshot = false;
const itemDetails = new Map();
let detailRequest = 0;
let favorites = [];
try { favorites = JSON.parse(localStorage.getItem('pico-store-favorites') || '[]'); } catch { favorites = []; }
if (!Array.isArray(favorites)) favorites = [];

function t(key) { return translations[locale][key]; }

function formatTime(value) {
  if (!value) return t('never');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t('unknownTime')
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function applyLocale() {
  document.documentElement.lang = locale;
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) element.placeholder = t(element.dataset.i18nPlaceholder);
  $('language').textContent = t('language');
  $('language').setAttribute('aria-label', t('languageLabel'));
  const guide = locale === 'zh-CN'
    ? 'https://github.com/nkanf-dev/pico-store-lab/blob/main/README.zh-CN.md#player-guide'
    : 'https://github.com/nkanf-dev/pico-store-lab#player-guide';
  $('guide-link').href = guide;
  $('workflow-guide-link').href = guide;
  document.title = locale === 'en' ? 'PICO Store Lab — Browse and download PICO apps' : 'PICO Store Lab — 浏览与下载 PICO 应用';
  if (currentState) render(currentState, fromSnapshot);
  renderAccount();
  renderDownload();
}

function renderCards(container, items) {
  container.replaceChildren();
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `catalog-item${item.itemId === selectedId ? ' selected' : ''}`;
    button.setAttribute('aria-pressed', String(item.itemId === selectedId));
    const name = document.createElement('strong');
    name.textContent = item.name;
    const subtitle = document.createElement('span');
    subtitle.textContent = t('viewApp');
    button.append(name, subtitle);
    button.addEventListener('click', () => selectItem(item.itemId, true));
    container.append(button);
  }
}

function renderCatalog() {
  renderCards($('catalog-items'), catalogItems);
  renderCards($('search-results'), searchItems);
  renderCards($('favorite-items'), favorites);
}

async function selectItem(itemId, scroll = false) {
  const item = [...catalogItems, ...searchItems, ...favorites].find(entry => entry.itemId === itemId);
  if (!item) return;
  selectedId = itemId;
  const request = ++detailRequest;
  invalidateDownload();
  renderCatalog();
  const base = item.state ?? { ...item, latestVersionCode: item.versionCode, releases: [], stale: true };
  render({ ...base, ...itemDetails.get(itemId) }, !item.state);
  if (scroll) {
    $('app-details').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    $('app-details').focus({ preventScroll: true });
  }
  refreshDownload();
  try {
    const url = `/api/item?itemId=${encodeURIComponent(item.itemId)}&package=${encodeURIComponent(item.packageName)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('item unavailable');
    const detail = await response.json();
    itemDetails.set(itemId, detail);
    if (selectedId === itemId && request === detailRequest) render({ ...base, ...detail, latestVersionCode: detail.versionCode });
  } catch {
    if (selectedId === itemId && request === detailRequest && !itemDetails.has(itemId)) {
      $('app-summary').textContent = t('detailUnavailable');
      $('status-pill').textContent = '';
    }
  }
}

function safeImage(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : null;
  } catch { return null; }
}

function setImage(id, url) {
  const element = $(id);
  const source = safeImage(url);
  element.hidden = !source;
  if (source) element.src = source;
  else element.removeAttribute('src');
  return !!source;
}

function readableText(value) {
  if (!value) return '';
  const document = new DOMParser().parseFromString(String(value || ''), 'text/html');
  document.querySelectorAll('script,style,iframe,object').forEach(node => node.remove());
  document.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  document.querySelectorAll('p,div,li').forEach(node => node.append('\n'));
  return document.body.textContent.trim();
}

function renderDetails(state) {
  $('app-cover-frame').hidden = !setImage('app-cover', state.coverUrl);
  setImage('app-icon', state.iconUrl);
  $('app-publisher').textContent = state.publisher || '';
  $('app-summary').textContent = readableText(state.summary);
  $('app-price').textContent = state.price !== undefined && state.price !== ''
    ? Number(state.price) === 0 ? t('free') : `${state.price} ${state.currency || ''}` : '';
  $('download-selected-name').textContent = state.name || '';
  const description = readableText(state.description);
  $('app-about').hidden = !description;
  $('app-description').textContent = description;
  const gallery = $('app-gallery');
  gallery.replaceChildren();
  for (const [index, source] of (state.screenshots || []).entries()) {
    const url = safeImage(source);
    if (!url) continue;
    const link = document.createElement('a');
    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const image = document.createElement('img');
    image.src = url; image.alt = `${state.name || ''} — ${t('screenshot')} ${index + 1}`;
    image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
    link.append(image); gallery.append(link);
  }
  gallery.hidden = !gallery.children.length;
  const facts = $('app-facts');
  facts.replaceChildren();
  const values = { publisher: state.publisher, genres: state.genres, ageRating: state.ageRating,
    platforms: state.supportedPlatforms, rating: state.score, version: state.appVersion || state.latestVersionCode };
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    const row = document.createElement('div');
    const label = document.createElement('dt'); label.textContent = t(key);
    const text = document.createElement('dd'); text.textContent = String(value);
    row.append(label, text); facts.append(row);
  }
}

function render(state, snapshot = false) {
  currentState = state;
  fromSnapshot = snapshot;
  renderDetails(state);
  $('release-heading').textContent = state.name ?? state.packageName ?? '—';
  $('favorite-toggle').textContent = t(favorites.some(item => item.itemId === state.itemId) ? 'favoriteRemove' : 'favoriteAdd');
  $('last-check').textContent = state.lastSuccessfulCheckAt
    ? `${t('lastCheck')}${formatTime(state.lastSuccessfulCheckAt)}` : t('catalogLookup');
  $('status-pill').textContent = !state.lastSuccessfulCheckAt && state.latestVersionCode
    ? t('publicDetail') : snapshot || state.stale ? t('stale') : t('fresh');
  $('official-link').href = state.officialUrl?.startsWith('https://store-global.picoxr.com/')
    ? state.officialUrl : `https://store-global.picoxr.com/global/detail/1/${state.itemId}`;
  const list = $('releases');
  list.replaceChildren();
  const releases = [...(state.releases ?? [])].reverse();
  if (!releases.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = t('empty');
    list.append(empty);
    return;
  }
  releases.forEach((release, index) => {
    const li = document.createElement('li');
    const number = document.createElement('span');
    number.className = 'ordinal';
    number.textContent = String(releases.length - index).padStart(2, '0');
    const version = document.createElement('strong');
    version.className = 'version';
    version.textContent = `BUILD ${release.versionCode}`;
    const time = document.createElement('time');
    time.dateTime = release.firstSeenAt;
    time.textContent = formatTime(release.firstSeenAt);
    li.append(number, version, time);
    list.append(li);
  });
}

async function search() {
  const word = $('search-word').value.trim();
  if (!word) return;
  $('search-status').textContent = t('searching');
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(word)}`);
    if (!response.ok) throw new Error('search unavailable');
    const result = await response.json();
    searchItems = result.items ?? [];
    renderCatalog();
    $('search-status').textContent = searchItems.length ? '' : t('searchEmpty');
  } catch { $('search-status').textContent = t('searchFailed'); }
}

$('search-form').addEventListener('submit', event => { event.preventDefault(); search(); });
$('favorite-toggle').addEventListener('click', () => {
  if (!currentState?.itemId) return;
  favorites = favorites.some(item => item.itemId === currentState.itemId)
    ? favorites.filter(item => item.itemId !== currentState.itemId)
    : [...favorites, { itemId: currentState.itemId, packageName: currentState.packageName, name: currentState.name }];
  localStorage.setItem('pico-store-favorites', JSON.stringify(favorites));
  renderCatalog();
  $('favorite-toggle').textContent = t(favorites.some(item => item.itemId === currentState.itemId) ? 'favoriteRemove' : 'favoriteAdd');
});

async function loadState() {
  try {
    const response = await fetch('/api/catalog', { cache: 'no-store' });
    if (!response.ok) throw new Error(`release API ${response.status}`);
    catalogItems = await response.json();
    if (!Array.isArray(catalogItems) || !catalogItems.length) throw new Error('catalog unavailable');
    selectItem(selectedId ?? catalogItems[0].itemId);
  } catch {
    try {
      const response = await fetch('/catalog.json');
      if (!response.ok) throw new Error('snapshot unavailable');
      const state = await response.json();
      catalogItems = [{ itemId: state.itemId, packageName: state.packageName, name: state.name, state }];
      selectItem(state.itemId);
    } catch {
      $('status-pill').textContent = t('unavailable');
      $('last-check').textContent = t('unable');
    }
  }
}

$('language').addEventListener('click', () => {
  locale = locale === 'en' ? 'zh-CN' : 'en';
  const url = new URL(location.href);
  url.searchParams.set('lang', locale);
  history.replaceState(null, '', url);
  applyLocale();
});

const ERROR_KEYS = {
  not_authenticated: 'errNotAuthenticated', rate_limited: 'errRateLimited', invalid_email: 'errInvalidEmail',
  invalid_code: 'errInvalidCode', account_rejected: 'errAccountRejected', account_unavailable: 'errAccountUnavailable',
  invalid_item_id: 'errInvalidItemId', invalid_package: 'errInvalidPackage',
  entitlement_required: 'errEntitlementRequired',
  apk_unavailable: 'errUnavailable', apk_metadata_unavailable: 'errUnavailable', entitlement_unconfirmed: 'errUnavailable',
  upstream_unreachable: 'errUnavailable', upstream_response_too_large: 'errUnavailable',
  upstream_invalid_response: 'errUnavailable',
  storage_not_configured: 'errMisconfigured', session_secret_missing: 'errMisconfigured',
};

let account = { authenticated: false, email: null };
let apk = null;
let apkRequest = 0;
let accountRequest = 0;
let accountBusy = false;
let accountStatusKey = null;

const errorKey = payload => ERROR_KEYS[payload?.error] ?? 'errGeneric';
const errorText = payload => t(errorKey(payload));

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) throw Object.assign(new Error(payload?.error ?? 'request_failed'), { payload, status: response.status });
  return payload ?? {};
}

function renderAccount() {
  $('account-status').textContent = accountStatusKey ? t(accountStatusKey)
    : account.authenticated ? `${t('signedInAs')}${account.email ?? ''}` : t('signedOut');
  $('download-card').hidden = !account.authenticated;
}

function setAccountStatus(key = null) {
  accountStatusKey = key;
  renderAccount();
}

function renderDownload() {
  $('download-card').hidden = !account.authenticated;
  const button = $('download-apk');
  const direct = $('download-direct');
  const acquire = $('acquire-apk');
  const available = account.authenticated && !accountBusy && apk?.available;
  acquire.hidden = !(account.authenticated && !accountBusy && apk?.canAcquire);
  $('copy-md5').disabled = !available;
  if (!available) {
    for (const id of ['apk-name', 'apk-version', 'apk-size', 'apk-md5']) $(id).textContent = '—';
    button.href = '#downloader';
    button.removeAttribute('download');
    button.setAttribute('aria-disabled', 'true');
    direct.hidden = true;
    direct.href = '#downloader';
    $('download-status').textContent = apk?.message
      ?? (selectedId ? t('apkUnavailable') : t('selectApp'));
    return;
  }
  $('apk-name').textContent = apk.name ?? apk.packageName;
  $('apk-version').textContent = apk.version || String(apk.versionCode);
  $('apk-size').textContent = formatBytes(apk.size);
  $('apk-md5').textContent = apk.md5;
  button.href = apk.downloadUrl;
  button.setAttribute('download', apk.fileName);
  button.removeAttribute('aria-disabled');
  direct.href = apk.directUrl ?? '#downloader';
  direct.hidden = !apk.directUrl;
  $('download-status').textContent = t('downloadHint');
}

function invalidateDownload(message) {
  apkRequest += 1;
  apk = message ? { available: false, message } : null;
  renderDownload();
}

function setAccountBusy(busy) {
  accountBusy = busy;
  for (const id of ['send-code', 'sign-in', 'sign-out']) $(id).disabled = busy;
}

function downloadError(error) {
  const canAcquire = error.payload?.canAcquire === true;
  return { available: false, message: canAcquire ? t('freeAcquisitionRequired') : errorText(error.payload), canAcquire };
}

// The app ID alone is not enough to ask PICO for a download, so pair it with
// whichever package name the catalog, the search results, or the snapshot has.
function selectedPackage() {
  const entry = [...catalogItems, ...searchItems, ...favorites]
    .find(item => item.itemId === selectedId);
  return currentState?.itemId === selectedId ? currentState.packageName : entry?.packageName;
}

async function refreshDownload() {
  invalidateDownload(t('checkingEntitlement'));
  if (!account.authenticated || accountBusy || !selectedId) return;
  const itemId = selectedId;
  const ticket = apkRequest;
  const accountTicket = accountRequest;
  const query = new URLSearchParams({ itemId });
  const packageName = selectedPackage();
  if (packageName) query.set('package', packageName);
  $('download-status').textContent = t('checkingEntitlement');
  let next;
  try {
    next = await api(`/api/download/info?${query}`);
  } catch (error) {
    next = downloadError(error);
  }
  if (ticket !== apkRequest || accountTicket !== accountRequest || itemId !== selectedId || !account.authenticated) return;
  apk = next;
  renderDownload();
}

async function refreshAccount() {
  const ticket = ++accountRequest;
  let next;
  try {
    const session = await api('/api/account/session');
    next = { authenticated: Boolean(session.authenticated), email: session.email ?? null };
  } catch {
    next = { authenticated: false, email: null };
  }
  if (ticket !== accountRequest) return;
  account = next;
  invalidateDownload();
  setAccountStatus();
  if (account.authenticated) await refreshDownload();
}

$('send-code').addEventListener('click', async () => {
  setAccountStatus('sendingCode');
  try {
    await api('/api/account/send-code', { method: 'POST', body: JSON.stringify({ email: $('account-email').value.trim() }) });
    setAccountStatus('codeSent');
    $('account-code').focus();
  } catch (error) {
    setAccountStatus(errorKey(error.payload));
  }
});

$('account-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (accountBusy) return;
  accountRequest += 1;
  setAccountBusy(true);
  invalidateDownload();
  const email = $('account-email').value.trim();
  setAccountStatus('signingIn');
  try {
    await api('/api/account/login', { method: 'POST', body: JSON.stringify({ email, code: $('account-code').value.trim() }) });
    account = { authenticated: true, email };
    $('account-code').value = '';
    setAccountStatus();
  } catch (error) {
    setAccountStatus(errorKey(error.payload));
  } finally {
    setAccountBusy(false);
    await refreshDownload();
  }
});

$('sign-out').addEventListener('click', async () => {
  if (accountBusy) return;
  accountRequest += 1;
  setAccountBusy(true);
  invalidateDownload();
  setAccountStatus('signingOut');
  try {
    await api('/api/account/logout', { method: 'POST', body: '{}' });
    account = { authenticated: false, email: null };
    setAccountStatus();
  } catch {
    setAccountStatus('errSignOutFailed');
  } finally {
    setAccountBusy(false);
    await refreshDownload();
  }
});

$('acquire-apk').addEventListener('click', async () => {
  if (!account.authenticated || accountBusy || !apk?.canAcquire || !selectedId) return;
  const itemId = selectedId;
  const packageName = selectedPackage();
  const accountTicket = accountRequest;
  invalidateDownload(t('acquiringApk'));
  const ticket = apkRequest;
  let next;
  try {
    next = await api('/api/download/acquire', { method: 'POST', body: JSON.stringify({ itemId, packageName }) });
  } catch (error) {
    next = downloadError(error);
  }
  if (ticket !== apkRequest || accountTicket !== accountRequest || itemId !== selectedId || !account.authenticated) return;
  apk = next;
  renderDownload();
});

$('copy-md5').addEventListener('click', async () => {
  if (!apk?.available) return;
  try {
    await navigator.clipboard.writeText(apk.md5);
    $('download-status').textContent = t('md5Copied');
  } catch {
    $('download-status').textContent = apk.md5;
  }
});

// Account and download state must exist before the first render, so boot last.
applyLocale();
loadState();
refreshAccount();
