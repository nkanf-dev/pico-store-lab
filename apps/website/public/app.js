const $ = id => document.getElementById(id);
// Detail pages intentionally contain only the detail/downloader sections. The
// shared script still runs there, so optional controls are bound defensively.
const on = (id, event, handler) => { const element = $(id); if (element) element.addEventListener(event, handler); };
const translations = {
  "en": {
    "indexLabel": "PICO APP CATALOG",
    "catalogLabel": "MORE APPS",
    "catalogHint": "CHOOSE AN APP",
    "currentLabel": "APP DETAILS",
    "searchLabel": "Search PICO apps",
    "searchPlaceholder": "App name",
    "searchButton": "Search",
    "searching": "Searching…",
    "searchEmpty": "No apps found. Try another name.",
    "searchFailed": "Search is unavailable. Please try again later.",
    "priceAll": "All",
    "priceFree": "Free",
    "pricePaid": "Paid",
    "allAppsLabel": "All apps",
    "allAppsEyebrow": "PICO STORE / FULL CATALOG",
    "allAppsHint": "Every app in the store, newest update first.",
    "allAppsCountLabel": "APPS",
    "loadAllApps": "Load all apps",
    "allAppsLoading": "Loading the full store…",
    "allAppsLoaded": "apps",
    "allAppsEmpty": "No apps found.",
    "allAppsFailed": "Could not load the app list. Please try again.",
    "allAppsNoMatch": "No app matches this filter.",
    "allAppsSearchLabel": "Filter",
    "allAppsSearchPlaceholder": "Name or publisher",
    "allAppsPrev": "← Previous",
    "allAppsNext": "Next →",
    "allAppsRange": "Showing {start}–{end} of {total}",
    "allAppsTableApp": "App / publisher",
    "allAppsTableCategory": "Category",
    "allAppsTableUpdated": "Updated",
    "allAppsTableRating": "Rating",
    "allAppsTablePrice": "Price",
    "sortLabel": "Sort",
    "sortUpdated": "Recently updated",
    "sortName": "Name A–Z",
    "sortRating": "Rating",
    "favoritesLabel": "FAVORITES",
    "favoritesHint": "SAVED ON THIS DEVICE",
    "favoriteAdd": "Add to favorites ☆",
    "favoriteRemove": "Remove from favorites ★",
    "packageLabel": "APP",
    "versionLabel": "LATEST VERSION CODE",
    "historyLabel": "Version history",
    "trackingLabel": "RECENT UPDATES",
    "workflowLabel": "GETTING STARTED",
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
    "downloadLabel": "WEB DOWNLOAD",
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
    "diagnosticDetails": "Download report",
    "copyReport": "Copy report",
    "saveReport": "Save report",
    "reportCopied": "Report copied. Send it to us with a description of what happened.",
    "reportSaveHint": "Save the report and send it to us with a description of what happened.",
    "reportReference": "Report ID",
    "preparingReport": "Checking the download connection…",
    "selectApp": "Choose an app above to see its download options.",
    "apkUnavailable": "This app is unavailable to download here.",
    "errNotAuthenticated": "Sign in with your PICO international account first.",
    "errRateLimited": "Too many attempts. Wait a few minutes and try again.",
    "errInvalidEmail": "Enter a valid email address.",
    "errInvalidCode": "Enter the verification code from your email.",
    "errAccountRejected": "Sign-in failed. Check your email address and code, or request a new code.",
    "errAccountUnavailable": "PICO sign-in is unavailable. Please try again later.",
    "errAccountSessionMissing": "PICO accepted the code but did not return a web session. Please request a new code; if it repeats, sign in through the official PICO app first.",
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
    "noAdaptation": "No sign-in adaptation needed",
    "compatibility": "Compatibility notice",
    "spaceProOnly": "PICO Space Pro only. It is not in the PICO 4 Ultra catalog; open it from search instead.",
    "publisher": "Publisher",
    "genres": "Category",
    "ageRating": "Age rating",
    "platforms": "Headsets",
    "version": "Version",
    "rating": "Rating",
    "viewApp": "View app →",
    "detailUnavailable": "Details could not be loaded. View this app in PICO Store for more information.",
    "screenshot": "App screenshot",
    "fileDetails": "File details",
    "regionLabel": "Store region",
    "regionGlobal": "International",
    "regionCn": "China (mainland)",
    "regionGlobalShort": "Global",
    "regionCnShort": "China",
    "cnDownloadIntro": "Use a China-region PICO account (mobile number) to download the selected app from the China store. Buy paid apps in the China store first.",
    "cnRegisterIntro": "Need a China-region PICO account?",
    "cnRegisterLink": "Register on PICO’s China website ↗",
    "cnRegisterHint": "New numbers must finish registration on the official website before signing in here.",
    "mobileLabel": "China mobile number",
    "mobilePlaceholder": "13800138000",
    "smsCodePlaceholder": "SMS code",
    "smsSending": "Sending the SMS code…",
    "smsSent": "SMS code sent. Enter the 6-digit code from your phone.",
    "errInvalidMobile": "Enter a valid mobile number, without the country code.",
    "errInvalidCountryCode": "Enter a valid country code.",
    "errAccountRegistrationRequired": "This number is not registered. Finish sign-up on PICO’s website, then sign in here.",
    "errSmsRateLimited": "PICO temporarily blocked SMS sending. Wait a few minutes, then try again.",
    "errInvalidSmsCode": "The SMS code is incorrect. Check it and try again.",
    "cnLoginEyebrow": "PICO CHINA / ACCOUNT",
    "cnLoginNote": "This device stays signed in for 30 days and renews when you use it.",
    "errCodeExpired": "The code request expired. Request a new SMS code."
  },
  "zh-CN": {
    "indexLabel": "PICO 应用目录",
    "catalogLabel": "更多应用",
    "catalogHint": "选择应用",
    "currentLabel": "应用详情",
    "searchLabel": "搜索 PICO 应用",
    "searchPlaceholder": "输入应用名称",
    "searchButton": "搜索",
    "searching": "正在搜索…",
    "searchEmpty": "没有找到应用，试试其他名称。",
    "searchFailed": "暂时无法搜索，请稍后重试。",
    "priceAll": "全部",
    "priceFree": "免费",
    "pricePaid": "付费",
    "allAppsLabel": "全部应用",
    "allAppsEyebrow": "PICO 商店 / 全量目录",
    "allAppsHint": "商店里的每一款应用，按最近更新时间排列。",
    "allAppsCountLabel": "款应用",
    "loadAllApps": "拉取全部应用",
    "allAppsLoading": "正在拉取商店全量目录…",
    "allAppsLoaded": "款应用",
    "allAppsEmpty": "没有找到应用。",
    "allAppsFailed": "无法加载应用列表，请稍后重试。",
    "allAppsNoMatch": "没有符合筛选条件的应用。",
    "allAppsSearchLabel": "筛选",
    "allAppsSearchPlaceholder": "名称或发行商",
    "allAppsPrev": "← 上一页",
    "allAppsNext": "下一页 →",
    "allAppsRange": "显示 {start}–{end} / 共 {total} 款",
    "allAppsTableApp": "应用 / 发行商",
    "allAppsTableCategory": "分类",
    "allAppsTableUpdated": "更新",
    "allAppsTableRating": "评分",
    "allAppsTablePrice": "价格",
    "sortLabel": "排序",
    "sortUpdated": "最近更新",
    "sortName": "名称 A–Z",
    "sortRating": "评分",
    "favoritesLabel": "收藏",
    "favoritesHint": "保存在此设备",
    "favoriteAdd": "加入收藏 ☆",
    "favoriteRemove": "取消收藏 ★",
    "packageLabel": "应用",
    "versionLabel": "最新版本码",
    "historyLabel": "版本记录",
    "trackingLabel": "近期更新",
    "workflowLabel": "开始使用",
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
    "downloadLabel": "网页下载",
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
    "diagnosticDetails": "下载诊断报告",
    "copyReport": "复制报告",
    "saveReport": "保存报告",
    "reportCopied": "报告已复制，反馈时请一起发给我们，并描述遇到的问题。",
    "reportSaveHint": "请保存报告，反馈时一起发给我们，并描述遇到的问题。",
    "reportReference": "报告编号",
    "preparingReport": "正在收集下载诊断…",
    "selectApp": "请先在上方选择一款应用。",
    "apkUnavailable": "暂时无法在这里下载这款应用。",
    "errNotAuthenticated": "请先登录 PICO 国际区账号。",
    "errRateLimited": "尝试次数过多，请等待几分钟后重试。",
    "errInvalidEmail": "请输入有效的邮箱地址。",
    "errInvalidCode": "请输入邮件中的验证码。",
    "errAccountRejected": "登录失败，请检查邮箱和验证码，或重新获取验证码。",
    "errAccountUnavailable": "暂时无法登录 PICO，请稍后重试。",
    "errAccountSessionMissing": "PICO 已接受验证码，但没有返回网页登录状态。请重新获取验证码；若仍失败，请先用官方 PICO 客户端登录一次。",
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
    "noAdaptation": "无需登录适配",
    "compatibility": "兼容性提示",
    "spaceProOnly": "仅支持 PICO Space Pro，不会出现在按 PICO 4 Ultra 生成的“全部应用”列表；仍可从搜索结果进入详情。",
    "publisher": "开发商",
    "genres": "类型",
    "ageRating": "年龄分级",
    "platforms": "支持的头显",
    "version": "版本",
    "rating": "评分",
    "viewApp": "查看应用 →",
    "detailUnavailable": "暂时无法加载完整介绍，可以前往 PICO 商店查看。",
    "screenshot": "应用截图",
    "fileDetails": "文件信息",
    "regionLabel": "商店区域",
    "regionGlobal": "国际区",
    "regionCn": "中国区",
    "regionGlobalShort": "国际",
    "regionCnShort": "中国",
    "cnDownloadIntro": "使用国区 PICO 账号（手机号）从中国商店下载所选应用。付费应用请先在中国商店购买。",
    "cnRegisterIntro": "还没有国区 PICO 账号？",
    "cnRegisterLink": "前往 PICO 中国官网注册 ↗",
    "cnRegisterHint": "新手机号需要先在官网完成注册，再回到这里登录。",
    "mobileLabel": "中国区手机号",
    "mobilePlaceholder": "13800138000",
    "smsCodePlaceholder": "短信验证码",
    "smsSending": "正在发送短信验证码…",
    "smsSent": "短信验证码已发送，请输入手机收到的 6 位验证码。",
    "errInvalidMobile": "请输入有效的手机号（不含国家码）。",
    "errInvalidCountryCode": "请输入有效的国家码。",
    "errAccountRegistrationRequired": "该手机号尚未注册，请先在 PICO 官网完成注册，再回到这里登录。",
    "errSmsRateLimited": "PICO 暂时限制了短信发送频率，请等待几分钟后重试。",
    "errInvalidSmsCode": "短信验证码不正确，请核对后重试。",
    "errCodeExpired": "验证码请求已过期，请重新获取短信验证码。",
    "cnLoginEyebrow": "PICO 中国区 / 账号",
    "cnLoginNote": "登录状态会保存在此设备 30 天，使用时会自动续期。"
  }
};

