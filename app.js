/* UTMB — moteur du site V1.4.1 (le contenu se gère dans le Google Sheet) */
(() => {
  'use strict';
  const C = window.UTMB_CONFIG, I18N = window.UTMB_I18N, FLAGS = window.UTMB_FLAGS;
  const $ = (s, r = document) => r.querySelector(s);
  const SEEN_KEY = 'utmb_seen', DOSSARD_KEY = 'utmb_dossard', GATE_KEY = 'utmb_ok', LANG_KEY = 'utmb_lang',
        SCROLL_KEY = 'utmb_scroll', MODE_KEY = 'utmb_mode';
  let DATA = null, DATA_SIG = '', map = null, VIEW = null, markers = {}, touring = false, tourRaf = null, MODE = '3d', deferredInstall = null;
  let chronoTarget = null, chronoTimer = null, slideTimer = null, pendingFly = null, mapWanted = false, mapLibPromise = null;

  /* ---------- Langue ---------- */
  const LANGS = (C.langues || ['fr']).filter(l => I18N[l]);
  const LANG = (() => {
    const q = (new URLSearchParams(location.search).get('lang') || '').toLowerCase();
    if (LANGS.includes(q)) { localStorage.setItem(LANG_KEY, q); return q; }
    const s = localStorage.getItem(LANG_KEY); if (LANGS.includes(s)) return s;
    const n = (navigator.language || '').slice(0, 2).toLowerCase(); if (LANGS.includes(n)) return n;
    return LANGS[0] || 'fr';
  })();
  const t = (k, v = {}) => String((I18N[LANG] && I18N[LANG][k]) ?? I18N.fr[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  const CACHE_KEY = 'utmb_data_v1_' + LANG;

  function switchLang(l) {
    if (!LANGS.includes(l) || l === LANG) return;
    localStorage.setItem(LANG_KEY, l);
    sessionStorage.setItem(SCROLL_KEY, String(scrollY));
    const u = new URL(location.href);
    u.searchParams.delete('lang');
    history.replaceState(null, '', u.toString());
    location.reload();
  }
  function applyStaticI18n() {
    document.documentElement.lang = LANG;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll('[data-lang-switch]').forEach(box => {
      box.innerHTML = LANGS.map(l => `<button type="button" data-lang="${l}" aria-pressed="${l === LANG}" title="${I18N[l]._nom}" aria-label="${I18N[l]._nom}">${FLAGS[l] || l.toUpperCase()}</button>`).join('');
      box.addEventListener('click', ev => {
        const b = ev.target.closest('button[data-lang]'); if (!b) return;
        ev.preventDefault(); switchLang(b.dataset.lang);
      });
    });
  }

  /* ---------- Utilitaires ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const md = s => esc(s).split(/\n{2,}/).map(p => '<p>' + p
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>') + '</p>').join('');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
  const statut = e => { const s = norm(e.statut); return s.startsWith('nouv') ? 'nouveau' : s.startsWith('ouv') ? 'ouvert' : 'verrouille'; };
  const isOpen = e => statut(e) !== 'verrouille';
  const photos = key => (DATA.photos && DATA.photos[key]) || [];
  const toast = (msg, ms = 4000) => { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(el._h); el._h = setTimeout(() => el.classList.remove('show'), ms); };
  /* Miniatures Drive : on demande une taille adaptée à l'écran (beaucoup plus léger sur téléphone) */
  const sized = (u, w) => String(u).replace(/sz=w\d+/, 'sz=w' + Math.round(w));
  const ecranW = () => Math.min(2000, Math.round((window.innerWidth || 1000) * Math.min(2, window.devicePixelRatio || 1)));
  const imgTag = (src, alt = '') => `<img src="${esc(sized(src, 700))}" alt="${esc(alt)}" loading="lazy" decoding="async" data-zoom data-full="${esc(src)}">`;
  const fmtNum = n => Number(n).toLocaleString(t('_locale'));

  /* Dates : « 2027-07-24 », « 2027-07-24T15:00 », « 24/07/2027 », « 24/07/2027 15:00 » → heure locale */
  function parseDate(v) {
    if (!v) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2})[:h](\d{2}))?$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    const d = new Date(s); return isNaN(d) ? null : d;
  }

  /* Proximité de deux étapes (marqueurs superposés) */
  const close = (a, b) => Math.abs(a.lat - b.lat) < 0.02 && Math.abs(a.lng - b.lng) < 0.02;
  const stackedIds = () => {
    const out = new Set();
    DATA.etapes.forEach((e, i) => { if (DATA.etapes.slice(0, i).some(p => close(p, e))) out.add(e.id); });
    return out;
  };

  /* ---------- Porte d'accès ---------- */
  async function sha256(txt) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt.trim().toUpperCase()));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function gate() {
    if (!C.accessCodeHash) return;
    if (localStorage.getItem(GATE_KEY) === C.accessCodeHash) return;
    const urlCode = new URLSearchParams(location.search).get('code');
    if (urlCode && await sha256(urlCode) === C.accessCodeHash) { localStorage.setItem(GATE_KEY, C.accessCodeHash); return; }
    const g = $('#gate'); g.hidden = false; document.body.style.overflow = 'hidden';
    await new Promise(resolve => {
      $('#gateForm').addEventListener('submit', async ev => {
        ev.preventDefault();
        if (await sha256($('#gateInput').value) === C.accessCodeHash) {
          localStorage.setItem(GATE_KEY, C.accessCodeHash); g.hidden = true; document.body.style.overflow = ''; resolve();
        } else { $('#gateError').textContent = t('gate_err'); }
      });
    });
  }

  /* ---------- Données : affichage immédiat depuis le cache, puis mise à jour ---------- */
  function readCache() {
    if (!C.apiUrl) return C.demo;
    try { const c = localStorage.getItem(CACHE_KEY); return c ? JSON.parse(c) : null; } catch (e) { return null; }
  }
  async function fetchData() {
    if (!C.apiUrl) return null;
    const ctrl = 'AbortController' in window ? new AbortController() : null;
    const to = ctrl && setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(C.apiUrl + (C.apiUrl.includes('?') ? '&' : '?') + 'lang=' + LANG + '&t=' + Date.now(), ctrl ? { signal: ctrl.signal } : {});
      const txt = await r.text();
      const d = JSON.parse(txt);
      if (!d || !d.etapes) throw new Error('format');
      try { localStorage.setItem(CACHE_KEY, txt); } catch (e) {}
      return d;
    } catch (e) { return null; } finally { if (to) clearTimeout(to); }
  }
  function prepare(d) {
    d.parametres = d.parametres || {};
    d.etapes = (d.etapes || []).filter(e => e.titre)
      .map((e, i) => ({ ...e, ordre: Number(e.ordre) || i + 1, lat: num(e.lat) ?? NaN, lng: num(e.lng) ?? NaN }))
      .sort((a, b) => a.ordre - b.ordre);
    d.etapes.forEach((e, i) => { if (!e.id) e.id = 'etape-' + (i + 1); });
    d.hebergements = d.hebergements || []; d.programme = d.programme || []; d.photos = d.photos || {};
    return d;
  }

  function computeView() {
    const p = DATA.parametres, v = { ...C.map };
    const b = num(p.carte_orientation), z = num(p.carte_zoom), pi = num(p.carte_inclinaison), r = num(p.carte_relief);
    if (b !== null) v.bearing = b;
    if (z !== null) v.zoom = Math.min(16, Math.max(6, z));
    if (pi !== null) v.pitch = Math.min(80, Math.max(0, pi));
    if (r !== null) v.exaggeration = Math.min(3, Math.max(0.5, r));
    const c = String(p.carte_centre || '').split(/[;\s]+|,\s+/).map(num).filter(x => x !== null);
    if (c.length === 2) v.center = [c[1], c[0]];
    return v;
  }

  /* ---------- Accueil : compte à rebours + altimètre ---------- */
  const PROFIL = [[0,62],[22,56],[44,59],[68,48],[92,52],[116,41],[140,45],[164,33],[188,37],[212,26],[236,29],[258,17],[280,8],[300,13]];
  function profilY(x) {
    for (let i = 1; i < PROFIL.length; i++) {
      const [x1, y1] = PROFIL[i], [x0, y0] = PROFIL[i - 1];
      if (x <= x1) return y0 + (y1 - y0) * ((x - x0) / (x1 - x0 || 1));
    }
    return PROFIL[PROFIL.length - 1][1];
  }
  function initAltimetre() {
    const d = 'M0,70 ' + PROFIL.map(p => 'L' + p.join(',')).join(' ') + ' L300,70 Z';
    $('#altiBase').setAttribute('d', d); $('#altiFill').setAttribute('d', d);
    $('#altiMax').textContent = t('alti_max', { a: fmtNum(C.altitudeSommet) });
    $('#alti').hidden = false;
  }
  function majAltimetre(target) {
    const start = parseDate(C.departChrono) || new Date();
    const total = target - start, done = Date.now() - start;
    const p = total > 0 ? Math.min(1, Math.max(0, done / total)) : 1;
    const alt = Math.round(C.altitudeDepart + (C.altitudeSommet - C.altitudeDepart) * p);
    const x = Math.max(3, Math.min(297, p * 300));
    $('#altiClipRect').setAttribute('width', (p * 300).toFixed(1));
    $('#altiDot').setAttribute('cx', x.toFixed(1));
    $('#altiDot').setAttribute('cy', profilY(x).toFixed(1));
    $('#altiVal').textContent = fmtNum(alt);
    if (p >= 1) $('#altiMax').textContent = t('alti_top');
  }

  /* Compte à rebours : un seul minuteur, même si l'accueil est redessiné */
  function startChrono(target) {
    if (chronoTarget && +chronoTarget === +target) return;
    chronoTarget = target;
    $('#heroDate').textContent = target.toLocaleDateString(t('_locale'), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('#chrono').hidden = false;
    initAltimetre();
    let last = -1;
    const tick = () => {
      let s = Math.max(0, Math.floor((chronoTarget - Date.now()) / 1000));
      $('#cJ').textContent = Math.floor(s / 86400); s %= 86400;
      $('#cH').textContent = String(Math.floor(s / 3600)).padStart(2, '0'); s %= 3600;
      $('#cM').textContent = String(Math.floor(s / 60)).padStart(2, '0');
      $('#cS').textContent = String(s % 60).padStart(2, '0');
      const minute = Math.floor(Date.now() / 60000);
      if (minute !== last) { last = minute; majAltimetre(chronoTarget); }
    };
    clearInterval(chronoTimer); tick(); chronoTimer = setInterval(tick, 1000);
  }
  /* Accueil minimal, affiché avant même l'arrivée des données */
  function renderHeroInstant() {
    $('#footerVersion').textContent = 'v' + C.version;
    const target = parseDate(C.dateMariage);
    if (target) startChrono(target);
  }

  function renderHero() {
    const p = DATA.parametres;
    $('#heroTitre').textContent = p.titre || 'U.T.M.B.';
    $('#heroSousTitre').textContent = p.sous_titre || '';
    $('#heroPrenoms').textContent = p.prenoms || '';
    $('#heroLieu').textContent = p.lieu || '';
    $('#introMessage').textContent = p.message_accueil || '';
    document.title = `${p.titre || 'U.T.M.B.'} — ${p.sous_titre || ''}`;
    $('#footerVersion').textContent = 'v' + C.version;

    const target = parseDate(p.date_mariage) || parseDate(C.dateMariage);
    if (target) {
      startChrono(target);
    }

    const bg = $('#heroBg'), imgs = photos('accueil');
    clearInterval(slideTimer);
    bg.classList.toggle('empty', !imgs.length);
    bg.innerHTML = imgs.map((u, i) => `<img src="${esc(sized(u, ecranW()))}" alt="" decoding="async"${i ? ' loading="lazy"' : ' fetchpriority="high"'}>`).join('');
    const els = bg.querySelectorAll('img');
    if (els.length) {
      let k = 0; els[0].classList.add('on');
      if (els.length > 1) slideTimer = setInterval(() => { els[k].classList.remove('on'); k = (k + 1) % els.length; els[k].classList.add('on'); }, 6000);
    }

    const strip = photos('bandeau');
    $('#strip').hidden = !strip.length;
    const html = strip.map(u => imgTag(u)).join('');
    $('#stripTrack').innerHTML = html + html;

    const d = JSON.parse(localStorage.getItem(DOSSARD_KEY) || 'null');
    if (d) showDossard(d);
  }
  function showDossard(d) {
    $('#dossard').hidden = false;
    $('#dossardNum').textContent = String(d.num).padStart(3, '0');
    $('#dossardName').textContent = d.nom;
  }

  /* ---------- Installation en appli ---------- */
  function initInstall() {
    const btn = $('#btnInstall');
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    if (standalone) return;
    if (ios) btn.hidden = false;
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; btn.hidden = false; });
    addEventListener('appinstalled', () => { btn.hidden = true; deferredInstall = null; toast(t('installe')); });
    btn.addEventListener('click', async () => {
      if (deferredInstall) {
        deferredInstall.prompt();
        try { const r = await deferredInstall.userChoice; if (r.outcome === 'accepted') btn.hidden = true; } catch (e) {}
        deferredInstall = null;
      } else { $('#iosModal').hidden = false; }
    });
    const closeModal = () => { $('#iosModal').hidden = true; };
    $('#iosClose').addEventListener('click', closeModal);
    $('#iosModal').addEventListener('click', e => { if (e.target.id === 'iosModal') closeModal(); });
  }

  /* ---------- Navigation (pastilles sur mobile) ---------- */
  function renderNav() {
    $('#navLinks').innerHTML = DATA.etapes.map((e, i) => {
      const open = isOpen(e);
      return `<a href="#${esc(e.id)}" class="${open ? '' : 'locked'}" title="${esc(e.titre)}" aria-label="${i + 1}. ${esc(e.titre)}">` +
        `<span class="nl-num" aria-hidden="true">${open ? i + 1 : '🔒'}</span><span class="nl-txt">${open ? '' : '🔒 '}${esc(e.titre)}</span></a>`;
    }).join('') +
      (hasGalerie() ? `<a href="#galerie" class="nl-gal" title="${esc(t('galerie'))}" aria-label="${esc(t('galerie'))}"><span class="nl-num" aria-hidden="true">📷</span><span class="nl-txt">${esc(t('galerie'))}</span></a>` : '');
  }
  let spy = null;
  function initScrollSpy() {
    if (!('IntersectionObserver' in window)) return;
    if (spy) spy.disconnect();
    const links = [...document.querySelectorAll('#navLinks a')];
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        links.forEach(a => a.classList.toggle('current', a.getAttribute('href') === '#' + en.target.id));
        const a = links.find(l => l.classList.contains('current')), box = $('#navLinks');
        if (a && box.scrollWidth > box.clientWidth) box.scrollTo({ left: a.offsetLeft - box.clientWidth / 2, behavior: 'smooth' });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    spy = io;
    document.querySelectorAll('.stage, #galerie').forEach(s => io.observe(s));
  }

  /* ---------- Progression ---------- */
  function renderProgress() {
    const total = DATA.etapes.length, open = DATA.etapes.filter(isOpen);
    const last = open[open.length - 1];
    const maxKm = Math.max(...DATA.etapes.map(e => Number(e.km) || 0), 1);
    const pct = total ? Math.round(((last ? Number(last.km) || 0 : 0) / maxKm) * 100) : 0;
    setTimeout(() => $('#progressFill').style.width = Math.max(pct, open.length ? 6 : 0) + '%', 300);
    $('#progressText').textContent = t('progress', { n: open.length, t: total }) + (last && last.km !== '' ? ` · km ${last.km}` : '');
  }

  /* ---------- Panneau des points de passage ---------- */
  function renderPanel() {
    $('#cpPanel').innerHTML = DATA.etapes.map((e, i) => {
      const st = statut(e);
      return `<button type="button" class="cp ${st === 'verrouille' ? 'locked' : ''}" data-id="${esc(e.id)}">
        <span class="cp-num">${st === 'verrouille' ? '🔒' : i + 1}</span>
        <span><span class="cp-title">${esc(e.titre)} ${st === 'nouveau' ? `<span class="badge">${esc(t('nouveau'))}</span>` : ''}</span>
        <span class="cp-meta">${esc(e.cp || '')} · ${esc(e.lieu || '')}${e.km !== '' && e.km != null ? ' · km ' + esc(e.km) : ''}</span></span>
      </button>`;
    }).join('');
  }
  function selectStage(id, fly, silent) {
    const e = DATA.etapes.find(x => x.id === id); if (!e) return;
    document.querySelectorAll('.cp').forEach(b => b.classList.toggle('active', b.dataset.id === id));
    document.querySelectorAll('.m2-mk').forEach(g => g.classList.toggle('active', g.dataset.id === id));
    if (fly && MODE === '3d' && map && !isNaN(e.lat)) {
      stopTour();
      map.flyTo({ center: [e.lng, e.lat], zoom: 12.6, pitch: 66, bearing: VIEW.bearing + 20, duration: 2800, essential: true });
    }
    if (silent) return;
    if (!isOpen(e)) toast(`🔒 ${e.titre} — ${e.indice || t('bientot')}`);
    else toast(`📍 ${e.cp || ''} ${e.lieu || ''} — ${e.titre} · ${t('toast_tap')}`, 3000);
    const btn = document.querySelector(`.cp[data-id="${CSS.escape(id)}"]`);
    if (btn && btn.dataset.armed) { goTo(id); delete btn.dataset.armed; }
    else if (btn) { document.querySelectorAll('.cp').forEach(b => delete b.dataset.armed); btn.dataset.armed = '1'; }
  }

  /* ---------- Mode carte 2D / 3D ---------- */
  const WEBGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  const LOW_END = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  let CAN_3D = WEBGL;
  const MAPLIBRE = 'https://unpkg.com/maplibre-gl@4.7.1/dist/';
  function loadMaplibre() {
    if (window.maplibregl) return Promise.resolve();
    if (mapLibPromise) return mapLibPromise;
    mapLibPromise = new Promise((ok, ko) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = MAPLIBRE + 'maplibre-gl.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = MAPLIBRE + 'maplibre-gl.js'; s.async = true;
      s.onload = () => window.maplibregl ? ok() : ko(); s.onerror = ko; document.head.appendChild(s);
    });
    return mapLibPromise;
  }
  function ensure3D() {
    if (MODE !== '3d' || map || !mapWanted || !DATA) return;
    $('#map').classList.add('loading');
    loadMaplibre().then(() => { $('#map').classList.remove('loading'); if (MODE === '3d' && !map) initMap(); })
      .catch(() => { CAN_3D = false; $('#map').classList.remove('loading'); setMode('2d', true); });
  }

  function setMode(m, info) {
    MODE = (m === '3d' && CAN_3D) ? '3d' : '2d';
    const is3d = MODE === '3d';
    $('#map').hidden = !is3d; $('#map2d').hidden = is3d;
    $('#btnTour').hidden = !is3d; $('#btnReset').hidden = !is3d;
    $('#btnMode').hidden = !CAN_3D;
    $('#btnMode').textContent = is3d ? t('mode2d') : t('mode3d');
    if (is3d) { stopTour(); if (!map) ensure3D(); else map.resize(); }
    else { stopTour(); if (DATA) render2D(); if (info) toast(t('info2d'), 3500); }
  }
  function initModes() {
    const saved = localStorage.getItem(MODE_KEY);
    const start = !CAN_3D ? '2d' : (saved || (LOW_END ? '2d' : '3d'));
    setMode(start, !CAN_3D);
    let rz, lastW = innerWidth;
    addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => {
      if (MODE === '2d' && DATA && innerWidth !== lastW) { delete $('#map2d').dataset.ok; render2D(); } lastW = innerWidth; }, 250); });
    /* La carte n'est préparée que lorsqu'on s'en approche (gain de plusieurs secondes au lancement) */
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(en => { if (en.some(x => x.isIntersecting)) { mapWanted = true; io.disconnect(); ensure3D(); } }, { rootMargin: '400px 0px' });
      io.observe($('#parcours'));
    } else { mapWanted = true; ensure3D(); }
    $('#btnMode').addEventListener('click', () => {
      const next = MODE === '3d' ? '2d' : '3d';
      localStorage.setItem(MODE_KEY, next); setMode(next);
    });
  }

  /* ---------- Carte 2D (secours, sans WebGL) ---------- */
  function render2D() {
    const box = $('#map2d');
    if (box.dataset.ok) return;
    const pts = C.route.concat(DATA.etapes.filter(e => !isNaN(e.lat)).map(e => [e.lng, e.lat]));
    const lngs = pts.map(p => p[0]), lats = pts.map(p => p[1]);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs), minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    const S = 1000 / ((maxLng - minLng) * k);
    const X = lng => (lng - minLng) * k * S, Y = lat => (maxLat - lat) * S;
    const H = (maxLat - minLat) * S;
    const wide = matchMedia('(min-width:821px)').matches;
    const pad = 90, padR = wide ? 520 : 90;
    const vb = `${-pad} ${-pad} ${1000 + pad + padR} ${H + pad * 2}`;
    const vbW = 1000 + pad + padR, vbH = H + pad * 2;
    const u = Math.max(vbW / Math.max(280, box.clientWidth || 360), vbH / Math.max(300, box.clientHeight || 460)); // 1 px écran en unités SVG
    const fs = px => (px * u).toFixed(1);
    const line = arr => arr.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ');

    const open = DATA.etapes.filter(isOpen), last = open[open.length - 1];
    let cut = 0;
    if (last && !isNaN(last.lat)) {
      let best = Infinity;
      C.route.forEach((p, i) => { const d = (p[0] - last.lng) ** 2 + (p[1] - last.lat) ** 2; if (d < best) { best = d; cut = i; } });
      if (last === DATA.etapes[DATA.etapes.length - 1]) cut = C.route.length - 1;
    }
    const mbx = X(6.8652), mby = Y(45.8326);
    const rings = [60, 120, 185, 255, 330, 410].map((r, i) => `<ellipse class="m2-ring" cx="${mbx}" cy="${mby}" rx="${r * 1.25}" ry="${r}" transform="rotate(${-20 + i * 4} ${mbx} ${mby})"/>`).join('');
    const stacked = stackedIds();
    const order = DATA.etapes.map((e, i) => ({ e, i })).filter(o => !isNaN(o.e.lat))
      .sort((a, b) => (isOpen(a.e) - isOpen(b.e)) || (b.i - a.i)); // verrouillées dessous, étape 1 au-dessus
    const mk = order.map(({ e, i }) => {
      const st = statut(e), locked = st === 'verrouille';
      const dx = stacked.has(e.id) ? 20 * u : 0, dy = stacked.has(e.id) ? -14 * u : 0;
      const x = X(e.lng) + dx, y = Y(e.lat) + dy, r = (locked ? 13 : 16) * u;
      return `<g class="m2-mk ${locked ? 'locked' : st}" data-id="${esc(e.id)}" tabindex="0" role="button" aria-label="${esc(e.titre)}">
        <circle cx="${x}" cy="${y}" r="${r}"/><text x="${x}" y="${y}" font-size="${fs(locked ? 11 : 14)}">${locked ? '🔒' : i + 1}</text>
        <text class="m2-lbl" x="${x}" y="${locked ? y - r - 6 * u : y + r + 12 * u}" font-size="${fs(11)}" stroke-width="${fs(3)}">${esc(e.lieu || e.titre)}</text></g>`;
    }).join('');
    box.innerHTML = `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map 2D">
      ${rings}
      <path d="M${mbx - 12 * u},${mby + 8 * u} L${mbx},${mby - 10 * u} L${mbx + 12 * u},${mby + 8 * u} Z" fill="rgba(255,255,255,.85)"/>
      <text class="m2-summit" x="${mbx + 16 * u}" y="${mby + 4 * u}" font-size="${fs(11)}" stroke-width="${fs(3)}">❄️ Mont Blanc</text>
      <path class="m2-glow" d="${line(C.route)}"/>
      <path class="m2-route" d="${line(C.route)}"/>
      ${cut > 0 ? `<path class="m2-done" d="${line(C.route.slice(0, cut + 1))}"/>` : ''}
      ${mk}</svg>`;
    box.dataset.ok = '1';
    if (box.dataset.ev) return;
    box.dataset.ev = '1';
    box.addEventListener('click', ev => { const g = ev.target.closest('.m2-mk'); if (g) selectStage(g.dataset.id, false); });
    box.addEventListener('keydown', ev => {
      const g = ev.target.closest('.m2-mk');
      if (g && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); selectStage(g.dataset.id, false); }
    });
  }

  /* ---------- Carte 3D ---------- */
  function initMap() {
    VIEW = computeView();
    try {
      map = new maplibregl.Map({
        container: 'map',
        center: VIEW.center, zoom: VIEW.zoom, pitch: VIEW.pitch, bearing: VIEW.bearing,
        maxPitch: 80, attributionControl: { compact: true }, cooperativeGestures: matchMedia('(pointer:coarse)').matches,
        style: {
          version: 8,
          sources: {
            sat: { type: 'raster', tileSize: 256, maxzoom: 17,
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics' },
            dem: { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 14,
              tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
              attribution: 'Relief © Mapzen / AWS Terrain Tiles' },
            hs: { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 14,
              tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'] }
          },
          layers: [
            { id: 'bg', type: 'background', paint: { 'background-color': '#2b3a31' } },
            { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-saturation': -0.15, 'raster-contrast': 0.08 } },
            { id: 'hillshade', type: 'hillshade', source: 'hs', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#1c2b22' } }
          ],
          terrain: { source: 'dem', exaggeration: VIEW.exaggeration }
        }
      });
    } catch (e) { map = null; return setMode('2d', true); }
    map.on('error', ev => { if (String(ev?.error?.message || '').includes('WebGL')) setMode('2d', true); });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-left');

    map.on('load', () => {
      map.jumpTo({ center: VIEW.center, zoom: VIEW.zoom, pitch: VIEW.pitch, bearing: VIEW.bearing });
      if (pendingFly) { const id = pendingFly; pendingFly = null; setTimeout(() => selectStage(id, true, true), 900); }

      const route = C.route;
      const open = DATA.etapes.filter(isOpen), last = open[open.length - 1];
      let cut = 0;
      if (last && !isNaN(last.lat)) {
        let best = Infinity;
        route.forEach((p, i) => { const d = (p[0] - last.lng) ** 2 + (p[1] - last.lat) ** 2; if (d < best) { best = d; cut = i; } });
        if (last === DATA.etapes[DATA.etapes.length - 1]) cut = route.length - 1;
      }
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: route } } });
      map.addSource('done', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: route.slice(0, cut + 1) } } });
      map.addLayer({ id: 'route-glow', type: 'line', source: 'route', paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.18, 'line-blur': 2 } });
      map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 2.5, 'line-dasharray': [1.5, 2] } });
      if (cut > 0) map.addLayer({ id: 'done', type: 'line', source: 'done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#e0b56e', 'line-width': 5 } });

      const s = document.createElement('div'); s.className = 'summit'; s.innerHTML = '❄️ <span>Mont Blanc</span>';
      new maplibregl.Marker({ element: s }).setLngLat([6.8652, 45.8326]).addTo(map);

      /* Ordre d'empilement : verrouillées d'abord (dessous), puis ouvertes, étape 1 en dernier (dessus) */
      const stacked = stackedIds();
      DATA.etapes.map((e, i) => ({ e, i })).filter(o => !isNaN(o.e.lat) && !isNaN(o.e.lng))
        .sort((a, b) => (isOpen(a.e) - isOpen(b.e)) || (b.i - a.i))
        .forEach(({ e, i }) => {
          const st = statut(e), locked = st === 'verrouille';
          const el = document.createElement('div');
          el.style.zIndex = String((locked ? 100 : 1000) - i);
          const pin = document.createElement('div');
          pin.className = 'marker ' + (locked ? 'locked' : st);
          pin.innerHTML = `${locked ? '🔒' : i + 1}<span class="marker-label">${esc(e.lieu || e.titre)}</span>`;
          pin.setAttribute('role', 'button'); pin.setAttribute('aria-label', e.titre); pin.tabIndex = 0;
          el.appendChild(pin);
          el.addEventListener('click', ev => { ev.stopPropagation(); selectStage(e.id, true); });
          const opts = { element: el };
          if (stacked.has(e.id)) opts.offset = [26, -18]; // décale le marqueur superposé
          markers[e.id] = new maplibregl.Marker(opts).setLngLat([e.lng, e.lat]).addTo(map);
        });
    });
    ['mousedown', 'touchstart', 'wheel'].forEach(ev => map.getCanvas().addEventListener(ev, stopTour, { passive: true }));
  }

  function announceNew() {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    const fresh = DATA.etapes.filter(e => statut(e) === 'nouveau' && !seen.includes(e.id));
    if (fresh.length) {
      const e = fresh[fresh.length - 1];
      setTimeout(() => toast(t('toast_new', { t: e.titre }), 5000), 1200);
      selectStage(e.id, false, true);
      if (MODE === '3d') { if (map && map.loaded()) selectStage(e.id, true, true); else pendingFly = e.id; }
    }
    localStorage.setItem(SEEN_KEY, JSON.stringify(DATA.etapes.filter(isOpen).map(e => e.id)));
  }
  function startTour() {
    if (!map || MODE !== '3d') return; touring = true; $('#btnTour').classList.add('on');
    const step = () => { if (!touring) return; map.setBearing(map.getBearing() + 0.08); tourRaf = requestAnimationFrame(step); };
    step();
  }
  function stopTour() { touring = false; cancelAnimationFrame(tourRaf); $('#btnTour')?.classList.remove('on'); }

  /* ---------- Sections ---------- */
  function photosHtml(key) { const p = photos(key); return p.length ? `<div class="stage-photos">${p.map(u => imgTag(u)).join('')}</div>` : ''; }
  function linkHtml(e) { return e.lien_url ? `<p><a class="btn btn-ghost" href="${esc(e.lien_url)}" target="_blank" rel="noopener">${esc(e.lien_libelle || t('en_savoir'))} →</a></p>` : ''; }
  const formOff = () => C.apiUrl ? '' : `<p class="form-off">${esc(t('demo'))}</p>`;

  /* ---------- Formulaires dynamiques (onglet « Questions » du Sheet) ---------- */
  const DEMI = ['texte', 'email', 'telephone', 'nombre', 'date', 'liste'];
  const formulaires = () => (DATA.formulaires && Object.keys(DATA.formulaires).length) ? DATA.formulaires : (C.demo.formulaires || {});
  const vide = v => v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '');

  /* « presence=Oui », « presence!=Non », « besoin=A|B » */
  function condOk(si, rep) {
    if (!si) return true;
    const m = String(si).match(/^\s*([\w-]+)\s*(!=|=)\s*(.*)$/);
    if (!m) return true;
    const vals = m[3].split('|').map(s => norm(s)), v = rep[m[1]];
    const has = Array.isArray(v) ? v.some(x => vals.includes(norm(x))) : vals.includes(norm(v));
    return m[2] === '=' ? has : !has;
  }

  function champHtml(q, form) {
    const id = `f-${form}-${q.id}`, req = q.obligatoire ? ' <span class="req" aria-hidden="true">*</span>' : '';
    const nm = esc(q.id), ph = q.aide ? ` placeholder="${esc(q.aide)}"` : '', rq = q.obligatoire ? ' aria-required="true"' : '';
    const def = q.defaut != null && q.defaut !== '' ? String(q.defaut) : '';
    const lab = `<label for="${id}">${esc(q.question)}${req}</label>`;
    const opts = q.options || [];
    let inner;
    switch (q.type) {
      case 'texte_long': inner = lab + `<textarea id="${id}" name="${nm}" maxlength="1000"${ph}${rq}>${esc(def)}</textarea>`; break;
      case 'email': inner = lab + `<input id="${id}" name="${nm}" type="email" maxlength="120" autocomplete="email" value="${esc(def)}"${ph}${rq}>`; break;
      case 'telephone': inner = lab + `<input id="${id}" name="${nm}" type="tel" maxlength="30" autocomplete="tel" value="${esc(def)}"${ph}${rq}>`; break;
      case 'nombre': inner = lab + `<input id="${id}" name="${nm}" type="number" inputmode="numeric" min="${q.min}" max="${q.max}" step="1" value="${esc(def)}"${ph}${rq}>`; break;
      case 'date': inner = lab + `<input id="${id}" name="${nm}" type="date" value="${esc(def)}"${rq}>`; break;
      case 'liste': inner = lab + `<select id="${id}" name="${nm}"${rq}><option value="">${esc(t('choisir'))}</option>` +
        opts.map(o => `<option value="${esc(o.v)}"${norm(o.v) === norm(def) ? ' selected' : ''}>${esc(o.l)}</option>`).join('') + '</select>'; break;
      case 'choix': case 'ouinon': case 'cases': {
        const multi = q.type === 'cases';
        const list = q.type === 'ouinon' && !opts.length ? [{ v: 'Oui', l: t('oui') }, { v: 'Non', l: t('non') }] : opts;
        const defs = def.split(';').map(norm);
        inner = `<fieldset class="choice-set"><legend>${esc(q.question)}${req}</legend>${q.aide ? `<p class="q-aide">${esc(q.aide)}</p>` : ''}<div class="choice">` +
          list.map(o => `<label><input type="${multi ? 'checkbox' : 'radio'}" name="${nm}" value="${esc(o.v)}"${defs.includes(norm(o.v)) && def ? ' checked' : ''}><span class="opt">${esc(o.l)}</span></label>`).join('') +
          '</div></fieldset>';
        break;
      }
      default: inner = lab + `<input id="${id}" name="${nm}" type="text" maxlength="200" value="${esc(def)}"${ph}${rq}>`;
    }
    return `<div class="q" data-q="${nm}" data-type="${esc(q.type)}"${q.si ? ` data-si="${esc(q.si)}"` : ''}>${inner}</div>`;
  }

  function formHtml(form) {
    const qs = formulaires()[form] || [];
    if (!qs.length) return '';
    const lim = DATA.parametres.date_limite_reponse;
    const intro = form === 'presence' && lim && !String(lim).includes('[') ? `<p class="form-off">${esc(t('avant_le', { d: lim }))}</p>` : '';
    return `<form class="form" data-type="${esc(form)}" novalidate>${intro}
      <div class="form-grid">${qs.map(q => champHtml(q, form)).join('')}</div>
      <p class="form-legende"><span class="req">*</span> ${esc(t('requis'))}</p>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn btn-gold" type="submit">${esc(t(form === 'presence' ? 'f_valider' : 'f_envoyer'))}</button>
      <p class="form-msg" aria-live="polite"></p>${formOff()}
    </form>`;
  }

  function lireReponses(f) {
    const fd = new FormData(f), qs = formulaires()[f.dataset.type] || [], rep = {};
    qs.forEach(q => { rep[q.id] = q.type === 'cases' ? fd.getAll(q.id) : (fd.get(q.id) ?? ''); });
    return rep;
  }

  /* Affiche / masque les questions conditionnelles + mise en page 2 colonnes */
  function majConditions(f) {
    const rep = lireReponses(f);
    let run = [];
    const flush = () => { run.forEach((el, i) => el.classList.toggle('q-pleine', run.length % 2 === 1 && i === run.length - 1)); run = []; };
    f.querySelectorAll('.q').forEach(el => {
      const ok = condOk(el.dataset.si, rep);
      el.hidden = !ok;
      el.querySelectorAll('input,select,textarea').forEach(i => { i.disabled = !ok; });
      if (!ok) return;
      if (DEMI.includes(el.dataset.type)) { el.classList.remove('q-pleine'); run.push(el); }
      else { el.classList.add('q-pleine'); flush(); }
    });
    flush();
  }
  function initForms() {
    document.querySelectorAll('form.form').forEach(f => {
      majConditions(f);
      f.addEventListener('change', () => majConditions(f));
      f.addEventListener('input', ev => { ev.target.closest('.q')?.classList.remove('q-err'); });
      f.addEventListener('submit', submitForm);
    });
  }

  function hebergementsHtml() {
    const h = DATA.hebergements.filter(x => x.nom && norm(x.visible) !== 'non');
    if (!h.length) return '';
    return `<div class="cards">${h.map(x => `<article class="card">
      ${x.type ? `<span class="tag">${esc(x.type)}</span>` : ''}
      <h3>${esc(x.nom)}</h3>
      <span class="meta">${[x.distance, x.prix].filter(Boolean).map(esc).join(' · ')}</span>
      ${x.description ? `<span>${esc(x.description)}</span>` : ''}
      ${x.lien ? `<a href="${esc(x.lien)}" target="_blank" rel="noopener">${esc(t('voir_reserver'))}</a>` : ''}
    </article>`).join('')}</div>`;
  }
  function programmeHtml() {
    const p = DATA.programme.filter(x => x.titre);
    if (!p.length) return '';
    return `<ol class="timeline">${p.map(x => `<li><div class="tl-time">${esc(x.heure)}</div>
      <div class="tl-title">${esc(x.titre)}</div>${x.lieu ? `<div class="tl-place">📍 ${esc(x.lieu)}</div>` : ''}
      ${x.description ? `<div>${esc(x.description)}</div>` : ''}</li>`).join('')}</ol>`;
  }

  function renderSections() {
    $('#sections').innerHTML = DATA.etapes.map((e, i) => {
      const st = statut(e), locked = st === 'verrouille';
      let body;
      if (locked) {
        body = `<div><div class="lock-ico">🔒</div><strong>${esc(t('verrouille'))}</strong><br>${esc(e.indice || t('bientot'))}</div>`;
      } else {
        body = md(e.contenu || '');
        const ty = norm(e.type);
        if (ty === 'presence') body += formHtml('presence');
        if (ty === 'hebergement') body += hebergementsHtml() + formHtml('hebergement');
        if (ty.startsWith('formulaire')) body += formHtml(ty.split(':')[1]?.trim() || '');
        if (ty === 'plan') body += photosHtml('plan');
        if (ty === 'programme') body += programmeHtml();
        body += photosHtml(e.id) + linkHtml(e);
      }
      return `<section class="stage ${locked ? 'locked' : ''}" id="${esc(e.id)}">
        <div class="stage-head">
          <div class="stage-num">${locked ? '🔒' : i + 1}</div>
          <div><div class="stage-cp">${esc(e.cp || '')}${e.lieu ? ' · ' + esc(e.lieu) : ''}${e.km !== '' && e.km != null ? ' · km ' + esc(e.km) : ''}${e.altitude ? ' · ' + esc(e.altitude) + ' m' : ''}</div>
          <h2>${esc(e.titre)}</h2>${e.sous_titre ? `<p class="stage-sub">${esc(e.sous_titre)}</p>` : ''}</div>
        </div>
        ${st === 'nouveau' ? `<span class="badge stage-new">${esc(t('nouveau'))}</span>` : ''}
        <div class="stage-body">${body}</div>
      </section>`;
    }).join('');
    initForms();
  }

  function hasGalerie() { return photos('galerie').length > 0; }
  function renderGalerie() {
    if (!hasGalerie()) return;
    $('#galerie').hidden = false;
    $('#galerieGrid').innerHTML = photos('galerie').map(u => imgTag(u)).join('');
  }

  /* ---------- Envoi des formulaires ---------- */
  async function submitForm(ev) {
    ev.preventDefault();
    const f = ev.currentTarget, msg = f.querySelector('.form-msg'), btn = f.querySelector('button[type=submit]');
    const form = f.dataset.type, qs = formulaires()[form] || [];
    const label = btn.textContent;
    msg.className = 'form-msg';
    f.querySelectorAll('.q-err').forEach(el => el.classList.remove('q-err'));
    const rep = lireReponses(f), envoi = {};
    const err = (txt, q) => {
      msg.textContent = txt; msg.classList.add('err');
      const el = q && f.querySelector(`.q[data-q="${CSS.escape(q.id)}"]`);
      if (el) { el.classList.add('q-err'); el.querySelector('input,select,textarea')?.focus(); }
    };
    for (const q of qs) {
      if (!condOk(q.si, rep)) continue;               // question masquée : ignorée
      let v = rep[q.id];
      if (q.obligatoire && vide(v)) return err(t('e_requis', { q: q.question }), q);
      if (vide(v)) { envoi[q.id] = q.type === 'cases' ? [] : ''; continue; }
      if (q.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return err(t('e_email'), q);
      if (q.type === 'nombre') {
        const n = Number(v);
        if (!Number.isFinite(n) || n < q.min || n > q.max) return err(t('e_nombre', { q: q.question, min: q.min, max: q.max }), q);
        v = Math.round(n);
      }
      envoi[q.id] = v;
    }
    if (!C.apiUrl) return err(t('e_demo'));
    btn.disabled = true; btn.textContent = t('envoi');
    try {
      const body = { type: form, langue: LANG, website: new FormData(f).get('website') || '', reponses: envoi };
      const r = await fetch(C.apiUrl, { method: 'POST', body: JSON.stringify(body) });
      const res = await r.json();
      if (!res.ok) throw new Error(res.error || 'Erreur');
      f.reset(); majConditions(f);
      if (form === 'presence' && res.dossard) {
        const d = { num: res.dossard, nom: String(envoi.nom || '').trim() };
        localStorage.setItem(DOSSARD_KEY, JSON.stringify(d)); showDossard(d);
        msg.textContent = t('ok_dossard', { n: String(res.dossard).padStart(3, '0') });
        toast(t('toast_dossard'), 5000);
      } else msg.textContent = t('ok');
      msg.classList.add('ok');
    } catch (e) {
      err(String(e.message || '').startsWith('requis:') ? t('e_requis', { q: e.message.slice(7) }) : t('e_envoi'));
    } finally { btn.disabled = false; btn.textContent = label; }
  }

  /* ---------- Visionneuse ---------- */
  function initLightbox() {
    document.addEventListener('click', e => {
      const img = e.target.closest('img[data-zoom]'); if (!img) return;
      $('#lbImg').src = sized(img.dataset.full || img.src, 2400); $('#lightbox').hidden = false;
    });
    const closeLb = () => { $('#lightbox').hidden = true; $('#lbImg').src = ''; };
    $('#lbClose').addEventListener('click', closeLb);
    $('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') closeLb(); });
    addEventListener('keydown', e => { if (e.key === 'Escape') { closeLb(); $('#iosModal').hidden = true; } });
  }

  /* ---------- Navigation interne sans « #ancre » dans l'adresse ---------- */
  function goTo(id) {
    if (id === 'top') return scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }
  function initAnchors() {
    document.addEventListener('click', ev => {
      const a = ev.target.closest('a[href^="#"]'); if (!a) return;
      const id = a.getAttribute('href').slice(1); if (!id) return;
      ev.preventDefault(); goTo(id);
    });
  }

  /* ---------- Rendu complet (rejouable sans doublon) ---------- */
  const formulaireEnCours = () => [...document.querySelectorAll('form.form')].some(f =>
    [...f.elements].some(el => (el.type === 'radio' || el.type === 'checkbox') ? el.checked !== el.defaultChecked
      : (el.name && el.name !== 'website' && 'defaultValue' in el && el.value !== el.defaultValue)));
  function renderAll(d, maj) {
    const sig = JSON.stringify(d);
    if (sig === DATA_SIG) return false;
    if (maj && formulaireEnCours()) return false;    // l'invité remplit un formulaire : on ne touche à rien
    DATA_SIG = sig; DATA = prepare(JSON.parse(sig));
    renderHero(); renderNav(); renderProgress(); renderPanel(); renderSections(); renderGalerie(); initScrollSpy();
    delete $('#map2d').dataset.ok;
    if (MODE === '2d') render2D();
    if (map) { map.remove(); map = null; markers = {}; }
    ensure3D();
    document.body.classList.remove('chargement');
    return true;
  }

  /* ---------- Démarrage ---------- */
  async function start() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const y = sessionStorage.getItem(SCROLL_KEY);
    if (y === null) {                                 // lancement normal : toujours sur l'accueil
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      scrollTo(0, 0);
    }
    applyStaticI18n();
    renderHeroInstant();                              // titres + compte à rebours tout de suite
    initInstall(); initLightbox(); initAnchors();
    const nav = $('#nav'), upd = () => nav.classList.toggle('scrolled', scrollY > 60);
    addEventListener('scroll', upd, { passive: true }); upd();
    $('#cpPanel').addEventListener('click', ev => { const b = ev.target.closest('.cp'); if (b) selectStage(b.dataset.id, true); });
    $('#btnTour').addEventListener('click', () => touring ? stopTour() : startTour());
    $('#btnReset').addEventListener('click', () => { stopTour(); map && VIEW && map.flyTo({ center: VIEW.center, zoom: VIEW.zoom, pitch: VIEW.pitch, bearing: VIEW.bearing, duration: 2200 }); });
    initModes();

    const frais = fetchData();                        // la requête part tout de suite, même pendant le code d'accès
    await gate();
    const cache = readCache();
    if (cache) { renderAll(cache); announceNew(); }   // visite suivante : tout s'affiche instantanément
    const d = await frais;
    if (d) { const premier = !DATA; renderAll(d, !premier); if (premier) announceNew(); }
    else if (!DATA) { renderAll(C.demo); announceNew(); }

    if (y !== null) { sessionStorage.removeItem(SCROLL_KEY); setTimeout(() => scrollTo({ top: +y, behavior: 'instant' }), 80); }
  }
  start();
})();
