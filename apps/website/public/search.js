const $ = id => document.getElementById(id);

const copy = {
  en: {
    searching: 'Searching…',
    empty: 'No apps found. Try another name.',
    failed: 'Search is unavailable. Please try again later.',
    results: '{count} results',
    open: 'Open',
    version: 'Version',
    free: 'Free',
  },
  'zh-CN': {
    searching: '正在搜索…',
    empty: '没有找到应用，试试其他名称。',
    failed: '暂时无法搜索，请稍后重试。',
    results: '找到 {count} 款应用',
    open: '打开',
    version: '版本',
    free: '免费',
  },
};

const locale = document.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en';
const t = key => copy[locale][key] ?? copy.en[key] ?? key;
const params = new URLSearchParams(location.search);
const base = locale === 'en' ? '/en' : '';
const DEVICE_CODES = ['B3110', 'A9210', 'A8A10', 'A8110', 'A7H10'];
const DEFAULT_DEVICE = 'A9210';
let region = params.get('region') === 'cn' ? 'cn'
  : params.get('region') === 'global' ? 'global'
    : localStorage.getItem('pico-store-region') === 'global' ? 'global'
      : localStorage.getItem('pico-store-region') === 'cn' ? 'cn'
        : locale === 'zh-CN' ? 'cn' : 'global';
const storedDevice = localStorage.getItem('pico-store-device');
let device = DEVICE_CODES.includes(params.get('device') || '') ? params.get('device')
  : DEVICE_CODES.includes(storedDevice || '') ? storedDevice
    : DEFAULT_DEVICE;
let priceFilter = localStorage.getItem('pico-store-price-filter');
if (!['all', 'free', 'paid'].includes(priceFilter)) priceFilter = 'all';

let catalog = [];
try { catalog = JSON.parse($('catalog-data')?.textContent || '[]'); } catch { catalog = []; }
if (!Array.isArray(catalog)) catalog = [];
const slugs = Object.fromEntries(catalog.filter(item => item.state?.slug).map(item => [item.itemId, item.state.slug]));

function safeImage(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : null;
  } catch { return null; }
}

function detailHref(item) {
  const slug = slugs[item.itemId];
  if (slug) return `${base}/apps/${slug}/?region=${region}&device=${device}&from=search`;
  const query = new URLSearchParams({ itemId: item.itemId, package: item.packageName, region, device, from: 'search' });
  return `${base}/app/?${query}`;
}

function priceLabel(value) {
  const price = String(value ?? '').trim();
  if (/^0+(?:\.0+)?$/.test(price)) return t('free');
  if (!price) return '';
  // The search payload carries an amount but not a currency; the region
  // determines whether it is CNY or USD.
  return region === 'cn' ? `¥${price}` : `$${price}`;
}

function renderRegion() {
  for (const [id, value] of [['region-global', 'global'], ['region-cn', 'cn']]) {
    const element = $(id);
    if (!element) continue;
    element.setAttribute('aria-selected', String(region === value));
    element.classList.toggle('active', region === value);
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

function renderPrice() {
  for (const button of document.querySelectorAll('.price-option')) {
    const active = button.dataset.price === priceFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function resultCard(item) {
  const link = document.createElement('a');
  link.className = 'search-card';
  link.href = detailHref(item);

  const artwork = document.createElement('div');
  artwork.className = 'search-card-art';
  const icon = safeImage(item.iconUrl);
  if (icon) {
    const image = document.createElement('img');
    image.src = icon;
    image.alt = '';
    image.addEventListener('error', () => {
      artwork.replaceChildren();
      artwork.textContent = 'P/';
      artwork.classList.add('store-art-fallback');
    }, { once: true });
    artwork.append(image);
  } else {
    artwork.textContent = 'P/';
  }

  const body = document.createElement('div');
  body.className = 'search-card-copy';
  const name = document.createElement('strong');
  name.textContent = item.name || item.packageName;
  const meta = document.createElement('span');
  const version = item.appVersion ? `${t('version')} ${item.appVersion}` : '';
  const price = priceLabel(item.price);
  meta.textContent = [version, price].filter(Boolean).join(' · ');
  body.append(name, meta);

  const arrow = document.createElement('span');
  arrow.className = 'search-card-arrow';
  arrow.textContent = '↗';
  arrow.setAttribute('aria-hidden', 'true');
  link.append(artwork, body, arrow);
  return link;
}

function renderResults(items) {
  const container = $('search-results');
  container.replaceChildren();
  if (!items.length) {
    $('search-status').textContent = t('empty');
    return;
  }
  $('search-status').textContent = t('results').replace('{count}', String(items.length));
  for (const item of items) container.append(resultCard(item));
}

async function search() {
  const word = $('search-word').value.trim();
  if (!word) return;
  $('search-status').textContent = t('searching');
  const url = new URL(location.href);
  if (url.searchParams.get('q') !== word) {
    url.searchParams.set('q', word);
    history.replaceState(null, '', url);
  }
  try {
    const price = priceFilter === 'all' ? '' : `&price=${priceFilter}`;
    const response = await fetch(`/api/search?region=${region}&device=${device}&q=${encodeURIComponent(word)}${price}&lang=${locale === 'zh-CN' ? 'zh' : 'en'}`);
    if (!response.ok) throw new Error('search unavailable');
    const payload = await response.json();
    renderResults(Array.isArray(payload.items) ? payload.items : []);
  } catch {
    $('search-results').replaceChildren();
    $('search-status').textContent = t('failed');
  }
}

$('search-form').addEventListener('submit', event => { event.preventDefault(); search(); });

for (const button of document.querySelectorAll('.price-option')) {
  button.addEventListener('click', () => {
    const next = ['free', 'paid'].includes(button.dataset.price) ? button.dataset.price : 'all';
    if (next === priceFilter) return;
    priceFilter = next;
    localStorage.setItem('pico-store-price-filter', priceFilter);
    renderPrice();
    if ($('search-word').value.trim()) search();
  });
}

for (const [id, value] of [['region-global', 'global'], ['region-cn', 'cn']]) {
  $(id)?.addEventListener('click', () => {
    if (region === value) return;
    region = value;
    localStorage.setItem('pico-store-region', region);
    renderRegion();
    syncLocation();
    if ($('search-word').value.trim()) search();
  });
}

$('device-select')?.addEventListener('change', event => {
  const next = DEVICE_CODES.includes(event.target.value) ? event.target.value : DEFAULT_DEVICE;
  if (next === device) return;
  device = next;
  localStorage.setItem('pico-store-device', device);
  renderDevice();
  syncLocation();
  if ($('search-word').value.trim()) search();
});

renderRegion();
renderDevice();
renderPrice();
syncLocation();
const initialQuery = params.get('q');
if (initialQuery) {
  $('search-word').value = initialQuery;
  search();
}
