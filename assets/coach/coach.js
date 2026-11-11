/* UTMB — Coach la marmotte (V2.0.0)
   Module chargé À LA DEMANDE uniquement (jamais au démarrage de la page) par app.js.
   1 seule image (coach.webp, ~60 Ko) + animations Web Animations API (transform / opacity).
   7 animations : coucou, jumelles, montre, ravito (aléatoires) + dossard, deblocage, matos (événements). */
(() => {
  'use strict';
  if (window.UTMB_COACH) return;
  const BASE = (document.currentScript && document.currentScript.src.replace(/coach\.js.*$/, '')) || 'assets/coach/';
  const IMG = BASE + 'coach.webp?v=2.0.0';
  const RATIO = 315 / 560;                       // largeur / hauteur de coach.webp
  const VUES_KEY = 'utmb_coach_vues', OFF_KEY = 'utmb_coach_off';

  /* ---------- Pancartes FR / IT / ES ---------- */
  const TXT = {
    fr: { coucou: ['Coucou ! 👋', 'Salut la compagnie ! 👋', 'Toujours là ? Moi aussi ! 😄'],
          jumelles: ['Je garde un œil sur vous 👀', 'M&L vous surveillent 👀', 'Je repère le prochain ravito… 🔭'],
          montre: ['Le chrono tourne, on avance ! ⏱️', 'Courage, la ligne approche !', 'Allez, on garde le rythme ! 💪'],
          ravito: ['Ravito bientôt ! 💧', 'Pense à bien t\'hydrater ! 💧', 'Une petite gorgée et on repart ! 🧃'],
          dossard: ['Bienvenue dans la course ! 🏅', 'Bienvenue dans la course ! Dossard n° {n} 🏅'],
          deblocage: ['Nouveau passage débloqué ! 🔓', 'Nouveau passage débloqué : {t} ! 🔓'],
          matos: ['N\'oublie pas de vérifier ton matos ! 🎒'],
          voir: 'Voir', masquer: 'Masquer Coach' },
    it: { coucou: ['Ciao! 👋', 'Ciao a tutti! 👋', 'Ancora qui? Anch\'io! 😄'],
          jumelles: ['Vi tengo d\'occhio 👀', 'M&L vi tengono d\'occhio 👀', 'Cerco il prossimo ristoro… 🔭'],
          montre: ['Il cronometro corre, avanti! ⏱️', 'Coraggio, il traguardo si avvicina!', 'Dai, teniamo il ritmo! 💪'],
          ravito: ['Ristoro in arrivo! 💧', 'Ricordati di bere! 💧', 'Un sorso e si riparte! 🧃'],
          dossard: ['Benvenuti in gara! 🏅', 'Benvenuti in gara! Pettorale n° {n} 🏅'],
          deblocage: ['Nuovo passaggio sbloccato! 🔓', 'Nuovo passaggio sbloccato: {t}! 🔓'],
          matos: ['Non dimenticare di controllare l\'attrezzatura! 🎒'],
          voir: 'Vedi', masquer: 'Nascondi Coach' },
    es: { coucou: ['¡Hola! 👋', '¡Hola a todos! 👋', '¿Siguen ahí? ¡Yo también! 😄'],
          jumelles: ['Los tengo vigilados 👀', 'M&L los están vigilando 👀', 'Busco el próximo avituallamiento… 🔭'],
          montre: ['El cronómetro corre, ¡a avanzar! ⏱️', '¡Ánimo, la meta se acerca!', '¡Vamos, mantengamos el ritmo! 💪'],
          ravito: ['¡Avituallamiento pronto! 💧', '¡No olvides hidratarte! 💧', '¡Un sorbo y seguimos! 🧃'],
          dossard: ['¡Bienvenidos a la carrera! 🏅', '¡Bienvenidos a la carrera! Dorsal n.º {n} 🏅'],
          deblocage: ['¡Nuevo punto desbloqueado! 🔓', '¡Nuevo punto desbloqueado: {t}! 🔓'],
          matos: ['¡No olvides revisar tu equipo! 🎒'],
          voir: 'Ver', masquer: 'Ocultar Coach' }
  };

  /* ---------- Les 7 animations ----------
     cote : depuis quel bord Coach apparaît (droite = patte qui salue visible ; gauche = montre visible)
     prop : accessoire (émoji) et sa position sur l'image (% largeur, % hauteur) */
  const ANIMS = {
    coucou:    { cote: 'droite', prop: null,                        duree: 3600 },
    jumelles:  { cote: 'any',    prop: { e: '🔭', x: 54, y: 14 },   duree: 4200 },
    montre:    { cote: 'gauche', prop: { e: '⌚', x: 74, y: 50 },   duree: 3800 },
    ravito:    { cote: 'any',    prop: { e: '💧', x: 46, y: 30 },   duree: 3800 },
    dossard:   { cote: 'bas',    prop: { e: '🏅', x: 50, y: 50 },   duree: 4600 },
    deblocage: { cote: 'any',    prop: { e: '🔓', x: 20, y: 12 },   duree: 4600 },
    matos:     { cote: 'bas',    prop: { e: '🎒', x: 78, y: 40 },   duree: 4200 }
  };
  const ALEATOIRES = ['coucou', 'jumelles', 'montre', 'ravito'];

  let ctx = null, stage = null, anchor = null, busy = false, current = null, timer = null, lastKind = '';
  let suspenduJusqua = 0, imgReady = null, scrollBase = 0, scrollRaf = null, perchEl = null;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const T = () => TXT[ctx.lang] || TXT.fr;
  const mobile = () => matchMedia('(max-width:820px)').matches;
  const reduit = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desactive = () => localStorage.getItem(OFF_KEY) === '1';

  /* ---------- Styles (injectés au premier chargement du module) ---------- */
  function injectCss() {
    const s = document.createElement('style');
    s.textContent = `
.coach-stage{position:fixed;inset:0;z-index:70;pointer-events:none;overflow:hidden;contain:strict}
.coach-anchor{position:absolute;left:0;top:0;width:100%;height:0;will-change:transform}
.coach{position:absolute;top:0;left:0;will-change:transform}
.coach-body{position:absolute;inset:0;transform-origin:50% 100%;will-change:transform}
.coach-gest{position:absolute;inset:0;transform-origin:50% 100%;will-change:transform}
.coach-body img{transform-origin:50% 100%;width:100%;height:100%;display:block;pointer-events:auto;cursor:pointer;user-select:none;-webkit-user-drag:none;
  filter:drop-shadow(0 10px 14px rgba(20,30,24,.38)) drop-shadow(0 2px 3px rgba(0,0,0,.25))}
.coach-shadow{position:absolute;left:18%;right:18%;bottom:-2%;height:6%;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.35),transparent);filter:blur(2px)}
.coach-prop{position:absolute;transform:translate(-50%,-50%);line-height:1;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35));pointer-events:none}
.coach-bubble{position:absolute;pointer-events:auto;width:max-content;max-width:min(250px,64vw);background:#fffdf8;color:#24382c;font:700 .92rem/1.3 'Inter',system-ui,sans-serif;
  padding:.6rem .8rem;border-radius:16px;border:2px solid #24382c;box-shadow:0 10px 24px -10px rgba(0,0,0,.45);opacity:0;white-space:normal}
.coach-bubble::after{content:"";position:absolute;bottom:-9px;width:14px;height:14px;background:#fffdf8;border-right:2px solid #24382c;border-bottom:2px solid #24382c;transform:rotate(45deg)}
.coach-bubble.q-g::after{left:18px}.coach-bubble.q-d::after{right:18px}
.coach-bubble .cb-go{display:inline-block;margin-top:.35rem;font:700 .8rem 'Inter',sans-serif;color:#fff;background:#b08d57;border:0;border-radius:999px;padding:.3rem .7rem;cursor:pointer}
.coach-bubble .cb-x{position:absolute;top:-10px;right:-10px;width:22px;height:22px;border-radius:50%;border:2px solid #24382c;background:#fff;color:#24382c;font:700 12px/1 sans-serif;cursor:pointer;display:grid;place-items:center;padding:0}
.coach-bubble .cb-x:focus-visible,.coach-bubble .cb-go:focus-visible{outline:3px solid #c9a66b;outline-offset:2px}
.coach-confetti{position:absolute;width:8px;height:12px;border-radius:2px;pointer-events:none}
.coach-nudge{display:inline-block;transition:transform .35s cubic-bezier(.34,1.56,.64,1)}
@media (max-width:820px){.coach-bubble{font-size:.82rem;padding:.5rem .65rem}}`;
    document.head.appendChild(s);
  }

  function build() {
    injectCss();
    stage = document.createElement('div'); stage.className = 'coach-stage'; stage.setAttribute('aria-live', 'polite');
    anchor = document.createElement('div'); anchor.className = 'coach-anchor';
    stage.appendChild(anchor); document.body.appendChild(stage);
    imgReady = new Promise(ok => { const i = new Image(); i.decoding = 'async'; i.onload = i.onerror = () => ok(); i.src = IMG; });
    /* L'invité commence à remplir un formulaire : Coach file aussitôt et se tait 90 s */
    const fuir = ev => {
      if (!ev.target.closest || !ev.target.closest('form')) return;
      suspenduJusqua = Date.now() + 90000;
      if (current) partir(true);
    };
    document.addEventListener('focusin', fuir, true);
    document.addEventListener('input', fuir, true);
    document.addEventListener('pointerdown', fuir, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden && current) partir(true); });
    addEventListener('scroll', suivreScroll, { passive: true });
  }

  /* Coach perché sur un titre suit le défilement ; s'il sort de l'écran, il s'en va */
  function suivreScroll() {
    if (!current || scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      if (!current) return;
      const dy = scrollY - scrollBase;
      anchor.style.transform = `translate3d(0,${(-dy).toFixed(1)}px,0)`;
      if (Math.abs(dy) > innerHeight * 0.45) partir(true);
    });
  }

  /* ---------- Conditions d'apparition ---------- */
  function bloque(evenement) {
    if (desactive() || reduit() || document.hidden) return true;
    if (!evenement && Date.now() < suspenduJusqua) return true;
    if (mobile() && !ctx.cfg.mobile) return true;
    const vis = s => { const el = document.querySelector(s); return el && !el.hidden; };
    if (vis('#gate') || vis('#lightbox') || vis('#iosModal')) return true;
    const a = document.activeElement;
    if (!evenement && a && a.closest && a.closest('form') && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return true;
    return false;
  }

  /* Un titre visible au milieu de l'écran ? Coach vient s'y percher (interaction avec le texte) */
  function titreVisible() {
    const zone = [innerHeight * 0.22, innerHeight * 0.72];
    const cands = [...document.querySelectorAll('.stage h2, .section-head h2, .intro-message')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.height && r.top > zone[0] && r.bottom < zone[1] && !el.closest('.stage.locked .stage-body');
    });
    return cands.length ? pick(cands) : null;
  }

  /* ---------- Construction d'une apparition ---------- */
  function creer(kind, texte, opts) {
    const a = ANIMS[kind];
    const H = Math.round(mobile() ? ctx.cfg.tailleMobile : ctx.cfg.taillePc), W = Math.round(H * RATIO);
    let cote = a.cote === 'any' ? (Math.random() < 0.5 ? 'gauche' : 'droite') : a.cote;
    const el = document.createElement('div'); el.className = 'coach';
    el.style.width = W + 'px'; el.style.height = H + 'px';
    el.innerHTML = `<div class="coach-shadow"></div><div class="coach-body"><div class="coach-gest"><img src="${IMG}" alt="Coach" draggable="false"></div></div>`;
    if (a.prop) {
      const p = document.createElement('span'); p.className = 'coach-prop'; p.textContent = a.prop.e;
      p.style.left = a.prop.x + '%'; p.style.top = a.prop.y + '%'; p.style.fontSize = Math.round(H * 0.15) + 'px'; p.style.opacity = '0';
      el.querySelector('.coach-gest').appendChild(p);
    }
    /* Position */
    perchEl = null;
    let x, y;
    if (cote === 'bas') {
      x = Math.round(rnd(0.08, 0.92) * innerWidth - W / 2);
      x = Math.max(4, Math.min(innerWidth - W - 4, x));
      y = innerHeight - H * 0.8;
      const toast = document.querySelector('#toast.show');            // ne pas se cacher derrière un message
      if (toast) y = Math.min(y, innerHeight - toast.offsetHeight - 28 - H * 0.98);
    } else {
      const titre = opts && opts.libre ? null : titreVisible();
      if (titre) {
        perchEl = titre;
        const r = titre.getBoundingClientRect();
        y = r.top + r.height / 2 - H * 0.55;
      } else y = rnd(0.32, 0.62) * innerHeight - H / 2;
      y = Math.max(70, Math.min(innerHeight - H * 0.85, y));
      x = cote === 'gauche' ? -W * 0.34 : innerWidth - W * 0.66;
    }
    el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    el.dataset.cote = cote;

    /* Bulle */
    const b = document.createElement('div');
    b.className = 'coach-bubble ' + (cote === 'droite' ? 'q-d' : 'q-g');
    b.setAttribute('role', 'status');
    b.innerHTML = `<span class="cb-t"></span><button type="button" class="cb-x" aria-label="${T().masquer}" title="${T().masquer}">✕</button>`;
    b.querySelector('.cb-t').textContent = texte;
    if (opts && opts.go) {
      const g = document.createElement('button'); g.type = 'button'; g.className = 'cb-go'; g.textContent = T().voir + ' →';
      g.addEventListener('click', () => { opts.go(); partir(); });
      b.appendChild(document.createElement('br')); b.appendChild(g);
    }
    b.querySelector('.cb-x').addEventListener('click', () => { localStorage.setItem(OFF_KEY, '1'); ctx.onToggle && ctx.onToggle(false); partir(true); });
    el.appendChild(b);
    el.querySelector('img').addEventListener('click', () => sauterEtPartir());
    return { el, b, cote, W, H, kind, x, y };
  }

  function placerBulle(c) {
    const b = c.b, bw = b.offsetWidth || 200, bh = b.offsetHeight || 50;
    let left = c.cote === 'droite' ? c.W * 0.25 - bw : c.W * 0.6;      // bulle toujours côté écran
    if (c.cote === 'bas') left = c.W * 0.62;
    let top = -bh - 6 + c.H * 0.06;
    /* bulle toujours dans l'écran */
    const ox = c.x, oy = c.y;
    const finalX = ox;
    if (finalX + left + bw > innerWidth - 8) left = innerWidth - 8 - bw - finalX;
    if (finalX + left < 8) left = 8 - finalX;
    if (oy + top < 64) top = c.H * 0.35;
    b.style.left = left.toFixed(1) + 'px'; b.style.top = top.toFixed(1) + 'px';
    b.classList.toggle('q-d', left < 0); b.classList.toggle('q-g', left >= 0);
  }

  /* ---------- Mouvements ---------- */
  const EASE_IN = 'cubic-bezier(.34,1.45,.64,1)', EASE_OUT = 'cubic-bezier(.5,0,.75,0)';
  function entree(c) {
    const body = c.el.querySelector('.coach-body');
    if (c.cote === 'bas') return body.animate([{ transform: `translateY(${c.H * 0.85}px)` }, { transform: 'translateY(0)' }],
      { duration: 650, easing: EASE_IN, fill: 'both' });
    const dx = c.cote === 'gauche' ? -c.W * 0.7 : c.W * 0.7;
    const lean = c.cote === 'gauche' ? 7 : -7;
    return body.animate([
      { transform: `translateX(${dx}px) rotate(0deg)` },
      { transform: `translateX(${dx * -0.04}px) rotate(${lean * 1.3}deg)`, offset: .7 },
      { transform: `translateX(0) rotate(${lean}deg)` }],
      { duration: 700, easing: EASE_IN, fill: 'both' });
  }
  function sortie(c, rapide) {
    const body = c.el.querySelector('.coach-body');
    const d = rapide ? 230 : 520;
    if (c.cote === 'bas') return body.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${c.H * 0.95}px)` }],
      { duration: d, easing: EASE_OUT, fill: 'forwards' });
    const dx = c.cote === 'gauche' ? -c.W * 0.75 : c.W * 0.75, lean = c.cote === 'gauche' ? 7 : -7;
    return body.animate([{ transform: `translateX(0) rotate(${lean}deg)` }, { transform: `translateX(${dx}px) rotate(0deg)` }],
      { duration: d, easing: EASE_OUT, fill: 'forwards' });
  }
  function respiration(c) {
    const img = c.el.querySelector('img');
    return img.animate([{ transform: 'scale(1,1)' }, { transform: 'scale(1.012,0.988)' }, { transform: 'scale(1,1)' }],
      { duration: 1600, iterations: Infinity, easing: 'ease-in-out' });
  }
  function bulle(c, on) {
    return c.b.animate(on
      ? [{ opacity: 0, transform: 'translateY(8px) scale(.85)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }]
      : [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-6px) scale(.9)' }],
      { duration: on ? 320 : 200, easing: on ? EASE_IN : 'ease-in', fill: 'forwards' });
  }
  function prop(c, kf, o) { const p = c.el.querySelector('.coach-prop'); return p ? p.animate(kf, o) : null; }

  /* Gestuelle propre à chaque animation (après l'entrée) */
  function geste(c) {
    const img = c.el.querySelector('.coach-gest');
    const lean = c.cote === 'gauche' ? 7 : c.cote === 'droite' ? -7 : 0;
    const R = d => `rotate(${d}deg)`;
    switch (c.kind) {
      case 'coucou':   // la patte levée salue : balancier du buste
        return img.animate([R(0), R(-6), R(5), R(-6), R(5), R(-3), R(0)].map(t => ({ transform: t })),
          { duration: 1500, easing: 'ease-in-out' });
      case 'jumelles': // scrute l'horizon lentement
        prop(c, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.4)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(-12deg)' }], { duration: 300, fill: 'forwards' });
        return img.animate([R(0), R(-5), R(-5), R(5), R(5), R(0)].map((t, i) => ({ transform: t, offset: [0, .2, .45, .65, .9, 1][i] })),
          { duration: 2400, easing: 'ease-in-out' });
      case 'montre':   // tapote la montre, impatient
        prop(c, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.5)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.25)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 600, fill: 'forwards' });
        prop(c, [{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(1.25)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 500, delay: 600, iterations: 3 });
        return img.animate([0, -7, 0, -7, 0, -7, 0].map(v => ({ transform: `translateY(${v}px)` })), { duration: 1500, easing: 'ease-in-out', delay: 200 });
      case 'ravito':   // renverse la tête pour boire
        prop(c, [{ opacity: 0, transform: 'translate(-50%,10%) scale(.5)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 1, transform: 'translate(-60%,-120%) scale(.9) rotate(-30deg)' }, { opacity: 0, transform: 'translate(-60%,-160%) scale(.6)' }],
          { duration: 1900, fill: 'forwards' });
        return img.animate([R(0), R(-10), R(-10), R(2), R(0)].map((t, i) => ({ transform: t, offset: [0, .25, .7, .85, 1][i] })),
          { duration: 1900, easing: 'ease-in-out' });
      case 'dossard':  // saute de joie (2 sauts avec écrasement à l'atterrissage) + confettis
        confettis(c);
        prop(c, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.3)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.3)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 500, fill: 'forwards' });
        return img.animate([
          { transform: 'translateY(0) scale(1,1)' }, { transform: 'translateY(0) scale(1.06,.92)', offset: .1 },
          { transform: 'translateY(-34px) scale(.96,1.05)', offset: .3 }, { transform: 'translateY(0) scale(1.07,.92)', offset: .48 },
          { transform: 'translateY(-26px) scale(.97,1.04)', offset: .68 }, { transform: 'translateY(0) scale(1.05,.95)', offset: .86 },
          { transform: 'translateY(0) scale(1,1)' }], { duration: 1500, easing: 'ease-in-out' });
      case 'deblocage': // pointe le contenu : penché vers l'écran + cadenas qui s'ouvre
        prop(c, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.4)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.2) rotate(12deg)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 700, fill: 'forwards' });
        return img.animate([R(0), R(-lean * 0.9), R(-lean * 0.3), R(-lean * 0.9), R(0)].map(t => ({ transform: t })),
          { duration: 1700, easing: 'ease-in-out' });
      case 'matos':    // fouille son sac : petites secousses
        prop(c, [{ opacity: 0, transform: 'translate(-50%,-20%) scale(.5)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 400, fill: 'forwards' });
        prop(c, [-10, 10, -8, 8, 0].map(d => ({ transform: `translate(-50%,-50%) rotate(${d}deg)` })), { duration: 700, delay: 450, iterations: 2 });
        return img.animate([R(0), R(3), R(-3), R(3), R(-3), R(0)].map(t => ({ transform: t })), { duration: 1400, easing: 'ease-in-out', delay: 300 });
    }
    return null;
  }

  function confettis(c) {
    const cols = ['#b08d57', '#24382c', '#c0563b', '#e0b56e', '#6b7f5a', '#ffffff'];
    for (let i = 0; i < 22; i++) {
      const p = document.createElement('span'); p.className = 'coach-confetti';
      p.style.background = pick(cols); p.style.left = (c.W * 0.5) + 'px'; p.style.top = (c.H * 0.25) + 'px';
      c.el.appendChild(p);
      const ang = rnd(-Math.PI * 0.95, -Math.PI * 0.05), dist = rnd(c.H * 0.4, c.H * 0.9);
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
      p.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 },
                 { transform: `translate(${dx}px,${dy}px) rotate(${rnd(180, 540)}deg)`, opacity: 1, offset: .6 },
                 { transform: `translate(${dx * 1.1}px,${dy + c.H * 0.6}px) rotate(${rnd(540, 900)}deg)`, opacity: 0 }],
        { duration: rnd(1300, 1900), easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).finished.then(() => p.remove(), () => p.remove());
    }
  }

  /* Le titre visé réagit discrètement quand Coach s'y appuie */
  function pousserTitre(c, on) {
    if (!perchEl) return;
    if (on) { perchEl.classList.add('coach-nudge'); perchEl.style.transform = `translateX(${c.cote === 'gauche' ? 6 : -6}px)`; }
    else { perchEl.style.transform = ''; const el = perchEl; setTimeout(() => el.classList.remove('coach-nudge'), 400); }
  }

  /* ---------- Lecture d'une animation ---------- */
  const EVENEMENTS = ['dossard', 'deblocage', 'matos'];
  async function jouer(kind, texte, opts) {
    if (busy) {
      if (!(opts && opts.prioritaire)) return false;
      if (current && ALEATOIRES.includes(current.kind)) await partir(true);   // un événement interrompt une apparition aléatoire
      while (busy) await attendre(150);                                       // …mais attend la fin d'un autre événement
    }
    if (!(opts && opts.force) && bloque(opts && opts.prioritaire)) return false;
    busy = true; lastKind = kind;
    await imgReady;
    const c = creer(kind, texte, opts);
    current = c; scrollBase = scrollY; anchor.style.transform = 'translate3d(0,0,0)';
    anchor.appendChild(c.el);
    placerBulle(c);
    try {
      const breathe = respiration(c);
      await entree(c).finished;
      if (current !== c) return true;
      pousserTitre(c, true);
      bulle(c, true);
      const g = geste(c); if (g) await g.finished.catch(() => {});
      if (current !== c) return true;
      await attendre(Math.max(900, ANIMS[kind].duree - 2300));
      if (current !== c) return true;
      breathe.cancel();
      await partir();
    } catch (e) { if (current === c) await partir(true); }
    return true;
  }
  const attendre = ms => new Promise(ok => setTimeout(ok, ms));

  async function partir(rapide) {
    const c = current; if (!c) { busy = false; return; }
    current = null;
    pousserTitre(c, false);
    try { bulle(c, false); await sortie(c, rapide).finished; } catch (e) {}
    c.el.remove(); busy = false;
  }
  function sauterEtPartir() {
    const c = current; if (!c) return;
    c.el.querySelector('.coach-gest').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-18px)' }, { transform: 'translateY(0)' }], { duration: 300 });
    setTimeout(() => partir(), 250);
  }

  /* ---------- Planification des apparitions aléatoires ---------- */
  const vues = () => +(sessionStorage.getItem(VUES_KEY) || 0);
  function planifier(sec) {
    clearTimeout(timer);
    if (vues() >= ctx.cfg.maxVisite) return;
    timer = setTimeout(tour, sec * 1000);
  }
  async function tour() {
    if (bloque() || busy) return planifier(15);                // pas le bon moment : on retente plus tard
    const kind = pick(ALEATOIRES.filter(k => k !== lastKind));
    const ok = await jouer(kind, pick(T()[kind]));
    if (ok) sessionStorage.setItem(VUES_KEY, String(vues() + 1));
    planifier(ok ? rnd(ctx.cfg.intervalleMin, ctx.cfg.intervalleMax) : 15);
  }

  /* ---------- API appelée par app.js ---------- */
  let file = Promise.resolve();
  function evt(type, info) { return window.UTMB_COACH._evt(type, info); }
  window.UTMB_COACH = {
    init(c) { ctx = c; if (!stage) build(); },
    /* Première apparition aléatoire (déjà temporisée par app.js), puis suivantes */
    start(sec) { if (sec) planifier(sec); else tour(); },
    /* Événements : dossard / deblocage / matos */
    evenement(type, info) { file = file.then(() => evt(type, info)).catch(() => {}); return file; },
    /* Contrôle qualité : ?coach=demo joue les 7 animations à la suite */
    async demo() {
      for (const k of ['coucou', 'jumelles', 'montre', 'ravito', 'dossard', 'deblocage', 'matos']) {
        await jouer(k, k === 'dossard' ? T().dossard[1].replace('{n}', '007') : pick(T()[k]), { force: true, prioritaire: true, libre: k === 'deblocage' });
        await attendre(900);
      }
    },
    _evt(type, info) {
      const L = T()[type]; if (!L) return;
      let txt = L[0];
      if (type === 'dossard' && info && info.n) txt = L[1].replace('{n}', String(info.n).padStart(3, '0'));
      if (type === 'deblocage' && info && info.t) txt = L[1].replace('{t}', info.t);
      const opts = { prioritaire: true };
      if (type === 'deblocage' && info && info.id && ctx.goTo) opts.go = () => ctx.goTo(info.id);
      if (type === 'deblocage') opts.libre = true;
      return jouer(type, txt, opts);
    },
    /* Bouton du pied de page : réactivation = coucou immédiat */
    coucou() { return jouer('coucou', pick(T().coucou), { force: true, prioritaire: true }); },
    masquer() { if (current) partir(true); clearTimeout(timer); }
  };
})();
