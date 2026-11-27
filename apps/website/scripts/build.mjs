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
const buildId = createHash('sha256').update(client).digest('hex').slice(0, 12);
const translations = JSON.parse(client.match(/const translations = (\{[\s\S]*?\n\});/)[1]);
const media = JSON.parse(await readFile(new URL('../content/app-media.json', import.meta.url), 'utf8'));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const localized = (path, lang) => `${lang === 'en' ? '/en' : ''}${path}`;
const external = (url, label) => `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
function pageEyebrow(lang, zhLabel, enLabel) {
  return `<p class="eyebrow"><span class="indicator"></span>PICO STORE LAB / ${lang === 'zh' ? zhLabel : enLabel}</p>`;
}
const section = (start, end) => template.slice(template.indexOf(start), template.indexOf(end));
const detailTemplate = section('<section id="app-details"', '<section id="downloader"');
const downloaderTemplate = section('<section id="downloader"', '<section id="workflow"');
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

const CN_HOME_APPS = {
  jigspace: {
    itemId: '7677488165888163845', packageName: 'com.JigSpace.JigViewer', name: 'JigSpace', nameEn: 'JigSpace',
    iconUrl: 'https://static.appstore.picovr.com/developer-platform/submission/assets/cover_art/square/2026-08-26/aadd4ac1f2603eb6d7082bf7126c9b1f.jpg',
    summary: {
      zh: '把 3D 模型和步骤说明放进空间里，适合演示、教学和产品讲解。',
      en: 'Bring 3D models and step-by-step instructions into your space for demos and lessons.',
    },
  },
  picoTv: {
    itemId: '7633313726493491206', packageName: 'com.ss.android.picotv', name: 'PICO TV', nameEn: 'PICO TV',
    iconUrl: 'https://static.appstore.picovr.com/developer-platform/submission/assets/cover_art/square/2026-05-18/e73dea24a67d41820d3eab194ca15d08.png',
    summary: {
      zh: 'PICO Space Pro 上的视频入口，聚合影视、音乐和直播内容。',
      en: 'The video hub on PICO Space Pro, bringing films, music and live content together.',
    },
  },
  picoVideo: {
    itemId: '3159', packageName: 'com.ss.android.ttvr', name: 'PICO 视频', nameEn: 'PICO Video',
    iconUrl: 'https://static.appstore.picovr.com/developer-platform/submission/assets/cover_art/square/2024-05-13/7fcdacf67faa451b92b6d744486976ad.png',
    summary: {
      zh: '在 PICO 头显里看电影、剧集和全景视频。',
      en: 'Watch films, series and panoramic videos on your PICO headset.',
    },
  },
  wps: {
    itemId: '7699788148594950180', packageName: 'cn.wps.moffice_eng', name: 'WPS Office', nameEn: 'WPS Office',
    iconUrl: 'https://static.appstore.picovr.com/developer-platform/submission/assets/cover_art/square/2026-10-27/c73382f42cc55114a7d94e67a0e88718.jpg',
    summary: {
      zh: '在空间里查看、编辑文档，做演示和扫描，把办公桌带进 VR。',
      en: 'View and edit documents, present and scan in VR, with your workspace in space.',
    },
  },
};

function cnFeaturedCard(item, index, lang, variant = '') {
  const href = `${localized('/app/', lang)}?itemId=${encodeURIComponent(item.itemId)}&package=${encodeURIComponent(item.packageName)}&region=cn&from=home`;
  const name = lang === 'zh' ? item.name : item.nameEn;
  const summary = item.summary[lang];
  const variantAttr = variant ? ` data-cn-featured="${variant}"` : '';
  return `<a class="featured-card"${variantAttr} href="${escape(href)}"><div class="card-top"><span class="eyebrow">0${index + 1} / ${lang === 'zh' ? '国区' : 'CHINA'}</span><img src="${escape(item.iconUrl)}" width="64" height="64" alt="" data-pico-pending data-pico-icon="${escape(item.itemId)}" data-pico-package="${escape(item.packageName)}"></div><h2>${escape(name)}</h2><p>${escape(summary)}</p><span class="card-link">${lang === 'zh' ? '查看应用与下载' : 'Explore & download'} <span aria-hidden="true">↗</span></span></a>`;
}

function cards(lang, region = 'global') {
  if (region === 'cn') {
    const cn = CN_HOME_APPS;
    return `<div class="featured-apps">${cnFeaturedCard(cn.jigspace, 0, lang)}${cnFeaturedCard(cn.picoTv, 1, lang, 'space')}${cnFeaturedCard(cn.picoVideo, 1, lang, 'other')}${cnFeaturedCard(cn.wps, 2, lang)}</div>`;
  }
  return `<div class="featured-apps">${catalog.map((item, index) => {
    const app = apps.find(page => page.itemId === item.itemId);
    const state = app ? appState(app, lang) : null;
    const href = app ? localized(`/apps/${app.slug}/`, lang) : `${localized('/', lang)}?itemId=${encodeURIComponent(item.itemId)}&package=${encodeURIComponent(item.packageName)}#app-details`;
    const summary = app?.[lang].summary ?? (lang === 'zh' ? '查看 PICO 版本详情，使用国际区账号下载并安装。' : 'Explore the PICO edition, then download and install with your international account.');
    return `<a class="featured-card" href="${escape(href)}"><div class="card-top"><span class="eyebrow">0${index + 1} / ${lang === 'zh' ? 'PICO 版' : 'PICO EDITION'}</span>${state?.iconUrl ? `<img src="${escape(state.iconUrl)}" width="64" height="64" alt="" data-pico-pending data-pico-icon="${escape(item.itemId)}" data-pico-package="${escape(item.packageName)}">` : ''}</div><h2>${escape(item.name)}</h2><p>${escape(summary)}</p><span class="card-link">${lang === 'zh' ? '查看应用与下载' : 'Explore & download'} <span aria-hidden="true">↗</span></span></a>`;
  }).join('')}</div>`;
}

const DEVICE_OPTIONS = [
  { code: 'B3110', name: 'PICO Space Pro' },
  { code: 'A9210', name: 'PICO 4 Ultra' },
  { code: 'A8A10', name: 'PICO 4 Pro' },
  { code: 'A8110', name: 'PICO 4' },
  { code: 'A7H10', name: 'PICO Neo3' },
];

const CATEGORY_OPTIONS = [
  { key: 'sports', zh: '运动', en: 'Sports' },
  { key: 'simulation', zh: '模拟', en: 'Simulation' },
  { key: 'action', zh: '动作', en: 'Action' },
  { key: 'shooter', zh: '射击', en: 'Shooting' },
  { key: 'adventure', zh: '冒险', en: 'Adventure' },
  { key: 'puzzle', zh: '解谜', en: 'Puzzle' },
  { key: 'casual', zh: '休闲', en: 'Casual' },
  { key: 'relax', zh: '放松', en: 'Relaxation' },
  { key: 'space', zh: '太空', en: 'Space' },
  { key: 'explore', zh: '探索', en: 'Explore' },
  { key: 'role', zh: '角色', en: 'Role' },
  { key: 'play', zh: '扮演', en: 'Play' },
  { key: 'strategy', zh: '策略', en: 'Strategy' },
  { key: 'racing', zh: '竞速', en: 'Racing' },
  { key: 'cartoon', zh: '卡通', en: 'Cartoon' },
  { key: 'scifi', zh: '科幻', en: 'Sci-fi' },
  { key: 'horror', zh: '恐怖', en: 'Horror' },
  { key: 'video', zh: '视频', en: 'Video' },
  { key: 'music', zh: '音乐', en: 'Music' },
  { key: 'social', zh: '社交', en: 'Social' },
  { key: 'education', zh: '教育', en: 'Education' },
  { key: 'news', zh: '新闻', en: 'News' },
];

function categoryMenuOptions(lang) {
  const zh = lang === 'zh';
  return [`<option value="all">${zh ? '全部分类' : 'All categories'}</option>`,
    ...CATEGORY_OPTIONS.map(category => `<option value="${category.key}">${escape(zh ? category.zh : category.en)}</option>`)].join('');
}

function deviceSwitch(lang) {
  const zh = lang === 'zh';
  const options = DEVICE_OPTIONS.map(device => `<option value="${device.code}">${device.name}</option>`).join('');
  return `<label class="device-switch"><select id="device-select" aria-label="${zh ? '选择设备' : 'Select device'}">${options}</select></label>`;
}

function masthead(lang, path, interactive = false) {
  const zh = lang === 'zh';
  const home = localized('/', lang);
  const tabs = [
    { id: 'home', href: home, label: zh ? '首页' : 'Home' },
    { id: 'search', href: localized('/search/', lang), label: zh ? '搜索' : 'Search' },
    { id: 'all-apps', href: localized('/all-apps/', lang), label: zh ? '全部应用' : 'All apps' },
    { id: 'favorites', href: localized('/favorites/', lang), label: zh ? '收藏' : 'Favorites' },
    { id: 'guide', href: localized('/guides/install-global-apps/', lang), label: zh ? '安装指南' : 'Guide' },
    { id: 'download', href: localized('/download/', lang), label: zh ? '客户端' : 'Clients' },
  ];
  const active = path === '/' ? 'home'
    : path.startsWith('/search/') ? 'search'
      : path.startsWith('/all-apps/') ? 'all-apps'
        : path.startsWith('/favorites/') ? 'favorites'
          : path.startsWith('/apps/') || path.startsWith('/app/') ? 'search'
            : path.startsWith('/guides/') ? 'guide'
              : path.startsWith('/download/') ? 'download' : '';
  const regionSwitch = interactive
    ? `<div class="masthead-region" role="tablist" aria-label="${zh ? '商店区域' : 'Store region'}"><button type="button" id="region-global" class="masthead-region-option" role="tab" aria-selected="true">${zh ? '国际' : 'Global'}</button><button type="button" id="region-cn" class="masthead-region-option" role="tab" aria-selected="false">${zh ? '中国' : 'China'}</button></div>`
    : '';
  const devices = interactive ? deviceSwitch(lang) : '';
  return `<header class="masthead site-chrome"><a class="brand" href="${home}" aria-label="PICO Store Lab"><span class="brand-mark">P/</span><span>PICO<br>STORE LAB</span></a><nav class="tabbar" aria-label="${zh ? '主导航' : 'Main navigation'}">${tabs.map(tab => `<a href="${tab.href}"${tab.id === active ? ' class="active" aria-current="page"' : ''}>${tab.label}</a>`).join('')}</nav><div class="masthead-tools">${devices}${regionSwitch}<a id="language" class="language" href="${localized(path, zh ? 'en' : 'zh')}" lang="${zh ? 'en' : 'zh-CN'}">${zh ? 'EN' : '中文'}</a></div></header>`;
}

function footer(lang) {
  return `<footer class="site-footer"><div class="footer-wordmark"><span class="footer-slash">P/</span><span>PICO<br>STORE LAB</span></div><div class="footer-meta"><nav><a href="${localized('/about/', lang)}">${lang === 'zh' ? '关于项目' : 'About'}</a>${external(repositoryUrl, 'GitHub')}</nav><p>${lang === 'zh' ? '由社区维护，与 PICO 官方无关联。' : 'A community project, independent of PICO.'}</p></div></footer>`;
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
  return `<section class="app-guide"><div class="reading-heading"><p class="eyebrow"><span class="indicator"></span>${lang === 'zh' ? '下载与安装' : 'DOWNLOAD & INSTALL'}</p><h2>${lang === 'zh' ? '从这里开始，一步步装好。' : 'Get it onto your headset.'}</h2></div>${steps(copy.steps)}<a class="text-link" href="${localized('/guides/install-global-apps/', lang)}">${lang === 'zh' ? '查看完整安装指南' : 'Read the installation guide'} ↗</a>${adaptationLink}<div class="faq">${copy.faq.map(item => `<details><summary>${escape(item.q)}</summary><p>${escape(item.a)}</p></details>`).join('')}</div><p class="source-links">${app.sources.map(link => external(link.url, link.label)).join(' · ')}</p></section>`;
}

function genericAppGuide(lang) {
  const zh = lang === 'zh';
  const copy = zh ? {
    eyebrow: '下载与安装', title: '确认设备，再开始安装。',
    steps: [
      { title: '先登录 PICO 账号', text: '国际区应用用国际区账号，中国区应用用中国区账号；需要 PICO 账号的应用可选国际区登录适配。' },
      { title: '在详情页下载 APK', text: '点击“下载此应用”，网页会校验账号与设备兼容性，再返回安装包或直达 PICO 商店。' },
      { title: '在头显中安装', text: '把 APK 放进 PICO 头显的文件管理器打开安装；系统提示未知来源时，允许当前文件管理器安装。' },
    ],
    guide: '查看完整安装指南',
    faq: [
      { q: '下载按钮提示没有权限怎么办？', a: '确认当前区域与账号一致；付费应用需要账号已拥有该应用，免费应用也需要先登录再下载。' },
    ],
  } : {
    eyebrow: 'DOWNLOAD & INSTALL', title: 'Check the headset, then install.',
    steps: [
      { title: 'Sign in to PICO first', text: 'Use a global account for global apps and a China account for China apps. Apps that require PICO sign-in can use international sign-in adaptation.' },
      { title: 'Download the APK from this page', text: 'Choose “Download this app”. The page checks account and device compatibility before returning the package or opening PICO Store.' },
      { title: 'Install on the headset', text: 'Open the APK in the PICO file manager. If the system warns about unknown sources, allow the current file manager to install it.' },
    ],
    guide: 'Read the installation guide',
    faq: [
      { q: 'What if download says I do not have permission?', a: 'Check that the region matches your account. Paid apps must already be owned; free apps still require sign-in first.' },
    ],
  };
  return `<section class="app-guide"><div class="reading-heading"><p class="eyebrow"><span class="indicator"></span>${copy.eyebrow}</p><h2>${copy.title}</h2></div>${steps(copy.steps)}<a class="text-link" href="${localized('/guides/install-global-apps/', lang)}">${copy.guide} ↗</a><div class="faq">${copy.faq.map(item => `<details><summary>${escape(item.q)}</summary><p>${escape(item.a)}</p></details>`).join('')}</div></section>`;
}

function appDownloadNotice(app, lang) {
  const notice = app[lang].downloadNotice;
  if (!notice) return '';
  return `<aside class="adapted-download-notice" aria-labelledby="adapted-download-heading"><div><p class="eyebrow"><span class="indicator"></span>${lang === 'zh' ? '下载方式提醒' : 'DOWNLOAD OPTIONS'}</p><h2 id="adapted-download-heading">${escape(notice.title)}</h2><p>${escape(notice.text)}</p></div><div class="adapted-download-actions"><a class="action primary" href="${localized('/download/', lang)}">${escape(notice.clientLabel)} ↗</a><a class="text-link" href="#downloader">${escape(notice.originalLabel)} ↓</a></div></aside>`;
}

function homeBody(lang, region = 'global') {
  const zh = lang === 'zh';
  const copy = region === 'cn'
    ? (zh ? {
      title: '官方写着“不兼容”，<br><em>也能装到兼容设备上。</em>',
      intro: '也可以只是下载下来备份、研究。按设备查看国区商店的版本与下载入口，登录国区账号即可获取。',
    } : {
      title: 'Marked “incompatible”,<br><em>still installable.</em>',
      intro: 'Or simply download it for backup and research. Browse China store versions and download links by headset, then sign in to get them.',
    })
    : (zh ? {
      title: '在国区 PICO 上，<br><em>找到你想用的应用。</em>',
      intro: '浏览 PICO 应用，用自己的国际区或中国区账号下载；需要 PICO 账号的应用还能选择国际区登录适配。',
    } : {
      title: 'Your PICO.<br><em>More to explore.</em>',
      intro: 'Browse PICO apps and download with your international or China account. Choose sign-in adaptation for apps that use PICO accounts.',
    });
  return `<section class="hero home-hero"><div class="hero-copy">${pageEyebrow(lang, '首页', 'HOME')}<h1>${copy.title}</h1><p class="intro">${copy.intro}</p><div class="hero-actions"><a class="action primary" href="${localized('/search/', lang)}">${zh ? '搜索应用' : 'Search apps'} ↗</a><a class="action secondary" href="${localized('/all-apps/', lang)}">${zh ? '全部应用' : 'All apps'} ↗</a></div></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="hero-glyph">P<span>/</span></div></div></section>`;
}

function homeFeatured(lang, region = 'global') {
  const zh = lang === 'zh';
  const label = zh ? '推荐应用' : 'FEATURED APPS';
  return `<section class="section-head"><span>${label}</span><span>01 / APPS</span></section><span class="home-catalog-anchor" data-catalog-anchor aria-hidden="true"${region === 'global' ? ' id="catalog"' : ''}></span>${cards(lang, region)}`;
}

function homePageBody(lang) {
  return ['global', 'cn'].map(region => `<div class="home-region" data-home-region="${region}"${region === 'cn' ? ' hidden' : ''}>${homeBody(lang, region)}${homeFeatured(lang, region)}</div>`).join('');
}

function filterMenus(lang, prefix) {
  const zh = lang === 'zh';
  const menuLabel = zh ? '筛选方式' : 'Filter and sort';
  return `<div class="store-filter-bar" role="group" aria-label="${menuLabel}">
