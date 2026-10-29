/* Room mode, DOM side: the loading bar, the accessible dialog that shows the page's own sections, focus handling and toasts.
   The long page stays in the DOM (SEO, no-JS, Selenium); a section is only MOVED into the dialog while it is open and put back on close. */
import { NAMES, ROLES } from './data.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const PROJECTS = ['wreckbox', 'dasvis', 'pm', 'unigen', 'netrisk', 'ciba', 'focus', 'khaata'];
const SECTIONS = {
  numbers: ['By the numbers', ['.role-pick', '#hero-role', '#numbers']],
  releases: ['Shipping log', ['#releases']],
  skills: ['Skills', ['#skills']],
  experience: ['Experience', ['#experience']],
  summit: ['Contact', ['#summit']],
  credits: ['3D model credits', ['#credits']],
  ...Object.fromEntries(PROJECTS.map(p => [p, [NAMES[p], ['#' + p]]])),
};
const cvHref = r => `cv/Apurv-Das-CV-${ROLES[r].cv}.pdf`;
const TITLES = { cv: 'Download CV', rubik: 'Rubik’s cube', mochi: 'Mochi' };
const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export async function start({ role, theme }) {
  const root = document.documentElement, panel = $('#rm-panel'), body = $('#rm-body'), title = $('#rm-title'), toast = $('#rm-toast'), bar = $('#rm-bar'), load = $('#rm-load');
  let pending = false, room = null, cur = null, tok = 0, closeT = 0, toastT = 0, curRole = role, cvNode = null, cubeNode = null, mochiNode = null, lastPin = null, tickI = 0;
  const { createRoom, PANEL_KEYS } = await import('./room.js');

  const say = (msg, quiet) => { toast.setAttribute('aria-live', quiet ? 'off' : 'polite'); toast.textContent = msg; toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 2800); };
  const pinFor = k => $(`.rm-pin[data-key="${k}"]`);
  const setInert = on => [$('.bar'), $('#rm-hot'), $('#rm-credit'), $('#rm-hint'), $('#rm-nav')].forEach(e => e && (on ? e.setAttribute('inert', '') : e.removeAttribute('inert')));

  function cvPanel() {
    if (cvNode) return cvNode;
    cvNode = document.createElement('div'); cvNode.className = 'rm-cv';
    const others = [...new Set(Object.values(ROLES).map(r => r.cv))];
    cvNode.innerHTML = `<p class="lead">The printer is warming up. Your CV for the <b class="rm-cv-role"></b> view is downloading now.</p>`
      + `<p><a class="btn pri cv-dl" download href="${cvHref('all')}">Download it again<span aria-hidden="true"> ↓</span></a></p>`
      + `<h3>Other versions</h3><ul class="rm-cvs">${others.map(c => `<li><a class="btn" download href="cv/Apurv-Das-CV-${c}.pdf">${c}<span aria-hidden="true"> ↓</span></a></li>`).join('')}</ul>`;
    return cvNode;
  }
  const syncCv = () => { if (!cvNode) return; $('.rm-cv-role', cvNode).textContent = ROLES[curRole].label; $$('.cv-dl', cvNode).forEach(a => a.href = cvHref(curRole)); };

  /* the Rubik's cube controls: buttons, move counter, timer, key hints and a live region for the "solved" announcement (inside the dialog, so it is heard) */
  const live = msg => { const l = $('.rc-live', cubeNode); if (!l) return; l.textContent = ''; setTimeout(() => { l.textContent = msg; }, 60); say(msg, true); };
  const showCube = i => {
    if (!cubeNode) return; $('.rc-moves', cubeNode).textContent = i.moves; $('.rc-time', cubeNode).textContent = fmtT(i.seconds);
    if (i.running && !tickI) tickI = setInterval(() => { const n = room.rubik && room.rubik.info(); if (!n || !n.running || !cubeNode.isConnected) { clearInterval(tickI); tickI = 0; } if (n) $('.rc-time', cubeNode).textContent = fmtT(n.seconds); }, 250);
  };
  function rubikPanel() {
    if (cubeNode) return cubeNode;
    cubeNode = document.createElement('div'); cubeNode.className = 'rm-cube';
    cubeNode.innerHTML = `<p class="lead">Drag a sticker to turn that layer. Drag the space around the cube to turn the whole thing.</p>`
      + `<dl class="rm-cube-stats"><div><dt>Moves</dt><dd class="rc-moves">0</dd></div><div><dt>Time</dt><dd class="rc-time">0:00</dd></div></dl>`
      + `<div class="rm-cube-btns"><button type="button" class="btn pri" data-act="scramble">Scramble</button><button type="button" class="btn" data-act="solve">Solve</button><button type="button" class="btn" data-act="reset">Reset</button></div>`
      + `<p class="rm-cube-keys"><kbd>U</kbd> <kbd>D</kbd> <kbd>L</kbd> <kbd>R</kbd> <kbd>F</kbd> <kbd>B</kbd> turn the face that is up, down, left, right, front or back (hold <kbd>Shift</kbd> to turn it the other way) · arrow keys turn the whole cube · <kbd>Space</kbd> scrambles · <kbd>Enter</kbd> solves · <kbd>Esc</kbd> closes</p>`
      + `<p class="sr rc-live" role="status" aria-live="polite"></p>`;
    cubeNode.addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if (!b || !room.rubik) return; const a = b.dataset.act;
      if (a === 'scramble') live('Scrambling the cube'); else if (a === 'reset') live('Cube reset'); else if (a === 'solve' && !room.rubik.info().solved) live('Solving'); else if (a === 'solve') return live('The cube is already solved');
      room.rubik[a]();
    });
    return cubeNode;
  }
  function mochiPanel() {
    if (mochiNode) return mochiNode;
    mochiNode = document.createElement('div'); mochiNode.className = 'rm-mochi';
    mochiNode.innerHTML = `<p class="lead"><b>Mochi</b> · Chief Quality Officer</p><p>Approves every release by sitting on it.</p>`
      + `<ul class="rm-mochi-facts"><li><span>Status</span> asleep, mostly</li><li><span>Approval process</span> a slow blink</li><li><span>Known issues</span> will not get off the keyboard</li></ul>`
      + `<p><button type="button" class="btn pri" data-act="pet">Say hello</button></p>`;
    mochiNode.addEventListener('click', e => { if (e.target.closest('[data-act="pet"]')) { room.react('mochi'); say('Mochi gives you a slow blink'); } });
    return mochiNode;
  }

  /* move a section into the dialog (a comment keeps its place), and back */
  function restore() { if (!cur) return; cur.moved.forEach(({ node, ph }) => ph ? ph.replaceWith(node) : node.remove()); cur = null; }
  function fill(k, label) {
    restore(); const moved = [];
    if (k === 'cv' || k === 'rubik' || k === 'mochi') { const n = { cv: cvPanel, rubik: rubikPanel, mochi: mochiPanel }[k](); body.appendChild(n); moved.push({ node: n }); if (k === 'cv') syncCv(); else if (k === 'rubik') showCube(room.rubik.info()); }
    else for (const sel of SECTIONS[k] ? SECTIONS[k][1] : [k]) {
      const node = typeof sel === 'string' ? $(sel) : sel; if (!node) continue;
      const ph = document.createComment('room:' + (node.id || sel)); node.replaceWith(ph); body.appendChild(node); moved.push({ node, ph });
      if (node.matches?.('details')) node.open = true; $$('details', node).forEach(d => { if (node.id === 'credits') d.open = true; });
    }
    cur = { key: k, moved }; title.textContent = label; body.scrollTop = 0;
  }

  function show(k, label) {
    clearTimeout(closeT); fill(k, label ?? (SECTIONS[k] ? SECTIONS[k][0] : TITLES[k] ?? k));
    const first = panel.hidden; panel.hidden = false; setInert(true);
    requestAnimationFrame(() => panel.classList.add('open')); if (first) title.focus({ preventScroll: true }); else title.focus({ preventScroll: true });
    $('#rm-hint')?.classList.add('gone');
  }
  async function openKey(k, label) {
    if (cur && cur.key === k) return;
    const my = ++tok, pin = pinFor(k); if (pin) lastPin = pin;
    if (k === 'cv') { const a = document.createElement('a'); a.href = cvHref(curRole); a.download = ''; document.body.appendChild(a); a.click(); a.remove(); }
    if (PANEL_KEYS.includes(k)) { pending = true; await room.flyTo(k); pending = false; }
    if (my !== tok) return; show(k, label);
  }
  function close() {
    ++tok; pending = false; room.release(); if (!cur && panel.hidden) return;   // also cancels a panel that is still waiting for the fly-in
    panel.classList.remove('open'); setInert(false);
    const pin = lastPin && lastPin.isConnected ? lastPin : null;
    const done = () => { panel.hidden = true; restore(); };
    const slow = !matchMedia('(prefers-reduced-motion: reduce)').matches; clearTimeout(closeT); if (slow) closeT = setTimeout(done, 300); else done();
    (pin || $('.rm-pin'))?.focus({ preventScroll: true });
  }
  /* in-page links inside the sections (Related chips, #wreckbox ...) open the matching panel instead of scrolling */
  function openId(id) {
    if (id === 'top') return close();
    if (id === 'stations') { close(); return $('.rm-pin')?.focus(); }
    if (id === 'credits') return openKey('credits');
    if (SECTIONS[id]) return openKey(id);
    if (id.startsWith('rel-')) return openKey('releases');
    const el = document.getElementById(id); if (!el) return;
    if (el.closest('#experience')) return openKey('experience');
    openGeneric(el);
  }
  function openGeneric(el) { tok++; if (!cur) lastPin = lastPin || $('.rm-pin'); fill(el, el.querySelector('h2, h3')?.textContent || 'Details'); cur.key = el.id; panel.hidden = false; panel.classList.add('open'); setInert(true); title.focus({ preventScroll: true }); }

  panel.addEventListener('keydown', e => {   // focus trap
    if (e.key !== 'Tab') return;
    const f = $$('a[href],button:not([disabled]),summary,[tabindex="0"],input,select', panel).filter(x => x.offsetParent !== null || x === document.activeElement); if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === a || document.activeElement === title)) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  });
  document.addEventListener('keydown', e => { if (cur && cur.key === 'rubik' && !panel.hidden && room.rubik && room.rubik.key(e)) e.preventDefault(); });   // cube keys work wherever focus is (clicking the canvas drops it to the page)
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && (!panel.hidden || pending)) { e.preventDefault(); close(); } });
  $('#rm-x').addEventListener('click', close);
  $('#rm-credit').addEventListener('click', e => { e.preventDefault(); lastPin = $('#rm-credit'); openKey('credits'); });

  /* touch: the first-tap hint and the Desk/Rack buttons (shown only when the frame is too narrow for the whole room and the camera pans) */
  const coarse = matchMedia('(pointer: coarse)').matches, hint = $('#rm-hint'), nav = $('#rm-nav');
  const onPan = ({ on, edge }) => {
    nav.hidden = !on; $$('button', nav).forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.go === edge)));
    hint.textContent = coarse ? (on ? 'Tap an object · swipe sideways for the rack' : 'Tap an object · drag to look around') : 'Click an object, or drag to look around';
  };
  nav.addEventListener('click', e => { const b = e.target.closest('button'); if (b) room.panTo(+b.dataset.go); });
  room = await createRoom({
    canvas: $('#room'), hotLayer: $('#rm-hot'), role, theme,
    onProgress: p => { bar.style.transform = `scaleX(${p.toFixed(3)})`; },
    onActivate: k => k ? openKey(k) : (cur && close()),
    onToast: say, onPan,
    onCube: (type, i) => { if (type === 'change') showCube(i); else live(i.how === 'player' ? `Solved in ${i.moves} moves, ${fmtT(i.seconds)}. Nice.` : 'Solved.'); },
  });
  root.classList.add('room-on'); load.classList.add('done'); setTimeout(() => { load.remove(); root.classList.add('room-live'); }, 650);
  setTimeout(() => $('#rm-hint')?.classList.add('gone'), 9000);
  if (coarse) { const hot = $('#rm-hot'); hot.classList.add('peek'); setTimeout(() => hot.classList.remove('peek'), 4600); }   // touch has no hover: the markers pulse briefly, then go

  /* bottom sheet (portrait): drag the handle or header down to dismiss */
  { let d = null; const ph = $('.rm-ph'), grab = $('.rm-grab'), sheet = matchMedia('(orientation: portrait) and (max-width: 900px)');
    const start = e => { if (!sheet.matches || e.target.closest('button') || e.button > 0) return; d = { id: e.pointerId, y: e.clientY, dy: 0 }; panel.classList.add('dragging'); e.currentTarget.setPointerCapture(e.pointerId); };
    const move = e => { if (!d || e.pointerId !== d.id) return; d.dy = Math.max(0, e.clientY - d.y); panel.style.transform = `translateY(${d.dy}px)`; };
    const end = e => { if (!d || e.pointerId !== d.id) return; const go = d.dy > 80; d = null; panel.classList.remove('dragging'); panel.style.transform = ''; if (go) close(); };
    for (const el of [ph, grab]) { el.addEventListener('pointerdown', start); el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); } }
  // the credits link is the only way back to focus order after the dialog closes if it opened from there
  const origClose = close;
  const api = {
    room, close: origClose, openId, say,
    get isOpen() { return !panel.hidden; },
    setRole(r) { curRole = r; room.setRole(r); syncCv(); },
    setTheme(t) { room.setTheme(t); },
  };
  if (/[?&]debug/.test(location.search)) window.__rm = api;   // testing hook
  return api;
}
