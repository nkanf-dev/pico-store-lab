// Only fixed categories are sent. No visitor ID, form fields, or full URLs.
(() => {
  if (navigator.doNotTrack === '1' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  const path = location.pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  const pages = { '/':'home', '/apps/vrchat/':'vrchat', '/apps/youtube-vr/':'youtube-vr',
    '/apps/virtual-desktop/':'virtual-desktop', '/guides/install-global-apps/':'guide',
    '/guides/international-sign-in/':'international-sign-in', '/guides/how-adaptation-works/':'adaptation-tech',
    '/download/':'clients', '/about/':'about' };
  const hosts = { google:'google.com', bing:'bing.com', baidu:'baidu.com', bilibili:'bilibili.com',
    douyin:'douyin.com', xiaohongshu:'xiaohongshu.com', chatgpt:'chatgpt.com', perplexity:'perplexity.ai', github:'github.com' };
  let source = 'direct';
  try {
    const previous = sessionStorage.getItem('pico-entry-source');
    if (previous && (previous === 'direct' || previous === 'other' || previous in hosts)) source = previous;
    if (document.referrer) {
      const host = new URL(document.referrer).hostname;
      if (host !== location.hostname) source = Object.entries(hosts).find(([, value]) => host === value || host.endsWith(`.${value}`))?.[0] ?? 'other';
    }
    const campaign = new URL(location.href).searchParams.get('utm_source');
    if (campaign && campaign in hosts) source = campaign;
    sessionStorage.setItem('pico-entry-source', source);
  } catch { /* Measurement is optional. */ }
  window.picoTrack = event => {
    fetch('/api/metrics', { method:'POST', credentials:'omit', keepalive:true,
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ page:pages[path] ?? 'other', source, event }),
    }).catch(() => {});
  };
  window.picoTrack('page_view');
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a');
    if (!link || link.getAttribute('aria-disabled') === 'true') return;
    if (link.id === 'detail-download') window.picoTrack('download_click');
    if (link.id === 'download-apk' || link.id === 'download-direct') window.picoTrack('download_requested');
  });
})();
