// Salvează o copie a listei de posturi în data/stations.json (folosită doar dacă API-ul nu răspunde).
// Rulare: node tools/snapshot.mjs
import { writeFile } from 'node:fs/promises';
const hosts = ['de1', 'de2', 'fi1', 'all'].map((h) => `https://${h}.api.radio-browser.info`);
const q = '/json/stations/search?countrycode=RO&hidebroken=true&order=clickcount&reverse=true&limit=2000';
const keep = ['stationuuid', 'name', 'url', 'url_resolved', 'favicon', 'tags', 'state', 'codec', 'bitrate', 'hls', 'votes', 'clickcount'];
for (const h of hosts) {
  try {
    const r = await fetch(h + q, { headers: { 'User-Agent': 'DanyColegu-radio/0.1' } });
    if (!r.ok) throw new Error(r.status);
    const data = (await r.json()).map((s) => Object.fromEntries(keep.map((k) => [k, s[k]])));
    await writeFile(new URL('../data/stations.json', import.meta.url), JSON.stringify(data));
    console.log(`OK: ${data.length} posturi de la ${h}`);
    process.exit(0);
  } catch (e) { console.warn(`${h}: ${e.message}`); }
}
process.exit(1);
