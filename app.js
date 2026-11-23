/* DanyColegu — radio românesc online, fără reclame. HTML/CSS/JS static, fără build. */
(() => {
  'use strict';

  // ---------------------------------------------------------------- config
  const API_HOSTS = [
    'de1.api.radio-browser.info',
    'de2.api.radio-browser.info',
    'fi1.api.radio-browser.info',
    'all.api.radio-browser.info',
  ];
  const API_QUERY = '/json/stations/search?countrycode=RO&hidebroken=true&order=clickcount&reverse=true&limit=2000';
  const SNAPSHOT = 'data/stations.json';
  const CACHE_KEY = 'dany.cache.v6';
  const CACHE_TTL = 12 * 3600 * 1000;
  const CONNECT_TIMEOUT = 15000;
  // contorul „colegi ascultă” (Cloudflare Worker). Gol = contor ascuns. ?counter=URL îl suprascrie pt teste.
  const COUNTER_URL = 'https://danycolegu-live.demrender-server.workers.dev';
  const IMG_PROXY = 'https://images.weserv.nl/?w=48&h=48&fit=contain&output=png&url=';
  const params = new URLSearchParams(location.search);
  // ?https=1 simulează o pagină securizată când rulezi local pe http
  const SECURE = location.protocol === 'https:' || params.has('https');
  const COUNTER = (params.get('counter') || COUNTER_URL).replace(/\/$/, '');

  const { GENRES, fold } = DanyStations;

  // ---------------------------------------------------------------- helpers
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privat / plin */ } },
  };
  const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

  const audioProbe = document.createElement('audio');
  const NATIVE_HLS = !!audioProbe.canPlayType('application/vnd.apple.mpegurl');
  const CAN_HLS = NATIVE_HLS || 'MediaSource' in window || 'ManagedMediaSource' in window; // altfel: hls.js
  const HLS_JS = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.light.min.js';
  const CAN_OGG = !!audioProbe.canPlayType('audio/ogg; codecs="vorbis"');
  const CAN_VOLUME = (() => { const a = new Audio(); a.volume = 0.5; return Math.abs(a.volume - 0.5) < 0.01; })();


  function initials(name) {
    const words = fold(name).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w && !['radio', 'the', 'romania', 'ro'].includes(w));
    if (!words.length) return 'R';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  const normalize = (raw) => DanyStations.normalize(raw, { canHls: CAN_HLS, canOgg: CAN_OGG });


  async function fetchJSON(url, ms = 8000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  let apiHost = API_HOSTS[0];
  async function loadFromApi() {
    for (const h of API_HOSTS) {
      try {
        const data = await fetchJSON(`https://${h}${API_QUERY}`);
        if (Array.isArray(data) && data.length > 20) { apiHost = h; return data; }
      } catch { /* încearcă următorul server */ }
    }
    throw new Error('api');
  }

  // ---------------------------------------------------------------- state
  const state = {
    all: [],
    byId: new Map(),
    tab: 'all',
    genre: '',
    city: '',
    q: '',
    showHttp: false,
    favs: store.get('dany.favs', []),       // stații complete (ca să rămână chiar dacă dispar din API)
    recent: store.get('dany.recent', []),   // id-uri, cel mai nou primul
    current: store.get('dany.last', null),  // stația completă
    failed: new Set(),
    visible: [],
  };
  const isFav = (id) => state.favs.some((f) => f.id === id);
  const blocked = (st) => SECURE && !st.secure;

  // ---------------------------------------------------------------- render
  const listEl = $('#list');
  const statusEl = $('#status');
  const emptyEl = $('#empty');

  function logoHTML(st, cls = '') {
    const h = hash(st.key || st.name) % 360;
    const bg = `linear-gradient(135deg, hsl(${h} 55% 34%), hsl(${(h + 40) % 360} 60% 22%))`;
    let img = '';
    if (st.favicon) {
      const src = SECURE ? st.favicon.replace(/^http:\/\//, 'https://') : st.favicon;
      img = `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-logo>`;
    }
    return `<div class="logo ${cls}" style="background:${bg}"><span class="ini">${esc(initials(st.name))}</span>${img}<span class="eq"><i></i><i></i><i></i></span></div>`;
  }

  // logo-urile care nu se încarcă sau sunt minuscule → rămân inițialele
  document.addEventListener('error', (e) => { if (e.target.matches?.('img[data-logo]')) e.target.remove(); }, true);
  document.addEventListener('load', (e) => {
    const img = e.target;
    if (img.matches?.('img[data-logo]') && img.naturalWidth && img.naturalWidth < 40) img.remove();
  }, true);

  const GENRE_NAME = Object.fromEntries(GENRES.map(([id, n]) => [id, n]));
  function subLine(st) {
    const bits = [];
    if (st.genres[0]) bits.push(GENRE_NAME[st.genres[0]]);
    else if (st.tags[0]) bits.push(st.tags[0]);
    if (st.city) bits.push(st.city);
    let s = esc(bits.join(' · ') || 'Radio');
    if (blocked(st)) s += '<span class="badge bad">doar http</span>';
    else if (state.failed.has(st.id)) s += '<span class="badge bad">nu răspunde</span>';
    return s;
  }

  function cardHTML(st) {
    const on = state.current && state.current.id === st.id;
    const fav = isFav(st.id);
    const off = blocked(st);
    return `<article class="card${on ? ' on' : ''}${on && player.playing ? ' playing' : ''}${off ? ' off' : ''}" data-id="${st.id}">
      <button class="hit" aria-label="Ascultă ${esc(st.name)}"></button>
      ${logoHTML(st)}
      <div class="meta"><div class="name">${esc(st.name)}</div><div class="sub"><span class="sl">${subLine(st)}</span><span class="lc">${lcText(st.id)}</span></div></div>
      <button class="fav" aria-label="Favorit" aria-pressed="${fav}"><svg viewBox="0 0 24 24"><path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.6l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13z" fill="currentColor"/></svg></button>
    </article>`;
  }

  function matches(st) {
    if (state.genre && !st.genres.includes(state.genre)) return false;
    if (state.city && st.city !== state.city) return false;
    if (state.q) {
      const hay = fold(`${st.name} ${st.tags.join(' ')} ${st.city} ${st.genres.map((g) => GENRE_NAME[g]).join(' ')}`);
      if (!state.q.split(' ').every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  function sourceList() {
    if (state.tab === 'fav') return state.favs.map((f) => state.byId.get(f.id) || f);
    if (state.tab === 'recent') return state.recent.map((id) => state.byId.get(id) || state.favs.find((f) => f.id === id)).filter(Boolean);
    return state.all.filter((st) => state.showHttp || !blocked(st));
  }

  function render() {
    const src = sourceList();
    const vis = src.filter(matches);
    state.visible = vis;
    let html = '';
    const plain = state.tab === 'all' && !state.q && !state.genre && !state.city;
    if (plain && vis.length) {
      const feat = vis.filter((s) => s.featured);
      const rest = vis.filter((s) => !s.featured);
      html += `<h2 class="section-title">Posturi mari</h2>${feat.map(cardHTML).join('')}`;
      html += `<h2 class="section-title">Toate posturile</h2>${rest.map(cardHTML).join('')}`;
    } else {
      html = vis.map(cardHTML).join('');
    }
    listEl.innerHTML = html;
    emptyEl.hidden = vis.length > 0 || !state.all.length;
    if (!vis.length) {
      emptyEl.textContent = state.tab === 'fav' && !state.favs.length
        ? 'Nu ai favorite încă. Apasă inima de lângă un post ca să-l salvezi aici.'
        : state.tab === 'recent' && !state.recent.length
          ? 'Posturile pe care le asculți vor apărea aici.'
          : 'Niciun post nu se potrivește. Încearcă alt cuvânt sau scoate filtrele.';
    }
    $('#count-all').textContent = state.all.filter((s) => !blocked(s)).length || '';
    $('#count-fav').textContent = state.favs.length || '';
  }

  function renderFilters() {
    const counts = Object.fromEntries(GENRES.map(([id]) => [id, 0]));
    const cities = new Map();
    for (const st of state.all) {
      if (blocked(st) && !state.showHttp) continue;
      st.genres.forEach((g) => counts[g]++);
      if (st.city) cities.set(st.city, (cities.get(st.city) || 0) + 1);
    }
    $('#genres').innerHTML = `<button class="chip" data-genre="" aria-pressed="${!state.genre}">Toate</button>` +
      GENRES.filter(([id]) => counts[id] > 0)
        .map(([id, n]) => `<button class="chip" data-genre="${id}" aria-pressed="${state.genre === id}">${esc(n)}</button>`).join('');
    const sel = $('#city');
    const opts = [...cities].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ro'));
    sel.innerHTML = `<option value="">Toate orașele</option>` + opts.map(([c, n]) => `<option value="${esc(c)}">${esc(c)} (${n})</option>`).join('');
    sel.value = state.city;
    const nHttp = state.all.filter(blocked).length;
    $('#http-toggle').hidden = !nHttp;
    $('#http-count').textContent = nHttp;
  }

  // ---------------------------------------------------------------- player
  const audio = $('#audio');
  const playerEl = $('#player');
  const npState = $('#np-state');
  const player = { playing: false, loading: false, timer: null, timerEnd: 0, connectT: null };

  function setState(kind, text) {
    player.playing = kind === 'live';
    player.loading = kind === 'load';
    playerEl.classList.toggle('playing', player.playing);
    playerEl.classList.toggle('loading', player.loading);
    npState.className = `np-state${kind === 'live' ? ' live' : kind === 'err' ? ' err' : ''}`;
    npState.textContent = text;
    $('#btn-play').setAttribute('aria-label', player.playing || player.loading ? 'Oprește' : 'Pornește');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = player.playing ? 'playing' : 'paused';
    document.querySelectorAll('.card.on').forEach((c) => c.classList.toggle('playing', player.playing));
    if (kind === 'live') live.start(); else if (kind !== 'load') live.stop();
  }

  function showPlayer(st) {
    playerEl.hidden = false;
    $('#np-logo').outerHTML = logoHTML(st).replace('class="logo ', 'id="np-logo" class="logo ');
    $('#np-name').textContent = st.name;
    syncFavBtn();
    applyTint(st);
    live.paint();
  }

  function syncFavBtn() {
    const on = !!state.current && isFav(state.current.id);
    $('#btn-fav').setAttribute('aria-pressed', on);
    $('#btn-fav').setAttribute('aria-label', on ? 'Scoate din favorite' : 'Adaugă la favorite');
  }

  let hls = null;
  let hlsLoading = null;
  function loadHls() {
    if (window.Hls) return Promise.resolve();
    return hlsLoading || (hlsLoading = new Promise((ok, bad) => {
      const sc = document.createElement('script');
      sc.src = HLS_JS; sc.onload = ok; sc.onerror = () => { hlsLoading = null; bad(new Error('hls.js')); };
      document.head.appendChild(sc);
    }));
  }

  function stopAudio() {
    clearTimeout(player.connectT);
    if (hls) { hls.destroy(); hls = null; }
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  function play(st, isRetry = false) {
    if (!st) return;
    player.attempt = isRetry ? 1 : 0;
    if (blocked(st)) {
      toast('Postul ăsta are doar stream http, care nu poate porni pe o pagină https.');
      return;
    }
    const same = state.current && state.current.id === st.id;
    state.current = st;
    store.set('dany.last', st);
    state.recent = [st.id, ...state.recent.filter((id) => id !== st.id)].slice(0, 24);
    store.set('dany.recent', state.recent);
    state.failed.delete(st.id);
    if (!same) showPlayer(st);

    stopAudio();
    setState('load', 'Se conectează…');
    const onErr = (err) => {
      if (state.current !== st) return;
      if (err && err.name === 'NotAllowedError') setState('idle', 'Apasă play ca să pornești');
      else if (err && err.name !== 'AbortError') fail(st);
    };
    if (st.hls && !NATIVE_HLS) {
      // Chrome/Firefox pe desktop: HLS prin hls.js (Safari/iPhone îl redă nativ)
      loadHls().then(() => {
        if (state.current !== st || !window.Hls || !Hls.isSupported()) { if (state.current === st) fail(st); return; }
        hls = new Hls({ lowLatencyMode: false });
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal && state.current === st) fail(st); });
        hls.loadSource(st.url);
        hls.attachMedia(audio);
        audio.play().catch(onErr);
      }, () => onErr(new Error('hls')));
    } else {
      audio.src = st.url;
      audio.play().catch(onErr);
    }
    player.connectT = setTimeout(() => { if (state.current === st && player.loading) fail(st); }, CONNECT_TIMEOUT);
    updateMediaSession(st);
    markCards();
    countClick(st);
  }

  function fail(st) {
    stopAudio();
    if (player.attempt === 0 && state.current === st) {
      // o reîncercare automată: rețeaua mobilă sau serverul postului pot sughița
      player.attempt = 1;
      setState('load', 'Reîncerc…');
      setTimeout(() => { if (state.current === st && player.loading) play(st, true); }, 2000);
      return;
    }
    state.failed.add(st.id);
    setState('err', 'Postul nu răspunde acum');
    toast(`${st.name} nu răspunde. Încearcă alt post sau revino mai târziu.`);
    markCards();
  }

  function pause() {
    stopAudio();
    setState('idle', 'Oprit');
  }

  function toggle() {
    if (!state.current) { if (state.visible[0]) play(state.visible[0]); return; }
    if (player.playing || player.loading) pause(); else play(state.byId.get(state.current.id) || state.current);
  }

  function step(dir) {
    const list = state.visible.filter((s) => !blocked(s));
    if (!list.length) return;
    const i = state.current ? list.findIndex((s) => s.id === state.current.id) : -1;
    play(list[(i + dir + list.length) % list.length]);
  }

  function markCards() {
    document.querySelectorAll('.card').forEach((c) => {
      const on = state.current && c.dataset.id === state.current.id;
      c.classList.toggle('on', !!on);
      c.classList.toggle('playing', !!on && player.playing);
      const st = state.byId.get(c.dataset.id);
      if (st) c.querySelector('.sl').innerHTML = subLine(st);
    });
  }

  audio.addEventListener('playing', () => { clearTimeout(player.connectT); setState('live', 'În direct'); });
  audio.addEventListener('waiting', () => { if (player.playing) setState('load', 'Se încarcă…'); });
  audio.addEventListener('error', () => {
    if (!state.current || (!audio.getAttribute('src') && !hls)) return;
    fail(state.current);
  });
  audio.addEventListener('pause', () => { if (player.playing) setState('idle', 'Oprit'); });

  function countClick(st) {
    // ajută statisticile Radio Browser (sursa listei); nu blochează nimic
    fetch(`https://${apiHost}/json/url/${encodeURIComponent(st.id)}`).catch(() => {});
  }

  function updateMediaSession(st) {
    if (!('mediaSession' in navigator)) return;
    const artwork = st.favicon && (!SECURE || st.favicon.startsWith('https://'))
      ? [{ src: st.favicon, sizes: '256x256' }]
      : [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }];
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: st.name, artist: 'DanyColegu · în direct', album: st.city || 'Radio România', artwork });
    } catch { /* Safari vechi */ }
  }
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const set = (a, f) => { try { ms.setActionHandler(a, f); } catch { /* nesuportat */ } };
    set('play', () => toggle());
    set('pause', () => pause());
    set('stop', () => pause());
    set('previoustrack', () => step(-1));
    set('nexttrack', () => step(1));
  }


  // ---------------------------------------------------------------- look pe post
  // culoarea dominantă din logo (prin proxy de imagini cu CORS); fără logo → nuanța inițialelor
  const tintCache = new Map();
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, sat, l];
  }
  function dominantHue(img) {
    const c = document.createElement('canvas');
    c.width = c.height = 40;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 40, 40);
    const px = x.getImageData(0, 0, 40, 40).data;
    const bins = new Float64Array(24), sats = new Float64Array(24);
    let total = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 160) continue;
      const [h, sat, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
      if (sat < 0.28 || l < 0.12 || l > 0.9) continue;
      const w = sat * (1 - Math.abs(l - 0.5));
      const b = Math.floor(h / 15) % 24;
      bins[b] += w; sats[b] += sat * w; total += w;
    }
    if (total < 6) return null; // logo alb-negru → rămâne culoarea casei
    const score = (b) => bins[b] + 0.5 * (bins[(b + 23) % 24] + bins[(b + 1) % 24]);
    let best = 0;
    for (let b = 1; b < 24; b++) if (score(b) > score(best)) best = b;
    return { h: best * 15 + 7, s: sats[best] / bins[best] };
  }
  function tintFor(st) {
    if (tintCache.has(st.id)) return Promise.resolve(tintCache.get(st.id));
    const fallback = () => ({ h: hash(st.key || st.name) % 360, s: 0.6 });
    if (!st.favicon) { const t = fallback(); tintCache.set(st.id, t); return Promise.resolve(t); }
    return new Promise((done) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      const finish = (t) => { tintCache.set(st.id, t); done(t); };
      const timer = setTimeout(() => finish(fallback()), 4000);
      img.onload = () => { clearTimeout(timer); let t = null; try { t = dominantHue(img); } catch { /* canvas blocat */ } finish(t); };
      img.onerror = () => { clearTimeout(timer); finish(fallback()); };
      img.src = IMG_PROXY + encodeURIComponent(st.favicon.replace(/^https?:\/\//, ''));
    });
  }
  function applyTint(st) {
    tintFor(st).then((t) => {
      if (!state.current || state.current.id !== st.id) return;
      const css = t ? `hsl(${Math.round(t.h)} ${Math.round(Math.min(0.9, Math.max(0.55, t.s)) * 100)}% 60%)` : '#ffb547';
      document.body.style.setProperty('--tint', css);
    });
  }

  // ---------------------------------------------------------------- trimite postul
  function shareLink(st) { return `${location.origin}${location.pathname}?post=${encodeURIComponent(st.id)}`; }
  async function shareCurrent() {
    const st = state.current;
    if (!st) return;
    const url = shareLink(st);
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: `${st.name} pe DanyColegu`, text: `Ascultă ${st.name} pe DanyColegu 📻`, url }); } catch { /* anulat */ }
      return;
    }
    try { await navigator.clipboard.writeText(url); toast('Link copiat. Trimite-l colegilor!'); } catch {
      const ta = document.createElement('textarea');
      ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch { /* vechi */ }
      ta.remove();
      if (copied) toast('Link copiat. Trimite-l colegilor!'); else prompt('Copiază linkul:', url);
    }
  }
  let sharedHandled = false;
  function openShared() {
    if (sharedHandled) return;
    const id = new URLSearchParams(location.search).get('post');
    if (!id || !state.all.length) return;
    sharedHandled = true;
    const st = state.byId.get(id);
    if (!st) { toast('Postul din link nu mai e în listă.'); return; }
    if (blocked(st)) { toast('Postul din link nu poate porni pe pagina asta (doar http).'); return; }
    stopAudio();
    state.current = st;
    showPlayer(st);
    setState('idle', 'Apasă play ca să asculți');
    updateMediaSession(st);
    markCards();
    const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (card) card.scrollIntoView({ block: 'center' });
    const q = new URLSearchParams(location.search); q.delete('post');
    history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : ''));
  }

  // ---------------------------------------------------------------- colegi online
  // anonim: un id aleator per filă (nu e salvat nicăieri), fără cookie-uri; serverul ține doar id + post + ora.
  // Cât timp pagina e deschisă (sau cântă în fundal) trimite un semnal la 45 s; la închidere anunță plecarea.
  let chatHook = null; // setat de chat: primește ultimul id de mesaj la fiecare semnal
  const live = (() => {
    const sid = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    let counts = {};
    let online = 0;
    let ok = false;
    let beatT = null, current = '', away = false;
    const json = (r) => (r.ok ? r.json() : Promise.reject(r.status));
    const got = (data) => { if (data && data.counts) { counts = data.counts; online = data.online || 0; ok = true; paint(); if (chatHook) chatHook(data.chat); } };
    const lost = () => { if (ok) { ok = false; paint(); } };
    // text/plain = cerere „simplă”, fără preflight CORS
    function send(body) {
      return fetch(`${COUNTER}/beat`, { method: 'POST', body: JSON.stringify(body), keepalive: true, headers: { 'Content-Type': 'text/plain' } }).then(json);
    }
    function beat() { away = false; send({ sid, station: current }).then(got, lost); }
    function leave() {
      if (away) return;
      away = true;
      const body = JSON.stringify({ sid, station: '', leave: 1 });
      if (navigator.sendBeacon) navigator.sendBeacon(`${COUNTER}/beat`, body);
      else send(JSON.parse(body)).catch(() => {});
    }
    function restart() { clearInterval(beatT); beat(); beatT = setInterval(beat, 45000); }
    function start() {
      if (!COUNTER || !state.current || current === state.current.id) return;
      current = state.current.id;
      restart();
    }
    function stop() {
      if (!COUNTER || !current) return;
      current = '';
      restart();
    }
    function n(id) { return ok ? counts[id] || 0 : 0; }
    function paint() {
      document.querySelectorAll('.card').forEach((c) => {
        const el = c.querySelector('.lc');
        if (el) el.textContent = lcText(c.dataset.id);
      });
      const el = $('#online');
      el.hidden = !ok || online < 1;
      el.textContent = online <= 1 ? 'doar tu acum' : `${online} colegi online`;
      el.dataset.short = online <= 1 ? 'doar tu' : `${online} online`;
      el.title = 'Câți colegi au DanyColegu deschis chiar acum';
    }
    if (COUNTER) {
      restart();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') restart();
        else if (!current) { clearInterval(beatT); leave(); } // în fundal fără muzică = plecat
      });
      addEventListener('pagehide', leave);
    }
    return { start, stop, paint, n, sid };
  })();
  // ---------------------------------------------------------------- chat colegi
  // nume ales de fiecare (salvat doar în browserul lui), mesajele stau pe server 24 h
  const chat = (() => {
    const panel = $('#chat'), list = $('#chat-list'), fab = $('#chat-fab'), badge = $('#chat-badge');
    const form = $('#chat-form'), input = $('#chat-input'), nameForm = $('#chat-name-form'), nameInput = $('#chat-name');
    let last = 0, open = false, pollT = null, loading = false, latest = 0;
    let seen = store.get('dany.chatSeen', 0);
    let nick = store.get('dany.nick', '');
    const sid = live.sid;

    const hueOf = (s) => hash(fold(s)) % 360;
    const timeOf = (ts) => new Date(ts * 1000).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });

    function showBadge() {
      const n = open ? 0 : Math.max(0, latest - seen);
      badge.hidden = n === 0;
      badge.textContent = n > 99 ? '99+' : String(n);
    }
    function markSeen() { if (last > seen) { seen = last; store.set('dany.chatSeen', seen); } showBadge(); }

    function add(msgs) {
      if (!msgs || !msgs.length) return;
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      const frag = document.createDocumentFragment();
      for (const m of msgs) {
        if (m.id <= last) continue;
        last = m.id;
        const el = document.createElement('div');
        el.className = `msg${m.name === nick ? ' mine' : ''}`;
        el.innerHTML = `<div class="msg-meta"><b style="color:hsl(${hueOf(m.name)} 75% 70%)"></b>${m.station ? '<span class="msg-st"></span>' : ''}<time>${timeOf(m.ts)}</time></div><div class="bubble"></div>`;
        el.querySelector('b').textContent = m.name;
        if (m.station) el.querySelector('.msg-st').textContent = `🎧 ${m.station}`;
        el.querySelector('.bubble').textContent = m.text;
        frag.appendChild(el);
      }
      $('#chat-empty').hidden = true;
      list.appendChild(frag);
      latest = Math.max(latest, last);
      if (atBottom || msgs.some((m) => m.name === nick)) list.scrollTop = list.scrollHeight;
      if (open) markSeen();
    }

    function fetchNew() {
      if (loading || document.visibilityState !== 'visible') return;
      loading = true;
      fetch(`${COUNTER}/chat?after=${last}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((d) => { add(d.msgs); if (!last) $('#chat-empty').hidden = false; })
        .catch(() => {})
        .finally(() => { loading = false; });
    }

    function syncName() {
      const has = !!nick;
      nameForm.hidden = has;
      form.hidden = !has;
      $('#chat-me').textContent = has ? `Tu: ${nick} ✎` : '';
      $('#chat-me').hidden = !has;
    }

    // iPhone: când apare tastatura, panoul se strânge pe zona vizibilă
    function fitViewport() {
      if (!open || !window.visualViewport || innerWidth > 640) { panel.style.height = ''; panel.style.top = ''; return; }
      panel.style.height = `${visualViewport.height}px`;
      panel.style.top = `${visualViewport.offsetTop}px`;
      list.scrollTop = list.scrollHeight;
    }

    function setOpen(v) {
      open = v;
      panel.hidden = !v;
      fab.setAttribute('aria-expanded', v);
      document.body.classList.toggle('chat-open', v);
      clearInterval(pollT);
      if (v) {
        syncName();
        fetchNew();
        pollT = setInterval(fetchNew, 4000);
        list.scrollTop = list.scrollHeight;
        markSeen();
        fitViewport();
        if (innerWidth > 640) (nick ? input : nameInput).focus();
      } else {
        showBadge();
      }
    }

    fab.addEventListener('click', () => setOpen(!open));
    $('#chat-close').addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) setOpen(false); });
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', fitViewport);
      visualViewport.addEventListener('scroll', fitViewport);
    }

    nameForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = nameInput.value.replace(/\s+/g, ' ').trim().slice(0, 24);
      if (!v) { nameInput.focus(); return; }
      nick = v;
      store.set('dany.nick', nick);
      syncName();
      input.focus();
    });
    $('#chat-me').addEventListener('click', () => {
      nameInput.value = nick;
      nick = '';
      syncName();
      nameInput.focus();
    });

    let sending = false;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || sending) return;
      sending = true;
      const station = state.current && (player.playing || player.loading) ? state.current.name : '';
      fetch(`${COUNTER}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ sid, name: nick, text, station, after: last }),
      }).then((r) => r.json()).then((d) => {
        if (d.error === 'slow') { toast('Mai încet puțin 🙂'); return; }
        if (d.error) { toast('Mesajul nu a plecat. Încearcă din nou.'); return; }
        input.value = '';
        add(d.msgs);
      }).catch(() => toast('Mesajul nu a plecat. Verifică internetul.'))
        .finally(() => { sending = false; input.focus(); });
    });

    if (COUNTER) fab.hidden = false;
    syncName();
    return {
      // vine din semnalul de prezență (la ~45 s): ultimul id de mesaj de pe server
      beat(n) { latest = Math.max(latest, n || 0); showBadge(); },
    };
  })();
  chatHook = (n) => chat.beat(n);

  function lcText(id) { const k = live.n(id); return k > 0 ? `🎧 ${k}` : ''; }

  // ---------------------------------------------------------------- favorite
  function toggleFav(id) {
    const st = state.byId.get(id) || state.favs.find((f) => f.id === id) || (state.current && state.current.id === id ? state.current : null);
    if (!st) return;
    if (isFav(id)) {
      state.favs = state.favs.filter((f) => f.id !== id);
      toast(`${st.name} scos din favorite`);
    } else {
      state.favs = [...state.favs, st];
      toast(`${st.name} adăugat la favorite`);
    }
    store.set('dany.favs', state.favs);
    syncFavBtn();
    if (state.tab === 'fav') render();
    else {
      document.querySelectorAll(`.card[data-id="${CSS.escape(id)}"] .fav`).forEach((b) => b.setAttribute('aria-pressed', isFav(id)));
      $('#count-fav').textContent = state.favs.length || '';
    }
  }

  // ---------------------------------------------------------------- timer
  const TIMER_STEPS = [0, 15, 30, 60, 90];
  let timerIdx = 0;
  function cycleTimer() {
    timerIdx = (timerIdx + 1) % TIMER_STEPS.length;
    clearTimeout(player.timer);
    const min = TIMER_STEPS[timerIdx];
    $('#btn-timer').classList.toggle('set', min > 0);
    $('#timer-label').textContent = min ? String(min) : '';
    if (min) {
      player.timer = setTimeout(() => { pause(); timerIdx = 0; $('#btn-timer').classList.remove('set'); $('#timer-label').textContent = ''; toast('Radioul s-a oprit (oprire automată).'); }, min * 60000);
      toast(`Se oprește singur în ${min} de minute`);
    } else toast('Oprire automată dezactivată');
  }

  // ---------------------------------------------------------------- toast
  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------------------------------------------------------------- events
  listEl.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('.fav')) { toggleFav(id); return; }
    const st = state.byId.get(id) || state.favs.find((f) => f.id === id);
    if (state.current && state.current.id === id && (player.playing || player.loading)) pause();
    else play(st);
  });

  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    state.tab = b.dataset.tab;
    document.querySelectorAll('.tabs [data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b));
    render();
    window.scrollTo({ top: 0 });
  });

  $('#genres').addEventListener('click', (e) => {
    const b = e.target.closest('[data-genre]');
    if (!b) return;
    state.genre = state.genre === b.dataset.genre ? '' : b.dataset.genre;
    document.querySelectorAll('#genres .chip').forEach((x) => x.setAttribute('aria-pressed', x.dataset.genre === state.genre));
    render();
  });

  $('#city').addEventListener('change', (e) => { state.city = e.target.value; render(); });

  let qT;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(qT);
    qT = setTimeout(() => { state.q = fold(e.target.value).trim().replace(/\s+/g, ' '); render(); }, 120);
  });

  $('#show-http').addEventListener('change', (e) => { state.showHttp = e.target.checked; renderFilters(); render(); });

  $('#btn-play').addEventListener('click', toggle);
  $('#btn-prev').addEventListener('click', () => step(-1));
  $('#btn-next').addEventListener('click', () => step(1));
  $('#btn-fav').addEventListener('click', () => state.current && toggleFav(state.current.id));
  $('#btn-timer').addEventListener('click', cycleTimer);
  $('#btn-share').addEventListener('click', shareCurrent);

  const vol = $('#vol');
  if (CAN_VOLUME) {
    vol.value = store.get('dany.vol', 0.9);
    audio.volume = +vol.value;
    vol.addEventListener('input', () => { audio.volume = +vol.value; store.set('dany.vol', +vol.value); });
  } else {
    $('#vol-wrap').hidden = true; // iOS: volumul se reglează din butoanele telefonului
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) {
      if (e.key === 'Escape' && e.target.id === 'q') { e.target.value = ''; state.q = ''; render(); e.target.blur(); }
      return;
    }
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
    else if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
    else if (e.key === 'ArrowRight' && e.altKey) step(1);
    else if (e.key === 'ArrowLeft' && e.altKey) step(-1);
  });

  // ---------------------------------------------------------------- boot
  function apply(list) {
    state.all = list;
    state.byId = new Map(list.map((s) => [s.id, s]));
    // ține la zi copiile salvate în favorite (URL, logo)
    state.favs = state.favs.map((f) => state.byId.get(f.id) || f);
    store.set('dany.favs', state.favs);
    statusEl.textContent = '';
    renderFilters();
    render();
    openShared();
  }

  async function boot() {
    if (state.current) {
      showPlayer(state.current);
      setState('idle', 'Ultimul ascultat · apasă play');
      updateMediaSession(state.current);
    }
    const cached = store.get(CACHE_KEY, null);
    if (cached && cached.list && cached.list.length) apply(cached.list);
    const fresh = cached && Date.now() - cached.t < CACHE_TTL;
    if (fresh) return;
    try {
      const raw = await loadFromApi();
      const list = normalize(raw);
      store.set(CACHE_KEY, { t: Date.now(), list });
      apply(list);
    } catch {
      if (state.all.length) return;
      try {
        const raw = await fetchJSON(SNAPSHOT, 10000);
        apply(normalize(raw));
        toast('Serverul cu posturi nu răspunde, folosesc lista salvată.');
      } catch {
        statusEl.textContent = 'Nu pot încărca lista de posturi. Verifică internetul și reîncarcă pagina.';
      }
    }
  }

  // ---------------------------------------------------------------- actualizare automată
  // telefonul ține pagina în cache; la deschidere verificăm version.json și reîncărcăm dacă e versiune nouă
  const VERSION = '7';
  function checkUpdate() {
    if (location.protocol !== 'https:') return;
    fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (!d || !d.v || String(d.v) === VERSION) return;
      let tried = '';
      try { tried = sessionStorage.getItem('dany.reloadFor') || ''; } catch { /* privat */ }
      if (tried === String(d.v)) return; // o singură reîncercare, fără bucle
      try { sessionStorage.setItem('dany.reloadFor', String(d.v)); } catch { /* privat */ }
      if (player.playing) { toast('A apărut o versiune nouă. Se aplică la următoarea deschidere.'); return; }
      location.reload();
    }).catch(() => {});
  }
  checkUpdate();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });

  boot();
})();
