const $ = id => document.getElementById(id);

const copy = {
  en: {
    loading: 'Syncing saved app details…',
    syncFailed: 'Could not sync app details. Showing the saved names instead.',
    empty: 'No favorites yet. Open an app and choose “Add to favorites ☆” to keep it here.',
    browse: 'Browse all apps ↗',
    app: 'App / publisher',
    version: 'Version',
    category: 'Category',
    rating: 'Rating',
    price: 'Price',
    updated: 'Updated',
    free: 'Free',
  },
  'zh-CN': {
    loading: '正在同步收藏的应用信息…',
    syncFailed: '暂时无法同步应用信息，先显示已保存的名称。',
    empty: '还没有收藏。打开任意应用详情，点“加入收藏 ☆”就会出现在这里。',
    browse: '去全部应用看看 ↗',
    app: '应用 / 发行商',
    version: '版本',
    category: '分类',
    rating: '评分',
    price: '价格',
    updated: '更新',
    free: '免费',
  },
};

const locale = document.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en';
const t = key => copy[locale][key] ?? copy.en[key] ?? key;
const FAVORITES_KEY = 'pico-store-favorites';
const params = new URLSearchParams(location.search);
const DEVICE_CODES = ['B3110', 'A9210', 'A8A10', 'A8110', 'A7H10'];
const DEFAULT_DEVICE = 'A9210';

const storedRegion = localStorage.getItem('pico-store-region');
let region = params.get('region') === 'cn' ? 'cn'
  : params.get('region') === 'global' ? 'global'
    : storedRegion === 'global' ? 'global'
      : storedRegion === 'cn' ? 'cn'
        : locale === 'zh-CN' ? 'cn' : 'global';
const storedDevice = localStorage.getItem('pico-store-device');
let device = DEVICE_CODES.includes(params.get('device') || '') ? params.get('device')
  : DEVICE_CODES.includes(storedDevice || '') ? storedDevice
    : DEFAULT_DEVICE;

let apps = [];
let loading = false;
let loadToken = 0;
let favorites = readFavorites();

const catalog = readCatalog();
const slugs = Object.fromEntries(catalog.filter(item => item.state?.slug).map(item => [String(item.itemId), item.state.slug]));

