/* DanyColegu — lista de posturi: curățare, deduplicare, gen, oraș, ordonare.
   Folosit de pagină (app.js) și de unelte (tools/lista.mjs). Fără DOM. */
(() => {
  'use strict';

  // Posturile mari, mereu sus în listă (cheie normalizată → ordine).
  const FEATURED = ['kiss', 'europa', 'digi', 'magic', 'zu', 'pro', 'rock', 'virgin', 'actualitati',
    'national', 'gold', 'one', 'guerrilla', 'impuls', 'muzical', 'cultural', 'bucurestifm', 'euronews'];

  // posturile mari: nume afișat curat + gen principal (+1 = rețea națională, fără oraș)
  const DISPLAY = { kiss: ['Kiss FM', 'pop', 1], europa: ['Europa FM', 'pop', 1], digi: ['Digi FM', 'pop', 1], magic: ['Magic FM', 'pop', 1],
    zu: ['Radio ZU', 'pop', 1], pro: ['Pro FM', 'pop', 1], rock: ['Rock FM', 'rock', 1], virgin: ['Virgin Radio', 'pop', 1],
    actualitati: ['Radio România Actualități', 'stiri', 1], gold: ['Gold FM', 'retro'], guerrilla: ['Radio Guerrilla', 'rock', 1],
    impuls: ['Radio Impuls', 'pop'], muzical: ['Radio România Muzical', 'clasica', 1], cultural: ['Radio România Cultural', 'stiri', 1],
    euronews: ['Euronews Radio', 'stiri', 1] };
  // logo-uri din API care nu se potrivesc (alt post al grupului / alb pe alb) → inițiale
  const NO_LOGO = new Set(['digi', 'zu']);
  // stream-uri https găsite manual pentru posturi mari care în baza publică au doar http
  const OVERRIDES = {
    zu: { url: 'https://ivm.antenaplay.ro/liveaudio/radiozu/playlist.m3u8', hls: true },
    muzical: { url: 'https://stream4.srr.ro:8443/romania-muzical' },
  };

  const GENRES = [
    ['pop', 'Pop & hituri', /\b(pop|hits?|top ?40|chart|mainstream|adult contemporary|contemporary)\b/],
    ['dance', 'Dance & electronic', /\b(dance|house|edm|electro\w*|techno|trance|club|deep|dj)\b/],
    ['rock', 'Rock', /\b(rock|metal|alternative|indie|grunge|punk|blues)\b/],
    ['retro', 'Retro & gold', /\b(oldies|gold|goldies|retro|slagare|[5-9]0s|[5-9]0'?s?|anii [5-9]0|classic hits|evergreen)\b/],
    ['manele', 'Manele & petrecere', /\b(manele|manea|petrecere|petrecaret\w*|lautar\w*|party)\b/],
    ['populara', 'Populară & folk', /\b(populara|popular|folk\w*|folclor\w*|traditional|etno|country)\b/],
    ['clasica', 'Clasică & jazz', /\b(classical|clasica|clasic|jazz|opera|symphon\w*|baroque|chamber)\b/],
    ['chill', 'Chill & relax', /\b(chill\w*|relax\w*|lounge|ambient|smooth|easy listening)\b/],
    ['stiri', 'Știri & talk', /\b(news|stiri|talk|informa\w*|actualitati|sport\w*|public radio)\b/],
    ['crestin', 'Creștin', /\b(christian|crestin\w*|religio\w*|ortodox\w*|gospel|worship|catholic|biseric\w*|evangh\w*)\b/],
  ];

  const CITIES = [
    ['bucuresti', 'București'], ['bucharest', 'București'], ['cluj', 'Cluj-Napoca'], ['iasi', 'Iași'],
    ['timisoara', 'Timișoara'], ['constanta', 'Constanța'], ['brasov', 'Brașov'], ['craiova', 'Craiova'],
    ['galati', 'Galați'], ['oradea', 'Oradea'], ['sibiu', 'Sibiu'], ['arad', 'Arad'], ['bacau', 'Bacău'],
    ['ploiesti', 'Ploiești'], ['pitesti', 'Pitești'], ['suceava', 'Suceava'], ['targu mures', 'Târgu Mureș'],
    ['tirgu mures', 'Târgu Mureș'], ['baia mare', 'Baia Mare'], ['buzau', 'Buzău'], ['botosani', 'Botoșani'],
    ['satu mare', 'Satu Mare'], ['onesti', 'Onești'], ['alba iulia', 'Alba Iulia'], ['deva', 'Deva'],
    ['bistrita', 'Bistrița'], ['focsani', 'Focșani'], ['braila', 'Brăila'], ['targu jiu', 'Târgu Jiu'],
    ['ramnicu valcea', 'Râmnicu Vâlcea'], ['valcea', 'Râmnicu Vâlcea'], ['piatra neamt', 'Piatra Neamț'],
    ['zalau', 'Zalău'], ['turda', 'Turda'], ['resita', 'Reșița'], ['hunedoara', 'Hunedoara'], ['medias', 'Mediaș'],
    ['sighisoara', 'Sighișoara'], ['miercurea ciuc', 'Miercurea Ciuc'], ['sfantu gheorghe', 'Sfântu Gheorghe'],
    ['odorheiu', 'Odorheiu Secuiesc'], ['tulcea', 'Tulcea'], ['slatina', 'Slatina'], ['severin', 'Drobeta-Turnu Severin'],
    ['vaslui', 'Vaslui'], ['giurgiu', 'Giurgiu'], ['alexandria', 'Alexandria'], ['calarasi', 'Călărași'],
    ['slobozia', 'Slobozia'], ['targoviste', 'Târgoviște'], ['gherla', 'Gherla'], ['marghita', 'Marghita'],
    ['mangalia', 'Mangalia'], ['roman', 'Roman'], ['dej', 'Dej'], ['campina', 'Câmpina'], ['lugoj', 'Lugoj'],
    ['caransebes', 'Caransebeș'], ['sacele', 'Săcele'], ['petrosani', 'Petroșani'], ['ramnicu sarat', 'Râmnicu Sărat'],
  ];

  const fold = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function cleanName(n) {
    return (n || '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').replace(/\s+-\s*$/, '').trim();
  }

  // cheia de deduplicare: „Kiss Fm Ro”, „KISS FM 107.9” → „kiss”
  function keyOf(name) {
    let n = fold(name).split(/\s[-–(|]/)[0];
    n = n.replace(/\d+[.,]\d+/g, ' ');
    n = n.split(/[^a-z0-9]+/).filter((w) => w && !['radio', 'romania', 'ro', 'fm', 'online', 'live', 'aac', 'mp3', 'hd', 'the', 'stream'].includes(w)).join('');
    n = n.replace(/fm$/, '').replace(/^radio/, '');
    return n || fold(name).replace(/[^a-z0-9]/g, '');
  }

  function pickUrl(s) {
    // fără playlist-uri (.m3u/.pls/.asx): elementul audio nu le poate reda direct
    const playlist = /\.(m3u|pls|asx|xspf)(\?|$)/i;
    const c = [s.url_resolved, s.url].filter(Boolean).map((u) => u.trim()).filter((u) => !playlist.test(u));
    const https = c.find((u) => u.startsWith('https://'));
    return { url: https || c[0] || '', secure: !!https };
  }

  function detectCity(s, name) {
    const hay = ` ${fold(`${s.state || ''} ${name}`).replace(/[^a-z0-9]+/g, ' ')} `;
    for (const [k, v] of CITIES) {
      if (hay.includes(` ${k} `) || (k.includes(' ') && hay.includes(` ${k.replace(/ /g, '')} `))) return v;
    }
    return '';
  }

  function detectGenres(text) {
    const t = fold(text);
    return GENRES.filter(([, , re]) => re.test(t)).map(([id]) => id);
  }

  // ---------------------------------------------------------------- data
  function normalize(raw, { canHls = true, canOgg = true, fixes = globalThis.DanyFixes || {} } = {}) {
    const out = [];
    for (const s of raw) {
      const name = cleanName(s.name);
      if (!name) continue;
      let { url, secure } = pickUrl(s);
      if (!secure && fixes[s.stationuuid]) { url = fixes[s.stationuuid]; secure = true; }
      if (!url) continue;
      const codec = (s.codec || '').toUpperCase();
      const hls = !!s.hls || /\.m3u8(\?|$)/i.test(url);
      if (hls && (!canHls || (s.bitrate || 0) > 600)) continue; // fără video / HLS nesuportat
      if (codec === 'FLV') continue;
      if ((codec === 'OGG' || /\.ogg(\?|$)/i.test(url)) && !canOgg) continue;
      const tags = (s.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
      let favicon = (s.favicon || '').trim();
      if (!/^https?:\/\//.test(favicon) || /https?:\/\/.*https?:\/\//.test(favicon)) favicon = '';
      out.push({
        id: s.stationuuid,
        name,
        key: keyOf(name),
        url, secure, hls,
        favicon,
        tags: tags.slice(0, 6),
        city: detectCity(s, name),
        genres: detectGenres(`${tags.join(' ')} ${name}`),
        codec, bitrate: s.bitrate || 0,
        score: (s.clickcount || 0) + (s.votes || 0) / 250,
      });
    }

    // deduplicare: după cheia numelui și după URL-ul stream-ului
    const best = new Map();
    const better = (a, b) => (a.secure !== b.secure ? a.secure : a.score > b.score);
    for (const st of out) {
      const prev = best.get(st.key);
      if (!prev) { best.set(st.key, st); continue; }
      const [win, lose] = better(st, prev) ? [st, prev] : [prev, st];
      win.favicon = win.favicon || lose.favicon;
      win.city = win.city || lose.city;
      win.genres = [...new Set([...win.genres, ...lose.genres])];
      win.score = Math.max(win.score, lose.score);
      best.set(st.key, win);
    }
    const byUrl = new Map();
    for (const st of best.values()) {
      const u = st.url.replace(/[?#].*$/, '').replace(/\/;?$/, '');
      const prev = byUrl.get(u);
      if (!prev || st.score > prev.score) byUrl.set(u, st);
    }
    const list = [...byUrl.values()];
    const rank = (st) => { const i = FEATURED.indexOf(st.key); return i < 0 ? 999 : i; };
    list.sort((a, b) => rank(a) - rank(b) || b.score - a.score || a.name.localeCompare(b.name, 'ro'));
    list.forEach((st) => { st.featured = rank(st) < 999; const d = DISPLAY[st.key];
      if (d) { st.name = d[0]; st.genres = [d[1], ...st.genres.filter((g) => g !== d[1])]; if (d[2]) st.city = ''; }
      if (NO_LOGO.has(st.key)) st.favicon = '';
      const o = OVERRIDES[st.key];
      if (o && !st.secure && (!o.hls || canHls)) { st.url = o.url; st.secure = true; st.hls = !!o.hls; }
    });
    return list;
  }

  globalThis.DanyStations = { GENRES, fold, normalize };
})();
