const $ = id => document.getElementById(id);

const copy = {
  en: {
    loading: 'Loading the store catalog…',
    empty: 'No apps are available for this store and device.',
    failed: 'Could not load the app list. Please try again.',
    free: 'Free',
    version: 'Version',
    category: 'Category',
    rating: 'Rating',
    price: 'Price',
    updated: 'Updated',
    app: 'App / publisher',
  },
  'zh-CN': {
    loading: '正在拉取商店目录…',
    empty: '这个商店和当前设备没有可用应用。',
    failed: '无法加载应用列表，请稍后重试。',
    free: '免费',
    version: '版本',
    category: '分类',
    rating: '评分',
    price: '价格',
    updated: '更新',
    app: '应用 / 发行商',
  },
};

const locale = document.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en';
const t = key => copy[locale][key] ?? copy.en[key] ?? key;
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
let catalog = [];
try { catalog = JSON.parse(document.getElementById('catalog-data')?.textContent || '[]'); } catch { catalog = []; }
if (!Array.isArray(catalog)) catalog = [];
const slugs = Object.fromEntries(catalog.filter(item => item.state?.slug).map(item => [item.itemId, item.state.slug]));

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
  return item.currency ? `${value} ${item.currency}` : value;
}

function versionLabel(item) {
  if (item.appVersion) return item.appVersion;
  const code = Number(item.versionCode);
  return Number.isSafeInteger(code) && code > 0 && code < 1000000 ? `v${code}` : '—';
}

let sortKey = 'updated';
let sortDirection = 'desc';
const DEFAULT_DIRECTION = { name: 'asc', category: 'asc', version: 'desc', rating: 'desc', price: 'asc', updated: 'desc' };
const collator = new Intl.Collator(locale === 'zh-CN' ? 'zh-CN' : 'en', { numeric: true, sensitivity: 'base' });

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sortValue(item, key) {
  if (key === 'name') return String(item.name ?? '');
  if (key === 'version') {
    const code = Number(item.versionCode);
    if (Number.isFinite(code) && code > 0) return code;
    const version = parseFloat(item.appVersion);
    return Number.isFinite(version) ? version : null;
  }
  if (key === 'category') return genreList(item.genres).join(' · ');
  if (key === 'rating') return numberValue(item.score);
  if (key === 'price') return numberValue(item.price);
  if (key === 'updated') return numberValue(item.updatedAt);
  return null;
}

function sortedItems(items) {
  const direction = sortDirection === 'asc' ? 1 : -1;
  return [...items].sort((left, right) => {
    const leftValue = sortValue(left, sortKey);
    const rightValue = sortValue(right, sortKey);
    if (leftValue == null && rightValue == null) return collator.compare(String(left.name ?? ''), String(right.name ?? ''));
    if (leftValue == null || rightValue == null) return leftValue == null ? 1 : -1;
    const comparison = typeof leftValue === 'string'
      ? collator.compare(leftValue, rightValue)
      : leftValue - rightValue;
    if (comparison !== 0) return comparison * direction;
    return collator.compare(String(left.name ?? ''), String(right.name ?? ''));
  });
}

function sortMark(key) {
  if (sortKey !== key) return '↕';
  return sortDirection === 'asc' ? '↑' : '↓';
}

function selectSort(key) {
  if (sortKey === key) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  else {
    sortKey = key;
    sortDirection = DEFAULT_DIRECTION[key] ?? 'desc';
  }
  render();
}

function el(tag, className, text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
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
  if (!select) return;
  select.value = device;
}

function syncLocation() {
  const url = new URL(location.href);
  url.searchParams.set('region', region);
  url.searchParams.set('device', device);
  history.replaceState(null, '', url);
}

function detailHref(item) {
  const base = locale === 'en' ? '/en' : '';
  const slug = slugs[item.itemId];
  if (slug) {
    const curated = new URL(`${base}/apps/${slug}/`, location.origin);
    curated.searchParams.set('region', region);
    curated.searchParams.set('device', device);
    curated.searchParams.set('from', 'all-apps');
    return curated.href;
  }
  const detail = new URL(`${base}/app/`, location.origin);
  detail.searchParams.set('itemId', item.itemId);
  detail.searchParams.set('package', item.packageName);
  detail.searchParams.set('region', region);
  detail.searchParams.set('device', device);
  detail.searchParams.set('from', 'all-apps');
  return detail.href;
}

