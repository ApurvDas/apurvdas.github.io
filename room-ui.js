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

export async function start({ role, theme }) {
  const root = document.documentElement, panel = $('#rm-panel'), body = $('#rm-body'), title = $('#rm-title'), toast = $('#rm-toast'), bar = $('#rm-bar'), load = $('#rm-load');
  let pending = false, room = null, cur = null, tok = 0, closeT = 0, toastT = 0, curRole = role, cvNode = null, lastPin = null;
  const { createRoom, PANEL_KEYS } = await import('./room.js');

  const say = msg => { toast.textContent = msg; toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 2800); };
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

  /* move a section into the dialog (a comment keeps its place), and back */
  function restore() { if (!cur) return; cur.moved.forEach(({ node, ph }) => ph ? ph.replaceWith(node) : node.remove()); cur = null; }
  function fill(k, label) {
    restore(); const moved = [];
    if (k === 'cv') { const n = cvPanel(); body.appendChild(n); moved.push({ node: n }); syncCv(); }
    else for (const sel of SECTIONS[k] ? SECTIONS[k][1] : [k]) {
      const node = typeof sel === 'string' ? $(sel) : sel; if (!node) continue;
      const ph = document.createComment('room:' + (node.id || sel)); node.replaceWith(ph); body.appendChild(node); moved.push({ node, ph });
      if (node.matches?.('details')) node.open = true; $$('details', node).forEach(d => { if (node.id === 'credits') d.open = true; });
    }
    cur = { key: k, moved }; title.textContent = label; body.scrollTop = 0;
  }

  function show(k, label) {
    clearTimeout(closeT); fill(k, label ?? (SECTIONS[k] ? SECTIONS[k][0] : k === 'cv' ? 'Download CV' : k));
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
