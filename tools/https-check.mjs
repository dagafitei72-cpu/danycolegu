// Caută variante https pentru posturile doar-http și scrie fixes.js (încărcat de pagină).
// Rulare: node tools/https-check.mjs
import { readFile, writeFile } from 'node:fs/promises';
await import(new URL('../stations.js', import.meta.url));
const raw = JSON.parse(await readFile(new URL('../data/stations.json', import.meta.url), 'utf8'));
const http = globalThis.DanyStations.normalize(raw, { canHls: true, canOgg: true }).filter((s) => !s.secure);
const candidates = (u) => {
  const x = new URL(u);
  const out = [u.replace(/^http:/, 'https:')];
  if (x.port) { const y = new URL(u); y.protocol = 'https:'; y.port = ''; out.push(y.href); }
  return [...new Set(out)];
};
async function probe(u) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(u, { signal: ctl.signal, headers: { 'User-Agent': 'DanyColegu-radio/0.1' } });
    const ct = r.headers.get('content-type') || '';
    const ok = r.ok && /audio|ogg|octet|mpegurl|aac|mpeg/i.test(ct);
    if (ok) { const rd = r.body.getReader(); const { value } = await rd.read(); ctl.abort(); return value && value.length > 100; }
    ctl.abort(); return false;
  } catch { return false; } finally { clearTimeout(t); }
}
const fixes = {};
let i = 0;
async function worker() {
  while (i < http.length) {
    const s = http[i++];
    for (const c of candidates(s.url)) if (await probe(c)) { fixes[s.id] = c; console.log('OK ', s.name, c); break; }
  }
}
await Promise.all(Array.from({ length: 24 }, worker));
const body = `/* Generat de tools/https-check.mjs: posturi doar-http care au și variantă https (id → url). */\nglobalThis.DanyFixes = ${JSON.stringify(fixes, null, 1)};\n`;
await writeFile(new URL('../fixes.js', import.meta.url), body);
console.log(`\n${Object.keys(fixes).length} din ${http.length} posturi doar-http au variantă https`);