<label class="store-filter"><select id="${prefix}-category" aria-label="${zh ? '分类' : 'Category'}">${categoryMenuOptions(lang)}</select></label>
<label class="store-filter"><select id="${prefix}-price" aria-label="${zh ? '价格' : 'Price'}"><option value="all">${zh ? '全部价格' : 'All prices'}</option><option value="free">${zh ? '免费' : 'Free'}</option><option value="paid">${zh ? '付费' : 'Paid'}</option></select></label>
<label class="store-filter"><select id="${prefix}-sort" aria-label="${zh ? '排序' : 'Sort'}"><option value="comprehensive">${zh ? '综合排序' : 'Recommended'}</option><option value="updated">${zh ? '最近更新' : 'Recently updated'}</option><option value="rating">${zh ? '评分优先' : 'Top rated'}</option><option value="price">${zh ? '价格从低到高' : 'Price low to high'}</option><option value="name">${zh ? '名称 A-Z' : 'Name A-Z'}</option></select></label>
</div>`;
}

function searchPageBody(lang) {
  const zh = lang === 'zh';
  return `<header class="page-heading"><div>${pageEyebrow(lang, '搜索', 'SEARCH')}<h1>${zh ? '搜索应用' : 'Search apps'}</h1><p>${zh ? '输入应用名称，查看商店结果，再进入应用详情页登录并下载。' : 'Enter an app name, review store results, then open a detail page to sign in and download.'}</p></div></header>
