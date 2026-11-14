/* UTMB — moteur du site V2.4.2 (le contenu se gère dans le Google Sheet) */
(() => {
  'use strict';
  const C = window.UTMB_CONFIG, I18N = window.UTMB_I18N, FLAGS = window.UTMB_FLAGS;
  const $ = (s, r = document) => r.querySelector(s);
  const SEEN_KEY = 'utmb_seen', DOSSARD_KEY = 'utmb_dossard', GATE_KEY = 'utmb_ok', LANG_KEY = 'utmb_lang',
        SCROLL_KEY = 'utmb_scroll', MODE_KEY = 'utmb_mode', FORMS_KEY = 'utmb_forms', UNLOCK_KEY = 'utmb_unlock';
  const NOUVEAU_PERSO_H = 48;                     // durée (heures) du badge « Nouveau » après un déblocage personnel
let DATA = null, DATA_SIG = '', RAW = null, map = null, VIEW = null, markers = {}, touring = false, tourRaf = null, MODE = '3d', deferredInstall = null;
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
  let CORRECTIONS = [], CORRECTIONS_SIG = '', corrObserver = null;
  const corrTextState = new WeakMap(), corrAttrState = new WeakMap();
  const CACHE_KEY = 'utmb_data_v1_' + LANG;

  /* Corrections éditables depuis le Sheet — appliquées à TOUT texte visible de la page.
     Le suivi de la valeur source évite les doubles remplacements, même si le DOM est redessiné. */
  const echapperRegExp = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function compilerCorrections(liste) {
    const alpha = 'A-Za-zÀ-ÖØ-öø-ÿ0-9';
    return (Array.isArray(liste) ? liste : [])
      .filter(c => c && String(c.source || '').trim())
      .map(c => {
        const source = String(c.source).trim(), remplacement = String(c.remplacement == null ? '' : c.remplacement);
        const debut = new RegExp('^[' + alpha + ']$').test(source.charAt(0));
        const fin = new RegExp('^[' + alpha + ']$').test(source.charAt(source.length - 1));
        return { source, remplacement, re: new RegExp((debut ? '(^|[^' + alpha + '])' : '()') + '(' + echapperRegExp(source) + ')' + (fin ? '(?=$|[^' + alpha + '])' : ''), 'gi') };
      })
      .sort((a, b) => b.source.length - a.source.length);
  }
  function corrigerTexte(valeur) {
    let out = String(valeur == null ? '' : valeur);
    CORRECTIONS.forEach(c => { out = out.replace(c.re, (_, avant) => (avant || '') + c.remplacement); });
    return out;
  }
  const t = (k, v = {}) => {
    const texte = String((I18N[LANG] && I18N[LANG][k]) ?? I18N.fr[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
    return k === '_locale' ? texte : corrigerTexte(texte);
  };

  const CORR_ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const ignorerTexte = n => !n.parentElement || !!n.parentElement.closest('script,style,noscript,template');
  function corrigerNoeudTexte(n, force) {
    if (!n || n.nodeType !== Node.TEXT_NODE || ignorerTexte(n)) return;
    const precedent = corrTextState.get(n), courant = n.nodeValue || '';
    const source = precedent && (force || courant === precedent.rendu) ? precedent.source : courant;
    const rendu = corrigerTexte(source);
    corrTextState.set(n, { source, rendu });
    if (courant !== rendu) n.nodeValue = rendu;
  }
  function corrigerAttribut(el, nom, force) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE || !el.hasAttribute(nom)) return;
    let etat = corrAttrState.get(el); if (!etat) { etat = {}; corrAttrState.set(el, etat); }
    const courant = el.getAttribute(nom) || '', precedent = etat[nom];
    const source = precedent && (force || courant === precedent.rendu) ? precedent.source : courant;
    const rendu = corrigerTexte(source); etat[nom] = { source, rendu };
    if (courant !== rendu) el.setAttribute(nom, rendu);
  }
  function appliquerCorrectionsPage(force, racine) {
    const root = racine || document;
    if (root.nodeType === Node.TEXT_NODE) corrigerNoeudTexte(root, force);
    if (root.nodeType === Node.ELEMENT_NODE) CORR_ATTRS.forEach(a => corrigerAttribut(root, a, force));
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode())) corrigerNoeudTexte(n, force);
    if (root.querySelectorAll) root.querySelectorAll('*').forEach(el => CORR_ATTRS.forEach(a => corrigerAttribut(el, a, force)));
  }
  function observerCorrections() {
    if (corrObserver) return;
    corrObserver = new MutationObserver(mutations => mutations.forEach(m => {
      if (m.type === 'characterData') corrigerNoeudTexte(m.target, false);
      else if (m.type === 'attributes') corrigerAttribut(m.target, m.attributeName, false);
      else m.addedNodes.forEach(n => appliquerCorrectionsPage(false, n));
    }));
    corrObserver.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: CORR_ATTRS });
  }
  function activerCorrections(liste) {
    const propres = (Array.isArray(liste) ? liste : []).map(c => ({ source: String(c.source || ''), remplacement: String(c.remplacement == null ? '' : c.remplacement) }));
    const sig = JSON.stringify(propres);
    if (sig !== CORRECTIONS_SIG) { CORRECTIONS_SIG = sig; CORRECTIONS = compilerCorrections(propres); appliquerCorrectionsPage(true); }
    observerCorrections();
  }

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

  /* ---------- Mémoire de l'appareil : formulaires envoyés ---------- */
  const lireJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } };
  const formsFaits = () => lireJSON(FORMS_KEY, {});
  const nouveauJeton = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
  function marquerForm(form, jeton, reponses) {
    const f = formsFaits(); f[form] = { j: jeton, r: reponses || {} }; localStorage.setItem(FORMS_KEY, JSON.stringify(f));
  }
  /* Règle de déblocage (colonne « debloquer_si » de l'onglet Etapes) :
     « presence » = dès que le formulaire Présence est envoyé ; « presence=Oui » = selon une réponse */
  function regleOk(regle) {
    const r = String(regle || '').trim(); if (!r) return true;
    const f = formsFaits(), m = r.match(/^([\w-]+)\s*(!=|=)\s*(.*)$/);
    if (!m) return !!f[norm(r)];
    const vals = m[3].split('|').map(norm);
    for (const k in f) {
      const v = f[k].r && f[k].r[m[1]];
      if (v === undefined) continue;
      const has = Array.isArray(v) ? v.some(x => vals.includes(norm(x))) : vals.includes(norm(v));
      return m[2] === '=' ? has : !has;
    }
    return false;
  }
  const formDeRegle = regle => { const r = String(regle || '').trim(), m = r.match(/^([\w-]+)\s*(!=|=)/); return m ? null : norm(r); };

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
    activerCorrections(d.corrections || []);
    d.parametres = d.parametres || {};
    d.etapes = (d.etapes || []).filter(e => e.titre)
      .map((e, i) => ({ ...e, ordre: Number(e.ordre) || i + 1, lat: num(e.lat) ?? NaN, lng: num(e.lng) ?? NaN }))
      .sort((a, b) => a.ordre - b.ordre);
      d.etapes.forEach((e, i) => { if (!e.id) e.id = 'etape-' + (i + 1); });
      /* Déblocage personnel : section verrouillée tant que la personne n'a pas répondu au formulaire indiqué */
      const unl = lireJSON(UNLOCK_KEY, {}), maintenant = Date.now();
      d.etapes.forEach(e => {
        if (!String(e.debloquer_si || '').trim()) return;
        if (regleOk(e.debloquer_si)) {
          if (!unl[e.id]) unl[e.id] = maintenant;
          e.statut = (maintenant - unl[e.id]) < NOUVEAU_PERSO_H * 3600e3 ? 'nouveau' : 'ouvert';
        } else {
          delete unl[e.id];
          e.statut = 'verrouille';
          if (!String(e.indice || '').trim()) {
            const f = formDeRegle(e.debloquer_si) || 'presence';
            const src = d.etapes.find(x => norm(x.type) === f || norm(x.type) === 'formulaire:' + f);
            e.indice = t('indice_form', { t: src ? src.titre : f });
          }
        }
      });
      try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(unl)); } catch (err) {}

      /* Badge « Nouveau » : une seule étape à la fois.
         - dès qu'une étape plus récente est nouvelle, les précédentes repassent ouvertes ;
         - si le formulaire de l'étape courante a déjà été envoyé et que la suivante reste verrouillée,
           son badge disparaît également (ex. Hébergement renseigné, étape 4 encore bloquée). */
      const nouveaux = d.etapes.filter(e => statut(e) === 'nouveau');
      if (nouveaux.length) {
        const courant = nouveaux[nouveaux.length - 1];
        nouveaux.slice(0, -1).forEach(e => { e.statut = 'ouvert'; });
        const ty = norm(courant.type), form = ty.startsWith('formulaire:') ? norm(ty.split(':')[1])
          : (['presence', 'hebergement'].includes(ty) ? ty : '');
        const idx = d.etapes.indexOf(courant), suivant = d.etapes[idx + 1];
        if (form && formsFaits()[form] && (!suivant || statut(suivant) === 'verrouille')) courant.statut = 'ouvert';
      }
    d.hebergements = d.hebergements || []; d.programme = d.programme || []; d.photos = d.photos || {};
    return d;
  }

  function computeView() {
    const p = DATA.parametres, v = { ...C.map };
    const b = num(p.carte_orientation), z = num(p.carte_zoom), pi = num(p.carte_inclinaison), r = num(p.carte_relief);
    if (b !== null) v.bearing = b;
    if (z !== null) v.zoom = Math.min(16, Math.max(6, z));
    if (!matchMedia('(min-width:821px)').matches) {          // téléphone : écran étroit → on prend plus de hauteur
      const zm = num(p.carte_zoom_mobile);
      v.zoom = zm !== null ? Math.min(16, Math.max(6, zm)) : v.zoom - 0.6;
    }
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
    /* Cadrage de la photo d'accueil (onglet Parametres) : 0 = gauche/haut, 50 = centre, 100 = droite/bas */
    const pc = (v, d) => { const n = num(v); return n === null ? d : Math.min(100, Math.max(0, n)); };
    const px = pc(p.accueil_position_h, 50), py = pc(p.accueil_position_v, 50);
    const zm = Math.min(3, Math.max(1, num(p.accueil_zoom) ?? 1));
    bg.style.setProperty('--px', px + '%'); bg.style.setProperty('--py', py + '%'); bg.style.setProperty('--z', zm);
    bg.style.setProperty('--pxm', pc(p.accueil_position_h_mobile, px) + '%'); bg.style.setProperty('--pym', pc(p.accueil_position_v_mobile, py) + '%');
    clearInterval(slideTimer);
    bg.classList.toggle('empty', !imgs.length);
    /* Photo plein écran (comme avant la V1.5) */
    bg.innerHTML = imgs.map((u, i) =>
      `<div class="slide"><img src="${esc(sized(u, ecranW()))}" alt="" decoding="async"${i ? ' loading="lazy"' : ' fetchpriority="high"'}></div>`).join('');
    const els = bg.querySelectorAll('.slide');
    if (els.length) {
      let k = 0; els[0].classList.add('on');
      if (els.length > 1) slideTimer = setInterval(() => { els[k].classList.remove('on'); k = (k + 1) % els.length; els[k].classList.add('on'); }, 6000);
    }

    const strip = photos('bandeau');
    $('#strip').hidden = !strip.length;
    $('#stripTrack').innerHTML = stripTrack(strip);

      const d = lireJSON(DOSSARD_KEY, null);
      if (d) showDossard(d); else hideDossard();
  }
  /* Bandeau défilant : photos répétées pour toujours remplir la largeur, boucle sans à-coup */
  function stripBase(list) { let b = list.slice(); while (b.length && b.length < 8) b = b.concat(list); return b; }
  function stripTrack(list) { const h = stripBase(list).map(u => imgTag(u)).join(''); return h + h; }
  function stripHtml(list) {
    if (!list.length) return '';
    return `<div class="strip strip-in"><div class="strip-track">${stripTrack(list)}</div></div>`;
  }
  /* Défilement des bandeaux en JavaScript : iOS/Safari fige les animations CSS en % quand les photos
     se chargent après le démarrage. Ici la largeur est mesurée en continu → défilement fiable partout. */
  const STRIP_VITESSE = 32;                                   // pixels par seconde
  const strips = new Map();
  let stripRaf = null, stripLast = 0;
  function initStrips() {
    document.querySelectorAll('.strip-track').forEach(tr => {
      if (strips.has(tr)) return;
      const st = { x: 0, pause: false, half: 0, visible: true };
      const mesure = () => { st.half = tr.scrollWidth / 2; };
      tr.querySelectorAll('img').forEach(im => { if (!im.complete) im.addEventListener('load', mesure, { once: true }); });
      mesure();
      const box = tr.parentElement;
      box.addEventListener('mouseenter', () => { st.pause = true; });
      box.addEventListener('mouseleave', () => { st.pause = false; });
      box.addEventListener('touchstart', () => { st.pause = true; }, { passive: true });
      box.addEventListener('touchend', () => { setTimeout(() => { st.pause = false; }, 1200); }, { passive: true });
      if ('IntersectionObserver' in window) new IntersectionObserver(en => { st.visible = en[0].isIntersecting; }).observe(box);
      strips.set(tr, st);
    });
    strips.forEach((st, tr) => { if (!tr.isConnected) strips.delete(tr); });
    if (!stripRaf && strips.size) { stripLast = performance.now(); stripRaf = requestAnimationFrame(stripTick); }
  }
  function stripTick(now) {
    const dt = Math.min(0.1, (now - stripLast) / 1000); stripLast = now;
    strips.forEach((st, tr) => {
      if (!tr.isConnected) { strips.delete(tr); return; }
      if (st.pause || !st.visible || document.hidden) return;
      if (!st.half) st.half = tr.scrollWidth / 2;
      if (st.half < 10) return;
      st.x -= STRIP_VITESSE * dt;
      if (-st.x >= st.half) st.x += st.half;
      tr.style.transform = `translate3d(${st.x.toFixed(2)}px,0,0)`;
    });
    stripRaf = strips.size ? requestAnimationFrame(stripTick) : null;
  }
  addEventListener('resize', () => strips.forEach((st, tr) => { st.half = tr.scrollWidth / 2; }));

    function hideDossard() { $('#dossard').hidden = true; }
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
      const open = isOpen(e), nv = statut(e) === 'nouveau';
      return `<a href="#${esc(e.id)}" class="${open ? '' : 'locked'}${nv ? ' nouveau' : ''}" title="${esc(e.titre)}" aria-label="${i + 1}. ${esc(e.titre)}${nv ? ' — ' + esc(t('nouveau')) : ''}">` +
        `<span class="nl-num" aria-hidden="true">${open ? i + 1 : '🔒'}</span><span class="nl-txt">${open ? '' : '🔒 '}${esc(e.titre)}</span>` +
        `${nv ? `<span class="badge nl-badge" aria-hidden="true">${esc(t('nouveau'))}</span>` : ''}</a>`;
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
      return `<button type="button" class="cp ${st === 'verrouille' ? 'locked' : ''}${st === 'nouveau' ? ' is-new' : ''}" data-id="${esc(e.id)}">
        <span class="cp-num">${st === 'verrouille' ? '🔒' : i + 1}</span>${st === 'nouveau' ? `<span class="badge badge-coin" aria-hidden="true">${esc(t('nouveau'))}</span>` : ''}
        <span><span class="cp-title">${esc(e.titre)} ${st === 'nouveau' ? `<span class="badge badge-inline">${esc(t('nouveau'))}</span>` : ''}</span>
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
      const zEtape = Math.min(16, Math.max(6, num(DATA.parametres.carte_zoom_etape) ?? 10.8));
      map.flyTo({ center: [e.lng, e.lat], zoom: zEtape, pitch: Math.min(60, VIEW.pitch + 3), bearing: VIEW.bearing + 20, duration: 2400, essential: true });
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

  /* ---------- Carte 2D (secours, sans WebGL) : photo aérienne + parcours ---------- */
  const TUILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';
  function render2D() {
    const box = $('#map2d');
    if (box.dataset.ok) return;
    const Z = 11, W = 256 * Math.pow(2, Z);                       // coordonnées « pixels » Web Mercator au zoom 11
    const X = lng => (lng + 180) / 360 * W;
    const Y = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * W; };
    const pts = C.route.concat(DATA.etapes.filter(e => !isNaN(e.lat)).map(e => [e.lng, e.lat]));
    const xs = pts.map(p => X(p[0])), ys = pts.map(p => Y(p[1]));
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const span = Math.max(x1 - x0, y1 - y0), pad = span * 0.12;
    const wide = matchMedia('(min-width:821px)').matches;
    x0 -= pad; y0 -= pad; y1 += pad; x1 += wide ? span * 0.62 : pad;   // place pour le panneau des étapes (ordinateur)
    /* Cadre ajusté aux proportions de l'écran : la photo remplit tout, sans bande vide */
    const bw = Math.max(280, box.clientWidth || 360), bh = Math.max(300, box.clientHeight || 460);
    let vw = x1 - x0, vh = y1 - y0;
    if (vw / vh < bw / bh) { const n = vh * bw / bh; x0 -= (n - vw) / 2; vw = n; } else { const n = vw * bh / bw; y0 -= (n - vh) / 2; vh = n; }
    const u = vw / bw, fs = px => (px * u).toFixed(2);           // 1 px écran en unités de la carte
    /* Tuiles satellite couvrant le cadre */
    /* Niveau de détail adapté à l'écran (moins de tuiles = chargement plus léger) */
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const dz = Math.max(0, Math.min(2, Math.floor(Math.log2(Math.max(1, 1.5 * u / dpr)))));
    const tz = Z - dz, ts = 256 * Math.pow(2, dz);                // taille d'une tuile en unités de la carte
    const t0x = Math.floor(x0 / ts), t1x = Math.floor((x0 + vw) / ts), t0y = Math.floor(y0 / ts), t1y = Math.floor((y0 + vh) / ts);
    let tiles = '';
    for (let tx = t0x; tx <= t1x; tx++) for (let ty = t0y; ty <= t1y; ty++)
      tiles += `<image href="${TUILE}${tz}/${ty}/${tx}" x="${tx * ts}" y="${ty * ts}" width="${ts + 0.6}" height="${ts + 0.6}" preserveAspectRatio="none"/>`;
    const line = arr => arr.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ');
    const open = DATA.etapes.filter(isOpen), last = open[open.length - 1];
    let cut = 0;
    if (last && !isNaN(last.lat)) {
      let best = Infinity;
      C.route.forEach((p, i) => { const d = (p[0] - last.lng) ** 2 + (p[1] - last.lat) ** 2; if (d < best) { best = d; cut = i; } });
      if (last === DATA.etapes[DATA.etapes.length - 1]) cut = C.route.length - 1;
    }
    const mbx = X(6.8652), mby = Y(45.8326);
    const stacked = stackedIds();
    const order = DATA.etapes.map((e, i) => ({ e, i })).filter(o => !isNaN(o.e.lat))
      .sort((a, b) => (isOpen(a.e) - isOpen(b.e)) || (b.i - a.i)); // verrouillées dessous, étape 1 au-dessus
    const mk = order.map(({ e, i }) => {
      const st = statut(e), locked = st === 'verrouille';
const dx = stacked.has(e.id) ? -10 * u : 0, dy = stacked.has(e.id) ? -3 * u : 0;   // superposé : à gauche
      const x = X(e.lng) + dx, y = Y(e.lat) + dy, r = (locked ? 13 : 16) * u;
      return `<g class="m2-mk ${locked ? 'locked' : st}" data-id="${esc(e.id)}" tabindex="0" role="button" aria-label="${esc(e.titre)}">
        <circle cx="${x}" cy="${y}" r="${r}"/><text x="${x}" y="${y}" font-size="${fs(locked ? 11 : 14)}">${locked ? '🔒' : i + 1}</text>
        <text class="m2-lbl" x="${x}" y="${locked ? y - r - 6 * u : y + r + 12 * u}" font-size="${fs(11)}" stroke-width="${fs(3)}">${esc(e.lieu || e.titre)}</text></g>`;
    }).join('');
    box.innerHTML = `<svg viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Map 2D">
      <g class="m2-photo">${tiles}</g>
      <rect class="m2-voile" x="${x0}" y="${y0}" width="${vw}" height="${vh}"/>
      <path d="M${mbx - 9 * u},${mby + 6 * u} L${mbx},${mby - 8 * u} L${mbx + 9 * u},${mby + 6 * u} Z" fill="rgba(255,255,255,.9)"/>
      <text class="m2-summit" x="${mbx + 13 * u}" y="${mby + 4 * u}" font-size="${fs(11)}" stroke-width="${fs(3)}">Mont Blanc</text>
      <path class="m2-glow" d="${line(C.route)}"/>
      <path class="m2-route" d="${line(C.route)}"/>
      ${cut > 0 ? `<path class="m2-done" d="${line(C.route.slice(0, cut + 1))}"/>` : ''}
      ${mk}</svg><span class="m2-credit">${esc(t('imagerie'))}</span>`;
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
if (stacked.has(e.id)) opts.offset = [-12, -3]; // marqueur superposé : toujours à gauche (décalage écran, quelle que soit l'orientation)
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
      coachEvent('deblocage', { id: e.id, t: e.titre });
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
  const choixMultiple = q => q.type === 'cases' || (q.type === 'pastilles' && norm(q.mode_selection) === 'multiple');

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
      case 'choix': case 'ouinon': case 'cases': case 'pastilles': {
        const multi = choixMultiple(q), pastilles = q.type === 'pastilles';
        const list = q.type === 'ouinon' && !opts.length ? [{ v: 'Oui', l: t('oui') }, { v: 'Non', l: t('non') }] : opts;
        const defs = def.split(';').map(norm);
        inner = `<fieldset class="choice-set${pastilles ? ' pills-set' : ''}"><legend>${esc(q.question)}${req}</legend>${q.aide ? `<p class="q-aide">${esc(q.aide)}</p>` : ''}<div class="choice${pastilles ? ` pills pills-${multi ? 'multi' : 'single'}` : ''}"${pastilles && !multi ? ' role="radiogroup"' : ''}>` +
          list.map(o => `<label><input type="${multi ? 'checkbox' : 'radio'}" name="${nm}" value="${esc(o.v)}"${defs.includes(norm(o.v)) && def ? ' checked' : ''}${rq}><span class="opt">${esc(o.l)}</span></label>`).join('') +
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
    const intro = form === 'presence' && lim && !String(lim).includes('[') ? `<div class="form-deadline" role="note">
      <span class="form-deadline-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false" aria-hidden="true" fill="none" stroke="#d8c3a5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v4M17 3v4M4 9h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z"/></svg></span><span class="form-deadline-text">
      <span class="form-deadline-label">${esc(t('deadline_label'))}</span><strong class="form-deadline-date">${esc(t('deadline_date', { d: lim }))}</strong></span></div>` : '';
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
    qs.forEach(q => { rep[q.id] = choixMultiple(q) ? fd.getAll(q.id) : (fd.get(q.id) ?? ''); });
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
    return `<div class="rows">${h.map(x => `<article class="row">
      <div class="row-id">${x.type ? `<span class="tag">${esc(x.type)}</span>` : ''}<h3>${esc(x.nom)}</h3>
        ${[x.distance, x.prix].filter(Boolean).length ? `<span class="meta">${[x.distance, x.prix].filter(Boolean).map(esc).join(' · ')}</span>` : ''}</div>
      <p class="row-desc">${x.description ? esc(x.description) : ''}</p>
      ${x.lien ? `<a class="row-lien" href="${esc(x.lien)}" target="_blank" rel="noopener">${esc(t('voir_reserver'))}</a>` : '<span></span>'}
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
        if (ty === 'hebergement') body += hebergementsHtml() + stripHtml(photos('hebergement')) + formHtml('hebergement');
        if (ty.startsWith('formulaire')) body += formHtml(ty.split(':')[1]?.trim() || '');
        if (ty === 'plan') body += photosHtml('plan');
        if (ty === 'programme') body += programmeHtml();
        body += photosHtml(e.id) + linkHtml(e);
      }
      return `<section class="stage ${locked ? 'locked' : ''}${st === 'nouveau' ? ' is-new' : ''}" id="${esc(e.id)}">
        <div class="stage-head">
          <div class="stage-num">${locked ? '🔒' : i + 1}</div>
          <div><div class="stage-cp">${esc(e.cp || '')}${e.lieu ? ' · ' + esc(e.lieu) : ''}${e.km !== '' && e.km != null ? ' · km ' + esc(e.km) : ''}${e.altitude ? ' · ' + esc(e.altitude) + ' m' : ''}</div>
            <h2>${esc(e.titre)}</h2>${e.sous_titre ? `<p class="stage-sub">${esc(e.sous_titre)}</p>` : ''}</div>
          ${st === 'nouveau' ? `<span class="badge badge-coin" aria-hidden="true">${esc(t('nouveau'))}</span>` : ''}
        </div>
        ${st === 'nouveau' ? `<span class="badge stage-new badge-inline">${esc(t('nouveau'))}</span>` : ''}
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
      if (vide(v)) { envoi[q.id] = choixMultiple(q) ? [] : ''; continue; }
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
        const deja = formsFaits()[form];
        const jeton = deja && deja.j && !String(deja.j).startsWith('d:') ? deja.j : nouveauJeton();   // même appareil = même jeton
        const body = { type: form, langue: LANG, jeton, website: new FormData(f).get('website') || '', reponses: envoi };
      const r = await fetch(C.apiUrl, { method: 'POST', body: JSON.stringify(body) });
      const res = await r.json();
      if (!res.ok) throw new Error(res.error || 'Erreur');
        f.reset(); majConditions(f);
        /* Mémoire de l'appareil : réponses courtes (choix) pour les déblocages conditionnels */
        const courtes = {};
        qs.forEach(q => { if (['choix', 'ouinon', 'liste', 'cases', 'pastilles'].includes(q.type) && envoi[q.id] !== undefined) courtes[q.id] = envoi[q.id]; });
        marquerForm(form, jeton, courtes);
        let texte;
        if (form === 'presence' && res.dossard) {
          const d = { num: res.dossard, nom: String(envoi.nom || '').trim(), j: jeton };
          localStorage.setItem(DOSSARD_KEY, JSON.stringify(d)); showDossard(d);
          texte = t('ok_dossard', { n: String(res.dossard).padStart(3, '0') });
          toast(t('toast_dossard'), 5000);
          coachEvent('dossard', { n: res.dossard });
        } else {
          if (form === 'presence') { localStorage.removeItem(DOSSARD_KEY); hideDossard(); }   // réponse « Non » : pas de dossard
          texte = form === 'hebergement' ? t('ok') + ' ' + t('ok_matos') : t('ok');
          if (form === 'hebergement') coachEvent('matos');
        }
        msg.textContent = texte; msg.classList.add('ok');
        /* Une section dépend de ce formulaire ? On la débloque tout de suite */
        if (RAW && rerenderSiDeblocage()) {
          const nf = document.querySelector(`form.form[data-type="${CSS.escape(form)}"] .form-msg`);
          if (nf) { nf.textContent = texte; nf.className = 'form-msg ok'; }
        }
    } catch (e) {
      err(String(e.message || '').startsWith('requis:') ? t('e_requis', { q: e.message.slice(7) }) : t('e_envoi'));
    } finally { btn.disabled = false; btn.textContent = label; }
  }

  /* ---------- Visionneuse : flèches, clavier, glisser du doigt ---------- */
  let lbList = [], lbIdx = 0;
  function lbShow(i) {
    if (!lbList.length) return;
    lbIdx = (i + lbList.length) % lbList.length;
    $('#lbImg').src = sized(lbList[lbIdx], 2400);
    const multi = lbList.length > 1;
    $('#lbPrev').hidden = !multi; $('#lbNext').hidden = !multi;
    $('#lbCount').textContent = multi ? `${lbIdx + 1} / ${lbList.length}` : '';
    if (multi) [lbIdx - 1, lbIdx + 1].forEach(k => { const im = new Image(); im.src = sized(lbList[(k + lbList.length) % lbList.length], 2400); });
  }
  function initLightbox() {
    document.addEventListener('click', e => {
      const img = e.target.closest('img[data-zoom]'); if (!img) return;
      const zone = img.closest('.strip-track, .stage-photos, .grid') || img.parentElement;
      const full = el => el.dataset.full || el.src;
      lbList = [...new Set([...zone.querySelectorAll('img[data-zoom]')].map(full))];   // bandeaux : photos dédoublonnées
      $('#lightbox').hidden = false; document.body.style.overflow = 'hidden';
      lbShow(Math.max(0, lbList.indexOf(full(img))));
    });
    const closeLb = () => { $('#lightbox').hidden = true; $('#lbImg').src = ''; document.body.style.overflow = ''; };
    $('#lbClose').addEventListener('click', closeLb);
    $('#lbPrev').addEventListener('click', ev => { ev.stopPropagation(); lbShow(lbIdx - 1); });
    $('#lbNext').addEventListener('click', ev => { ev.stopPropagation(); lbShow(lbIdx + 1); });
    $('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') closeLb(); });
    addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (!$('#lightbox').hidden) closeLb(); $('#iosModal').hidden = true; }
      if ($('#lightbox').hidden) return;
      if (e.key === 'ArrowLeft') lbShow(lbIdx - 1);
      if (e.key === 'ArrowRight') lbShow(lbIdx + 1);
    });
    let x0 = null, y0 = null;
    $('#lightbox').addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    $('#lightbox').addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) lbShow(lbIdx + (dx < 0 ? 1 : -1));
    }, { passive: true });
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
    function renderAll(d, maj, force) {
      const sig = JSON.stringify(d);
      if (sig === DATA_SIG && !force) return false;
      if (maj && formulaireEnCours()) return false;    // l'invité remplit un formulaire : on ne touche à rien
      RAW = d; DATA_SIG = sig; DATA = prepare(JSON.parse(sig));
    renderHero(); renderNav(); renderProgress(); renderPanel(); renderSections(); renderGalerie(); initScrollSpy(); initStrips();
    appliquerCorrectionsPage(false);
    delete $('#map2d').dataset.ok;
    if (MODE === '2d') render2D();
    if (map) { map.remove(); map = null; markers = {}; }
    ensure3D();
    document.body.classList.remove('chargement');
    return true;
  }

    /* Re-calcule les déblocages personnels ; re-dessine seulement si quelque chose change */
    function rerenderSiDeblocage() {
      const avant = DATA.etapes.map(e => e.id + ':' + statut(e)).join('|');
      const apres = prepare(JSON.parse(JSON.stringify(RAW))).etapes.map(e => e.id + ':' + statut(e)).join('|');
      if (avant === apres) return false;
      renderAll(RAW, false, true);
      setTimeout(announceNew, 1800);
      return true;
    }

    /* Vérifie auprès du Sheet que les réponses mémorisées sur l'appareil existent encore
       (réponses effacées dans le Sheet → dossard et déblocages retirés de l'appareil) */
    async function verifierMemoire() {
      if (!C.apiUrl) return;
      const f = formsFaits(), dos = lireJSON(DOSSARD_KEY, null), q = {};
      Object.keys(f).forEach(k => { if (f[k] && f[k].j) q[k] = f[k].j; });
      if (dos && !q.presence) q.presence = dos.j || ('d:' + dos.num + ':' + (dos.nom || ''));   // dossard d'avant la V1.9
      if (!Object.keys(q).length) return;
      try {
        const r = await fetch(C.apiUrl + (C.apiUrl.includes('?') ? '&' : '?') + 'action=verif&j=' + encodeURIComponent(JSON.stringify(q)) + '&t=' + Date.now());
        const res = await r.json();
        if (!res || res.ok !== true || !res.forms) return;          // pas de réponse fiable : on ne touche à rien
        const ff = formsFaits();
        Object.keys(q).forEach(k => {
          if (res.forms[k] === false) delete ff[k];
          else if (res.forms[k] === true && !ff[k]) ff[k] = { j: q[k], r: k === 'presence' ? { presence: 'Oui' } : {} };
        });
        localStorage.setItem(FORMS_KEY, JSON.stringify(ff));
        if (res.dossard && res.dossard.num) {
          const d = { num: res.dossard.num, nom: res.dossard.nom || (dos && dos.nom) || '', j: ff.presence && ff.presence.j };
          localStorage.setItem(DOSSARD_KEY, JSON.stringify(d)); showDossard(d);
        } else { localStorage.removeItem(DOSSARD_KEY); hideDossard(); }
        if (RAW) rerenderSiDeblocage();
      } catch (e) {}
    }

    /* ---------- Démarrage ---------- */
  /* ---------- Coach la marmotte : AUCUN fichier Coach chargé au démarrage ----------
     Le module (assets/coach/coach.js + coach.webp, ~85 Ko au total) n'est téléchargé qu'au moment
     de la 1re apparition (25-50 s après l'ouverture, navigateur au repos) ou après une action de l'invité. */
  const T0 = performance.now();
  let coachProm = null, coachPlanifie = false, coachPending = null;
  function coachCfg() {
    const p = (DATA && DATA.parametres) || {}, d = C.coach || {};
    const v = (k, def) => { const n = num(p['coach_' + k]); return n === null ? def : n; };
    const b = (k, def) => { const x = norm(p['coach_' + k]); return x ? ['oui', '1', 'true', 'vrai', 'yes', 'si'].includes(x) : def; };
    return { active: b('active', d.active !== false), mobile: b('mobile', d.mobile !== false), evenements: b('evenements', d.evenements !== false),
      delaiMin: v('delai_min', d.delaiMin ?? 25), delaiMax: v('delai_max', d.delaiMax ?? 50),
      intervalleMin: v('intervalle_min', d.intervalleMin ?? 120), intervalleMax: v('intervalle_max', d.intervalleMax ?? 300),
      maxVisite: v('max_visite', d.maxVisite ?? 3), taillePc: v('taille_pc', d.taillePc ?? 230), tailleMobile: v('taille_mobile', d.tailleMobile ?? 160) };
  }
  const coachParam = () => new URLSearchParams(location.search).get('coach');
  const coachOff = () => localStorage.getItem('utmb_coach_off') === '1';
  function coachPossible(cfg) {
    if (!cfg.active || coachOff() || coachParam() === '0') return false;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (!cfg.mobile && matchMedia('(max-width:820px)').matches) return false;
    return true;
  }
  function chargerCoach() {
    if (coachProm) return coachProm;
    coachProm = new Promise((ok, ko) => {
      const s = document.createElement('script'); s.src = 'assets/coach/coach.js?v=' + C.version; s.async = true;
      s.onload = () => {
        if (!window.UTMB_COACH) return ko();
        window.UTMB_COACH.init({ lang: LANG, cfg: coachCfg(), goTo, onToggle: majCoachToggle });
        ok(window.UTMB_COACH);
      };
      s.onerror = () => { coachProm = null; ko(); };
      document.head.appendChild(s);
    });
    return coachProm;
  }
  const auRepos = fn => ('requestIdleCallback' in window) ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 300);
  const alea = (a, b) => (a + Math.random() * Math.max(0, b - a)) * 1000;
  function planifierCoach() {
    majCoachToggle();
    if (coachParam() === 'demo') {                       // contrôle qualité : les 7 animations à la suite
      setTimeout(() => chargerCoach().then(m => m.demo()).catch(() => {}), 3000);
      return;
    }
    if (coachPlanifie) return;
    const cfg = coachCfg();
    if (!coachPossible(cfg)) return;
    coachPlanifie = true;
    setTimeout(() => auRepos(() => chargerCoach().then(m => {
      if (coachPending) { const p = coachPending; coachPending = null; m.evenement(p.type, p.info); m.start(alea(cfg.intervalleMin, cfg.intervalleMax) / 1000); }
      else m.start();
    }).catch(() => {})), alea(cfg.delaiMin, cfg.delaiMax));
  }
  function coachEvent(type, info) {
    const cfg = coachCfg();
    if (!coachPossible(cfg) || !cfg.evenements) return;
    const age = performance.now() - T0;
    /* Pendant les 15 premières secondes : l'événement attend la 1re apparition programmée (aucun chargement au démarrage) */
    if (age < 15000 && !coachProm) { coachPending = { type, info }; return; }
    auRepos(() => chargerCoach().then(m => m.evenement(type, info)).catch(() => {}));
  }
  function majCoachToggle() {
    const btn = $('#coachToggle'); if (!btn) return;
    const cfg = coachCfg();
    btn.hidden = !cfg.active || matchMedia('(prefers-reduced-motion: reduce)').matches;
    btn.textContent = t(coachOff() ? 'coach_on' : 'coach_off');
  }
  function initCoachToggle() {
    const btn = $('#coachToggle'); if (!btn) return;
    btn.addEventListener('click', () => {
      if (coachOff()) {
        localStorage.removeItem('utmb_coach_off'); majCoachToggle();
        chargerCoach().then(m => m.coucou()).catch(() => {});
        coachPlanifie = false; planifierCoach();
      } else {
        localStorage.setItem('utmb_coach_off', '1'); majCoachToggle();
        if (window.UTMB_COACH) window.UTMB_COACH.masquer();
      }
    });
  }

  async function start() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const y = sessionStorage.getItem(SCROLL_KEY);
    if (y === null) {                                 // lancement normal : toujours sur l'accueil
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      scrollTo(0, 0);
    }
    applyStaticI18n();
    renderHeroInstant();                              // titres + compte à rebours tout de suite
    initInstall(); initLightbox(); initAnchors(); initCoachToggle();
    const nav = $('#nav'), upd = () => nav.classList.toggle('scrolled', scrollY > 60);
    addEventListener('scroll', upd, { passive: true }); upd();
    $('#cpPanel').addEventListener('click', ev => { const b = ev.target.closest('.cp'); if (b) selectStage(b.dataset.id, true); });
    $('#btnTour').addEventListener('click', () => touring ? stopTour() : startTour());
    $('#btnReset').addEventListener('click', () => { stopTour(); map && VIEW && map.flyTo({ center: VIEW.center, zoom: VIEW.zoom, pitch: VIEW.pitch, bearing: VIEW.bearing, duration: 2200 }); });
    initModes();

    const cache = readCache();                         // permet aussi de corriger immédiatement l'écran d'accès
    if (cache) activerCorrections(cache.corrections || []);
    const frais = fetchData();                        // la requête part tout de suite, même pendant le code d'accès
    frais.then(d => { if (d) activerCorrections(d.corrections || []); }).catch(() => {});
    await gate();
    if (cache) { renderAll(cache); announceNew(); }   // visite suivante : tout s'affiche instantanément
    const d = await frais;
    if (d) { const premier = !DATA; renderAll(d, !premier); if (premier) announceNew(); }
    else if (!DATA) { renderAll(C.demo); announceNew(); }

      if (y !== null) { sessionStorage.removeItem(SCROLL_KEY); setTimeout(() => scrollTo({ top: +y, behavior: 'instant' }), 80); }
      verifierMemoire();
      planifierCoach();
  }
  start();
})();

