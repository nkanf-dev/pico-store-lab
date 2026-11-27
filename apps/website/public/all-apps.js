const $ = id => document.getElementById(id);

const copy = {
  en: {
    loading: 'Loading the store catalog…',
    searching: 'Searching…',
    empty: 'No apps are available for this store and device.',
    filteredEmpty: 'No apps match these filters.',
    failed: 'Could not load the app list. Please try again.',
    searchFailed: 'Search is unavailable. Please try again later.',
    free: 'Free',
    version: 'Version',
    category: 'Category',
    rating: 'Rating',
    price: 'Price',
    updated: 'Updated',
    app: 'App / publisher',
    perPage: 'Per page',
    allItems: 'All',
    prevPage: '← Previous',
    nextPage: 'Next →',
  },
  'zh-CN': {
    loading: '正在拉取商店目录…',
    searching: '正在搜索…',
    empty: '这个商店和当前设备没有可用应用。',
    filteredEmpty: '没有符合筛选条件的应用。',
    failed: '无法加载应用列表，请稍后重试。',
    free: '免费',
    version: '版本',
    category: '分类',
    rating: '评分',
    price: '价格',
    updated: '更新',
    app: '应用 / 发行商',
    perPage: '每页',
    allItems: '全部',
    prevPage: '← 上一页',
    nextPage: '下一页 →',
  },
};

const locale = document.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en';
const t = key => copy[locale][key] ?? copy.en[key] ?? key;
const params = new URLSearchParams(location.search);
const DEVICE_CODES = ['B3110', 'A9210', 'A8A10', 'A8110', 'A7H10'];
const DEFAULT_DEVICE = 'A9210';
const PAGE_SIZES = ['20', '50', '100', 'all'];
const DEFAULT_PAGE_SIZE = '20';

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

let categoryFilter = 'all';
let priceFilter = 'all';
let textFilter = (params.get('q') || '').trim();
const storedPageSize = localStorage.getItem('pico-store-page-size');
let pageSize = PAGE_SIZES.includes(storedPageSize) ? storedPageSize : DEFAULT_PAGE_SIZE;
let pageIndex = 1;
let pageTotal = 1;
let totalCount = 0;
let preloadedPage = 0;
let allShown = 0;
let allPage = 1;
let allItems = [];
let preloadHost = null;
let pageCache = new Map();
let pageLoading = false;
let prefetchingPage = 0;
let requestToken = 0;
const ALL_BATCH = 100;

function renderFilterOptions() {
  const category = $('all-apps-category');
  if (category) {
    if (![...category.options].some(option => option.value === categoryFilter)) categoryFilter = 'all';
    category.value = categoryFilter;
  }
  if ($('all-apps-price')) $('all-apps-price').value = priceFilter;
  if ($('all-apps-page-size')) $('all-apps-page-size').value = pageSize;
}

function syncSortSelect() {
  const select = $('all-apps-sort');
  if (!select) return;
  let mode = 'comprehensive';
  if (sortKey === 'updated' && sortDirection === 'desc') mode = 'updated';
  else if (sortKey === 'rating' && sortDirection === 'desc') mode = 'rating';
  else if (sortKey === 'price' && sortDirection === 'asc') mode = 'price';
  else if (sortKey === 'name' && sortDirection === 'asc') mode = 'name';
  select.value = mode;
}

function setSortMode(mode) {
  if (mode === 'rating') {
    sortKey = 'rating';
    sortDirection = 'desc';
  } else if (mode === 'price') {
    sortKey = 'price';
    sortDirection = 'asc';
  } else if (mode === 'name') {
    sortKey = 'name';
    sortDirection = 'asc';
  } else {
    // “综合排序” and “最近更新” both use the catalog's default update order.
    sortKey = 'updated';
    sortDirection = 'desc';
  }
  render();
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

let sortKey = 'updated';
let sortDirection = 'desc';
const DEFAULT_DIRECTION = { name: 'asc', category: 'asc', version: 'desc', rating: 'desc', price: 'asc', updated: 'desc' };

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
  syncSortSelect();
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
  if (textFilter) url.searchParams.set('q', textFilter);
  else url.searchParams.delete('q');
  history.replaceState(null, '', url);
}

function submitSearch() {
  const input = $('all-apps-search-word');
  textFilter = (input?.value || '').trim();
  syncLocation();
  load();
}

