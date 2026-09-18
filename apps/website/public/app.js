import { md5File } from './md5.js';

const $ = id => document.getElementById(id);
const translations = {
  en: {
    indexLabel: 'INDEPENDENT PICO APP INDEX', catalogLabel: '01 / RECOMMENDED', catalogHint: 'START EXPLORING', currentLabel: '02 / SELECTED RELEASE',
    searchLabel: 'Search PICO apps', searchPlaceholder: 'App name', searchButton: 'Search', searching: 'Searching PICO Store…', searchEmpty: 'No apps found', searchFailed: 'Search is unavailable; try again.',
    favoritesLabel: 'FAVORITES', favoritesHint: 'SAVED ON THIS DEVICE', favoriteAdd: 'Save favorite ☆', favoriteRemove: 'Remove favorite ★',
    packageLabel: 'PACKAGE', versionLabel: 'LATEST VERSION CODE',
    historyLabel: '03 / RELEASE HISTORY', trackingLabel: 'MONOTONIC TRACKING',
    workflowLabel: '05 / HOW IT WORKS', communityLabel: 'PICO STORE LAB / COMMUNITY EXPERIMENT',
    heroLine: 'Your PICO apps,', heroAccent: 'your way to get them.',
    intro: 'Explore PICO apps and their releases. Choose an app, then get it through your own account on your headset.',
    official: 'Official listing ↗', exploreCatalog: 'Explore catalog ↓', repositoryLink: 'GitHub repo ↗',
    playerGuide: 'Get the app & player guide', getClient: 'Get Android client ↗',
    fullGuide: 'Full player guide ↗', loading: 'Loading',
    nativeNote: 'Official PICO app listing.',
    reading: 'Reading release data', readingHistory: 'Reading release history…',
    workflowOne: 'Your PICO account.', workflowTwo: 'Your own download.',
    stepOne: 'Get our Android client from GitHub Releases and install it on your PICO headset.',
    stepTwo: 'Open PICO Store Lab, choose an app, and sign in with your own PICO email verification code.',
    stepThree: 'Choose Download and install. The client requests your entitled APK from PICO, verifies it, then asks for system installation approval.',
    stepFour: 'Prefer a desktop? Sign in above and the same APK downloads in your browser, with an MD5 you can verify.',
    disclaimer: 'Independent project. App rights belong to their owners.',
    downloadLabel: '04 / WEB DOWNLOAD',
    downloadOne: 'Your account signs in.', downloadTwo: 'The APK comes straight here.',
    downloadIntro: "Sign in with your own PICO email code, then download this app's APK in the browser. The APK comes from PICO exactly as PICO serves it.",
    emailLabel: 'PICO account email', codePlaceholder: 'Verification code', sendCode: 'Send code', signIn: 'Sign in',
    signedOut: 'Not signed in', signedInAs: 'Signed in as ', signingOut: 'Signing out…', signOut: 'Sign out',
    sendingCode: 'Sending the verification code…', codeSent: 'Code sent. Check your PICO email.',
    signingIn: 'Signing in…', checkingEntitlement: 'Checking your entitlement…',
    acquireApk: 'Get app and prepare download', acquiringApk: 'Getting this free app for your account…',
    freeAcquisitionRequired: 'This free app is not in your account yet. Choose Get app and prepare download to add it.',
    errSignOutFailed: 'Could not sign out. Your session may still be active; please retry.',
    apkLabel: 'APK', apkVersionLabel: 'VERSION', apkSizeLabel: 'SIZE', downloadApk: 'Download APK',
    directDownload: 'PICO CDN link ↗',
    copyMd5: 'Copy MD5', md5Copied: 'MD5 copied to the clipboard',
    verifyLabel: 'Verify a downloaded file', hashProgress: 'Hashing the file… ',
    verifyMatch: 'Checksum matches. The APK is intact.',
    verifyMismatch: 'Checksum mismatch. Delete the file and download it again.',
    downloadHint: 'Your browser handles the download; keep this page open until it finishes.',
    selectApp: 'Choose an app above to see its APK.',
    apkUnavailable: 'This app cannot be downloaded here.',
    errNotAuthenticated: 'Sign in with your PICO account first.',
    errRateLimited: 'Too many attempts. Wait a few minutes and try again.',
    errInvalidEmail: 'Enter a valid email address.',
    errInvalidCode: 'Enter the letters and digits from your email code.',
    errAccountRejected: 'PICO rejected that code. Request a new one.',
    errAccountUnavailable: 'PICO sign-in is unavailable right now.',
    errInvalidItemId: 'That app ID is not a valid PICO item ID.',
    errInvalidPackage: 'Send the package name together with the app ID.',
    errEntitlementRequired: 'This app is not in your PICO account yet. Get it on the official Store first, then come back and download it.',
    errUnavailable: 'The APK is unavailable right now. Try again in a moment.',
    errMisconfigured: 'Downloads are not configured on this deployment.',
    errGeneric: 'Something went wrong. Try again.',
    never: 'No successful check yet', unknownTime: 'Unknown time',
    publicDetail: 'Official item data', catalogLookup: 'Current official listing',
    lastCheck: 'Last successful check: ', stale: 'Previous snapshot / needs recheck',
    fresh: 'Up to date', empty: 'No releases recorded yet', unavailable: 'Unavailable',
    unable: 'Unable to load release data', language: '中文', languageLabel: 'Switch to Chinese',
  },
  'zh-CN': {
    indexLabel: '独立 PICO 应用索引', catalogLabel: '01 / 推荐应用', catalogHint: '开始探索', currentLabel: '02 / 所选版本',
    searchLabel: '搜索 PICO 应用', searchPlaceholder: '输入应用名称', searchButton: '搜索', searching: '正在搜索 PICO 商店…', searchEmpty: '没有找到应用', searchFailed: '搜索暂不可用，请重试。',
    favoritesLabel: '收藏', favoritesHint: '保存在此设备', favoriteAdd: '加入收藏 ☆', favoriteRemove: '取消收藏 ★',
    packageLabel: '包名', versionLabel: '最新版本码',
    historyLabel: '03 / 发布记录', trackingLabel: '版本只增不退',
    workflowLabel: '05 / 使用流程', communityLabel: 'PICO STORE LAB / 社区实验',
    heroLine: '你的 PICO 应用，', heroAccent: '由你选择获取方式。',
    intro: '浏览 PICO 应用及其发布版本。选择应用后，在头显上通过自己的账号获取并安装。',
    official: '官方商品页 ↗', exploreCatalog: '浏览应用目录 ↓', repositoryLink: 'GitHub 仓库 ↗',
    playerGuide: '获取应用与玩家指南', getClient: '下载头显客户端 ↗',
    fullGuide: '完整玩家指南 ↗', loading: '读取中',
    nativeNote: 'PICO 官方应用商品页。',
    reading: '正在读取发布信息', readingHistory: '正在读取发布记录…',
    workflowOne: '用你自己的 PICO 账号，', workflowTwo: '获取你自己的下载。',
    stepOne: '从 GitHub Releases 获取我们的 Android 客户端，并安装到 PICO 头显。',
    stepTwo: '打开 PICO Store Lab，选择应用，再用自己的 PICO 邮箱验证码登录。',
    stepThree: '点击「下载并安装」。客户端向 PICO 请求你的账号可获取的官方包，校验后由系统询问安装许可。',
    stepFour: '想用电脑？在上面登录后，同一个安装包会直接在浏览器里下载，并给出可校验的 MD5。',
    disclaimer: '独立社区项目。应用权利归各自权利人所有。',
    downloadLabel: '04 / 网页下载',
    downloadOne: '用你的 PICO 账号登录，', downloadTwo: 'APK 直接下到这里。',
    downloadIntro: '用你自己的 PICO 邮箱验证码登录，然后在浏览器里下载该应用的 APK。安装包按 PICO 的原样提供，不在本站转存。',
    emailLabel: 'PICO 账号邮箱', codePlaceholder: '邮箱验证码', sendCode: '发送验证码', signIn: '登录',
    signedOut: '尚未登录', signedInAs: '已登录：', signingOut: '正在退出…', signOut: '退出登录',
    sendingCode: '正在发送验证码…', codeSent: '验证码已发送，请查收 PICO 注册邮箱。',
    signingIn: '正在登录…', checkingEntitlement: '正在检查你的获取权限…',
    acquireApk: '获取应用并准备下载', acquiringApk: '正在为你的账号获取此免费应用…',
    freeAcquisitionRequired: '你的账号尚未获取此免费应用。点击「获取应用并准备下载」后领取。',
    errSignOutFailed: '退出登录失败，会话可能仍然有效，请重试。',
    apkLabel: 'APK', apkVersionLabel: '版本', apkSizeLabel: '大小', downloadApk: '下载 APK',
    directDownload: 'PICO CDN 直链 ↗',
    copyMd5: '复制 MD5', md5Copied: 'MD5 已复制到剪贴板',
    verifyLabel: '校验已下载的文件', hashProgress: '正在计算校验值… ',
    verifyMatch: '校验值一致，安装包完整。',
    verifyMismatch: '校验值不一致，请删除文件后重新下载。',
    downloadHint: '下载由浏览器负责，请保持页面打开直到完成。',
    selectApp: '请先在上方选择一个应用。',
    apkUnavailable: '该应用无法在此下载。',
    errNotAuthenticated: '请先用 PICO 账号登录。',
    errRateLimited: '尝试次数过多，请等待几分钟后重试。',
    errInvalidEmail: '请输入有效的邮箱地址。',
    errInvalidCode: '请输入邮件中的字母数字验证码。',
    errAccountRejected: 'PICO 拒绝了该验证码，请重新获取。',
    errAccountUnavailable: 'PICO 登录服务暂时不可用。',
    errInvalidItemId: '应用 ID 不是有效的 PICO item ID。',
    errInvalidPackage: '请把包名和应用 ID 一起传过来。',
    errEntitlementRequired: '该应用尚未在你的 PICO 账号下。请先在官方商店获取，再回到这里下载。',
    errUnavailable: '安装包暂时不可用，请稍后重试。',
    errMisconfigured: '当前部署尚未配置下载功能。',
    errGeneric: '出错了，请重试。',
    never: '尚未完成检查', unknownTime: '时间未知',
    publicDetail: '官方商品信息', catalogLookup: '当前官方商品页',
    lastCheck: '最后成功检查：', stale: '上次快照 / 待复查',
    fresh: '数据已更新', empty: '尚无发布记录', unavailable: '暂不可用',
    unable: '无法读取发布数据', language: 'EN', languageLabel: 'Switch to English',
  },
};

