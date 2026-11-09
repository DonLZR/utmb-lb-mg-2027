/* UTMB — moteur du site (ne pas modifier : le contenu se gère dans le Google Sheet) */
(() => {
  'use strict';
  const C = window.UTMB_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const CACHE_KEY = 'utmb_data_v1', SEEN_KEY = 'utmb_seen', DOSSARD_KEY = 'utmb_dossard', GATE_KEY = 'utmb_ok';
  let DATA = null, map = null, markers = {}, touring = false, tourRaf = null;

  /* ---------- Utilitaires ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const md = s => esc(s).split(/\n{2,}/).map(p => '<p>' + p
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>') + '</p>').join('');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const statut = e => { const s = norm(e.statut); return s.startsWith('nouv') ? 'nouveau' : s.startsWith('ouv') ? 'ouvert' : 'verrouille'; };
  const isOpen = e => statut(e) !== 'verrouille';
  const photos = key => (DATA.photos && DATA.photos[key]) || [];
  const toast = (msg, ms = 4000) => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); };
  const imgTag = (src, alt = '') => `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" data-zoom>`;

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
        } else { $('#gateError').textContent = 'Code incorrect — vérifiez votre faire-part.'; }
      });
    });
  }

  /* ---------- Données ---------- */
  async function loadData() {
    if (!C.apiUrl) return C.demo;
    try {
      const r = await fetch(C.apiUrl + (C.apiUrl.includes('?') ? '&' : '?') + 't=' + Date.now());
      const d = await r.json();
      if (!d || !d.etapes) throw new Error('format');
      localStorage.setItem(CACHE_KEY, JSON.stringify(d));
      return d;
    } catch (e) {
      const c = localStorage.getItem(CACHE_KEY);
      return c ? JSON.parse(c) : C.demo;
    }
  }
  function prepare(d) {
    d.parametres = d.parametres || {};
    d.etapes = (d.etapes || []).filter(e => e.titre)
      .map((e, i) => ({ ...e, ordre: Number(e.ordre) || i + 1, lat: parseFloat(e.lat), lng: parseFloat(e.lng) }))
      .sort((a, b) => a.ordre - b.ordre);
    d.etapes.forEach((e, i) => { if (!e.id) e.id = 'etape-' + (i + 1); });
    d.hebergements = d.hebergements || []; d.programme = d.programme || []; d.photos = d.photos || {};
    return d;
  }

  /* ---------- Accueil ---------- */
  function renderHero() {
    const p = DATA.parametres;
    $('#heroTitre').textContent = p.titre || 'U.T.M.B.';
    $('#heroSousTitre').textContent = p.sous_titre || '';
    $('#heroPrenoms').textContent = p.prenoms || '';
    $('#heroLieu').textContent = p.lieu || '';
    $('#introMessage').textContent = p.message_accueil || '';
    document.title = `${p.titre || 'U.T.M.B.'} — ${p.sous_titre || ''}`;
    $('#footerVersion').textContent = 'v' + C.version;

    const target = p.date_mariage ? new Date(p.date_mariage) : null;
    if (target && !isNaN(target)) {
      $('#heroDate').textContent = target.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      $('#chrono').hidden = false;
      const tick = () => {
        let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
        $('#cJ').textContent = Math.floor(s / 86400); s %= 86400;
        $('#cH').textContent = String(Math.floor(s / 3600)).padStart(2, '0'); s %= 3600;
        $('#cM').textContent = String(Math.floor(s / 60)).padStart(2, '0');
        $('#cS').textContent = String(s % 60).padStart(2, '0');
      };
      tick(); setInterval(tick, 1000);
    }

    const bg = $('#heroBg'), imgs = photos('accueil');
    if (!imgs.length) bg.classList.add('empty');
    else {
      bg.innerHTML = imgs.map((u, i) => `<img src="${esc(u)}" alt="" ${i ? 'loading="lazy"' : ''}>`).join('');
      const els = bg.querySelectorAll('img'); let k = 0; els[0].classList.add('on');
      if (els.length > 1) setInterval(() => { els[k].classList.remove('on'); k = (k + 1) % els.length; els[k].classList.add('on'); }, 6000);
    }

    const strip = photos('bandeau');
    if (strip.length) {
      $('#strip').hidden = false;
      const html = strip.map(u => imgTag(u)).join('');
      $('#stripTrack').innerHTML = html + html; // boucle infinie
    }

    const d = JSON.parse(localStorage.getItem(DOSSARD_KEY) || 'null');
    if (d) showDossard(d);
  }
  function showDossard(d) {
    $('#dossard').hidden = false;
    $('#dossardNum').textContent = String(d.num).padStart(3, '0');
    $('#dossardName').textContent = d.nom;
  }

  /* ---------- Navigation ---------- */
  function renderNav() {
    $('#navLinks').innerHTML = DATA.etapes.map(e =>
      `<a href="#${esc(e.id)}" class="${isOpen(e) ? '' : 'locked'}">${isOpen(e) ? '' : '🔒 '}${esc(e.titre)}</a>`).join('') +
      (hasGalerie() ? '<a href="#galerie">Galerie</a>' : '');
    const nav = $('#nav');
    addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 60), { passive: true });
  }

  /* ---------- Progression ---------- */
  function renderProgress() {
    const total = DATA.etapes.length, open = DATA.etapes.filter(isOpen);
    const last = open[open.length - 1];
    const maxKm = Math.max(...DATA.etapes.map(e => Number(e.km) || 0), 1);
    const pct = total ? Math.round(((last ? Number(last.km) || 0 : 0) / maxKm) * 100) : 0;
    setTimeout(() => $('#progressFill').style.width = Math.max(pct, open.length ? 6 : 0) + '%', 300);
    $('#progressText').textContent = `${open.length} / ${total} points de passage débloqués` + (last && last.km !== '' ? ` · km ${last.km}` : '');
  }

  /* ---------- Panneau des points de passage ---------- */
  function renderPanel() {
    $('#cpPanel').innerHTML = DATA.etapes.map((e, i) => {
      const st = statut(e);
      return `<button type="button" class="cp ${st === 'verrouille' ? 'locked' : ''}" data-id="${esc(e.id)}">
        <span class="cp-num">${st === 'verrouille' ? '🔒' : i + 1}</span>
        <span><span class="cp-title">${esc(e.titre)} ${st === 'nouveau' ? '<span class="badge">Nouveau</span>' : ''}</span>
        <span class="cp-meta">${esc(e.cp || '')} · ${esc(e.lieu || '')}${e.km !== '' && e.km != null ? ' · km ' + esc(e.km) : ''}</span></span>
      </button>`;
    }).join('');
    $('#cpPanel').addEventListener('click', ev => {
      const b = ev.target.closest('.cp'); if (b) selectStage(b.dataset.id, true);
    });
  }
  function selectStage(id, fly) {
    const e = DATA.etapes.find(x => x.id === id); if (!e) return;
    document.querySelectorAll('.cp').forEach(b => b.classList.toggle('active', b.dataset.id === id));
    if (fly && map && !isNaN(e.lat)) {
      stopTour();
      map.flyTo({ center: [e.lng, e.lat], zoom: 12.6, pitch: 66, bearing: map.getBearing() + 25, duration: 2800, essential: true });
    }
    if (!isOpen(e)) toast(`🔒 ${e.titre} — ${e.indice || 'Débloqué prochainement'}`);
    else toast(`📍 ${e.cp || ''} ${e.lieu || ''} — ${e.titre} · touchez à nouveau pour lire`, 3000);
    const btn = document.querySelector(`.cp[data-id="${CSS.escape(id)}"]`);
    if (btn && btn.dataset.armed) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); delete btn.dataset.armed; }
    else if (btn) { document.querySelectorAll('.cp').forEach(b => delete b.dataset.armed); btn.dataset.armed = '1'; }
  }

  /* ---------- Carte 3D ---------- */
  function initMap() {
    if (!window.maplibregl) return fallbackMap();
    try {
      map = new maplibregl.Map({
        container: 'map',
        center: C.map.center, zoom: C.map.zoom, pitch: C.map.pitch, bearing: C.map.bearing,
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
          terrain: { source: 'dem', exaggeration: C.map.exaggeration }
        }
      });
    } catch (e) { return fallbackMap(); }
    map.on('error', ev => { if (String(ev?.error?.message || '').includes('WebGL')) fallbackMap(); });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-left');

    map.on('load', () => {
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

      // Sommet du Mont Blanc
      const s = document.createElement('div'); s.className = 'summit'; s.innerHTML = '❄️ <span>Mont Blanc</span>';
      new maplibregl.Marker({ element: s }).setLngLat([6.8652, 45.8326]).addTo(map);

      DATA.etapes.forEach((e, i) => {
        if (isNaN(e.lat) || isNaN(e.lng)) return;
        const el = document.createElement('div'); // conteneur positionné par MapLibre
        const pin = document.createElement('div');
        pin.className = 'marker ' + (statut(e) === 'verrouille' ? 'locked' : statut(e));
        pin.innerHTML = `${statut(e) === 'verrouille' ? '🔒' : i + 1}<span class="marker-label">${esc(e.lieu || e.titre)}</span>`;
        pin.setAttribute('role', 'button'); pin.setAttribute('aria-label', e.titre); pin.tabIndex = 0;
        el.appendChild(pin);
        el.addEventListener('click', ev => { ev.stopPropagation(); selectStage(e.id, true); });
        markers[e.id] = new maplibregl.Marker({ element: el }).setLngLat([e.lng, e.lat]).addTo(map);
      });

      announceNew();
    });
    ['mousedown', 'touchstart', 'wheel'].forEach(t => map.getCanvas().addEventListener(t, stopTour, { passive: true }));
  }
  function fallbackMap() { $('#mapFallback').hidden = false; $('#btnTour').hidden = true; $('#btnReset').hidden = true; }

  function announceNew() {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    const fresh = DATA.etapes.filter(e => statut(e) === 'nouveau' && !seen.includes(e.id));
    if (fresh.length) {
      const e = fresh[fresh.length - 1];
      setTimeout(() => { toast(`🎉 Nouveau point de passage débloqué : ${e.titre} !`, 5000); selectStage(e.id, true); }, 1500);
    }
    localStorage.setItem(SEEN_KEY, JSON.stringify(DATA.etapes.filter(isOpen).map(e => e.id)));
  }
  function startTour() {
    if (!map) return; touring = true; $('#btnTour').classList.add('on');
    const step = () => { if (!touring) return; map.setBearing(map.getBearing() + 0.08); tourRaf = requestAnimationFrame(step); };
    step();
  }
  function stopTour() { touring = false; cancelAnimationFrame(tourRaf); $('#btnTour')?.classList.remove('on'); }

  /* ---------- Sections ---------- */
  function photosHtml(key) { const p = photos(key); return p.length ? `<div class="stage-photos">${p.map(u => imgTag(u)).join('')}</div>` : ''; }
  function linkHtml(e) { return e.lien_url ? `<p><a class="btn btn-ghost" href="${esc(e.lien_url)}" target="_blank" rel="noopener">${esc(e.lien_libelle || 'En savoir plus')} →</a></p>` : ''; }
  const formOff = () => C.apiUrl ? '' : '<p class="form-off">Mode démo : le formulaire sera actif une fois le Google Sheet branché.</p>';

  function presenceForm() {
    const lim = DATA.parametres.date_limite_reponse;
    return `<form class="form" data-type="presence" novalidate>
      ${lim && !lim.includes('[') ? `<p class="form-off">Réponse souhaitée avant le ${esc(lim)}.</p>` : ''}
      <div class="form-row">
        <label>Nom & prénom *<input name="nom" required maxlength="80" autocomplete="name"></label>
        <label>E-mail<input name="email" type="email" maxlength="120" autocomplete="email"></label>
      </div>
      <div class="choice" role="radiogroup" aria-label="Présence">
        <label><input type="radio" name="presence" value="Oui" required> 🏃 Je prends le départ !</label>
        <label><input type="radio" name="presence" value="Non"> 🫶 Abandon… mais de tout cœur avec vous</label>
      </div>
      <div class="form-row">
        <label>Nombre d'adultes<input name="adultes" type="number" min="0" max="20" value="1"></label>
        <label>Nombre d'enfants<input name="enfants" type="number" min="0" max="20" value="0"></label>
      </div>
      <label>Régime alimentaire / allergies<input name="regime" maxlength="200" placeholder="Végétarien, sans gluten…"></label>
      <label>Un mot pour les mariés<textarea name="message" maxlength="1000"></textarea></label>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn btn-gold" type="submit">Valider mon inscription</button>
      <p class="form-msg" aria-live="polite"></p>${formOff()}
    </form>`;
  }
  function hebergementForm() {
    return `<form class="form" data-type="hebergement" novalidate>
      <div class="form-row">
        <label>Nom & prénom *<input name="nom" required maxlength="80" autocomplete="name"></label>
        <label>Nombre de personnes<input name="personnes" type="number" min="1" max="20" value="2"></label>
      </div>
      <label>Votre besoin
        <select name="besoin">
          <option>Je souhaite une proposition d'hébergement</option>
          <option>Je réserve moi-même</option>
          <option>Je n'ai pas besoin d'hébergement</option>
        </select></label>
      <label>Nuits concernées<input name="nuits" maxlength="120" placeholder="Ex. vendredi + samedi"></label>
      <label>Commentaire<textarea name="commentaire" maxlength="1000"></textarea></label>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn btn-gold" type="submit">Envoyer</button>
      <p class="form-msg" aria-live="polite"></p>${formOff()}
    </form>`;
  }
  function hebergementsHtml() {
    const h = DATA.hebergements.filter(x => x.nom && norm(x.visible) !== 'non');
    if (!h.length) return '';
    return `<div class="cards">${h.map(x => `<article class="card">
      ${x.type ? `<span class="tag">${esc(x.type)}</span>` : ''}
      <h3>${esc(x.nom)}</h3>
      <span class="meta">${[x.distance, x.prix].filter(Boolean).map(esc).join(' · ')}</span>
      ${x.description ? `<span>${esc(x.description)}</span>` : ''}
      ${x.lien ? `<a href="${esc(x.lien)}" target="_blank" rel="noopener">Voir / réserver →</a>` : ''}
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
        body = `<div><div class="lock-ico">🔒</div><strong>Point de passage verrouillé</strong><br>${esc(e.indice || 'Débloqué prochainement')}</div>`;
      } else {
        body = md(e.contenu || '');
        const t = norm(e.type);
        if (t === 'presence') body += presenceForm();
        if (t === 'hebergement') body += hebergementsHtml() + hebergementForm();
        if (t === 'plan') body += photosHtml('plan');
        if (t === 'programme') body += programmeHtml();
        body += photosHtml(e.id) + linkHtml(e);
      }
      return `<section class="stage ${locked ? 'locked' : ''}" id="${esc(e.id)}">
        <div class="stage-head">
          <div class="stage-num">${locked ? '🔒' : i + 1}</div>
          <div><div class="stage-cp">${esc(e.cp || '')}${e.lieu ? ' · ' + esc(e.lieu) : ''}${e.km !== '' && e.km != null ? ' · km ' + esc(e.km) : ''}${e.altitude ? ' · ' + esc(e.altitude) + ' m' : ''}</div>
          <h2>${esc(e.titre)}</h2>${e.sous_titre ? `<p class="stage-sub">${esc(e.sous_titre)}</p>` : ''}</div>
        </div>
        ${st === 'nouveau' ? '<span class="badge stage-new">Nouveau</span>' : ''}
        <div class="stage-body">${body}</div>
      </section>`;
    }).join('');

    document.querySelectorAll('form.form').forEach(f => f.addEventListener('submit', submitForm));
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
    const data = Object.fromEntries(new FormData(f).entries());
    msg.className = 'form-msg';
    if (!data.nom || !data.nom.trim()) { msg.textContent = 'Merci d’indiquer votre nom.'; msg.classList.add('err'); return; }
    if (f.dataset.type === 'presence' && !data.presence) { msg.textContent = 'Merci d’indiquer si vous serez présent(e).'; msg.classList.add('err'); return; }
    if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) { msg.textContent = 'Adresse e-mail invalide.'; msg.classList.add('err'); return; }
    ['adultes', 'enfants', 'personnes'].forEach(k => { if (k in data) data[k] = Math.min(20, Math.max(0, parseInt(data[k], 10) || 0)); });
    if (!C.apiUrl) { msg.textContent = 'Mode démo : rien n’a été envoyé.'; msg.classList.add('err'); return; }
    btn.disabled = true; btn.textContent = 'Envoi…';
    try {
      const r = await fetch(C.apiUrl, { method: 'POST', body: JSON.stringify({ type: f.dataset.type, ...data }) });
      const res = await r.json();
      if (!res.ok) throw new Error(res.error || 'Erreur');
      f.reset();
      if (f.dataset.type === 'presence' && data.presence === 'Oui' && res.dossard) {
        const d = { num: res.dossard, nom: data.nom.trim() };
        localStorage.setItem(DOSSARD_KEY, JSON.stringify(d)); showDossard(d);
        msg.textContent = `Inscription validée ! Votre dossard : n° ${String(res.dossard).padStart(3, '0')} 🏅`;
        toast('🏅 Dossard attribué — rendez-vous sur la ligne de départ !', 5000);
      } else msg.textContent = 'Merci, c’est bien reçu !';
      msg.classList.add('ok');
    } catch (e) {
      msg.textContent = 'Oups, l’envoi a échoué. Réessayez dans un instant.'; msg.classList.add('err');
    } finally { btn.disabled = false; btn.textContent = f.dataset.type === 'presence' ? 'Valider mon inscription' : 'Envoyer'; }
  }

  /* ---------- Visionneuse ---------- */
  function initLightbox() {
    document.addEventListener('click', e => {
      const img = e.target.closest('img[data-zoom]'); if (!img) return;
      $('#lbImg').src = img.src.replace(/sz=w\d+/, 'sz=w2400'); $('#lightbox').hidden = false;
    });
    const close = () => { $('#lightbox').hidden = true; $('#lbImg').src = ''; };
    $('#lbClose').addEventListener('click', close);
    $('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') close(); });
    addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  /* ---------- Démarrage ---------- */
  async function start() {
    await gate();
    // Affichage immédiat depuis le cache, puis rafraîchissement
    DATA = prepare(await loadData());
    renderHero(); renderNav(); renderProgress(); renderPanel(); renderSections(); renderGalerie(); initLightbox(); initMap();
    $('#btnTour').addEventListener('click', () => touring ? stopTour() : startTour());
    $('#btnReset').addEventListener('click', () => { stopTour(); map && map.flyTo({ center: C.map.center, zoom: C.map.zoom, pitch: C.map.pitch, bearing: C.map.bearing, duration: 2200 }); });
  }
  start();
})();
