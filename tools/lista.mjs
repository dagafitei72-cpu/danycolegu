// Scrie LISTA-POSTURI.md cu toate posturile din pagină, grupate pe gen.
// Rulare: node tools/lista.mjs   (folosește data/stations.json; rulează întâi tools/snapshot.mjs pt listă proaspătă)
import { readFile, writeFile } from 'node:fs/promises';
await import(new URL('../fixes.js', import.meta.url));
await import(new URL('../stations.js', import.meta.url));
const { normalize, GENRES } = globalThis.DanyStations;
const raw = JSON.parse(await readFile(new URL('../data/stations.json', import.meta.url), 'utf8'));
let extra = [];
try { extra = JSON.parse(await readFile(new URL('../data/extra.json', import.meta.url), 'utf8')); } catch {}
const list = normalize([...extra, ...raw], { canHls: true, canOgg: true });
const name = Object.fromEntries(GENRES.map(([id, n]) => [id, n]));
const line = (s) => `- ${s.name}${s.city ? ` — ${s.city}` : ''}${s.secure ? '' : ' ⚠️ *doar http*'}`;
const by = (a, b) => a.name.localeCompare(b.name, 'ro');
const https = list.filter((s) => s.secure).length;
let md = `# Posturile din DanyColegu\n\nTotal: **${list.length}** posturi (${https} merg pe site-ul public; cele marcate ⚠️ *doar http* merg doar local, până punem un proxy).\n` +
  `Fiecare post apare o singură dată, la genul lui principal. Generat ${new Date().toISOString().slice(0, 10)} din Radio Browser.\n\n`;
const feat = list.filter((s) => s.featured);
md += `## Posturi mari (sus în pagină)\n\n${feat.map(line).join('\n')}\n\n`;
const rest = list.filter((s) => !s.featured);
for (const [id] of GENRES) {
  const g = rest.filter((s) => s.genres[0] === id).sort(by);
  if (g.length) md += `## ${name[id]} (${g.length})\n\n${g.map(line).join('\n')}\n\n`;
}
const other = rest.filter((s) => !s.genres.length).sort(by);
md += `## Fără gen precizat (${other.length})\n\n${other.map(line).join('\n')}\n`;
await writeFile(new URL('../LISTA-POSTURI.md', import.meta.url), md);
console.log(`OK: ${list.length} posturi, ${https} https, scris LISTA-POSTURI.md`);