const requested = new URL(location.href).searchParams.get('lang');
const pageContext = document.documentElement.dataset ?? {};
let initialCatalog = [];
try { initialCatalog = JSON.parse($('catalog-data')?.textContent || '[]'); } catch { initialCatalog = []; }
if (!Array.isArray(initialCatalog)) initialCatalog = [];
const publicPaths = Object.fromEntries(initialCatalog.filter(item => item.state?.slug).map(item => [item.itemId, item.state.slug]));
let locale = requested === 'en' || requested === 'zh-CN'
  ? requested : pageContext.seo ? document.documentElement.lang : navigator.language.startsWith('zh') ? 'zh-CN' : 'en';
let currentState = null;
let catalogItems = initialCatalog;
let searchItems = [];
let allApps = [];
let allAppsLoaded = false;
let allAppsLoading = false;
let allAppsSort = 'updated';
let allAppsPage = 1;
let allAppsQuery = '';
const ALL_APPS_PAGE_SIZE = 24;
const selectedQuery = new URL(location.href).searchParams;
let selectedId = pageContext.itemId || (/^[0-9]{1,20}$/.test(selectedQuery.get('itemId') || '') ? selectedQuery.get('itemId') : null);
let fromSnapshot = false;
const itemDetails = new Map();
let detailRequest = 0;
let favorites = [];
try { favorites = JSON.parse(localStorage.getItem('pico-store-favorites') || '[]'); } catch { favorites = []; }
if (!Array.isArray(favorites)) favorites = [];
let region = selectedQuery.get('region') === 'cn' ? 'cn'
  : selectedQuery.get('region') === 'global' ? 'global'
    : localStorage.getItem('pico-store-region') === 'cn' ? 'cn' : 'global';
