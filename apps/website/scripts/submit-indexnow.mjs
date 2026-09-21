import { readFile, writeFile } from 'node:fs/promises';
import settings from '../content/indexnow.json' with { type:'json' };

const origin = 'https://pico.kanglives.top';
const manifest = JSON.parse(await readFile(new URL('../.local/page-manifest.json', import.meta.url), 'utf8'));
const stateFile = new URL('../.local/indexnow-submitted.json', import.meta.url);
let previous = [];
try { previous = JSON.parse(await readFile(stateFile, 'utf8')); } catch { /* First submission. */ }
const changed = manifest.filter(page => previous.find(entry => entry.path === page.path)?.hash !== page.hash);
const removed = previous.filter(page => !manifest.some(entry => entry.path === page.path));
const paths = [...new Set([...changed, ...removed].map(page => page.path))];
if (!paths.length) {
  console.log('No changed public pages to submit.');
} else {
  const keyUrl = `${origin}/${settings.key}.txt`;
  const keyResponse = await fetch(keyUrl, { signal:AbortSignal.timeout(15000) });
  if (!keyResponse.ok || (await keyResponse.text()).trim() !== settings.key) throw new Error('Deploy the IndexNow key file before submitting.');
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method:'POST', headers:{ 'Content-Type':'application/json' }, signal:AbortSignal.timeout(30000),
    body:JSON.stringify({ host:new URL(origin).host, key:settings.key, keyLocation:keyUrl, urlList:paths.map(path => origin + path) }),
  });
  if (![200,202].includes(response.status)) throw new Error(`IndexNow submission failed: HTTP ${response.status}`);
  await writeFile(stateFile, JSON.stringify(manifest,null,2)+'\n');
  console.log(`IndexNow received ${paths.length} changed URLs (HTTP ${response.status}). Receipt is not an indexing confirmation.`);
}
