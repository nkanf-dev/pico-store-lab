const pages = new Set(['home', 'vrchat', 'youtube-vr', 'guide', 'clients', 'about', 'other']);
const sources = new Set(['direct', 'google', 'bing', 'baidu', 'bilibili', 'douyin', 'xiaohongshu', 'chatgpt', 'perplexity', 'github', 'other']);
const events = new Set(['page_view', 'download_click', 'login_success', 'download_requested']);

export async function recordMetric(request, env) {
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  if (request.method !== 'POST') return new Response(null, { status:405, headers });
  if (request.headers.get('origin') !== new URL(request.url).origin) return new Response(null, { status:403, headers });
  if (request.headers.get('dnt') === '1') return new Response(null, { status:204, headers });
  let body;
  try {
    const text = await request.text();
    if (text.length > 256) return new Response(null, { status:413, headers });
    body = JSON.parse(text);
  } catch { return new Response(null, { status:400, headers }); }
  if (!pages.has(body?.page) || !sources.has(body?.source) || !events.has(body?.event)) return new Response(null, { status:400, headers });
  try {
    await env.DB.prepare(`INSERT INTO discovery_counts (day,page,source,event,count) VALUES (?,?,?,?,1)
      ON CONFLICT(day,page,source,event) DO UPDATE SET count=count+1`)
      .bind(new Date().toISOString().slice(0,10), body.page, body.source, body.event).run();
  } catch { return new Response(null, { status:503, headers }); }
  return new Response(null, { status:204, headers });
}