function clearTextSearch() {
  textFilter = '';
  syncLocation();
  load();
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

function pageStart(page) {
  return pageSize === 'all' ? 0 : (page - 1) * Number(pageSize);
}

function updateFooter() {
  const footer = $('all-apps-footer');
  if (!footer) return;
  const total = totalCount;
  footer.hidden = total === 0;
  if (!total) return;
  const status = $('all-apps-page-status');
  if (status) {
    if (pageSize === 'all') {
      status.textContent = locale === 'zh-CN'
        ? `已显示 ${allShown} / 共 ${total} 条`
        : `Showing ${allShown} of ${total}`;
    } else {
      const start = pageStart(pageIndex) + 1;
      const end = Math.min(pageStart(pageIndex) + Number(pageSize), total);
      status.textContent = locale === 'zh-CN'
        ? `第 ${pageIndex} / ${pageTotal} 页 · 显示 ${start}–${end}，共 ${total} 条`
        : `Page ${pageIndex} / ${pageTotal} · ${start}–${end} of ${total}`;
    }
  }
  const pagination = $('all-apps-page-nav');
  if (pagination) pagination.hidden = pageSize === 'all' || pageTotal <= 1;
  if ($('all-apps-prev-page')) $('all-apps-prev-page').disabled = pageIndex <= 1;
  if ($('all-apps-next-page')) $('all-apps-next-page').disabled = pageIndex >= pageTotal;
}

function createRow(item, index, eager = false) {
  const row = document.createElement('a');
  row.className = 'store-row';
  row.classList.add(index % 2 ? 'store-row-alt' : 'store-row-base');
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
    image.loading = eager || index < 30 ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      art.replaceChildren();
      art.textContent = 'P/';
      art.classList.add('store-art-fallback');
    }, { once: true });
    art.append(image);
  } else art.textContent = 'P/';
  const naming = el('span', 'store-naming');
  const name = el('strong', '', item.name);
  name.title = item.name;
  const publisher = el('small', '', item.publisher || '—');
  if (item.publisher) publisher.title = item.publisher;
  naming.append(name, publisher);
  main.append(art, naming);

  const versionText = versionLabel(item);
  const version = el('span', 'store-version', versionText);
  if (versionText !== '—') version.title = versionText;
  const category = el('span', 'store-category', genreList(item.genres).join(' · ') || '—');
  category.title = category.textContent;
  row.append(main, version, category,
    el('span', 'store-rating', typeof item.score === 'number' && Number.isFinite(item.score) ? `★ ${item.score.toFixed(1)}` : '—'),
    el('span', 'store-price', priceLabel(item)),
    el('span', 'store-updated', item.updatedAt ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(item.updatedAt * 1000)) : '—'),
    el('span', 'store-arrow', '↗'));
  return row;
}

function createHeader() {
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
  return head;
}

function ensurePreloadHost() {
  if (preloadHost && preloadHost.isConnected) return preloadHost;
  preloadHost = document.createElement('div');
  preloadHost.id = 'all-apps-preload';
  preloadHost.hidden = true;
  $('all-apps-results')?.after(preloadHost);
  return preloadHost;
}

function queryString(page, size) {
  const query = new URLSearchParams({
    region, device, sort: sortKey, category: categoryFilter, price: priceFilter,
    page: String(page), pageSize: String(size), lang: locale === 'zh-CN' ? 'zh' : 'en',
  });
  if (textFilter) query.set('q', textFilter);
  return query;
}

async function fetchAppsPage(page) {
  const size = pageSize === 'all' ? ALL_BATCH : Number(pageSize);
  const response = await fetch(`/api/apps?${queryString(page, size)}`);
  if (!response.ok) throw new Error('apps unavailable');
  return response.json();
}

function renderEmpty() {
  const container = $('all-apps-results');
  const empty = el('p', 'store-empty', t(textFilter || categoryFilter !== 'all' || priceFilter !== 'all' ? 'filteredEmpty' : 'empty'));
  container.replaceChildren(empty);
  container.hidden = false;
  $('all-apps-status').hidden = true;
  $('all-apps-count').textContent = '0';
  totalCount = 0;
  pageTotal = 1;
  if (preloadHost) preloadHost.replaceChildren();
  preloadedPage = 0;
  updateFooter();
}