function readCatalog() {
  try {
    const parsed = JSON.parse(document.getElementById('catalog-data')?.textContent || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function normalizeKey(value) {
  return String(value ?? '').trim();
}

function favoriteKey(item) {
  return normalizeKey(item?.itemId) || normalizeKey(item?.packageName).toLowerCase();
}

function matchesItem(saved, app) {
  if (normalizeKey(saved.itemId) && normalizeKey(saved.itemId) === normalizeKey(app.itemId)) return true;
  const savedPackage = normalizeKey(saved.packageName).toLowerCase();
  const appPackage = normalizeKey(app.packageName).toLowerCase();
  return Boolean(savedPackage && appPackage && savedPackage === appPackage);
}

function readFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw
      .filter(item => item && (item.itemId || item.packageName))
      .map(item => ({
        ...item,
        itemId: normalizeKey(item.itemId),
        packageName: normalizeKey(item.packageName),
        name: String(item.name ?? ''),
      }))
      .filter(item => {
        const key = favoriteKey(item);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .reverse();
  } catch { return []; }
}

function refreshFavorites() {
  const next = readFavorites();
  favorites = next;
  render();
  if (favorites.length && !apps.length && !loading) load();
}

function safeImage(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : null;
  } catch { return null; }
}

function genreList(value) {
  return String(value ?? '').split(/[,、·:：]/).map(part => part.trim()).filter(Boolean);
}

function priceLabel(item) {
  const value = String(item.price ?? '').trim();
  if (/^0+(?:\.0+)?$/.test(value)) return t('free');
  if (!value) return '—';
  if (item.currency === 'CNY') return `¥${value}`;
  if (item.currency === 'USD') return `$${value}`;
  return region === 'cn' ? `¥${value}` : `$${value}`;
}

function versionLabel(item) {
  if (item.appVersion) return item.appVersion;
  const code = Number(item.versionCode);
  return Number.isSafeInteger(code) && code > 0 && code < 1000000 ? `v${code}` : '—';
}

function detailHref(item) {
  const base = locale === 'en' ? '/en' : '';
  const slug = slugs[normalizeKey(item.itemId)] || item.slug;
  if (slug) {
    const curated = new URL(`${base}/apps/${slug}/`, location.origin);
    curated.searchParams.set('region', region);
    curated.searchParams.set('device', device);
    curated.searchParams.set('from', 'favorites');
    return curated.href;
  }
  const detail = new URL(`${base}/app/`, location.origin);
  if (item.itemId) detail.searchParams.set('itemId', item.itemId);
  if (item.packageName) detail.searchParams.set('package', item.packageName);
  detail.searchParams.set('region', region);
  detail.searchParams.set('device', device);
  detail.searchParams.set('from', 'favorites');
  return detail.href;
}

function el(tag, className, text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function setStatus(text) {
  const status = $('favorites-status');
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || '';
}

function enrichedFavorite(saved) {
  const found = apps.find(app => matchesItem(saved, app));
  return found ? { ...saved, ...found, name: found.name || saved.name } : saved;
}

function renderEmpty() {
  const container = $('favorites-results');
  const empty = el('div', 'store-empty');
  empty.append(el('p', '', t('empty')));
  const browse = document.createElement('a');
  browse.href = `${locale === 'en' ? '/en' : ''}/all-apps/?region=${region}&device=${device}`;
  browse.textContent = t('browse');
  empty.append(browse);
  container.append(empty);
}

async function render() {
  const container = $('favorites-results');
  const count = $('favorites-count');
  if (!container) return;
  container.replaceChildren();
  if (count) count.textContent = String(favorites.length);
  if (!favorites.length) {
    setStatus('');
    renderEmpty();
    return;
  }

  await window.PicoStoreIcons?.resolve(favorites);

  const head = el('div', 'store-row store-row-head');
  for (const label of [t('app'), t('version'), t('category'), t('rating'), t('price'), t('updated')]) {
    head.append(el('span', '', label));
  }
  head.append(el('span', '', ''));
  container.append(head);

  favorites.forEach((saved, index) => {
    const item = enrichedFavorite(saved);
    const row = document.createElement('a');
    row.className = `store-row ${index % 2 ? 'store-row-alt' : 'store-row-base'}`;
    row.href = detailHref(item);

    const main = el('span', 'store-main');
    const art = el('span', 'store-art');
    const icon = safeImage(item.iconUrl);
    if (icon) {
      const image = document.createElement('img');
      image.src = window.PicoStoreIcons?.url(item) || icon;
      image.alt = '';
      image.dataset.picoIcon = item.itemId;
      image.dataset.picoReady = 'true';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => {
        art.replaceChildren();
        art.textContent = 'P/';
        art.classList.add('store-art-fallback');
      }, { once: true });
      art.append(image);
    } else art.textContent = 'P/';
    const naming = el('span', 'store-naming');
    naming.append(el('strong', '', item.name || '—'), el('small', '', item.publisher || '—'));
    main.append(art, naming);

    const versionText = versionLabel(item);
    const version = el('span', 'store-version', versionText);
    if (versionText !== '—') version.title = versionText;
    row.append(
      main,
      version,
      el('span', 'store-category', genreList(item.genres).join(' · ') || '—'),
      el('span', 'store-rating', typeof item.score === 'number' && Number.isFinite(item.score) ? `★ ${item.score.toFixed(1)}` : '—'),
      el('span', 'store-price', priceLabel(item)),
      el('span', 'store-updated', item.updatedAt ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(item.updatedAt * 1000)) : '—'),
      el('span', 'store-arrow', '↗'),
    );
    container.append(row);
  });
}

async function load() {
  const token = ++loadToken;
  if (!favorites.length) {
    loading = false;
    setStatus('');
    render();
    return;
  }
  loading = true;
  setStatus(t('loading'));
  render();
  try {
    const lang = locale === 'zh-CN' ? 'zh' : 'en';
    const fetchItems = async language => {
      const response = await fetch(`/api/apps?region=${region}&device=${device}&sort=updated&lang=${language}`);
      if (!response.ok) throw new Error('apps unavailable');
      const payload = await response.json();
      return Array.isArray(payload.items) ? payload.items : [];
    };
    let items = await fetchItems(lang);
    if (lang === 'en') {
      try {
        const fallback = await fetchItems('zh');
        const seen = new Set(items.map(item => String(item.itemId || item.packageName || '')));
        for (const item of fallback) {
          const key = String(item.itemId || item.packageName || '');
          if (key && !seen.has(key)) {
            seen.add(key);
            items.push(item);
          }
        }
      } catch {
        // English catalog is enough for English-localized apps; keep it if Chinese fallback fails.
      }
    }
    if (token !== loadToken) return;
    apps = items;
    setStatus('');
    render();
  } catch {
    if (token !== loadToken) return;
    apps = [];
    setStatus(t('syncFailed'));
    render();
  } finally {
    if (token === loadToken) loading = false;
  }
}

function renderRegion() {
  for (const [id, value] of [['region-global', 'global'], ['region-cn', 'cn']]) {
    const button = $(id);
    if (!button) continue;
    button.setAttribute('aria-selected', String(region === value));
    button.classList.toggle('active', region === value);
  }
}

function renderDevice() {
  const select = $('device-select');
  if (select) select.value = device;
}

function syncLocation() {
  const url = new URL(location.href);
  url.searchParams.set('region', region);
  url.searchParams.set('device', device);
  history.replaceState(null, '', url);
}

function changeContext(nextRegion, nextDevice) {
  region = nextRegion;
  device = nextDevice;
  localStorage.setItem('pico-store-region', region);
  localStorage.setItem('pico-store-device', device);
  renderRegion();
  renderDevice();
  apps = [];
  syncLocation();
  load();
}

for (const [id, value] of [['region-global', 'global'], ['region-cn', 'cn']]) {
  $(id)?.addEventListener('click', () => {
    if (region === value) return;
    changeContext(value, device);
  });
}

$('device-select')?.addEventListener('change', event => {
  const next = DEVICE_CODES.includes(event.target.value) ? event.target.value : DEFAULT_DEVICE;
  if (next === device) return;
  changeContext(region, next);
});

window.addEventListener('storage', event => {
  if (event.key === FAVORITES_KEY) refreshFavorites();
});
window.addEventListener('pageshow', refreshFavorites);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshFavorites();
});

renderRegion();
renderDevice();
render();
if (favorites.length) load();