const storedPrice = localStorage.getItem('pico-store-price-filter');
let priceFilter = storedPrice === 'free' || storedPrice === 'paid' ? storedPrice : 'all';
const DEVICE_CODES = ['B3110', 'A9210', 'A8A10', 'A8110', 'A7H10'];
const DEFAULT_DEVICE = 'A9210';
const SPACE_PRO_VERIFIED = new Set(['com.JigSpace.JigViewer', 'cn.wps.moffice_eng']);
const storedDevice = localStorage.getItem('pico-store-device');
let device = DEVICE_CODES.includes(selectedQuery.get('device') || '') ? selectedQuery.get('device')
  : DEVICE_CODES.includes(storedDevice || '') ? storedDevice
    : DEFAULT_DEVICE;
let sessions = { global: { authenticated: false, label: '' }, cn: { authenticated: false, label: '' } };

function t(key, vars = null) {
  let text = translations[locale][key] ?? translations.en[key] ?? key;
  if (vars) for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}

function formatTime(value) {
  if (!value) return t('never');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t('unknownTime')
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatTableDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

function applyLocale() {
  document.documentElement.lang = locale;
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) element.placeholder = t(element.dataset.i18nPlaceholder);
  if ($('language')) {
    $('language').textContent = t('language');
    $('language').setAttribute('aria-label', t('languageLabel'));
  }
  if (!pageContext.seo) document.title = locale === 'en' ? 'PICO Store Lab — Browse and download PICO apps' : 'PICO Store Lab — 浏览与下载 PICO 应用';
  if (currentState && $('app-details')) render(currentState, fromSnapshot);
  if (allAppsLoaded && $('all-apps-results')) renderAllApps();
  renderAccount();
  renderDownload();
}

function renderCards(container, items, showUpdated = false, showScore = false) {
  container.replaceChildren();
  for (const item of items) {
    const button = document.createElement('a');
    const base = locale === 'en' ? '/en' : '';
    const slug = publicPaths[item.itemId];
    button.href = slug ? `${base}/apps/${slug}/` : `${base}/?itemId=${encodeURIComponent(item.itemId)}&package=${encodeURIComponent(item.packageName)}#app-details`;
    button.className = `catalog-item${item.itemId === selectedId ? ' selected' : ''}`;
    if (item.itemId === selectedId) button.setAttribute('aria-current', 'page');
    const name = document.createElement('strong');
    name.textContent = item.name;
    const subtitle = document.createElement('span');
    const details = [t('viewApp')];
    if (showUpdated && item.updatedAt) details.push(formatTime(item.updatedAt * 1000));
    if (showScore && typeof item.score === 'number' && Number.isFinite(item.score)) details.push(`★ ${item.score.toFixed(2)}`);
    subtitle.textContent = details.join(' · ');
    button.append(name, subtitle);
    if (typeof item.price === 'string' && item.price.trim() !== '') {
      const price = document.createElement('em');
      price.className = 'card-price';
      price.textContent = /^\s*0+(?:\.0+)?\s*$/.test(item.price) ? t('free') : item.price;
      button.append(price);
    }
    button.addEventListener('click', event => {
      if (pageContext.seo && event) return; // Real links preserve shareable URLs and normal browser navigation.
      event?.preventDefault();
      selectItem(item.itemId, true);
    });
    container.append(button);
  }
}

function renderCatalog() {
  // Kept for the legacy template in public/index.html; the generated site uses
  // dedicated search and catalog pages instead.
  if ($('catalog-items')) renderCards($('catalog-items'), catalogItems);
}

function allAppsHref(item) {
  const base = locale === 'en' ? '/en' : '';
  const slug = publicPaths[item.itemId];
  return slug ? `${base}/apps/${slug}/` : `${base}/?itemId=${encodeURIComponent(item.itemId)}&package=${encodeURIComponent(item.packageName)}#app-details`;
}

function sortedAllApps() {
  const items = [...allApps];
  const byUpdated = (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  const byName = (a, b) => a.name.localeCompare(b.name, locale);
  if (allAppsSort === 'name') return items.sort((a, b) => byName(a, b) || byUpdated(a, b));
  if (allAppsSort === 'rating') return items.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || byUpdated(a, b));
  return items.sort((a, b) => byUpdated(a, b) || byName(a, b));
}

function filteredAllApps() {
  const query = allAppsQuery.trim().toLocaleLowerCase(locale);
  const items = sortedAllApps();
  if (!query) return items;
  return items.filter(item => [item.name, item.publisher, item.genres]
    .some(value => String(value ?? '').toLocaleLowerCase(locale).includes(query)));
}

function allAppsPrice(item) {
  const price = String(item.price ?? '').trim();
  if (/^0+(?:\.0+)?$/.test(price)) return t('free');
  if (!price) return '—';
  if (item.currency === 'CNY') return `¥${price}`;
  if (item.currency === 'USD') return `$${price}`;
  return item.currency ? `${price} ${item.currency}` : price;
}