function renderRows(items) {
  const container = $('all-apps-results');
  container.replaceChildren();
  if (!items.length) {
    container.append(el('p', 'store-empty', t('empty')));
    $('all-apps-count').textContent = '0';
    return;
  }
  const ordered = sortedItems(items);
  const head = el('div', 'store-row store-row-head');
  const columns = [
    ['name', t('app')],
    ['version', t('version')],
    ['category', t('category')],
    ['rating', t('rating')],
    ['price', t('price')],
    ['updated', t('updated')],
  ];
  for (const [key, label] of columns) {
    const button = el('button', 'store-sort');
    button.type = 'button';
    button.dataset.sort = key;
    button.classList.toggle('is-active', sortKey === key);
    button.title = `${label} · ${sortMark(key)}`;
    button.append(el('span', 'store-sort-label', label), el('span', 'store-sort-mark', sortMark(key)));
    button.addEventListener('click', () => selectSort(key));
    head.append(button);
  }
  head.append(el('span', 'store-head-tail', ''));
  container.append(head);

  ordered.forEach((item, index) => {
    const row = document.createElement('a');
    row.className = 'store-row';
    row.classList.add(index % 2 ? 'store-row-alt' : 'store-row-base');
    row.href = detailHref(item);

    const main = el('span', 'store-main');
    const art = el('span', 'store-art');
    const icon = safeImage(item.iconUrl);
    if (icon) {
      const image = document.createElement('img');
      image.src = icon;
      image.alt = '';
      image.loading = index < 30 ? 'eager' : 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => {
        art.replaceChildren();
        art.textContent = 'P/';
        art.classList.add('store-art-fallback');
      }, { once: true });
      art.append(image);
    } else art.textContent = 'P/';
    const naming = el('span', 'store-naming');
    naming.append(el('strong', '', item.name), el('small', '', item.publisher || '—'));
    main.append(art, naming);

    const versionText = versionLabel(item);
    const version = el('span', 'store-version', versionText);
    if (versionText !== '—') version.title = versionText;
    row.append(main, version,
      el('span', 'store-category', genreList(item.genres).join(' · ') || '—'),
      el('span', 'store-rating', typeof item.score === 'number' && Number.isFinite(item.score) ? `★ ${item.score.toFixed(1)}` : '—'),
      el('span', 'store-price', priceLabel(item)),
      el('span', 'store-updated', item.updatedAt ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(item.updatedAt * 1000)) : '—'),
      el('span', 'store-arrow', '↗'));
    container.append(row);
  });
  $('all-apps-count').textContent = String(items.length);
}

function render() {
  if (!apps.length) {
    renderRows([]);
    return;
  }
  renderRows(apps);
}

async function load() {
  if (loading) return;
  loading = true;
  $('all-apps-status').hidden = false;
  $('all-apps-status').textContent = t('loading');
  $('all-apps-count').textContent = '—';
  $('all-apps-results').hidden = true;
  try {
    const response = await fetch(`/api/apps?region=${region}&device=${device}&sort=updated&lang=${locale === 'zh-CN' ? 'zh' : 'en'}`);
    if (!response.ok) throw new Error('apps unavailable');
    const payload = await response.json();
    apps = Array.isArray(payload.items) ? payload.items : [];
    $('all-apps-results').hidden = false;
    $('all-apps-status').hidden = true;
    render();
  } catch {
    apps = [];
    $('all-apps-count').textContent = '—';
    $('all-apps-results').hidden = true;
    $('all-apps-status').hidden = false;
    $('all-apps-status').textContent = t('failed');
  } finally {
    loading = false;
  }
}

function changeContext(nextRegion, nextDevice) {
  region = nextRegion;
  device = nextDevice;
  localStorage.setItem('pico-store-region', region);
  localStorage.setItem('pico-store-device', device);
  renderRegion();
  renderDevice();
  syncLocation();
  apps = [];
  $('all-apps-results').replaceChildren();
  $('all-apps-results').hidden = true;
  $('all-apps-count').textContent = '—';
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

renderRegion();
renderDevice();
syncLocation();
load();