async function showPage(payload, token = null) {
  totalCount = Number(payload.total) || 0;
  pageIndex = Number(payload.page) || 1;
  pageTotal = Math.max(1, Number(payload.pageTotal) || 1);
  const container = $('all-apps-results');
  container.hidden = false;
  $('all-apps-status').hidden = true;
  $('all-apps-count').textContent = String(totalCount);
  if (!payload.items?.length) {
    if (preloadHost) preloadHost.replaceChildren();
    preloadedPage = 0;
    renderEmpty();
    return;
  }
  await window.PicoStoreIcons?.resolve(payload.items);
  if (token !== null && token !== requestToken) return;
  const start = pageStart(pageIndex);
  const rows = payload.items.map((item, offset) => createRow(item, start + offset));
  container.replaceChildren(createHeader(), ...rows);
  if (preloadHost) preloadHost.replaceChildren();
  preloadedPage = 0;
  updateFooter();
}

async function showAllFirst(payload, token = null) {
  totalCount = Number(payload.total) || 0;
  allPage = Number(payload.page) || 1;
  allItems = payload.items ?? [];
  allShown = allItems.length;
  pageTotal = 1;
  const container = $('all-apps-results');
  container.hidden = false;
  $('all-apps-status').hidden = true;
  $('all-apps-count').textContent = String(totalCount);
  if (!allItems.length) {
    renderEmpty();
    return;
  }
  await window.PicoStoreIcons?.resolve(allItems);
  if (token !== null && token !== requestToken) return;
  const rows = allItems.map((item, index) => createRow(item, index));
  container.replaceChildren(createHeader(), ...rows);
  if (preloadHost) preloadHost.replaceChildren();
  preloadedPage = 0;
  updateFooter();
}

async function preloadNextPage() {
  const next = pageIndex + 1;
  if (pageSize === 'all' || pageIndex >= pageTotal || preloadedPage === next || prefetchingPage === next || pageLoading) return;
  prefetchingPage = next;
  try {
    let payload = pageCache.get(next);
    if (!payload) {
      payload = await fetchAppsPage(next);
      pageCache.set(Number(payload.page) || next, payload);
    }
    if (Number(payload.page) !== next || pageIndex + 1 !== next) return;
    await window.PicoStoreIcons?.resolve(payload.items);
    if (pageIndex + 1 !== next) return;
    const host = ensurePreloadHost();
    const start = pageStart(next);
    host.replaceChildren(...payload.items.map((item, offset) => createRow(item, start + offset, true)));
    preloadedPage = next;
  } catch { /* Prefetch is best-effort. */ } finally {
    if (prefetchingPage === next) prefetchingPage = 0;
  }
}

async function loadAllMore() {
  if (pageSize !== 'all' || pageLoading || allShown >= totalCount) return false;
  pageLoading = true;
  const token = ++requestToken;
  try {
    const payload = await fetchAppsPage(allPage + 1);
    if (token !== requestToken) return false;
    allPage = Number(payload.page) || allPage + 1;
    totalCount = Number(payload.total) || totalCount;
    await window.PicoStoreIcons?.resolve(payload.items);
    if (token !== requestToken) return false;
    const container = $('all-apps-results');
    for (const item of payload.items ?? []) {
      container.append(createRow(item, allItems.length));
      allItems.push(item);
    }
    allShown = allItems.length;
    $('all-apps-count').textContent = String(totalCount);
    updateFooter();
    return true;
  } catch {
    return false;
  } finally {
    pageLoading = false;
  }
}

async function checkAutoLoad() {
  const footer = $('all-apps-footer');
  if (!footer || footer.hidden) return;
  if (footer.getBoundingClientRect().top - window.innerHeight > 400) return;
  if (pageSize === 'all') {
    if (await loadAllMore()) await checkAutoLoad();
  } else {
    await preloadNextPage();
  }
}

let autoLoadScheduled = false;
function scheduleAutoLoad() {
  if (autoLoadScheduled) return;
  autoLoadScheduled = true;
  requestAnimationFrame(() => {
    autoLoadScheduled = false;
    checkAutoLoad();
  });
}

function render() {
  renderFilterOptions();
  load();
}

