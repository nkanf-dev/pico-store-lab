(() => {
  const cache = new Map();

  function region() {
    const value = new URLSearchParams(location.search).get('region');
    if (value === 'cn' || value === 'global') return value;
    return localStorage.getItem('pico-store-region') === 'cn' ? 'cn' : 'global';
  }

  function device() {
    const value = new URLSearchParams(location.search).get('device');
    return value || localStorage.getItem('pico-store-device') || 'A9210';
  }

  function key(itemId, regionValue = region()) {
    return `${regionValue}|${itemId}`;
  }

  function apply(itemId, url) {
    for (const image of document.querySelectorAll(`img[data-pico-icon="${CSS.escape(String(itemId))}"]`)) {
      if (image.src !== url) image.src = url;
    }
  }

  async function request(entries, regionValue, deviceValue) {
    const items = entries.map(([itemId, packageName]) => `${itemId}:${packageName}`).join(',');
    const query = new URLSearchParams({ region: regionValue, device: deviceValue, items });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`/api/icons?${query}`, { signal: controller.signal });
      if (!response.ok) return {};
      const payload = await response.json();
      return payload.icons && typeof payload.icons === 'object' ? payload.icons : {};
    } catch {
      return {};
    } finally {
      clearTimeout(timer);
    }
  }

  // Resolve every item's detail-page app icon before the caller renders a list.
  // Returns after the batch lookups settle (or time out) so the first paint
  // already uses the detail icon instead of the square cover art.
  async function resolve(items) {
    const regionValue = region();
    const deviceValue = device();
    const pending = new Map();
    for (const item of items || []) {
      if (!item?.itemId || !item.packageName) continue;
      const cached = cache.get(key(item.itemId, regionValue));
      if (cached) {
        apply(item.itemId, cached);
        continue;
      }
      pending.set(String(item.itemId), item.packageName);
    }
    const entries = [...pending.entries()];
    for (let index = 0; index < entries.length; index += 50) {
      const chunk = entries.slice(index, index + 50);
      const icons = await request(chunk, regionValue, deviceValue);
      for (const [itemId, url] of Object.entries(icons)) {
        if (typeof url !== 'string' || !url) continue;
        cache.set(key(itemId, regionValue), url);
        apply(itemId, url);
      }
    }
    return cache;
  }

  // Static cards (built into the HTML) start hidden until their detail icon is
  // resolved, so the square cover never flashes before the real icon.
  async function scan() {
    const images = [...document.querySelectorAll('img[data-pico-icon][data-pico-package]')];
    if (!images.length) return;
    await resolve(images.map(image => ({
      itemId: image.dataset.picoIcon,
      packageName: image.dataset.picoPackage,
    })));
    for (const image of images) image.dataset.picoReady = 'true';
  }

  window.PicoStoreIcons = {
    url(item) {
      return cache.get(key(item?.itemId)) || item?.iconUrl || '';
    },
    resolve,
    // Fire-and-forget fallback for places that upgrade an already-rendered list.
    upgrade: items => { resolve(items); },
    scan,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(scan, 0), { once: true });
  } else {
    setTimeout(scan, 0);
  }
})();
