# DanyColegu — radio românesc, fără reclame

Pagină statică (HTML/CSS/JS, fără build) cu posturi de radio din România, făcută pentru telefon
(pe iPhone: Safari → Share → Add to Home Screen).

Lista vine live din API-ul public Radio Browser (de1/de2/fi1/all), cu cache 12h în browser
și copie de rezervă în `data/stations.json`.

- Rulare locală: `python -m http.server 5197` în folderul ăsta, apoi http://localhost:5197
- Simulare site https local: http://localhost:5197/?https=1 (ascunde posturile doar-http)
- Copie de rezervă proaspătă: `node tools/snapshot.mjs`
- Variante https pentru posturile doar-http: `node tools/https-check.mjs` (scrie `fixes.js`)
- Lista posturilor: `node tools/lista.mjs` (scrie `LISTA-POSTURI.md`)
- Iconițe: `python tools/icons.py`

Logica listei (curățare, dubluri, gen, oraș, posturi mari, stream-uri https găsite manual)
e în `stations.js`; pagina și player-ul în `app.js`.

La fiecare publicare: crește numărul din `version.json`, `VERSION` din `app.js` și `?v=` din `index.html` (toate la fel), ca telefoanele să ia singure versiunea nouă.