<section class="search-panel" aria-label="${zh ? '搜索' : 'Search'}">
  <form id="search-form" class="store-search"><div><input id="search-word" type="search" required maxlength="100" aria-label="${zh ? '应用名称' : 'App name'}" placeholder="${zh ? '应用名称' : 'App name'}"><button type="submit">${zh ? '搜索' : 'Search'}</button></div></form>
  ${filterMenus(lang, 'search')}
  <p id="search-status" class="search-status" role="status" aria-live="polite"></p>
  <div id="search-results" class="search-results store-search-results"></div>
</section>`;
}

function allAppsPageBody(lang) {
  const zh = lang === 'zh';
  const pageSizes = ['20', '50', '100'].map(size => `<option value="${size}">${size}</option>`).join('') + `<option value="all">${zh ? '全部' : 'All'}</option>`;
  return `<header class="page-heading all-apps-heading"><div>${pageEyebrow(lang, '全部应用', 'ALL APPS')}<h1>${zh ? '全部应用' : 'All apps'}</h1><p>${zh ? '浏览 PICO 商店的全部应用，按最近更新排列。' : 'Browse the complete PICO store catalog, ordered by recent updates.'}</p></div><span id="all-apps-count" class="apps-total" aria-live="polite">—</span></header>
<div class="all-apps-filter">
<form id="all-apps-search-form" class="store-search" role="search"><div><input id="all-apps-search-word" type="search" maxlength="100" aria-label="${zh ? '应用名称' : 'App name'}" placeholder="${zh ? '应用名称' : 'App name'}"><button type="submit">${zh ? '搜索' : 'Search'}</button></div></form>
${filterMenus(lang, 'all-apps')}
</div>
<p id="all-apps-status" class="all-apps-status" role="status" aria-live="polite">${zh ? '正在拉取商店目录…' : 'Loading the store catalog…'}</p>
<div id="all-apps-results" class="all-apps-results store-list" hidden></div>
<div id="all-apps-footer" class="all-apps-footer" hidden>
<span id="all-apps-page-status" class="all-apps-page-status" aria-live="polite"></span>
<span id="all-apps-page-nav" class="all-apps-page-buttons" hidden>
<button id="all-apps-prev-page" type="button">${zh ? '← 上一页' : '← Previous'}</button>
<button id="all-apps-next-page" type="button">${zh ? '下一页 →' : 'Next →'}</button>
</span>
<label class="all-apps-page-size" for="all-apps-page-size"><span>${zh ? '每页' : 'Per page'}</span><select id="all-apps-page-size" aria-label="${zh ? '每页条目数' : 'Items per page'}">${pageSizes}</select></label>
</div>`;
}

function favoritesPageBody(lang) {
  const zh = lang === 'zh';
  return `<header class="page-heading all-apps-heading favorites-heading"><div>${pageEyebrow(lang, '收藏', 'FAVORITES')}<h1>${zh ? '收藏' : 'Favorites'}</h1><p>${zh ? '保存在这台设备上的应用。收藏只存在当前浏览器，不会上传。' : 'Apps saved on this device. Favorites stay in this browser and are never uploaded.'}</p></div><span id="favorites-count" class="apps-total" aria-live="polite">—</span></header>
