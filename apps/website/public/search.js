const $ = id => document.getElementById(id);

const copy = {
  en: {
    searching: 'Searching…',
    empty: 'No apps found. Try another name.',
    filteredEmpty: 'No apps match these filters.',
    failed: 'Search is unavailable. Please try again later.',
    results: '{count} results',
    open: 'Open',
    version: 'Version',
    free: 'Free',
  },
  'zh-CN': {
    searching: '正在搜索…',
    empty: '没有找到应用，试试其他名称。',
    filteredEmpty: '没有符合筛选条件的应用。',
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
let categoryFilter = 'all';
let sortMode = 'comprehensive';
let searchItems = [];

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

function genreList(value) {
  return String(value ?? '').split(/[,、·:：]/).map(part => part.trim()).filter(Boolean);
}

const CATEGORY_ALIASES = {
  sports: ['运动', 'Sports'],
  simulation: ['模拟', 'Simulation'],
  action: ['动作', 'Action'],
  shooter: ['射击', 'Shooting', 'Shooter'],
  adventure: ['冒险', 'Adventure'],
  puzzle: ['解谜', 'Puzzle'],
  casual: ['休闲', 'Casual'],
  relax: ['放松', 'Relaxation', 'Relax'],
  space: ['太空', 'Space'],
  explore: ['探索', 'Explore', 'Exploration'],
  role: ['角色', '角色扮演', 'Role', 'RPG'],
  play: ['扮演', '角色扮演', 'Role-playing', 'RPG'],
  strategy: ['策略', 'Strategy'],
  racing: ['竞速', 'Racing'],
  cartoon: ['卡通', 'Cartoon'],
  scifi: ['科幻', 'Sci-fi', 'Sci-Fi', 'Science Fiction'],
  horror: ['恐怖', 'Horror'],
  video: ['视频', 'Video'],
  music: ['音乐', 'Music'],
  social: ['社交', 'Social'],
  education: ['教育', 'Education'],
  news: ['新闻', 'News'],
};

function categoryMatches(item) {
  if (categoryFilter === 'all') return true;
  const aliases = (CATEGORY_ALIASES[categoryFilter] ?? []).map(alias => alias.toLowerCase());
  return genreList(item.genres).some(genre => {
    const value = genre.toLowerCase();
    return aliases.some(alias => value.includes(alias) || alias.includes(value));
  });
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function renderFilters() {
  const category = $('search-category');
  if (category) {
    if (![...category.options].some(option => option.value === categoryFilter)) categoryFilter = 'all';
    category.value = categoryFilter;
  }
  if ($('search-price')) $('search-price').value = priceFilter;
  if ($('search-sort')) $('search-sort').value = sortMode;
}

function priceMatches(item) {
  if (priceFilter === 'all') return true;
  const price = numberValue(item.price);
  const free = price === null || price === 0;
  return priceFilter === 'free' ? free : !free;
}

function sortedResults(items) {
  if (sortMode === 'comprehensive') return [...items];
  const direction = sortMode === 'name' ? 1 : sortMode === 'price' ? 1 : -1;
  const collator = new Intl.Collator(locale === 'zh-CN' ? 'zh-CN' : 'en', { numeric: true, sensitivity: 'base' });
  return [...items].sort((left, right) => {
    let leftValue;
    let rightValue;
    if (sortMode === 'name') {
      leftValue = String(left.name ?? '');
      rightValue = String(right.name ?? '');
    } else if (sortMode === 'rating') {
      leftValue = numberValue(left.score);
      rightValue = numberValue(right.score);
    } else if (sortMode === 'price') {
      leftValue = numberValue(left.price);
      rightValue = numberValue(right.price);
    } else {
      leftValue = numberValue(left.updatedAt);
      rightValue = numberValue(right.updatedAt);
    }
    if (leftValue == null && rightValue == null) return collator.compare(String(left.name ?? ''), String(right.name ?? ''));
    if (leftValue == null || rightValue == null) return leftValue == null ? 1 : -1;
    const comparison = typeof leftValue === 'string'
      ? collator.compare(leftValue, rightValue)
      : leftValue - rightValue;
    if (comparison !== 0) return comparison * direction;
    return collator.compare(String(left.name ?? ''), String(right.name ?? ''));
  });
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
    image.src = window.PicoStoreIcons?.url(item) || icon;
    image.alt = '';
    image.dataset.picoIcon = item.itemId;
    image.dataset.picoReady = 'true';
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
  const categories = genreList(item.genres).join(' · ');
  const price = priceLabel(item.price);
  meta.textContent = [version, categories, price].filter(Boolean).join(' · ');
  body.append(name, meta);

  const arrow = document.createElement('span');
  arrow.className = 'search-card-arrow';
  arrow.textContent = '↗';
  arrow.setAttribute('aria-hidden', 'true');
  link.append(artwork, body, arrow);
  return link;
}

async function renderResults(items, filtered = false) {
  const container = $('search-results');
  container.replaceChildren();
  if (!items.length) {
    $('search-status').textContent = filtered && searchItems.length ? t('filteredEmpty') : t('empty');
    return;
  }
  $('search-status').textContent = t('results').replace('{count}', String(items.length));
  await window.PicoStoreIcons?.resolve(items);
  for (const item of items) container.append(resultCard(item));
}

function applyFilters() {
  const filtered = searchItems
    .filter(categoryMatches)
    .filter(priceMatches);
  renderResults(sortedResults(filtered), true);
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
    const response = await fetch(`/api/search?region=${region}&device=${device}&q=${encodeURIComponent(word)}&lang=${locale === 'zh-CN' ? 'zh' : 'en'}`);
    if (!response.ok) throw new Error('search unavailable');
    const payload = await response.json();
    searchItems = Array.isArray(payload.items) ? payload.items : [];
    renderFilters();
    applyFilters();
  } catch {
    searchItems = [];
    $('search-results').replaceChildren();
    $('search-status').textContent = t('failed');
    renderFilters();
  }
}

$('search-form').addEventListener('submit', event => { event.preventDefault(); search(); });

$('search-category')?.addEventListener('change', event => {
  categoryFilter = event.target.value || 'all';
  if (searchItems.length) applyFilters();
});

$('search-price')?.addEventListener('change', event => {
  const next = ['free', 'paid'].includes(event.target.value) ? event.target.value : 'all';
  priceFilter = next;
  localStorage.setItem('pico-store-price-filter', priceFilter);
  renderFilters();
  if (searchItems.length || $('search-word').value.trim()) applyFilters();
});

$('search-sort')?.addEventListener('change', event => {
  sortMode = ['updated', 'rating', 'price', 'name'].includes(event.target.value) ? event.target.value : 'comprehensive';
  renderFilters();
  if (searchItems.length) applyFilters();
});

for (const [id, value] of [['region-global', 'global'], ['region-cn', 'cn']]) {
  $(id)?.addEventListener('click', () => {
    if (region === value) return;
    region = value;
    localStorage.setItem('pico-store-region', region);
    renderRegion();
    syncLocation();
    categoryFilter = 'all';
    searchItems = [];
    renderFilters();
    if ($('search-word').value.trim()) search();
    else $('search-status').textContent = '';
  });
}

$('device-select')?.addEventListener('change', event => {
  const next = DEVICE_CODES.includes(event.target.value) ? event.target.value : DEFAULT_DEVICE;
  if (next === device) return;
  device = next;
  localStorage.setItem('pico-store-device', device);
  renderDevice();
  syncLocation();
  categoryFilter = 'all';
  searchItems = [];
  renderFilters();
  if ($('search-word').value.trim()) search();
  else $('search-status').textContent = '';
});

renderRegion();
renderDevice();
renderFilters();
syncLocation();
const initialQuery = params.get('q');
if (initialQuery) {
  $('search-word').value = initialQuery;
  search();
}
