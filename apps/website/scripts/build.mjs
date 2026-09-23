import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { apps, guide, signInGuide, adaptationTechGuide, about } from '../content/pages.mjs';
import { githubOwner, repositoryUrl, releasesUrl, releaseDownloadUrl, ownerUrl, websiteOrigin, playerGuideUrl, registerUrl } from '../content/project-links.mjs';
import catalog from '../../../contracts/v1/catalog.json' with { type: 'json' };
import noAdaptation from '../../../contracts/v1/no-adaptation.json' with { type: 'json' };

const origin = websiteOrigin;
const output = new URL('../dist/', import.meta.url);
const source = new URL('../public/', import.meta.url);
const template = (await readFile(new URL('index.html', source), 'utf8'))
  .replaceAll('__STORE_REPOSITORY_URL__', repositoryUrl)
  .replaceAll('__STORE_RELEASES_URL__', releasesUrl)
  .replaceAll('__STORE_PLAYER_GUIDE_URL__', playerGuideUrl)
  .replaceAll('__PICO_REGISTRATION_URL__', registerUrl);
const client = await readFile(new URL('app.js', source), 'utf8');
const translations = JSON.parse(client.match(/const translations = (\{[\s\S]*?\n\});/)[1]);
const media = JSON.parse(await readFile(new URL('../content/app-media.json', import.meta.url), 'utf8'));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const localized = (path, lang) => `${lang === 'en' ? '/en' : ''}${path}`;
const external = (url, label) => `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
const section = (start, end) => template.slice(template.indexOf(start), template.indexOf(end));
const detailTemplate = section('<section id="app-details"', '<section id="downloader"');
const downloaderTemplate = section('<section id="downloader"', '<section id="workflow"');
const workflowTemplate = section('<section id="workflow"', '</main>');
const discoveryTemplate = section('<section id="discovery"', '<section id="app-details"');
const headTemplate = template.slice(template.indexOf('<head>') + 6, template.indexOf('</head>'));

function translate(html, lang) {
  const t = translations[lang === 'en' ? 'en' : 'zh-CN'];
  const copy = { ...t, catalogLabel: lang === 'zh' ? '更多应用' : 'MORE APPS', currentLabel: lang === 'zh' ? '应用详情' : 'APP DETAILS', downloadLabel: lang === 'zh' ? '网页下载' : 'WEB DOWNLOAD', workflowLabel: lang === 'zh' ? '开始使用' : 'GETTING STARTED' };
  return html.replace(/(<[^>]+\bdata-i18n="([^"]+)"[^>]*>)[\s\S]*?(<\/[^>]+>)/g, (_m, start, key, end) => `${start}${escape(copy[key] ?? key)}${end}`)
    .replace(/<[^>]+\bdata-i18n-placeholder="([^"]+)"[^>]*>/g, (tag, key) => tag.replace(/placeholder="[^"]*"/, `placeholder="${escape(t[key])}"`))
    .replace('class="muted">Not signed in</p>', `class="muted">${escape(t.signedOut)}</p>`);
}

function appState(app, lang) {
  const copy = app[lang];
  const noAdaptationReason = noAdaptation.find(rule => rule.packageName === app.packageName)?.reason?.[lang] ?? '';
  return { ...media.find(item => item.itemId === app.itemId), itemId: app.itemId, packageName: app.packageName,
    name: app.name, slug: app.slug, officialUrl: app.officialUrl, publisher: app.publisher,
    price: app.price ?? '0.00', currency: app.currency ?? '',
    summary: copy.summary, description: copy.description, noAdaptationReason,
    supportedPlatforms: copy.platforms.join(' · '), releases: [] };
}

function cards(lang) {
  return `<div class="featured-apps">${catalog.map((item, index) => {
    const app = apps.find(page => page.itemId === item.itemId);
    const state = app ? appState(app, lang) : null;
    const href = app ? localized(`/apps/${app.slug}/`, lang) : `${localized('/', lang)}?itemId=${encodeURIComponent(item.itemId)}&package=${encodeURIComponent(item.packageName)}#app-details`;
    const summary = app?.[lang].summary ?? (lang === 'zh' ? '查看 PICO 版本详情，使用国际区账号下载并安装。' : 'Explore the PICO edition, then download and install with your international account.');
    return `<a class="featured-card" href="${escape(href)}"><div class="card-top"><span class="eyebrow">0${index + 1} / ${lang === 'zh' ? 'PICO 版' : 'PICO EDITION'}</span>${state?.iconUrl ? `<img src="${escape(state.iconUrl)}" width="64" height="64" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</div><h2>${escape(item.name)}</h2><p>${escape(summary)}</p><span class="card-link">${lang === 'zh' ? '查看应用与下载' : 'Explore & download'} <span aria-hidden="true">↗</span></span></a>`;
  }).join('')}</div>`;
}

function masthead(lang, path) {
  const home = localized('/', lang);
  return `<header class="masthead"><a class="brand" href="${home}" aria-label="PICO Store Lab"><span class="brand-mark">P/</span><span>PICO<br>STORE LAB</span></a><nav class="masthead-meta" aria-label="${lang === 'zh' ? '主导航' : 'Main navigation'}"><a href="${home}#catalog">${lang === 'zh' ? '应用' : 'Apps'}</a><a href="${localized('/guides/install-global-apps/', lang)}">${lang === 'zh' ? '安装指南' : 'Guide'}</a><a href="${localized('/download/', lang)}">${lang === 'zh' ? '客户端' : 'Clients'}</a><a id="language" class="language" href="${localized(path, lang === 'zh' ? 'en' : 'zh')}" lang="${lang === 'zh' ? 'en' : 'zh-CN'}">${lang === 'zh' ? 'EN' : '中文'}</a></nav></header>`;
}

function footer(lang) {
  return `<footer><span>PICO STORE LAB / OPEN SOURCE</span><nav><a href="${localized('/about/', lang)}">${lang === 'zh' ? '关于项目' : 'About'}</a> · ${external(repositoryUrl, 'GitHub')}</nav><span>${lang === 'zh' ? '由社区维护，与 PICO 官方无关联。' : 'A community project, independent of PICO.'}</span></footer>`;
}

function steps(steps) {
  return `<ol class="guide-steps">${steps.map(step => `<li><strong>${escape(typeof step === 'string' ? step : step.title)}</strong>${typeof step === 'string' ? '' : `<p>${escape(step.text)}</p>`}</li>`).join('')}</ol>`;
}

function reading(copy, lang) {
  return `<div class="guide-layout"><nav class="guide-toc" aria-label="${lang === 'zh' ? '本页内容' : 'On this page'}">${copy.sections.map((section, index) => `<a href="#${escape(section.id)}"><span>0${index + 1}</span>${escape(section.title)}</a>`).join('')}</nav><div class="guide-body">${copy.sections.map(section => `<section id="${escape(section.id)}"><h2>${escape(section.title)}</h2>${(section.paragraphs ?? []).map(p => `<p>${escape(p)}</p>`).join('')}${section.steps?.length ? steps(section.steps) : ''}${section.links?.length ? `<div class="reading-links">${section.links.map(link => external(link.url, link.label)).join('')}</div>` : ''}</section>`).join('')}</div></div>`;
}

function appDetails(app, lang) {
  const state = appState(app, lang);
  let html = detailTemplate.replace('<h2 id="release-heading">—</h2>', `<h1 id="release-heading">${escape(app.name)}</h1>`)
    .replace('<p id="app-summary" class="app-summary"></p>', `<p id="app-summary" class="app-summary">${escape(state.summary)}</p>`)
    .replace('<p id="adaptation-note" class="adaptation-note" hidden></p>',
      state.noAdaptationReason ? `<p id="adaptation-note" class="adaptation-note">${lang === 'zh' ? '无需登录适配：' : 'No sign-in adaptation needed: '}${escape(state.noAdaptationReason)}</p>` : '<p id="adaptation-note" class="adaptation-note" hidden></p>')
    .replace('<p id="app-publisher" class="app-publisher"></p>', `<p id="app-publisher" class="app-publisher">${escape(state.publisher)} / PICO</p>`)
    .replace('<div id="app-about" hidden>', '<div id="app-about">')
    .replace('<div id="app-description" class="app-description"></div>', `<div id="app-description" class="app-description">${escape(state.description)}</div>`)
    .replace('<dl id="app-facts" class="app-facts"></dl>', `<dl id="app-facts" class="app-facts"><div><dt>${lang === 'zh' ? '支持设备' : 'Devices'}</dt><dd>${escape(state.supportedPlatforms)}</dd></div></dl>`)
    .replace('href="https://store-global.picoxr.com/global"', `href="${escape(app.officialUrl)}"`);
  if (state.coverUrl) html = html.replace('id="app-cover-frame" class="app-cover-frame" hidden', 'id="app-cover-frame" class="app-cover-frame"')
    .replace('id="app-cover" alt="" loading="lazy"', `id="app-cover" src="${escape(state.coverUrl)}" alt="${escape(app.name)}" fetchpriority="high"`);
  if (state.iconUrl) html = html.replace('id="app-icon" alt="" width="72" height="72" hidden', `id="app-icon" src="${escape(state.iconUrl)}" alt="" width="72" height="72"`);
  return html;
}

function appGuide(app, lang) {
  const copy = app[lang];
  const adaptationLink = noAdaptation.some(rule => rule.packageName === app.packageName) ? '' : ` · <a class="text-link" href="${localized('/guides/international-sign-in/', lang)}">${lang === 'zh' ? '国际区登录适配' : 'International sign-in adaptation'} ↗</a>`;
  return `<section class="app-guide"><div class="reading-heading"><p class="eyebrow">${lang === 'zh' ? '下载与安装' : 'DOWNLOAD & INSTALL'}</p><h2>${lang === 'zh' ? '从这里开始，一步步装好。' : 'Get it onto your headset.'}</h2></div>${steps(copy.steps)}<a class="text-link" href="${localized('/guides/install-global-apps/', lang)}">${lang === 'zh' ? '查看完整安装指南' : 'Read the installation guide'} ↗</a>${adaptationLink}<div class="faq">${copy.faq.map(item => `<details><summary>${escape(item.q)}</summary><p>${escape(item.a)}</p></details>`).join('')}</div><p class="source-links">${app.sources.map(link => external(link.url, link.label)).join(' · ')}</p></section>`;
}

function appDownloadNotice(app, lang) {
  const notice = app[lang].downloadNotice;
  if (!notice) return '';
  return `<aside class="adapted-download-notice" aria-labelledby="adapted-download-heading"><div><p class="eyebrow">${lang === 'zh' ? '下载方式提醒' : 'DOWNLOAD OPTIONS'}</p><h2 id="adapted-download-heading">${escape(notice.title)}</h2><p>${escape(notice.text)}</p></div><div class="adapted-download-actions"><a class="action primary" href="${localized('/download/', lang)}">${escape(notice.clientLabel)} ↗</a><a class="text-link" href="#downloader">${escape(notice.originalLabel)} ↓</a></div></aside>`;
}

const records = [];
async function page({ path, lang, title, description, body, app, interactive = false, type = 'WebPage' }) {
  const pathname = localized(path, lang);
  const canonical = `${origin}${pathname}`;
  const ogImage = `${origin}/social-cover.png`;
  const structured = [
    { '@context':'https://schema.org', '@type':type, '@id':`${canonical}#page`, name:title, description, url:canonical,
      inLanguage:lang === 'zh' ? 'zh-CN' : 'en', isPartOf:{ '@id':`${origin}/#website` },
      ...(app ? { about:{ '@type':'SoftwareApplication', name:app.name, operatingSystem:'PICO OS', applicationCategory:app.slug === 'vrchat' ? 'GameApplication' : 'MultimediaApplication', url:app.officialUrl, publisher:{ '@type':'Organization', name:app.publisher } } } : {}) },
    { '@context':'https://schema.org', '@type':'WebSite', '@id':`${origin}/#website`, name:'PICO Store Lab', url:origin,
      inLanguage:['zh-CN','en'], publisher:{ '@type':'Person', name:githubOwner, url:ownerUrl } },
  ];
  if (path !== '/') structured.push({ '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[
    { '@type':'ListItem', position:1, name:lang === 'zh' ? '首页' : 'Home', item:`${origin}${localized('/', lang)}` },
    { '@type':'ListItem', position:2, name:app?.name ?? title, item:canonical },
  ] });
  let head = headTemplate.replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escape(description)}">`)
    .replace('<script type="module" src="/app.js"></script>', interactive ? '<script type="module" src="/app.js"></script>' : '');
  head += `<script defer src="/metrics.js"></script><link rel="stylesheet" href="/pages.css"><link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="zh-CN" href="${origin}${path}"><link rel="alternate" hreflang="en" href="${origin}/en${path}"><link rel="alternate" hreflang="x-default" href="${origin}${path}">
<meta property="og:type" content="website"><meta property="og:site_name" content="PICO Store Lab"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${canonical}"><meta property="og:locale" content="${lang === 'zh' ? 'zh_CN' : 'en_US'}"><meta property="og:image" content="${ogImage}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${json(structured)}</script>`;
  const initialCatalog = catalog.map(item => { const known = apps.find(app => app.itemId === item.itemId); return { ...item, ...(known ? { state:appState(known, lang) } : {}) }; });
  const html = `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : 'en'}" data-seo="true" data-page="${app ? 'app' : path === '/' ? 'home' : 'reading'}"${app ? ` data-item-id="${app.itemId}"` : ''}><head>${head}</head><body class="${app ? 'page-app' : path === '/' ? 'page-home' : 'page-reading'}"><a class="skip-link" href="#main">${lang === 'zh' ? '跳至正文' : 'Skip to content'}</a><div class="shell">${masthead(lang, path)}<main id="main">${translate(body, lang)}</main>${footer(lang)}</div>${interactive ? `<script type="application/json" id="catalog-data">${json(initialCatalog)}</script>` : ''}</body></html>`;
  const destination = new URL(`.${pathname}index.html`, output);
  await mkdir(new URL('./', destination), { recursive:true });
  await writeFile(destination, html);
  records.push({ path:pathname, hash:createHash('sha256').update(html).digest('hex') });
}