<div class="favorites-status-wrap"><p id="favorites-status" class="all-apps-status" role="status" aria-live="polite" hidden></p></div>
<div id="favorites-results" class="store-list favorites-results"></div>`;
}

function appPageBody(lang) {
  const zh = lang === 'zh';
  return `<nav class="breadcrumbs"><a id="app-breadcrumb-link" href="${localized('/search/', lang)}">${zh ? '搜索' : 'Search'}</a><span>/</span><span>${zh ? '应用' : 'App'}</span></nav>${detailTemplate}${downloaderTemplate}${genericAppGuide(lang)}`;
}

const records = [];
async function page({ path, lang, title, description, body, app, interactive = false, script = interactive ? 'app.js' : '', pageType = '', type = 'WebPage' }) {
  const pathname = localized(path, lang);
  const canonical = `${origin}${pathname}`;
  const ogImage = `${origin}/social-cover.png`;
  const pageKind = pageType || (app ? 'app' : path === '/' ? 'home' : 'reading');
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
    .replace('<script type="module" src="/app.js"></script>', script ? `<script type="module" src="/${script}"></script>` : '');
  head += `<script defer src="/icons.js"></script><script defer src="/metrics.js"></script><link rel="stylesheet" href="/pages.css"><link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="zh-CN" href="${origin}${path}"><link rel="alternate" hreflang="en" href="${origin}/en${path}"><link rel="alternate" hreflang="x-default" href="${origin}${path}">