function renderAllApps() {
  if (!allAppsLoaded || !$('all-apps-results')) return;
  const container = $('all-apps-results');
  const items = filteredAllApps();
  const totalPages = Math.max(1, Math.ceil(items.length / ALL_APPS_PAGE_SIZE));
  allAppsPage = Math.min(Math.max(1, allAppsPage), totalPages);
  const start = (allAppsPage - 1) * ALL_APPS_PAGE_SIZE;
  const pageItems = items.slice(start, start + ALL_APPS_PAGE_SIZE);
  $('all-apps-count').textContent = String(allApps.length);
  $('all-apps-tools').hidden = false;
  container.replaceChildren();
  container.hidden = false;

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'all-apps-empty';
    empty.textContent = allAppsQuery.trim() ? t('allAppsNoMatch') : t('allAppsEmpty');
    container.append(empty);
    $('all-apps-status').textContent = '0 / 0';
    $('all-apps-pagination').hidden = true;
    return;
  }

  const header = document.createElement('div');
  header.className = 'app-row app-row-head';
  for (const label of ['#', t('allAppsTableApp'), t('allAppsTableCategory'), t('allAppsTableUpdated'), t('allAppsTableRating'), t('allAppsTablePrice'), '']) {
    const cell = document.createElement('span');
    cell.textContent = label;
    header.append(cell);
  }
  container.append(header);

  pageItems.forEach((item, index) => {
    const row = document.createElement('a');
    row.className = `app-row${item.itemId === selectedId ? ' selected' : ''}`;
    row.href = allAppsHref(item);
    if (item.itemId === selectedId) row.setAttribute('aria-current', 'page');
    row.addEventListener('click', event => {
      if (pageContext.seo) return;
      event.preventDefault();
      selectItem(item.itemId, true);
    });

    const rank = document.createElement('span');
    rank.className = 'app-rank';
    rank.textContent = String(start + index + 1).padStart(3, '0');

    const main = document.createElement('span');
    main.className = 'app-main';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const publisher = document.createElement('span');
    publisher.className = 'app-row-publisher';
    publisher.textContent = item.publisher || t('publicDetail');
    main.append(name, publisher);

    const category = document.createElement('span');
    category.className = 'app-category';
    category.textContent = item.genres || '—';

    const updated = document.createElement('span');
    updated.className = 'app-updated';
    updated.textContent = item.updatedAt ? formatTableDate(item.updatedAt * 1000) : '—';

    const rating = document.createElement('span');
    rating.className = `app-rating${allAppsSort === 'rating' ? ' accent' : ''}`;
    rating.textContent = typeof item.score === 'number' && Number.isFinite(item.score) ? `★ ${item.score.toFixed(2)}` : '—';

    const price = document.createElement('span');
    price.className = 'app-price-cell';
    price.textContent = allAppsPrice(item);

    const arrow = document.createElement('span');
    arrow.className = 'app-arrow';
    arrow.textContent = '↗';
    arrow.setAttribute('aria-hidden', 'true');

    row.append(rank, main, category, updated, rating, price, arrow);
    container.append(row);
  });

  $('all-apps-status').textContent = t('allAppsRange', {
    start: start + 1, end: Math.min(start + ALL_APPS_PAGE_SIZE, items.length), total: items.length,
  });
  $('all-apps-page').textContent = `${allAppsPage} / ${totalPages}`;
  $('all-apps-pagination').hidden = totalPages <= 1;
  $('all-apps-prev').disabled = allAppsPage <= 1;
  $('all-apps-next').disabled = allAppsPage >= totalPages;
}

async function loadAllApps() {
  if (allAppsLoading) return;
  allAppsLoading = true;
  $('all-apps-load').disabled = true;
  $('all-apps-status').textContent = t('allAppsLoading');
  try {
    const response = await fetch(`/api/apps?region=${region}&device=${device}&sort=updated&lang=${locale === 'zh-CN' ? 'zh' : 'en'}`);
    if (!response.ok) throw new Error('apps unavailable');
    const result = await response.json();
    allApps = Array.isArray(result.items) ? result.items : [];
    allAppsLoaded = true;
    allAppsPage = 1;
    allAppsQuery = '';
    $('all-apps-query').value = '';
    renderAllApps();
  } catch {
    allAppsLoaded = false;
    allApps = [];
    $('all-apps-count').textContent = '—';
    $('all-apps-tools').hidden = true;
    $('all-apps-results').hidden = true;
    $('all-apps-pagination').hidden = true;
    $('all-apps-status').textContent = t('allAppsFailed');
  } finally {
    allAppsLoading = false;
    $('all-apps-load').disabled = false;
  }
}