await rm(output, { recursive:true, force:true });
await mkdir(output, { recursive:true });
await cp(source, output, { recursive:true });

for (const lang of ['zh', 'en']) {
  const zh = lang === 'zh';
  const hero = `<section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="indicator"></span>PICO STORE LAB</p><h1>${zh ? '在国区 PICO 上，<br><em>找到你想用的应用。</em>' : 'Your PICO.<br><em>More to explore.</em>'}</h1><p class="intro">${zh ? '查找 PICO 应用，用自己的国际区账号下载；需要 PICO 账号的应用还能选择国际区登录适配。' : 'Find PICO apps and download with your international account. Choose sign-in adaptation for apps that use PICO accounts.'}</p><div class="hero-actions"><a class="action primary" href="#catalog">${zh ? '选择应用' : 'Explore apps'} ↓</a><a id="guide-link" class="action secondary" href="${localized('/guides/international-sign-in/', lang)}">${zh ? '了解国际区登录适配' : 'International sign-in'} ↗</a></div></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="hero-glyph">P<span>/</span></div><div class="art-caption">PICO APPS<br>INTERNATIONAL SIGN-IN</div></div></section>`;
  const featured = `<section id="catalog" class="section-head"><span>${zh ? '推荐应用' : 'FEATURED APPS'}</span><span>01 / APPS</span></section>${cards(lang)}`;
  const discovery = discoveryTemplate.replace('id="catalog"', 'id="more-apps"');
  const workflow = workflowTemplate.replaceAll(playerGuideUrl, localized('/guides/install-global-apps/', lang))
    .replaceAll(releasesUrl, localized('/download/', lang));
  await page({ path:'/', lang, title:zh ? 'PICO 国际区应用下载与安装指南 | PICO Store Lab' : 'PICO apps, downloads & installation | PICO Store Lab',
    description:zh ? '在国区 PICO 上查找应用的 PICO 版本，使用自己的 PICO 国际区账号下载并安装。' : 'Browse PICO apps, then download and install with your international account.',
    body:hero + featured + discovery + detailTemplate + downloaderTemplate + workflow, interactive:true });
  for (const app of apps) {
    const breadcrumb = `<nav class="breadcrumbs"><a href="${localized('/', lang)}">${zh ? '应用' : 'Apps'}</a><span>/</span><span>${escape(app.name)}</span></nav>`;
    // Keep the existing search/favorites controls available without moving them above the selected app.
    const discovery = `<div class="secondary-discovery">${discoveryTemplate.replace('id="catalog"', 'id="more-apps"')}</div>`;
    await page({ path:`/apps/${app.slug}/`, lang, app, interactive:true,
      title:`${app.name} ${zh ? 'PICO 版下载与安装指南' : 'for PICO — download & install'} | PICO Store Lab`,
      description:app[lang].summary + (zh ? ' 查看支持设备、国际账号注册和国区头显安装步骤。' : ' Find device information, account setup and installation steps.'),
      body:breadcrumb + appDetails(app, lang) + appDownloadNotice(app, lang) + downloaderTemplate + appGuide(app, lang) + discovery + workflow });
  }
  const guideCopy = guide[lang];
  await page({ path:'/guides/install-global-apps/', lang, title:`${guideCopy.title} | PICO Store Lab`, description:guideCopy.description,
    body:`<header class="reading-hero"><p class="eyebrow">${zh ? '安装指南' : 'PLAYER GUIDE'}</p><h1>${escape(guideCopy.title)}</h1><p>${escape(guideCopy.description)}</p><a class="action primary" href="${localized('/', lang)}#catalog">${zh ? '去选一款应用' : 'Choose an app'} ↗</a></header>${reading(guideCopy, lang)}<section class="related-apps"><h2>${zh ? '想先装哪一款？' : 'Where would you like to start?'}</h2>${cards(lang)}</section>` });
  const signInCopy = signInGuide[lang];
  await page({ path:'/guides/international-sign-in/', lang, title:`${signInCopy.title} | PICO Store Lab`, description:signInCopy.description,
    body:`<header class="reading-hero"><p class="eyebrow">${zh ? '国际区登录适配' : 'INTERNATIONAL SIGN-IN'}</p><h1>${escape(signInCopy.title)}</h1><p>${escape(signInCopy.description)}</p><a class="action primary" href="${localized('/download/', lang)}">${zh ? '下载头显客户端' : 'Get the headset app'} ↗</a></header>${reading(signInCopy, lang)}<section class="related-apps"><h2>${zh ? '选择应用' : 'Choose an app'}</h2>${cards(lang)}</section>` });
  const techCopy = adaptationTechGuide[lang];
  await page({ path:'/guides/how-adaptation-works/', lang, title:`${techCopy.title} | PICO Store Lab`, description:techCopy.description,
    body:`<header class="reading-hero"><p class="eyebrow">${zh ? '技术原理' : 'HOW IT WORKS'}</p><h1>${escape(techCopy.title)}</h1><p>${escape(techCopy.description)}</p><a class="action primary" href="${localized('/guides/international-sign-in/', lang)}">${zh ? '查看使用指南' : 'Read the user guide'} ↗</a></header>${reading(techCopy, lang)}` });
  const releases = releaseDownloadUrl;
  const clientBody = `<header class="reading-hero"><p class="eyebrow">PICO STORE LAB</p><h1>${zh ? '选一个顺手的<br>下载方式。' : 'Choose how<br>you download.'}</h1><p>${zh ? '偶尔下载，打开网页就够了。常用的话，也可以装到头显或电脑上。' : 'Use the website for a quick download, or keep the app on your headset or computer.'}</p><a class="action primary" href="${localized('/', lang)}#catalog">${zh ? '直接在网页下载' : 'Use the website'} ↗</a></header><div class="client-grid"><section><span class="eyebrow">01 / PICO</span><h2>${zh ? '在头显上' : 'On your headset'}</h2><p>${zh ? '安装一次 PICO Store Lab，之后在头显里搜索、下载和安装应用。' : 'Install PICO Store Lab once, then find, download and install apps on your headset.'}</p><p class="client-adaptation-note">${zh ? '头显客户端可以下载并安装国际区登录适配版；网页下载的是原版 APK。' : 'The headset app can download and install an international sign-in adapted copy. The website downloads the original APK.'}</p><a class="action primary" href="${releases}pico-store-android.apk">${zh ? '下载 Android APK' : 'Download Android APK'} ↓</a><a class="text-link" href="${localized('/guides/install-global-apps/', lang)}#headset-install">${zh ? '安装方法' : 'Installation guide'} ↗</a></section>${[['Windows','windows','exe'],['macOS','macos','dmg'],['Linux','linux','AppImage']].map(([name,platform,ext],index) => `<section><span class="eyebrow">0${index + 2} / DESKTOP</span><h2>${name}</h2><p>${zh ? '在电脑上查找应用，下载后安装到头显。' : 'Find apps on your computer, then install your downloads on the headset.'}</p><div class="client-actions"><a class="action secondary" href="${releases}pico-store-desktop-${platform}-x64.${ext}">${name === 'macOS' ? 'Intel' : 'x64'} ↓</a><a class="action secondary" href="${releases}pico-store-desktop-${platform}-arm64.${ext}">${name === 'macOS' ? 'Apple silicon' : 'ARM64'} ↓</a></div></section>`).join('')}</div>`;
  await page({ path:'/download/', lang, title:zh ? '下载 PICO Store Lab 客户端 | Android、Windows、macOS、Linux' : 'Download PICO Store Lab | Android, Windows, macOS & Linux', description:zh ? '下载 PICO Store Lab，在 PICO 头显或电脑上查找、下载应用。也可以直接使用网页。' : 'Get PICO Store Lab for your headset or computer, or download apps directly on the website.', body:clientBody });
  const aboutCopy = about[lang];
  await page({ path:'/about/', lang, title:`${aboutCopy.title} | PICO Store Lab`, description:aboutCopy.description,
    body:`<header class="reading-hero"><p class="eyebrow">ABOUT / PICO STORE LAB</p><h1>${escape(aboutCopy.title)}</h1><p>${escape(aboutCopy.description)}</p></header>${reading(aboutCopy, lang)}` });
}

await writeFile(new URL('sitemap.xml', output), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${records.map(page => `<url><loc>${origin}${page.path}</loc></url>`).join('')}</urlset>\n`);
await writeFile(new URL('robots.txt', output), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(new URL('404.html', output), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>页面未找到 | PICO Store Lab</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/pages.css"></head><body><main class="reading-hero"><p class="eyebrow">404 / PICO STORE LAB</p><h1>这个页面没有找到。</h1><p>回到首页，找找你想下载的应用。</p><a class="action primary" href="/">回到首页 ↗</a></main></body></html>`);
await mkdir(new URL('../.local/', output), { recursive:true });
await writeFile(new URL('../.local/page-manifest.json', output), JSON.stringify(records, null, 2) + '\n');
console.log(`Built ${records.length} public pages in apps/website/dist`);