const requested = new URL(location.href).searchParams.get('lang');
let locale = requested === 'en' || requested === 'zh-CN'
  ? requested : navigator.language.startsWith('zh') ? 'zh-CN' : 'en';
let currentState = null;
let catalogItems = [];
let searchItems = [];
let selectedId = null;
let fromSnapshot = false;
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
  document.title = locale === 'en' ? 'PICO Store Lab — Independent PICO app catalog' : 'PICO Store Lab — 独立 PICO 应用目录';
  if (currentState) render(currentState, fromSnapshot);
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
    const version = document.createElement('span');
    const versionCode = item.state?.latestVersionCode ?? item.versionCode;
    version.textContent = versionCode ? `BUILD ${versionCode}` : '—';
    button.append(name, version);
    button.addEventListener('click', () => selectItem(item.itemId));
    container.append(button);
  }
}

function renderCatalog() {
  renderCards($('catalog-items'), catalogItems);
  renderCards($('search-results'), searchItems);
  renderCards($('favorite-items'), favorites);
}

async function selectItem(itemId) {
  selectedId = itemId;
  invalidateDownload();
  const item = [...catalogItems, ...searchItems, ...favorites].find(entry => entry.itemId === itemId);
  if (!item) return;
  renderCatalog();
  render(item.state ?? { ...item, latestVersionCode: item.versionCode, releases: [], stale: true }, !item.state);
  if (!item.state) {
    try {
      const url = `/api/item?itemId=${encodeURIComponent(item.itemId)}&package=${encodeURIComponent(item.packageName)}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('item unavailable');
      const detail = await response.json();
      item.versionCode = detail.versionCode;
      renderCatalog();
      if (selectedId === itemId) render({ ...detail, latestVersionCode: detail.versionCode, releases: [] });
    } catch { /* Search result remains selectable with its public summary. */ }
  }
  refreshDownload();
}

function render(state, snapshot = false) {
  currentState = state;
  fromSnapshot = snapshot;
  $('version-code').textContent = state.latestVersionCode ?? '—';
  $('release-heading').textContent = state.name ?? state.packageName ?? '—';
  $('package-name').textContent = state.packageName ?? '—';
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

const errorText = payload => t(ERROR_KEYS[payload?.error] ?? 'errGeneric');

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
  $('account-status').textContent = account.authenticated
    ? `${t('signedInAs')}${account.email ?? ''}` : t('signedOut');
  $('download-card').hidden = !account.authenticated;
}

function renderDownload() {
  $('download-card').hidden = !account.authenticated;
  const button = $('download-apk');
  const direct = $('download-direct');
  const acquire = $('acquire-apk');
  const available = account.authenticated && !accountBusy && apk?.available;
  acquire.hidden = !(account.authenticated && !accountBusy && apk?.canAcquire);
  $('copy-md5').disabled = !available;
  $('verify-file').disabled = !available;
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
  $('apk-version').textContent = `BUILD ${apk.versionCode}${apk.version ? ` / ${apk.version}` : ''}`;
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
  $('verify-file').value = '';
  $('verify-status').textContent = '';
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
  renderAccount();
  if (account.authenticated) await refreshDownload();
}

$('send-code').addEventListener('click', async () => {
  $('account-status').textContent = t('sendingCode');
  try {
    await api('/api/account/send-code', { method: 'POST', body: JSON.stringify({ email: $('account-email').value.trim() }) });
    $('account-status').textContent = t('codeSent');
    $('account-code').focus();
  } catch (error) {
    $('account-status').textContent = errorText(error.payload);
  }
});

$('account-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (accountBusy) return;
  accountRequest += 1;
  setAccountBusy(true);
  invalidateDownload();
  const email = $('account-email').value.trim();
  $('account-status').textContent = t('signingIn');
  try {
    await api('/api/account/login', { method: 'POST', body: JSON.stringify({ email, code: $('account-code').value.trim() }) });
    account = { authenticated: true, email };
    $('account-code').value = '';
    renderAccount();
  } catch (error) {
    $('account-status').textContent = errorText(error.payload);
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
  $('account-status').textContent = t('signingOut');
  try {
    await api('/api/account/logout', { method: 'POST', body: '{}' });
    account = { authenticated: false, email: null };
    renderAccount();
  } catch {
    $('account-status').textContent = t('errSignOutFailed');
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

$('verify-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  const status = $('verify-status');
  if (!file) { status.textContent = ''; return; }
  const expected = apk?.available ? apk.md5 : null;
  const ticket = apkRequest;
  status.textContent = `${t('hashProgress')}0%`;
  try {
    const digest = await md5File(file, ratio => {
      if (ticket === apkRequest) status.textContent = `${t('hashProgress')}${Math.round(ratio * 100)}%`;
    });
    if (ticket !== apkRequest) return;
    if (!expected) { status.textContent = digest; return; }
    status.textContent = digest === expected ? t('verifyMatch') : `${t('verifyMismatch')} (${digest})`;
  } catch {
    if (ticket === apkRequest) status.textContent = t('errGeneric');
  }
});

// Account and download state must exist before the first render, so boot last.
applyLocale();
loadState();
refreshAccount();