on('all-apps-load', 'click', loadAllApps);
on('all-apps-sort', 'change', () => {
  allAppsSort = $('all-apps-sort').value;
  allAppsPage = 1;
  renderAllApps();
});
on('all-apps-query', 'input', () => {
  allAppsQuery = $('all-apps-query').value;
  allAppsPage = 1;
  renderAllApps();
});
on('all-apps-prev', 'click', () => {
  if (allAppsPage <= 1) return;
  allAppsPage -= 1;
  renderAllApps();
  $('all-apps-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
on('all-apps-next', 'click', () => {
  allAppsPage += 1;
  renderAllApps();
  $('all-apps-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

async function selectItem(itemId, scroll = false) {
  const item = [...catalogItems, ...searchItems, ...favorites, ...allApps].find(entry => entry.itemId === itemId);
  if (!item) return;
  selectedId = itemId;
  document.body?.classList.add('has-selection');
  const request = ++detailRequest;
  invalidateDownload();
  renderCatalog();
  if (allAppsLoaded) renderAllApps();
  const base = item.state ?? { ...item, latestVersionCode: item.versionCode, releases: [], stale: true };
  render({ ...base, ...itemDetails.get(itemId) }, !item.state);
  if (scroll) {
    $('app-details').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    $('app-details').focus({ preventScroll: true });
  }
  refreshDownload();
  try {
    const url = `/api/item?region=${region}&device=${device}&itemId=${encodeURIComponent(item.itemId)}&package=${encodeURIComponent(item.packageName)}&lang=${locale === 'zh-CN' ? 'zh' : 'en'}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('item unavailable');
    const detail = await response.json();
    const curated = initialCatalog.find(entry => entry.itemId === itemId)?.state;
    const resolved = { ...base, ...detail, ...(curated ? { summary: curated.summary, description: curated.description, supportedPlatforms: curated.supportedPlatforms } : {}), latestVersionCode: detail.versionCode };
    itemDetails.set(itemId, resolved);
    if (selectedId === itemId && request === detailRequest) render(resolved);
  } catch {
    if (selectedId === itemId && request === detailRequest && !itemDetails.has(itemId)) {
      if (!base.summary) $('app-summary').textContent = t('detailUnavailable');
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
  const adaptationNote = $('adaptation-note');
  const platforms = String(state.supportedPlatforms || '');
  const spaceProOnly = /space pro/i.test(platforms) && !/4 ultra|pico 4|neo/i.test(platforms);
  const compatibility = state.noAdaptationReason
    ? `${t('noAdaptation')}: ${state.noAdaptationReason}`
    : spaceProOnly && !SPACE_PRO_VERIFIED.has(state.packageName) ? `${t('compatibility')}: ${t('spaceProOnly')}` : '';
  adaptationNote.hidden = !compatibility;
  adaptationNote.textContent = compatibility;
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
    image.loading = 'eager';
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
  if (region === 'cn') {
    $('official-link').href = state.officialUrl?.startsWith('https://store.picoxr.com/')
      ? state.officialUrl : `https://store.picoxr.com/cn/detail/1/${state.itemId}`;
  } else {
    $('official-link').href = state.officialUrl?.startsWith('https://store-global.picoxr.com/')
      ? state.officialUrl : `https://store-global.picoxr.com/global/detail/1/${state.itemId}`;
  }
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
    const priceQuery = priceFilter === 'all' ? '' : `&price=${priceFilter}`;
    const response = await fetch(`/api/search?region=${region}&device=${device}&q=${encodeURIComponent(word)}${priceQuery}`);
    if (!response.ok) throw new Error('search unavailable');
    const result = await response.json();
    searchItems = result.items ?? [];
    $('search-status').textContent = searchItems.length ? '' : t('searchEmpty');
  } catch { $('search-status').textContent = t('searchFailed'); }
}

on('search-form', 'submit', event => { event.preventDefault(); search(); });

function renderPriceFilter() {
  for (const button of document.querySelectorAll('.price-option')) {
    const active = button.dataset.price === priceFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

for (const button of document.querySelectorAll('.price-option')) {
  button.addEventListener('click', () => {
    const next = button.dataset.price === 'free' || button.dataset.price === 'paid' ? button.dataset.price : 'all';
    if (next === priceFilter) return;
    priceFilter = next;
    localStorage.setItem('pico-store-price-filter', priceFilter);
    renderPriceFilter();
    if ($('search-word').value.trim()) search();
  });
}
renderPriceFilter();
on('favorite-toggle', 'click', () => {
  if (!currentState?.itemId) return;
  favorites = favorites.some(item => item.itemId === currentState.itemId)
    ? favorites.filter(item => item.itemId !== currentState.itemId)
    : [...favorites, { itemId: currentState.itemId, packageName: currentState.packageName, name: currentState.name }];
  localStorage.setItem('pico-store-favorites', JSON.stringify(favorites));
  if ($('favorite-toggle')) $('favorite-toggle').textContent = t(favorites.some(item => item.itemId === currentState.itemId) ? 'favoriteRemove' : 'favoriteAdd');
});

async function loadState() {
  // The home page only needs the shared region/language chrome; its cards are
  // already server-rendered, so do not fetch the release catalog there.
  if (pageContext.page === 'home' && !selectedId) return;
  // Curated public content is immediately useful even when an upstream lookup fails.
  if (pageContext.seo && selectedId) {
    const initial = initialCatalog.find(item => item.itemId === selectedId);
    if (initial?.state) {
      render(initial.state, true);
      document.body?.classList.add('has-selection');
    }
  }
  function chooseSelection() {
    if (selectedId && !catalogItems.some(item => item.itemId === selectedId)) {
      const packageName = selectedQuery.get('package') || '';
      if (/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(packageName)) {
        catalogItems.push({ itemId: selectedId, packageName });
      }
    }
    if (pageContext.page === 'home' && !selectedId) return;
    const target = catalogItems.find(item => item.itemId === selectedId) ?? catalogItems[0];
    if (target) selectItem(target.itemId);
  }
  try {
    const response = await fetch('/api/catalog', { cache: 'no-store' });
    if (!response.ok) throw new Error(`release API ${response.status}`);
    catalogItems = await response.json();
    if (!Array.isArray(catalogItems) || !catalogItems.length) throw new Error('catalog unavailable');
    catalogItems = catalogItems.map(item => {
      const initial = initialCatalog.find(entry => entry.itemId === item.itemId);
      return { ...item, state: { ...initial?.state, ...item.state } };
    });
    for (const initial of initialCatalog) if (!catalogItems.some(item => item.itemId === initial.itemId)) catalogItems.push(initial);
    chooseSelection();
  } catch {
    if (initialCatalog.length) {
      catalogItems = initialCatalog;
      chooseSelection();
      return;
    }
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

$('language').addEventListener('click', event => {
  if (pageContext.seo) {
    const target = new URL($('language').href, location.href);
    if (!pageContext.itemId && selectedId) {
      target.searchParams.set('itemId', selectedId);
      const packageName = selectedPackage();
      if (packageName) target.searchParams.set('package', packageName);
    }
    target.hash = new URL(location.href).hash;
    $('language').href = target.href;
    return;
  }
  event?.preventDefault();
  locale = locale === 'en' ? 'zh-CN' : 'en';
  const url = new URL(location.href);
  url.searchParams.set('lang', locale);
  history.replaceState(null, '', url);
  applyLocale();
});

const ERROR_KEYS = {
  not_authenticated: 'errNotAuthenticated', rate_limited: 'errRateLimited', invalid_email: 'errInvalidEmail',
  invalid_code: 'errInvalidCode', account_rejected: 'errAccountRejected', account_unavailable: 'errAccountUnavailable',
  account_session_missing: 'errAccountSessionMissing',
  invalid_mobile: 'errInvalidMobile', invalid_country_code: 'errInvalidCountryCode',
  account_registration_required: 'errAccountRegistrationRequired', code_expired: 'errCodeExpired',
  invalid_item_id: 'errInvalidItemId', invalid_package: 'errInvalidPackage',
  entitlement_required: 'errEntitlementRequired',
  apk_unavailable: 'errUnavailable', apk_metadata_unavailable: 'errUnavailable', entitlement_unconfirmed: 'errUnavailable',
  upstream_unreachable: 'errUnavailable', upstream_response_too_large: 'errUnavailable',
  upstream_invalid_response: 'errUnavailable',
  storage_not_configured: 'errMisconfigured', session_secret_missing: 'errMisconfigured',
};
const cnErrorKey = payload => payload?.error === 'invalid_code' ? 'errInvalidSmsCode' : errorKey(payload);

let account = { authenticated: false, email: null };
let cnAccountStatusKey = null;
let cnMobileTicket = '';
let cnTicketMobile = '';
let cnSsoCookies = {};

function syncActiveAccount() {
  const active = sessions[region] ?? { authenticated: false, label: '' };
  account = { authenticated: Boolean(active.authenticated), email: active.label ?? '' };
}
let apk = null;
let apkRequest = 0;
let accountRequest = 0;
let accountBusy = false;
let accountStatusKey = null;
let downloadReport = null;

// Deliberately select fields: API payloads and error messages can contain private
// CDN links or account data. These never enter a shareable support report.
function reportError(error) {
  const payload = error.payload ?? {};
  const code = value => typeof value === 'string' && /^[a-z_]{1,64}$/.test(value) ? value : undefined;
  return {
    error: code(payload.error) ?? 'request_failed',
    stage: code(payload.stage), reason: code(payload.reason),
    ...Object.fromEntries(['upstreamStatus', 'upstreamCode', 'attempts'].filter(key => Number.isInteger(payload[key])).map(key => [key, payload[key]])),
    ...(Number.isInteger(error.status) ? { httpStatus: error.status } : {}),
  };
}

function probeEvents(payload) {
  return (Array.isArray(payload?.events) ? payload.events : []).slice(0, 8).map(event => {
    const safe = reportError({ payload: event, status: event.httpStatus });
    return { stage: safe.stage, reason: safe.reason, httpStatus: safe.httpStatus,
      attempt: Number.isInteger(event.attempt) ? event.attempt : undefined };
  });
}

function newDownloadReport(itemId, packageName) {
  return { schema: 1, reportId: globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    time: new Date().toISOString(), client: 'website', build: pageContext.build ?? '',
    browser: navigator.userAgent ?? '', application: { itemId, packageName }, events: [] };
}

function renderReport() {
  const diagnostics = $('download-diagnostics');
  if (!diagnostics) return;
  diagnostics.hidden = !downloadReport;
  $('report-reference').hidden = !downloadReport?.failure;
  $('report-reference').textContent = downloadReport ? `${t('reportReference')}: ${downloadReport.reportId}` : '';
  $('diagnostic-report').textContent = downloadReport ? JSON.stringify(downloadReport, null, 2) : '';
}

async function collectDownloadReport() {
  const report = downloadReport;
  if (!report) return null;
  if (!report.connection && !report.failure) {
    $('download-status').textContent = t('preparingReport');
    const query = new URLSearchParams({ itemId: report.application.itemId, region, device });
    if (report.application.packageName) query.set('package', report.application.packageName);
    try {
      const result = await api(`/api/download/diagnostics?${query}`, { signal: AbortSignal.timeout(20_000) });
      const response = result.response ?? {};
      report.connection = { events: probeEvents(result),
        httpStatus: Number.isInteger(response.httpStatus) ? response.httpStatus : undefined,
        contentLength: /^\d+$/.test(response.contentLength ?? '') ? response.contentLength : undefined,
        contentRange: /^bytes \d+-\d+\/\d+$/.test(response.contentRange ?? '') ? response.contentRange : undefined };
    } catch (error) { report.connection = { ...reportError(error), events: probeEvents(error.payload) }; }
    if (downloadReport === report) renderReport();
  }
  return report;
}

function saveDownloadReport(report) {
  if (!report) return;
  const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `pico-store-lab-report-${report.reportId}.json`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

const errorKey = payload => ERROR_KEYS[payload?.error] ?? 'errGeneric';
const errorText = payload => (payload?.upstreamCode === 7 ? t('errSmsRateLimited') : t(errorKey(payload)));

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
  if ($('account-status')) {
    $('account-status').textContent = accountStatusKey ? t(accountStatusKey)
      : account.authenticated ? `${t('signedInAs')}${account.email ?? ''}` : t('signedOut');
  }
  if ($('download-card')) $('download-card').hidden = !account.authenticated;
}

function setAccountStatus(key = null) {
  accountStatusKey = key;
  renderAccount();
}

function renderDownload() {
  const downloadCard = $('download-card');
  if (!downloadCard) return;
  downloadCard.hidden = !account.authenticated;
  renderReport();
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
  // Resolve a fresh PICO link at click time rather than retaining an expiring CDN URL.
  direct.href = `${apk.downloadUrl}&direct=1`;
  direct.hidden = !apk.directUrl;
  $('download-status').textContent = t('downloadHint');
}

function invalidateDownload(message) {
  apkRequest += 1;
  downloadReport = null;
  if ($('download-diagnostics')) $('download-diagnostics').open = false;
  apk = message ? { available: false, message } : null;
  renderDownload();
}

function setAccountBusy(busy) {
  accountBusy = busy;
  for (const id of ['send-code', 'sign-in', 'cn-send-code', 'cn-sign-in', 'sign-out']) $(id).disabled = busy;
}

function setCnAccountStatus(key = null) {
  cnAccountStatusKey = key;
  const status = $('cn-account-status');
  if (!status) return;
  status.textContent = key ? t(key) : '';
  status.classList.toggle('is-error', Boolean(key?.startsWith('err')));
}

function syncContextLocation() {
  const current = new URL(location.href);
  current.searchParams.set('region', region);
  current.searchParams.set('device', device);
  history.replaceState(null, '', current);
}

// Detail pages own their download state. Reloading them makes the app metadata
// and the APK entitlement lookup use the newly selected store and headset.
function navigateForContext() {
  localStorage.setItem('pico-store-region', region);
  localStorage.setItem('pico-store-device', device);
  const target = new URL(location.href);
  target.searchParams.set('region', region);
  target.searchParams.set('device', device);
  location.assign(target.href);
}

function renderHomeRegion() {
  if (pageContext.page !== 'home') return;
  for (const slot of document.querySelectorAll('.home-region[data-home-region]')) {
    slot.hidden = slot.dataset.homeRegion !== region;
    const anchor = slot.querySelector('[data-catalog-anchor]');
    if (anchor) anchor.id = slot.hidden ? '' : 'catalog';
  }
  renderCnFeatured();
}

function renderCnFeatured() {
  if (pageContext.page !== 'home') return;
  const spacePro = device === 'B3110';
  for (const card of document.querySelectorAll('.home-region[data-home-region="cn"] .featured-card')) {
    if (card.dataset.cnFeatured) {
      card.hidden = card.dataset.cnFeatured !== (spacePro ? 'space' : 'other');
    }
    const target = new URL(card.href, location.href);
    if (target.searchParams.get('region') === 'cn') {
      target.searchParams.set('device', device);
      card.href = target.href;
    }
  }
}

function applyDevice() {
  localStorage.setItem('pico-store-device', device);
  if ($('device-select')) $('device-select').value = device;
  renderCnFeatured();
  syncContextLocation();
}

// Toggle the international email form vs the China SMS form, and reflect the
// active region's sign-in state in the shared download card.
function applyRegion({ reloadDetail = true } = {}) {
  localStorage.setItem('pico-store-region', region);
  if ($('global-login')) $('global-login').hidden = region !== 'global';
  if ($('cn-login')) $('cn-login').hidden = region !== 'cn';
  for (const [id, value] of [['region-global', 'global'], ['region-cn', 'cn']]) {
    if (!$(`${id}`)) continue;
    $(`${id}`).setAttribute('aria-selected', String(region === value));
    $(`${id}`).classList.toggle('active', region === value);
  }
  const intro = $('download-intro-text');
  if (intro) intro.textContent = region === 'cn' ? t('cnDownloadIntro') : t('downloadIntro');
  const regionTag = $('download-region-tag');
  if (regionTag) regionTag.textContent = `${t('regionLabel')}: ${region === 'cn' ? t('regionCn') : t('regionGlobal')}`;
  allApps = [];
  allAppsLoaded = false;
  allAppsLoading = false;
  allAppsPage = 1;
  allAppsQuery = '';
  for (const id of ['all-apps-query', 'all-apps-tools', 'all-apps-count', 'all-apps-results', 'all-apps-pagination', 'all-apps-status', 'all-apps-load']) {
    if (!$(id)) continue;
    if (id === 'all-apps-query') $(id).value = '';
    if (id === 'all-apps-tools') $(id).hidden = true;
    if (id === 'all-apps-count') $(id).textContent = '—';
    if (id === 'all-apps-results') { $(id).replaceChildren(); $(id).hidden = true; }
    if (id === 'all-apps-pagination') $(id).hidden = true;
    if (id === 'all-apps-status') $(id).textContent = '';
    if (id === 'all-apps-load') $(id).disabled = false;
  }
  cnMobileTicket = '';
  cnSsoCookies = {};
  cnTicketMobile = '';
  syncActiveAccount();
  setAccountStatus();
  setCnAccountStatus();
  invalidateDownload();
  if (reloadDetail && selectedId) selectItem(selectedId);
  else renderDownload();
}

for (const [id, value] of [['region-global', 'global'], ['region-cn', 'cn']]) {
  on(id, 'click', () => {
    if (region === value || accountBusy) return;
    region = value;
    if (pageContext.page === 'app') {
      navigateForContext();
      return;
    }
    applyRegion();
    syncContextLocation();
    renderHomeRegion();
  });
}

on('device-select', 'change', event => {
  const next = DEVICE_CODES.includes(event.target.value) ? event.target.value : DEFAULT_DEVICE;
  if (next === device) return;
  device = next;
  if (pageContext.page === 'app') {
    navigateForContext();
    return;
  }
  applyDevice();
  syncContextLocation();
});

function downloadError(error) {
  const canAcquire = error.payload?.canAcquire === true;
  return { available: false, message: canAcquire ? t('freeAcquisitionRequired') : errorText(error.payload), canAcquire };
}

// The app ID alone is not enough to ask PICO for a download, so pair it with
// whichever package name the catalog, the search results, or the snapshot has.
function selectedPackage() {
  const entry = [...catalogItems, ...searchItems, ...favorites, ...allApps]
    .find(item => item.itemId === selectedId);
  return currentState?.itemId === selectedId ? currentState.packageName : entry?.packageName;
}

async function refreshDownload() {
  invalidateDownload(t('checkingEntitlement'));
  if (!account.authenticated || accountBusy || !selectedId) return;
  const itemId = selectedId;
  const ticket = apkRequest;
  const accountTicket = accountRequest;
  const query = new URLSearchParams({ itemId, region, device });
  const packageName = selectedPackage();
  if (packageName) query.set('package', packageName);
  $('download-status').textContent = t('checkingEntitlement');
  let next;
  const report = newDownloadReport(itemId, packageName);
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      next = await api(`/api/download/info?${query}`);
      report.events.push({ stage: 'download_info', attempt, result: 'ready' });
      report.metadata = { versionCode: next.versionCode, version: next.version, size: next.size, md5: next.md5 };
      break;
    } catch (error) {
      report.events.push({ stage: 'download_info', attempt, ...reportError(error) });
      if (attempt === 1 && (error.status === undefined || error.status >= 500)) {
        if (ticket !== apkRequest || accountTicket !== accountRequest || itemId !== selectedId || !account.authenticated) return;
        continue;
      }
      next = downloadError(error);
      report.failure = reportError(error);
      break;
    }
  }
  if (ticket !== apkRequest || accountTicket !== accountRequest || itemId !== selectedId || !account.authenticated) return;
  apk = next;
  downloadReport = report;
  renderDownload();
}

async function refreshAccount() {
  const ticket = ++accountRequest;
  let next;
  try {
    const session = await api('/api/account/session');
    next = {
      global: {
        authenticated: Boolean(session.regions?.global?.authenticated),
        label: session.regions?.global?.label ?? '',
      },
      cn: {
        authenticated: Boolean(session.regions?.cn?.authenticated),
        label: session.regions?.cn?.label ?? '',
      },
    };
  } catch {
    next = {
      global: { authenticated: false, label: '' },
      cn: { authenticated: false, label: '' },
    };
  }
  if (ticket !== accountRequest) return;
  sessions = next;
  syncActiveAccount();
  invalidateDownload();
  setAccountStatus();
  setCnAccountStatus();
  if (account.authenticated) await refreshDownload();
}

on('send-code', 'click', async () => {
  setAccountStatus('sendingCode');
  try {
    await api('/api/account/send-code', { method: 'POST', body: JSON.stringify({ email: $('account-email').value.trim() }) });
    setAccountStatus('codeSent');
    $('account-code').focus();
  } catch (error) {
    setAccountStatus(errorKey(error.payload));
  }
});

on('account-form', 'submit', async event => {
  event.preventDefault();
  if (accountBusy) return;
  accountRequest += 1;
  setAccountBusy(true);
  invalidateDownload();
  const email = $('account-email').value.trim();
  setAccountStatus('signingIn');
  try {
    await api('/api/account/login', { method: 'POST', body: JSON.stringify({ email, code: $('account-code').value.trim() }) });
    sessions.global = { authenticated: true, label: email };
    syncActiveAccount();
    if (pageContext.seo) window.picoTrack?.('login_success');
    $('account-code').value = '';
    setAccountStatus();
  } catch (error) {
    setAccountStatus(errorKey(error.payload));
  } finally {
    setAccountBusy(false);
    await refreshDownload();
  }
});

on('sign-out', 'click', async () => {
  if (accountBusy) return;
  accountRequest += 1;
  setAccountBusy(true);
  invalidateDownload();
  setAccountStatus('signingOut');
  try {
    // Clear only the active region; the other region's session is kept.
    await api('/api/account/logout', { method: 'POST', body: JSON.stringify({ region }) });
    sessions[region] = { authenticated: false, label: '' };
    syncActiveAccount();
    setAccountStatus();
  } catch {
    setAccountStatus('errSignOutFailed');
  } finally {
    setAccountBusy(false);
    await refreshDownload();
  }
});

on('cn-send-code', 'click', async () => {
  const mobile = $('cn-mobile').value.trim();
  const countryCode = $('cn-country').value.trim() || '86';
  setCnAccountStatus('smsSending');
  try {
    const payload = await api('/api/account/cn/send-code', { method: 'POST', body: JSON.stringify({ mobile, countryCode }) });
    cnMobileTicket = typeof payload.mobileTicket === 'string' ? payload.mobileTicket : '';
    cnSsoCookies = payload.ssoCookies && typeof payload.ssoCookies === 'object' ? payload.ssoCookies : {};
    cnTicketMobile = mobile;
    setCnAccountStatus('smsSent');
    $('cn-code').focus();
  } catch (error) {
    cnMobileTicket = '';
    cnSsoCookies = {};
    cnTicketMobile = '';
    setCnAccountStatus(error.payload?.upstreamCode === 7 ? 'errSmsRateLimited' : cnErrorKey(error.payload));
  }
});

on('cn-account-form', 'submit', async event => {
  event.preventDefault();
  if (accountBusy) return;
  const mobile = $('cn-mobile').value.trim();
  const countryCode = $('cn-country').value.trim() || '86';
  const code = $('cn-code').value.trim();
  if (!cnMobileTicket || cnTicketMobile !== mobile) {
    setCnAccountStatus('errCodeExpired');
    return;
  }
  accountRequest += 1;
  setAccountBusy(true);
  invalidateDownload();
  setCnAccountStatus('signingIn');
  try {
    await api('/api/account/cn/login', { method: 'POST', body: JSON.stringify({ mobile, countryCode, code, mobileTicket: cnMobileTicket, ssoCookies: cnSsoCookies }) });
    sessions.cn = { authenticated: true, label: `+${countryCode} ${mobile}` };
    syncActiveAccount();
    if (pageContext.seo) window.picoTrack?.('login_success');
    $('cn-code').value = '';
    cnMobileTicket = '';
    cnSsoCookies = {};
    cnTicketMobile = '';
    setCnAccountStatus();
  } catch (error) {
    setCnAccountStatus(error.payload?.upstreamCode === 7 ? 'errSmsRateLimited' : cnErrorKey(error.payload));
  } finally {
    setAccountBusy(false);
    await refreshDownload();
  }
});

on('acquire-apk', 'click', async () => {
  if (!account.authenticated || accountBusy || !apk?.canAcquire || !selectedId) return;
  const itemId = selectedId;
  const packageName = selectedPackage();
  const accountTicket = accountRequest;
  invalidateDownload(t('acquiringApk'));
  const ticket = apkRequest;
  let next;
  const report = newDownloadReport(itemId, packageName);
  try {
    next = await api('/api/download/acquire', { method: 'POST', body: JSON.stringify({ itemId, packageName, region, device }) });
    report.events.push({ stage: 'acquisition', result: 'ready' });
  } catch (error) {
    next = downloadError(error);
    report.events.push({ stage: 'acquisition', ...reportError(error) });
    report.failure = reportError(error);
  }
  if (ticket !== apkRequest || accountTicket !== accountRequest || itemId !== selectedId || !account.authenticated) return;
  apk = next;
  downloadReport = report;
  renderDownload();
});

on('copy-report', 'click', async () => {
  const report = await collectDownloadReport();
  if (!report) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    $('download-status').textContent = t('reportCopied');
  } catch {
    saveDownloadReport(report);
    $('download-status').textContent = t('reportSaveHint');
  }
});
on('save-report', 'click', async () => { saveDownloadReport(await collectDownloadReport()); });

on('copy-md5', 'click', async () => {
  if (!apk?.available) return;
  try {
    await navigator.clipboard.writeText(apk.md5);
    $('download-status').textContent = t('md5Copied');
  } catch {
    $('download-status').textContent = apk.md5;
  }
});

// A detail opened from the catalog should keep the catalog's navigation context
// instead of claiming it was reached through search.
function applyNavigationContext() {
  if (new URLSearchParams(location.search).get('from') !== 'all-apps') return;
  const basePath = locale === 'en' ? '/en' : '';
  const breadcrumb = $('app-breadcrumb-link');
  if (breadcrumb) {
    const target = new URL(`${basePath}/all-apps/`, location.origin);
    target.searchParams.set('region', region);
    target.searchParams.set('device', device);
    breadcrumb.href = target.href;
    breadcrumb.textContent = locale === 'en' ? 'All apps' : '全部应用';
  }
  const tabbar = document.querySelector('.tabbar');
  if (!tabbar) return;
  const allApps = [...tabbar.querySelectorAll('a')].find(link => link.getAttribute('href')?.endsWith('/all-apps/'));
  if (!allApps) return;
  for (const link of tabbar.querySelectorAll('a')) {
    link.classList.remove('active');
    link.removeAttribute('aria-current');
  }
  allApps.classList.add('active');
  allApps.setAttribute('aria-current', 'page');
}

// Account and download state must exist before the first render, so boot last.
applyLocale();
applyDevice();
applyNavigationContext();
applyRegion({ reloadDetail: false });
syncContextLocation();
renderHomeRegion();
loadState();
refreshAccount();