async function load() {
  pageLoading = true;
  const token = ++requestToken;
  $('all-apps-status').hidden = false;
  $('all-apps-status').textContent = t(textFilter ? 'searching' : 'loading');
  $('all-apps-count').textContent = '—';
  $('all-apps-results').hidden = true;
  if ($('all-apps-footer')) $('all-apps-footer').hidden = true;
  pageCache = new Map();
  preloadedPage = 0;
  prefetchingPage = 0;
  if (preloadHost) preloadHost.replaceChildren();
  try {
    const payload = await fetchAppsPage(1);
    if (token !== requestToken) return;
    pageCache.set(1, payload);
    if (pageSize === 'all') await showAllFirst(payload, token);
    else await showPage(payload, token);
    requestAnimationFrame(checkAutoLoad);
  } catch {
    if (token !== requestToken) return;
    totalCount = 0;
    $('all-apps-count').textContent = '—';
    $('all-apps-results').hidden = true;
    $('all-apps-status').hidden = false;
    $('all-apps-status').textContent = t('failed');
  } finally {
    if (token === requestToken) pageLoading = false;
  }
}

function changeContext(nextRegion, nextDevice) {
  region = nextRegion;
  device = nextDevice;
  localStorage.setItem('pico-store-region', region);
  localStorage.setItem('pico-store-device', device);
  renderRegion();
  renderDevice();
  categoryFilter = 'all';
  priceFilter = 'all';
  textFilter = '';
  sortKey = 'updated';
  sortDirection = 'desc';
  if ($('all-apps-search-word')) $('all-apps-search-word').value = '';
  renderFilterOptions();
  if ($('all-apps-sort')) $('all-apps-sort').value = 'comprehensive';
  syncLocation();
  $('all-apps-results').replaceChildren();
  $('all-apps-results').hidden = true;
  $('all-apps-count').textContent = '—';
  if ($('all-apps-footer')) $('all-apps-footer').hidden = true;
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

$('all-apps-search-form')?.addEventListener('submit', event => {
  event.preventDefault();
  submitSearch();
});

$('all-apps-search-word')?.addEventListener('search', event => {
  if (!event.target.value) clearTextSearch();
});

$('all-apps-search-word')?.addEventListener('input', event => {
  if (!event.target.value) clearTextSearch();
});

$('all-apps-category')?.addEventListener('change', event => {
  categoryFilter = event.target.value || 'all';
  render();
});

$('all-apps-price')?.addEventListener('change', event => {
  priceFilter = ['free', 'paid'].includes(event.target.value) ? event.target.value : 'all';
  render();
});

$('all-apps-sort')?.addEventListener('change', event => {
  setSortMode(['updated', 'rating', 'price', 'name'].includes(event.target.value) ? event.target.value : 'comprehensive');
});

$('all-apps-page-size')?.addEventListener('change', event => {
  pageSize = PAGE_SIZES.includes(event.target.value) ? event.target.value : DEFAULT_PAGE_SIZE;
  localStorage.setItem('pico-store-page-size', pageSize);
  render();
});

async function goToPage(next) {
  if (next < 1 || next > pageTotal || next === pageIndex || pageLoading) return;
  if (next === pageIndex + 1 && preloadedPage === next && preloadHost?.children.length) {
    const container = $('all-apps-results');
    const header = container.firstElementChild;
    const rows = [...preloadHost.children];
    preloadHost.replaceChildren();
    preloadedPage = 0;
    container.replaceChildren(header, ...rows);
    pageIndex = next;
    updateFooter();
    preloadNextPage();
  } else {
    const cached = pageCache.get(next);
    if (cached) {
      await showPage(cached);
      preloadNextPage();
    } else {
      pageLoading = true;
      const token = ++requestToken;
      const status = $('all-apps-status');
      if (status) {
        status.hidden = false;
        status.textContent = t('loading');
      }
      try {
        const payload = await fetchAppsPage(next);
        if (token !== requestToken) return;
        pageCache.set(Number(payload.page) || next, payload);
        await showPage(payload, token);
        preloadNextPage();
      } catch {
        if (status) status.textContent = t('failed');
      } finally {
        if (token === requestToken) pageLoading = false;
      }
    }
  }
  $('all-apps-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('all-apps-prev-page')?.addEventListener('click', () => goToPage(pageIndex - 1));
$('all-apps-next-page')?.addEventListener('click', () => goToPage(pageIndex + 1));

addEventListener('scroll', scheduleAutoLoad, { passive: true });
addEventListener('resize', scheduleAutoLoad);

renderRegion();
renderDevice();
renderFilterOptions();
if ($('all-apps-search-word')) $('all-apps-search-word').value = textFilter;
syncLocation();
load();
