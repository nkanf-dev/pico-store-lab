const $ = id => document.getElementById(id);

const copy = {
  en: {
    loading: 'Loading the store catalog…',
    loaded: 'Showing {start}–{end} of {total}',
    empty: 'No apps match these filters.',
    catalogScope: 'This list contains PICO 4 Ultra compatible apps only. Apps made for other headsets are available through Search.',
    failed: 'Could not load the app list. Please try again.',
    searchStore: 'Search the store for “{query}”',
    free: 'Free',
    version: 'Version',
    category: 'Category',
    rating: 'Rating',
    price: 'Price',
    updated: 'Updated',
    app: 'App / publisher',
    previous: '← Previous',
    next: 'Next →',
    allCategories: 'All categories',
  },
  'zh-CN': {
    loading: '正在拉取商店目录…',
    loaded: '显示 {start}–{end} / 共 {total} 款',
    empty: '没有符合筛选条件的应用。',
    catalogScope: '本列表只包含 PICO 4 Ultra 可用的应用；其他设备专用的应用请用搜索查找。',
    failed: '无法加载应用列表，请稍后重试。',
    searchStore: '在商店搜索「{query}」',
    free: '免费',
    version: '版本',
    category: '分类',
    rating: '评分',
    price: '价格',
    updated: '更新',
    app: '应用 / 发行商',
    previous: '← 上一页',
    next: '下一页 →',
    allCategories: '全部分类',
  },
};

const locale = document.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en';
const t = (key, vars = {}) => (copy[locale][key] ?? copy.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const params = new URLSearchParams(location.search);
let region = params.get('region') === 'cn' ? 'cn'
  : params.get('region') === 'global' ? 'global'
    : localStorage.getItem('pico-store-region') === 'global' ? 'global'
      : localStorage.getItem('pico-store-region') === 'cn' ? 'cn'
        : locale === 'zh-CN' ? 'cn' : 'global';
const PAGE_SIZE = 24;

let apps = [];
let catalog = [];
try { catalog = JSON.parse(document.getElementById('catalog-data')?.textContent || '[]'); } catch { catalog = []; }
if (!Array.isArray(catalog)) catalog = [];
const slugs = Object.fromEntries(catalog.filter(item => item.state?.slug).map(item => [item.itemId, item.state.slug]));
let loaded = false;
let loading = false;
let page = 1;
let query = '';
let category = 'all';
let price = 'all';
let sort = 'comprehensive';

function safeImage(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : null;
  } catch { return null; }
}

function genreList(value) {
  return String(value ?? '').split(/[,、·:：]/).map(part => part.trim()).filter(Boolean);
}

function priceNumber(item) {
  const value = String(item.price ?? '').trim();
  if (!value) return Infinity;
  const number = Number(value);
  return Number.isFinite(number) ? number : Infinity;
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
  // A few storefront rows expose only an internal asset code; it is not a
  // human-readable release version, so keep the table clean instead.
  return Number.isSafeInteger(code) && code > 0 && code < 1000000 ? `v${code}` : '—';
}

function comprehensiveValue(item) {
  const score = typeof item.score === 'number' && Number.isFinite(item.score) ? item.score / 5 : 0;
  const now = Date.now() / 1000;
  const age = item.updatedAt ? Math.max(0, now - item.updatedAt) : 365 * 86400;
  const freshness = Math.max(0, Math.min(1, 1 - age / (365 * 86400)));
  return score * 0.65 + freshness * 0.35;
}

function compare(a, b, key) {
  if (key === 'rating') return (b.score ?? -1) - (a.score ?? -1) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  if (key === 'price_asc') return priceNumber(a) - priceNumber(b) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  if (key === 'price_desc') return priceNumber(b) - priceNumber(a) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  if (key === 'updated') return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  return comprehensiveValue(b) - comprehensiveValue(a) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
}

function filtered() {
  const needle = query.trim().toLocaleLowerCase(locale);
  return apps.filter(item => {
    if (category !== 'all' && !genreList(item.genres).includes(category)) return false;
    const amount = priceNumber(item);
    if (price === 'free' && amount !== 0) return false;
    if (price === 'paid' && (!Number.isFinite(amount) || amount <= 0)) return false;
    if (!needle) return true;
    return [item.name, item.publisher, item.genres].some(value => String(value ?? '').toLocaleLowerCase(locale).includes(needle));
  }).sort((a, b) => compare(a, b, sort));
}

function buildCategories() {
  const select = $('all-apps-category');
  const counts = new Map();
  for (const item of apps) for (const genre of genreList(item.genres)) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  const options = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], locale));
  select.replaceChildren();
  const all = document.createElement('option');
  all.value = 'all'; all.textContent = t('allCategories'); select.append(all);
  for (const [name, count] of options) {
    const option = document.createElement('option');
    option.value = name; option.textContent = `${name} (${count})`; select.append(option);
  }
  select.value = category;
}