<meta property="og:type" content="website"><meta property="og:site_name" content="PICO Store Lab"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${canonical}"><meta property="og:locale" content="${lang === 'zh' ? 'zh_CN' : 'en_US'}"><meta property="og:image" content="${ogImage}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${json(structured)}</script>`;
  const initialCatalog = catalog.map(item => { const known = apps.find(app => app.itemId === item.itemId); return { ...item, ...(known ? { state:appState(known, lang) } : {}) }; });
  const html = `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : 'en'}" data-seo="true" data-build="${buildId}" data-page="${pageKind}"${app ? ` data-item-id="${app.itemId}"` : ''}><head>${head}</head><body class="page-${pageKind}"><a class="skip-link" href="#main">${lang === 'zh' ? '跳至正文' : 'Skip to content'}</a><div class="shell">${masthead(lang, path, interactive)}<main id="main">${translate(body, lang)}</main>${footer(lang)}</div>${interactive ? `<script type="application/json" id="catalog-data">${json(initialCatalog)}</script>` : ''}</body></html>`;
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
  await page({ path:'/', lang, title:zh ? 'PICO 国际区应用下载与安装指南 | PICO Store Lab' : 'PICO apps, downloads & installation | PICO Store Lab',
    description:zh ? '在国区 PICO 上查找应用的 PICO 版本，使用自己的 PICO 国际区或中国区账号下载并安装。' : 'Browse PICO apps, then download and install with your international or China account.',
    body:homePageBody(lang), interactive:true, script:'app.js', pageType:'home' });
  await page({ path:'/search/', lang, title:zh ? '搜索 PICO 应用 | PICO Store Lab' : 'Search PICO apps | PICO Store Lab',
    description:zh ? '按名称搜索 PICO 商店应用，进入详情页登录并下载。' : 'Search PICO Store apps by name, then open a detail page to sign in and download.',
    body:searchPageBody(lang), interactive:true, script:'search.js', pageType:'search' });
  await page({ path:'/all-apps/', lang, title:zh ? '全部 PICO 应用 | PICO Store Lab' : 'All PICO apps | PICO Store Lab',
    description:zh ? '浏览 PICO 商店的全部应用，切换设备查看对应目录。' : 'Browse the complete PICO store catalog and switch headsets to see the matching list.',
    body:allAppsPageBody(lang), interactive:true, script:'all-apps.js', pageType:'all-apps' });
  await page({ path:'/favorites/', lang, title:zh ? '收藏 | PICO Store Lab' : 'Favorites | PICO Store Lab',
    description:zh ? '查看保存在当前浏览器中的 PICO 应用收藏。' : 'View the PICO apps saved in this browser.',
    body:favoritesPageBody(lang), interactive:true, script:'favorites.js?v=2', pageType:'favorites' });
  await page({ path:'/app/', lang, title:zh ? 'PICO 应用详情与下载 | PICO Store Lab' : 'PICO app details and download | PICO Store Lab',
    description:zh ? '查看 PICO 应用详情，使用国际区或中国区账号登录并下载 APK。' : 'View PICO app details, sign in with an international or China account, and download the APK.',
    body:appPageBody(lang), interactive:true, script:'app.js', pageType:'app' });
  for (const app of apps) {
    const breadcrumb = `<nav class="breadcrumbs"><a href="${localized('/search/', lang)}">${zh ? '搜索' : 'Search'}</a><span>/</span><span>${escape(app.name)}</span></nav>`;
    await page({ path:`/apps/${app.slug}/`, lang, app, interactive:true,
      title:`${app.name} ${zh ? 'PICO 版下载与安装指南' : 'for PICO — download & install'} | PICO Store Lab`,
      description:app[lang].summary + (zh ? ' 查看支持设备、国际账号注册和国区头显安装步骤。' : ' Find device information, account setup and installation steps.'),
      body:breadcrumb + appDetails(app, lang) + appDownloadNotice(app, lang) + downloaderTemplate + appGuide(app, lang), pageType:'app' });
  }
  const guideCopy = guide[lang];
  await page({ path:'/guides/install-global-apps/', lang, title:`${guideCopy.title} | PICO Store Lab`, description:guideCopy.description,
    body:`<header class="reading-hero">${pageEyebrow(lang, '安装指南', 'PLAYER GUIDE')}<h1>${escape(guideCopy.title)}</h1><p>${escape(guideCopy.description)}</p><a class="action primary" href="${localized('/', lang)}#catalog">${zh ? '去选一款应用' : 'Choose an app'} ↗</a></header>${reading(guideCopy, lang)}<section class="related-apps"><h2>${zh ? '想先装哪一款？' : 'Where would you like to start?'}</h2>${cards(lang)}</section>` });
  const signInCopy = signInGuide[lang];
  await page({ path:'/guides/international-sign-in/', lang, title:`${signInCopy.title} | PICO Store Lab`, description:signInCopy.description,
    body:`<header class="reading-hero">${pageEyebrow(lang, '国际区登录适配', 'INTERNATIONAL SIGN-IN')}<h1>${escape(signInCopy.title)}</h1><p>${escape(signInCopy.description)}</p><a class="action primary" href="${localized('/download/', lang)}">${zh ? '下载头显客户端' : 'Get the headset app'} ↗</a></header>${reading(signInCopy, lang)}<section class="related-apps"><h2>${zh ? '选择应用' : 'Choose an app'}</h2>${cards(lang)}</section>` });
  const techCopy = adaptationTechGuide[lang];
  await page({ path:'/guides/how-adaptation-works/', lang, title:`${techCopy.title} | PICO Store Lab`, description:techCopy.description,
    body:`<header class="reading-hero">${pageEyebrow(lang, '技术原理', 'HOW IT WORKS')}<h1>${escape(techCopy.title)}</h1><p>${escape(techCopy.description)}</p><a class="action primary" href="${localized('/guides/international-sign-in/', lang)}">${zh ? '查看使用指南' : 'Read the user guide'} ↗</a></header>${reading(techCopy, lang)}` });
  const releases = releaseDownloadUrl;
  const clientBody = `<header class="reading-hero">${pageEyebrow(lang, '客户端', 'CLIENTS')}<h1>${zh ? '选一个顺手的<br>下载方式。' : 'Choose how<br>you download.'}</h1><p>${zh ? '偶尔下载，打开网页就够了。常用的话，也可以装到头显或电脑上。' : 'Use the website for a quick download, or keep the app on your headset or computer.'}</p><a class="action primary" href="${localized('/', lang)}#catalog">${zh ? '直接在网页下载' : 'Use the website'} ↗</a></header><div class="client-grid"><section><span class="eyebrow">01 / PICO</span><h2>${zh ? '在头显上' : 'On your headset'}</h2><p>${zh ? '安装一次 PICO Store Lab，之后在头显里搜索、下载和安装应用。' : 'Install PICO Store Lab once, then find, download and install apps on your headset.'}</p><p class="client-adaptation-note">${zh ? '头显客户端可以下载并安装国际区登录适配版；网页下载的是原版 APK。' : 'The headset app can download and install an international sign-in adapted copy. The website downloads the original APK.'}</p><a class="action primary" href="${releases}pico-store-android.apk">${zh ? '下载 Android APK' : 'Download Android APK'} ↓</a><a class="text-link" href="${localized('/guides/install-global-apps/', lang)}#headset-install">${zh ? '安装方法' : 'Installation guide'} ↗</a></section>${[['Windows','windows','exe'],['macOS','macos','dmg'],['Linux','linux','AppImage']].map(([name,platform,ext],index) => `<section><span class="eyebrow">0${index + 2} / DESKTOP</span><h2>${name}</h2><p>${zh ? '在电脑上查找应用，下载后安装到头显。' : 'Find apps on your computer, then install your downloads on the headset.'}</p><div class="client-actions"><a class="action secondary" href="${releases}pico-store-desktop-${platform}-x64.${ext}">${name === 'macOS' ? 'Intel' : 'x64'} ↓</a><a class="action secondary" href="${releases}pico-store-desktop-${platform}-arm64.${ext}">${name === 'macOS' ? 'Apple silicon' : 'ARM64'} ↓</a></div></section>`).join('')}</div>`;
  await page({ path:'/download/', lang, title:zh ? '下载 PICO Store Lab 客户端 | Android、Windows、macOS、Linux' : 'Download PICO Store Lab | Android, Windows, macOS & Linux', description:zh ? '下载 PICO Store Lab，在 PICO 头显或电脑上查找、下载应用。也可以直接使用网页。' : 'Get PICO Store Lab for your headset or computer, or download apps directly on the website.', body:clientBody });
  const aboutCopy = about[lang];
  await page({ path:'/about/', lang, title:`${aboutCopy.title} | PICO Store Lab`, description:aboutCopy.description,
    body:`<header class="reading-hero">${pageEyebrow(lang, '关于项目', 'ABOUT')}<h1>${escape(aboutCopy.title)}</h1><p>${escape(aboutCopy.description)}</p></header>${reading(aboutCopy, lang)}` });
}

await writeFile(new URL('sitemap.xml', output), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${records.map(page => `<url><loc>${origin}${page.path}</loc></url>`).join('')}</urlset>\n`);
await writeFile(new URL('robots.txt', output), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(new URL('404.html', output), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>页面未找到 | PICO Store Lab</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/pages.css"></head><body><main class="reading-hero"><p class="eyebrow"><span class="indicator"></span>PICO STORE LAB / 404</p><h1>这个页面没有找到。</h1><p>回到首页，找找你想下载的应用。</p><a class="action primary" href="/">回到首页 ↗</a></main></body></html>`);
await mkdir(new URL('../.local/', output), { recursive:true });
await writeFile(new URL('../.local/page-manifest.json', output), JSON.stringify(records, null, 2) + '\n');
console.log(`Built ${records.length} public pages in apps/website/dist`);