function el(tag, className, text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function renderRows(items) {
  const container = $('all-apps-results');
  container.replaceChildren();
  if (!items.length) {
    const empty = el('p', 'store-empty', t('empty'));
    container.append(empty);
    if (query.trim()) {
      const scope = el('p', 'store-note', t('catalogScope'));
      container.append(scope);
      const link = el('a', 'store-empty-link', t('searchStore', { query: query.trim() }));
      const base = locale === 'en' ? '/en' : '';
      const target = new URL(`${base}/search/`, location.origin);
      target.searchParams.set('q', query.trim());
      target.searchParams.set('region', region);
      link.href = target;
      container.append(link);
    }
    $('all-apps-status').textContent = '0 / 0';
    $('all-apps-pagination').hidden = true;
    return;
  }
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);
  const head = el('div', 'store-row store-row-head');
  for (const label of [t('app'), t('version'), t('category'), t('rating'), t('price'), t('updated'), '']) head.append(el('span', '', label));
  container.append(head);

  pageItems.forEach((item, index) => {
    const row = document.createElement('a');
    row.className = 'store-row';
    const base = locale === 'en' ? '/en' : '';
    const slug = slugs[item.itemId];
    if (slug) {
      const curated = new URL(`${base}/apps/${slug}/`, location.origin);
      curated.searchParams.set('region', region);
      curated.searchParams.set('from', 'all-apps');
      row.href = curated.href;
    } else {
      const detail = new URL(`${base}/app/`, location.origin);
      detail.searchParams.set('itemId', item.itemId);
      detail.searchParams.set('package', item.packageName);
      detail.searchParams.set('region', region);
      detail.searchParams.set('from', 'all-apps');
      row.href = detail.href;
    }

    const main = el('span', 'store-main');
    const art = el('span', 'store-art');
    const icon = safeImage(item.iconUrl);
    if (icon) {
      const image = document.createElement('img');
      image.src = icon; image.alt = '';
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

    row.append(main, el('span', 'store-version', versionLabel(item)),
      el('span', 'store-category', genreList(item.genres).join(' · ') || '—'),
      el('span', 'store-rating', typeof item.score === 'number' && Number.isFinite(item.score) ? `★ ${item.score.toFixed(1)}` : '—'),
      el('span', 'store-price', priceLabel(item)),
      el('span', 'store-updated', item.updatedAt ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(item.updatedAt * 1000)) : '—'),
      el('span', 'store-arrow', '↗'));
    container.append(row);
  });
  const status = $('all-apps-status');
  status.textContent = t('loaded', { start: start + 1, end: Math.min(start + PAGE_SIZE, items.length), total: items.length });
  $('all-apps-page').textContent = `${page} / ${Math.max(1, Math.ceil(items.length / PAGE_SIZE))}`;
  $('all-apps-prev').disabled = page <= 1;
  $('all-apps-next').disabled = page >= Math.max(1, Math.ceil(items.length / PAGE_SIZE));
}

function render() {
  if (!loaded) return;
  const items = filtered();
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  page = Math.min(Math.max(1, page), totalPages);
  $('all-apps-results').hidden = false;
  $('all-apps-pagination').hidden = totalPages <= 1;
  renderRows(items);
}

async function load() {
  if (loading) return;
  loading = true;
  $('all-apps-status').textContent = t('loading');
  try {
    const response = await fetch(`/api/apps?region=${region}&sort=updated&lang=${locale === 'zh-CN' ? 'zh' : 'en'}`);
    if (!response.ok) throw new Error('apps unavailable');
    const payload = await response.json();
    apps = Array.isArray(payload.items) ? payload.items : [];
    loaded = true;
    page = 1;
    $('all-apps-count').textContent = String(apps.length);
    buildCategories();
    render();
  } catch {
    loaded = false;
    apps = [];
    $('all-apps-count').textContent = '—';
    $('all-apps-results').hidden = true;
    $('all-apps-pagination').hidden = true;
    $('all-apps-status').textContent = t('failed');
  } finally {
    loading = false;
  }
}

function resetFilters({ keepQuery = false } = {}) {
  page = 1;
  sort = 'comprehensive';
  $('all-apps-sort').value = sort;
  if (!keepQuery) { query = ''; $('all-apps-query').value = ''; }
  category = 'all';
  $('all-apps-category').value = category;
  price = 'all';
  $('all-apps-price').value = price;
}

$('all-apps-query').addEventListener('input', () => { query = $('all-apps-query').value; page = 1; render(); });
$('all-apps-category').addEventListener('change', () => { category = $('all-apps-category').value; page = 1; render(); });
$('all-apps-price').addEventListener('change', () => { price = $('all-apps-price').value; page = 1; render(); });
$('all-apps-sort').addEventListener('change', () => { sort = $('all-apps-sort').value; page = 1; render(); });
$('all-apps-prev').addEventListener('click', () => { if (page > 1) { page -= 1; render(); } });
$('all-apps-next').addEventListener('click', () => { page += 1; render(); });

for (const [id, value] of [['region-global', 'global'], ['region-cn', 'cn']]) {
  $(id)?.addEventListener('click', () => {
    if (region === value) return;
    region = value;
    localStorage.setItem('pico-store-region', region);
    for (const [buttonId, buttonValue] of [['region-global', 'global'], ['region-cn', 'cn']]) {
      $(buttonId)?.setAttribute('aria-selected', String(region === buttonValue));
      $(buttonId)?.classList.toggle('active', region === buttonValue);
    }
    page = 1; loaded = false; apps = [];
    $('all-apps-results').hidden = true;
    $('all-apps-pagination').hidden = true;
    resetFilters({ keepQuery: true });
    load();
  });
}

// Set the initial region state and start the crawl immediately.
for (const [id, value] of [['region-global', 'global'], ['region-cn', 'cn']]) {
  $(id)?.setAttribute('aria-selected', String(region === value));
  $(id)?.classList.toggle('active', region === value);
}
load();
