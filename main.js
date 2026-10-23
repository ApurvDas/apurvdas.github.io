/* Ropeway to Nathu La: theme, role switch, the one continuous cable, connections, charts, scene hookup.
   The page is complete HTML without this file; everything here is enhancement. */
import { WAYPOINTS as WP, NAMES, ROLES, LINKS, SKILLS, RELEASES } from './data.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement, clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = t => t * t * (3 - 2 * t);
const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };
const fmtAlt = a => Math.round(a / 5) * 5;
const fmt = n => n.toLocaleString('en-US');
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
let reduce = mqReduce.matches, A = null;       // A = anime.js, loaded after first paint
let scene = null;

const flow = $('#flow'), stations = $('#stations'), rail = $('#rail');
// layout position from offsetTop, so the entrance transforms below never shift the cable's nodes
const absTop = el => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };

/* ============================== theme ============================== */
const sw = $('#theme');
function setTheme(t, persist) {
  root.dataset.theme = t; sw.setAttribute('aria-checked', String(t === 'dark'));
  if (persist) try { localStorage.setItem('theme', t); } catch {}
  if (scene) { scene.setTheme(t); requestAnimationFrame(syncAccent); }
}
sw.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
sw.setAttribute('aria-checked', String(root.dataset.theme === 'dark'));
const syncAccent = () => scene && scene.setAccent(getComputedStyle(root).getPropertyValue('--accent').trim());

/* ============================== roles ============================== */
const parseRole = () => (/role=(qa|systems|web|ai)/.exec(location.hash) || [])[1] || 'all';
let role = root.dataset.role || 'all', switchTok = 0;
const wait = ms => new Promise(r => setTimeout(r, ms));

function reorder(container, ids, sel = '[data-id]') {
  const kids = $$(`:scope > ${sel}`, container), by = Object.fromEntries(kids.map(k => [k.dataset.id, k]));
  ids.forEach(id => by[id] && container.appendChild(by[id]));
}
function applyOrder(r) {
  const R = ROLES[r];
  const blocks = Object.fromEntries($$('[data-block]', flow).map(b => [b.dataset.block, b]));
  [...R.blocks.map(b => blocks[b]), $('#numbers'), $('#releases'), $('#skills'), $('#summit')].forEach(b => flow.appendChild(b));
  reorder($('[data-group="jobs"]'), R.jobs);
  const pg = $('[data-group="projects"]'); reorder(pg, R.projects);
  reorder($('[data-group="panels"]'), R.panels, '.panel');
  reorder($('[data-group="groups"]'), R.groups, '.sgroup');
  $$('.job').forEach(j => { const p = R.primary.includes(j.dataset.id); j.classList.toggle('is-primary', p); if (p) j.classList.remove('open'); });
}
function flipRoute(R) {
  const ol = $('#route'), items = $$('li', ol), first = new Map(items.map(li => [li, li.getBoundingClientRect()]));
  const order = R.blocks.flatMap(b => b === 'experience' ? R.jobs : R.projects), by = Object.fromEntries(items.map(li => [li.dataset.id, li]));
  order.forEach(id => ol.appendChild(by[id]));
  if (reduce || !ol.offsetParent) return;
  items.forEach(li => { const a = first.get(li), b = li.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top; if (dx || dy) li.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.23,1,.32,1)' }); });
}
function setHeroText(R, instant) {
  const box = $('#hero-role'), put = () => { $('#role-headline').textContent = R.headline; const s = $('#role-summary'); s.textContent = R.summary; s.classList.remove('open'); const m = $('.more-s'); if (m) m.textContent = 'Read more'; };
  if (instant || reduce) return put();
  box.style.opacity = 0; setTimeout(() => { put(); box.style.opacity = ''; }, 140);
}
function markRole(r) {
  root.dataset.role = r;
  $$('.roles button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.role === r)));
  requestAnimationFrame(syncAccent);
}
async function switchRole(r, first) {
  const tok = ++switchTok, R = ROLES[r], prev = role; role = r;
  if (first) { markRole(r); applyOrder(r); flipRoute(R); setHeroText(R, true); layout(true); root.classList.add('ready'); return; }
  const old = snapshot(); markRole(r); setHeroText(R); flipRoute(R);
  flow.style.opacity = 0; await wait(reduce ? 0 : 150); if (tok !== switchTok) return;
  applyOrder(r); layout(false);
  const next = nodeYs();
  if (scrollY > absTop(stations) - 60) scrollTo({ top: absTop(stations) - 70, behavior: 'instant' });
  flow.style.opacity = ''; morph(old, next);
}
$$('.roles button').forEach(b => b.addEventListener('click', () => {
  const r = b.dataset.role; if (r === role) return;
  history.replaceState(null, '', r === 'all' ? location.pathname + location.search : '#role=' + r);
  switchRole(r);
}));
addEventListener('hashchange', () => { const r = parseRole(); if (r !== role) switchRole(r); });
$('.more-s')?.addEventListener('click', e => { const s = $('#role-summary'); s.classList.toggle('open'); e.currentTarget.textContent = s.classList.contains('open') ? 'Show less' : 'Read more'; });
$$('.more').forEach(m => m.addEventListener('click', () => { const j = m.closest('.job'), o = j.classList.toggle('open'); m.setAttribute('aria-expanded', String(o)); m.textContent = o ? 'Show less' : `Show all ${m.dataset.n}`; }));

/* ============================== the cable (rail) ============================== */
const R_ = { w: 40, cx: 28, nodes: [], ys: {}, arcs: [], lanes: [], samples: [], H: 0 };
const nodeKeyOf = k => k.startsWith('sk:') ? 'skills' : k.startsWith('rel:') ? 'releases' : k;
const linkNode = k => nodeKeyOf(k);
let nodeEls = {}, cableEl = $('#rail-cable'), arcLayer = $('#rail-arcs'), nodeLayer = $('#rail-nodes'), hlLayer = $('#rail-hl'), cabin = null, built = '';
const WPKEYS = new Set(['base', 'mid', 'summit']);

function collectNodes() {
  const top = absTop(stations), out = [{ key: 'base', y: 8 }];
  $$('[data-node], #projects .block-title', flow).forEach(el => {
    const key = el.dataset.node ? el.dataset.key : 'mid', a = el.dataset.node ? $('.node-anchor', el) : el;
    out.push({ key, y: absTop(a) - top + 11, el });
  });
  return out;
}
const nodeYs = () => Object.fromEntries(collectNodes().map(n => [n.key, n.y]));
const snapshot = () => ({ ys: { ...R_.ys }, t: scrollY });

function assignLanes(pairs, ys) {      // greedy interval colouring -> lane index per pair
  const items = pairs.map((p, i) => ({ i, a: Math.min(ys[p[0]], ys[p[1]]), b: Math.max(ys[p[0]], ys[p[1]]) })).sort((x, y) => (y.b - y.a) - (x.b - x.a));
  const lanes = [], out = {};
  items.forEach(it => { let l = lanes.findIndex(L => L.every(o => it.b + 8 < o.a || it.a - 8 > o.b)); if (l < 0) { l = lanes.length; lanes.push([]); } lanes[l].push(it); out[it.i] = l; });
  return { lane: out, n: lanes.length };
}
const bulge = (lane, n) => { const max = Math.max(14, R_.cx - 8), step = Math.min(13, (max - 9) / Math.max(1, n - 1)); return 9 + lane * step; };
const arcD = (cx, ya, yb, b) => `M${cx},${ya} C${cx - b * 1.33},${ya} ${cx - b * 1.33},${yb} ${cx},${yb}`;

function cableD(ys) {
  const pts = R_.nodes.map(n => [R_.cx, ys[n.key] ?? n.y]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) { const [, y0] = pts[i - 1], [, y1] = pts[i], bow = clamp(Math.abs(y1 - y0) * .035, 3, R_.cx > 30 ? 12 : 7); d += ` Q${R_.cx + bow},${(y0 + y1) / 2} ${R_.cx},${y1}`; }
  return d;
}
function buildRail() {
  arcLayer.textContent = nodeLayer.textContent = hlLayer.textContent = ''; nodeEls = {};
  R_.nodes.forEach(n => {
    const g = mk('g', { class: 'nd', 'data-nk': n.key }, nodeLayer);
    if (WPKEYS.has(n.key)) mk('rect', { x: -5, y: -5, width: 10, height: 10 }, g);
    else { mk('line', { x1: -7, x2: 7, y1: 0, y2: 0 }, g); mk('circle', { r: 4.5 }, g); }
    nodeEls[n.key] = g;
  });
  R_.arcs = LINKS.filter(l => !l[3]).map(l => ({ a: linkNode(l[0]), b: linkNode(l[1]), el: mk('path', { class: 'arc' }, arcLayer) })).filter(x => x.a !== x.b);
  if (!cabin) cabin = buildCabin();
}
function buildCabin() {
  const g = mk('g', { class: 'cab' }, $('#rail-cabin'));
  mk('circle', { class: 'glow', r: 14 }, g); mk('rect', { class: 'pul', x: -2, y: -17, width: 4, height: 6, rx: 1 }, g);
  mk('rect', { class: 'body', x: -7, y: -11, width: 14, height: 22, rx: 4 }, g);
  mk('rect', { class: 'win', x: -4.5, y: -7, width: 9, height: 5, rx: 1.5 }, g); mk('rect', { class: 'win', x: -4.5, y: 0, width: 9, height: 5, rx: 1.5 }, g);
  return g;
}
function render(ys) {
  R_.nodes.forEach(n => { const y = ys[n.key] ?? n.y; nodeEls[n.key].setAttribute('transform', `translate(${R_.cx},${y})`); });
  cableEl.setAttribute('d', cableD(ys));
  const pairs = R_.arcs.map(a => [a.a, a.b]);
  R_.arcs.forEach((a, i) => a.el.setAttribute('d', arcD(R_.cx, ys[a.a] ?? 0, ys[a.b] ?? 0, bulge(R_.lanes.lane[i] ?? 0, R_.lanes.n))));
}
function sampleCable() {
  const L = cableEl.getTotalLength(), n = Math.max(40, Math.ceil(L / 8)); R_.samples = [];
  for (let i = 0; i <= n; i++) { const p = cableEl.getPointAtLength(L * i / n); R_.samples.push([p.y, p.x]); }
}
const xAtY = y => { const s = R_.samples; if (!s.length) return R_.cx; let lo = 0, hi = s.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; s[m][0] < y ? lo = m + 1 : hi = m; } return s[lo][1]; };

function layout(sizeOnly) {
  const cs = getComputedStyle(root), railW = parseFloat(getComputedStyle(rail).width) || 40;
  R_.w = railW; R_.cx = railW - 12; rail.classList.toggle('narrow', railW < 56);
  R_.nodes = collectNodes(); R_.ys = Object.fromEntries(R_.nodes.map(n => [n.key, n.y]));
  R_.H = Math.ceil(stations.getBoundingClientRect().height);
  rail.setAttribute('width', railW); rail.setAttribute('height', R_.H); rail.setAttribute('viewBox', `0 0 ${railW} ${R_.H}`);
  const sig = R_.nodes.map(n => n.key).join();
  if (sig !== built || !cabin) { built = sig; buildRail(); }
  const pairs = LINKS.filter(l => !l[3]).map(l => [linkNode(l[0]), linkNode(l[1])]).filter(p => p[0] !== p[1]);
  R_.lanes = assignLanes(pairs, R_.ys);
  render(R_.ys); sampleCable();
  updateAltitudes(); buildDock();
  computeScrollMaps(); update(true);
}
let morphTok = 0;
function morph(old, next) {
  const tok = ++morphTok;
  if (!A || reduce) return;
  const from = {}, keys = Object.keys(next);
  keys.forEach(k => from[k] = old.ys[k] ?? next[k]);
  const o = { t: 0 }; cabinHide = true;
  A.animate(o, { t: 1, duration: 800, ease: 'outExpo', onUpdate: () => { if (tok !== morphTok) return; const ys = {}; keys.forEach(k => ys[k] = from[k] + (next[k] - from[k]) * o.t); render(ys); }, onComplete: () => { cabinHide = false; if (tok === morphTok) { render(next); sampleCable(); update(true); } } });
}

/* ---------- altitude: Gangtok 1,650 m -> Tsomgo Lake 3,753 m -> Nathu La 4,310 m ---------- */
let altCtrl = [{ s: 0, a: WP.base }, { s: 1, a: WP.top }], stageCtrl = [], maxScroll = 1, paperTop = 0;
const interp = (ctrl, s, f = x => x) => { if (s <= ctrl[0].s) return ctrl[0].a; for (let i = 1; i < ctrl.length; i++) if (s <= ctrl[i].s) { const p = ctrl[i - 1], q = ctrl[i], t = (s - p.s) / Math.max(1, q.s - p.s); return p.a + (q.a - p.a) * f(t); } return ctrl[ctrl.length - 1].a; };
function computeScrollMaps() {
  const vh = innerHeight, proj = $('#projects'), top = absTop(stations);
  maxScroll = Math.max(1, document.documentElement.scrollHeight - vh); paperTop = absTop($('.paper'));
  const pTop = absTop(proj), pBot = pTop + proj.offsetHeight, mid = (pTop + pBot) / 2, sum = absTop($('#summit')) + 40;
  const sMid = Math.max(60, mid - vh / 2), sSum = Math.max(sMid + 200, Math.min(sum - vh / 2, maxScroll));
  altCtrl = [{ s: 0, a: WP.base }, { s: sMid, a: WP.mid }, { s: sSum, a: WP.top }];
  // keep the cabin moving: only a short pause (~a quarter screen of scroll) at Tsomgo Lake, centred on the Projects block
  const hold = .12 * vh, a1 = Math.max(.1 * vh + 100, sMid - hold), d1 = a1 + 2 * hold, a2 = Math.max(d1 + 200, Math.min(absTop($('#summit')) - .55 * vh, maxScroll - 4));
  stageCtrl = [{ s: 0, a: 0 }, { s: .1 * vh, a: 0 }, { s: a1, a: 1 }, { s: d1, a: 1 }, { s: a2, a: 2 }, { s: Math.max(a2 + 1, maxScroll + 1), a: 2 }];
}
const altAtScroll = s => interp(altCtrl, s, smooth);
function updateAltitudes() {
  const vh = innerHeight, top = absTop(stations);
  computeScrollMaps();
  R_.nodes.forEach(n => {
    if (!n.el) return; const tag = $('[data-alt]', n.el); if (!tag) return;
    tag.textContent = fmt(n.key === 'summit' ? WP.top : fmtAlt(altAtScroll(Math.max(0, top + n.y - vh / 2)))) + ' m';
  });
}

/* ---------- altitude profile (dock, wide screens) ---------- */
const dock = $('#dock'); let dockRefs = null;
function buildDock() {
  if (!dock) return;
  const W = 272, H = 52, top = absTop(stations), y0 = top + 8, y1 = top + (R_.ys.summit ?? R_.H);
  const X = y => 8 + (W - 16) * clamp((y - y0) / Math.max(1, y1 - y0), 0, 1), Y = a => H - 6 - (H - 14) * (a - WP.base) / (WP.top - WP.base);
  const vh = innerHeight, pts = R_.nodes.map(n => { const ay = top + n.y, a = n.key === 'base' ? WP.base : n.key === 'summit' ? WP.top : altAtScroll(Math.max(0, ay - vh / 2)); return { n, x: X(ay), yy: Y(a), a, key: n.key }; });
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.yy.toFixed(1)).join('');
  dock.textContent = '';
  const head = document.createElement('div'); head.className = 'dk-h'; head.innerHTML = '<span>Altitude profile</span><b id="dk-alt">1,650 m</b>'; dock.appendChild(head);
  const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-labelledby': 'dk-t dk-d' });
  mk('title', { id: 'dk-t' }, svg).textContent = 'Altitude profile of the climb';
  mk('desc', { id: 'dk-d' }, svg).textContent = `Scroll progress as a climb from Gangtok at ${fmt(WP.base)} metres via Tsomgo Lake at ${fmt(WP.mid)} metres to Nathu La at ${fmt(WP.top)} metres. ${pts.length} stations.`;
  mk('path', { class: 'dk-fill', d: line + `L${pts[pts.length - 1].x},${H}L${pts[0].x},${H}Z` }, svg); mk('path', { class: 'dk-line', d: line }, svg);
  pts.forEach(p => { if (WPKEYS.has(p.key)) mk('rect', { class: 'dk-wp', x: p.x - 3.5, y: p.yy - 3.5, width: 7, height: 7 }, svg); else mk('circle', { class: 'dk-pt', cx: p.x, cy: p.yy, r: 2 }, svg); });
  const mark = mk('circle', { class: 'dk-mark', r: 4.5, cx: 8, cy: Y(WP.base) }, svg); dock.appendChild(svg);
  const tb = document.createElement('table'); tb.className = 'sr'; tb.innerHTML = '<caption>Stations and altitude</caption>' + pts.map(p => `<tr><th scope="row">${NAMES[p.key] || p.key}</th><td>${fmt(fmtAlt(p.a))} m</td></tr>`).join(''); dock.appendChild(tb);
  dockRefs = { mark, X, Y, y0, y1, alt: $('#dk-alt'), top };
}

/* ---------- cabin on the rail ---------- */
let cabY = 0, cabV = 0, cabin_t = 0, cabinHide = false, cabRaf = 0, lastY = 0;
function cabinTick(now) {
  cabRaf = 0; if (!cabin) return;
  const dt = Math.min(.05, (now - (cabin_t || now)) / 1000) || .016; cabin_t = now;
  const top = absTop(stations), tgt = clamp(scrollY + innerHeight * .5 - top, R_.ys.base ?? 8, R_.ys.summit ?? R_.H);
  const k = 90, c = 2 * Math.sqrt(k), a = (tgt - cabY) * k - cabV * c; cabV += a * dt; cabY += cabV * dt;
  if (reduce) { cabY = tgt; cabV = 0; }
  const x = xAtY(cabY), ang = clamp(-cabV * .0009, -.3, .3) * 57.3;
  cabin.setAttribute('transform', `translate(${x.toFixed(1)},${cabY.toFixed(1)}) rotate(${ang.toFixed(1)})`);
  cabin.style.display = reduce || cabinHide ? 'none' : '';
  if (Math.abs(tgt - cabY) > .2 || Math.abs(cabV) > .5) cabRaf = requestAnimationFrame(cabinTick);
}
const kickCabin = () => { if (!cabRaf) { cabin_t = 0; cabRaf = requestAnimationFrame(cabinTick); } };

/* ============================== scroll ============================== */
let camMode = 'hero', ticking = false;   // the canvas is always full screen; 'hero' and 'ride' only change the framing
const prog = $('#progress'), altEl = $('#alt'), altHero = $('#alt-hero'), ruler = $('#ruler'), hint = $('#hint'), cam = $('#cam');
function setCamMode(m) {
  if (m === camMode) return; camMode = m; cam.dataset.mode = m; scene && scene.setMode(m);
}
function update(force) {
  ticking = false;
  const s = scrollY, alt = fmtAlt(altAtScroll(s));
  prog.style.transform = `scaleX(${clamp(s / maxScroll, 0, 1).toFixed(4)})`;
  const txt = fmt(alt); if (altEl.textContent !== txt) { altEl.textContent = txt; altHero.textContent = txt; ruler.style.transform = `scaleX(${clamp((alt - WP.base) / (WP.top - WP.base), 0, 1).toFixed(3)})`; if (dockRefs) dockRefs.alt.textContent = txt + ' m'; }
  hint.classList.toggle('gone', s > 40);
  const past = s > paperTop - innerHeight * .6; root.classList.toggle('past-hero', past);
  setCamMode(past ? 'ride' : 'hero');
  if (scene) scene.setStage(interp(stageCtrl, s, smooth));
  if (dockRefs) { const ay = clamp(s + innerHeight / 2, dockRefs.y0, dockRefs.y1); dockRefs.mark.setAttribute('cx', dockRefs.X(ay)); dockRefs.mark.setAttribute('cy', dockRefs.Y(alt)); }
  kickCabin();
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => update()); } }, { passive: true });
let rzT = 0; addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => layout(false), 120); });
let roT = 0; new ResizeObserver(() => { clearTimeout(roT); roT = setTimeout(() => R_.nodes.length && Math.abs(stations.getBoundingClientRect().height - R_.H) > 1 && layout(false), 80); }).observe(flow);
new IntersectionObserver(([e]) => root.classList.toggle('hero-roles', e.isIntersecting), { rootMargin: `-${56}px 0px 0px 0px` }).observe($('.role-pick'));

/* ============================== connections (hover / focus / tap) ============================== */
const adj = new Map(), link = (a, b) => { (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); (adj.get(b) || adj.set(b, new Set()).get(b)).add(a); };
LINKS.forEach(l => link(l[0], l[1]));
SKILLS.forEach(s => s[3].forEach(u => link('sk:' + s[0], u)));
RELEASES.forEach(r => link('rel:' + r.id, r.project));
$$('.panel [data-key]', flow).forEach(e => { if (!e.dataset.key.startsWith('rel:')) link('numbers', e.dataset.key); });
const keyEls = new Map(); $$('[data-key]').forEach(e => (keyEls.get(e.dataset.key) || keyEls.set(e.dataset.key, []).get(e.dataset.key)).push(e));
const nameOf = k => k.startsWith('sk:') ? SKILLS.find(s => s[0] === k.slice(3))[1] : k.startsWith('rel:') ? 'Release ' + RELEASES.find(r => r.id === k.slice(4)).tag : (NAMES[k] || k);
const status = $('#hl-status');
let hoverK = null, focusK = null, lockK = null, activeK = null, activeEl = null, lastType = 'mouse';

function highlight(k, el) {
  if (k === activeK) return; activeK = k; activeEl = el;
  $$('.lit').forEach(e => e.classList.remove('lit')); hlLayer.textContent = '';
  $$('.nd.dim,.nd.lit,.arc.dim,.arc.lit').forEach(e => e.classList.remove('dim', 'lit'));
  document.body.classList.toggle('hl', !!k); status.classList.toggle('on', !!k);
  $$('.chip[aria-pressed="true"]').forEach(c => c.setAttribute('aria-pressed', 'false'));
  if (!k) return;
  const lit = new Set([k, ...(adj.get(k) || [])]), nodes = new Set([...lit].map(nodeKeyOf));
  if (k.startsWith('sk:') || k.startsWith('rel:')) nodes.add(nodeKeyOf(k));
  lit.forEach(x => (keyEls.get(x) || []).forEach(e => e.classList.add('lit')));
  nodes.forEach(n => (keyEls.get(n) || []).forEach(e => e.classList.add('lit')));
  if (lockK === k) $$(`.chip[data-key="${k}"]`).forEach(c => c.setAttribute('aria-pressed', 'true'));
  const nk = nodeKeyOf(k);
  R_.nodes.forEach(n => nodeEls[n.key].classList.add(nodes.has(n.key) ? 'lit' : 'dim'));
  R_.arcs.forEach(a => a.el.classList.add(nodes.has(a.a) && nodes.has(a.b) && (a.a === nk || a.b === nk) ? 'lit' : 'dim'));
  // transient cables from the active thing to everything it touches
  const top = absTop(stations), yA = k.startsWith('sk:') || k.startsWith('rel:') ? (activeEl ? absTop(activeEl) - top + activeEl.offsetHeight / 2 : R_.ys[nk]) : R_.ys[nk];
  const perm = new Set(R_.arcs.map(a => [a.a, a.b].sort().join()));
  const targets = [...nodes].filter(n => n !== nk && R_.ys[n] != null && !perm.has([n, nk].sort().join()));
  const pairs = targets.map(t => [nk, t]), ys = { ...R_.ys, [nk]: yA }, L = assignLanes(pairs, ys), fan = targets.length > 4;   // a dense bundle (Zentrax) is drawn as one faint fan: same bulge, shared origin
  targets.forEach((t, i) => { const p = mk('path', { class: fan ? 'hl-arc fan' : 'hl-arc', d: arcD(R_.cx, yA, R_.ys[t], fan ? bulge(0, 1) : bulge(L.lane[i], L.n)) }, hlLayer); if (!reduce) { const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len; p.getBoundingClientRect(); p.style.transition = 'stroke-dashoffset 320ms cubic-bezier(.23,1,.32,1)'; p.style.strokeDashoffset = 0; } });
  const ents = [...adj.get(k) || []].filter(x => !x.startsWith('sk:') && !x.startsWith('rel:')), sk = [...adj.get(k) || []].filter(x => x.startsWith('sk:')).length, rl = [...adj.get(k) || []].filter(x => x.startsWith('rel:')).length;
  const parts = [ents.slice(0, 5).map(nameOf).join(' · ') + (ents.length > 5 ? ` +${ents.length - 5}` : ''), sk ? `${sk} skill${sk > 1 ? 's' : ''}` : '', rl ? `${rl} release${rl > 1 ? 's' : ''}` : ''].filter(Boolean);
  status.textContent = `${nameOf(k)} ↔ ${parts.join(' · ') || 'no links'}`;
}
const refresh = (el) => { const k = hoverK || focusK || lockK; highlight(k, k === hoverK ? hoverEl : k === focusK ? focusEl : lockEl || el); };
let hoverEl = null, focusEl = null, lockEl = null;
document.addEventListener('pointerover', e => { lastType = e.pointerType; if (e.pointerType !== 'mouse') return; const t = e.target.closest('[data-hl]'); if (t && t.dataset.hl !== hoverK) { hoverK = t.dataset.hl; hoverEl = t; refresh(); } });
document.addEventListener('pointerout', e => { if (e.pointerType !== 'mouse') return; const t = e.target.closest('[data-hl]'); if (t && !t.contains(e.relatedTarget)) { hoverK = null; refresh(); } });
document.addEventListener('focusin', e => { const t = e.target.closest?.('[data-hl]'); if (t && e.target.matches(':focus-visible')) { focusK = t.dataset.hl; focusEl = t; refresh(); } });
document.addEventListener('focusout', e => { if (focusK) { focusK = null; refresh(); } });
document.addEventListener('pointerdown', e => { lastType = e.pointerType; });
document.addEventListener('click', e => {
  const t = e.target.closest('[data-hl]'), isChip = t && t.classList.contains('chip');
  if (!t) { if (lockK && !e.target.closest('.momo')) { lockK = null; refresh(); } return; }
  const touchy = lastType !== 'mouse', onControl = e.target.closest('a,summary,button:not(.chip)');
  if (isChip || (touchy && !onControl)) { lockK = lockK === t.dataset.hl ? null : t.dataset.hl; lockEl = t; activeK = null; refresh(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { lockK = null; $$('.momo.open').forEach(m => m.classList.remove('open')); activeK = null; refresh(); } });

/* ---------- momo memory note: hover/focus via CSS, tap via .open ---------- */
$$('.momo-btn').forEach(b => b.addEventListener('click', () => b.parentElement.classList.toggle('open')));
document.addEventListener('click', e => { if (!e.target.closest('.momo')) $$('.momo.open').forEach(m => m.classList.remove('open')); });

/* ---------- in-page links keep the role hash ---------- */
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); if (!a || a.getAttribute('href').length < 2) return;
  const t = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); if (!t) return;
  e.preventDefault(); t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const d = t.closest('details'); if (d) d.open = true;
});

/* ============================== count-ups + bars ============================== */
function countUp(el) {
  const to = parseFloat(el.dataset.to), dec = +el.dataset.dec || 0;
  if (!A || reduce) return;
  const o = { v: 0 }; el.textContent = (0).toFixed(dec);
  A.animate(o, { v: to, duration: 900, ease: 'outExpo', onUpdate: () => { el.textContent = o.v.toFixed(dec); }, onComplete: () => { el.textContent = to.toFixed(dec); } });
}
const seen = new WeakSet();
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting || seen.has(e.target)) return; seen.add(e.target);
  if (e.target.classList.contains('panels')) e.target.classList.add('in'); else $$('.count', e.target).forEach(countUp);
}), { threshold: .25 });
function observeReveals() { $$('.stats').forEach(s => io.observe(s)); $$('.panels').forEach(s => io.observe(s)); }
if (reduce) $$('.panels').forEach(p => p.classList.add('in'));

/* ============================== panel entrances (anime.js) ==============================
   Each glass panel rises and fades in once, as it nears the viewport; its parts follow in a short stagger.
   Only transform and opacity move. Fast scrolling never queues: at most 3 run at once (the rest simply appear),
   and a panel that leaves the screen mid-entrance is finished at once. Shown panels are never animated again. */
const glass = $$('.glass'), running = new Map(), waiting = new Set(), shown = new WeakSet();
const showNow = el => { shown.add(el); el.classList.add('in'); };
const partsOf = el => [...el.children].flatMap(c => c.matches('.st-head, .block-head') ? [...c.children] : [c]).slice(0, 7);
const clearStyle = els => els.forEach(e => { e.style.opacity = ''; e.style.transform = ''; });
function settle(el) { const r = running.get(el); if (!r) return; running.delete(el); r.anims.forEach(a => a.complete()); clearStyle([el, ...r.parts]); }
function reveal(el) {
  if (shown.has(el)) return;
  if (!A) { waiting.add(el); return; }
  waiting.delete(el);
  if (reduce || running.size >= 3) return showNow(el);
  shown.add(el);
  const parts = partsOf(el);
  el.style.opacity = 0; el.style.transform = 'translateY(24px)'; parts.forEach(p => p.style.opacity = 0);
  el.classList.add('in');
  const a1 = A.animate(el, { opacity: [0, 1], translateY: [24, 0], duration: 620, ease: 'outQuart', onComplete: () => clearStyle([el]) });
  const a2 = A.animate(parts, { opacity: [0, 1], translateY: [12, 0], duration: 520, ease: 'outQuart', delay: A.stagger(48, { start: 90 }), onComplete: () => { running.delete(el); clearStyle(parts); } });
  running.set(el, { anims: [a1, a2], parts });
}
const revealIO = 'IntersectionObserver' in window && new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { revealIO.unobserve(e.target); reveal(e.target); }
}), { rootMargin: '0px 0px -8% 0px' });
const leaveIO = 'IntersectionObserver' in window && new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) settle(e.target); }));
const flushReveals = () => [...waiting].forEach(reveal);
document.addEventListener('focusin', e => { const g = e.target.closest?.('.glass'); if (g && !shown.has(g)) { settle(g); showNow(g); } });
function armReveals() {
  if (reduce || root.classList.contains('rv-off') || !revealIO) return glass.forEach(showNow);
  glass.forEach(g => { revealIO.observe(g); leaveIO.observe(g); });
}

/* ============================== boot ============================== */
setTheme(root.dataset.theme, false);
switchRole(parseRole(), true);
observeReveals(); armReveals();
addEventListener('load', () => document.fonts?.ready.then(() => layout(false)));
const mqData = matchMedia('(prefers-reduced-data: reduce)'), saveData = () => mqData.matches || !!navigator.connection?.saveData;   // static frame, no travel
const sceneStill = () => { scene && (scene.setReduced(reduce || saveData()), scene.setStatic(saveData())); };
mqReduce.addEventListener('change', e => { reduce = e.matches; sceneStill(); if (reduce) { $$('.panels').forEach(p => p.classList.add('in')); [...running.keys()].forEach(settle); glass.forEach(showNow); } update(true); });

// after first paint: motion library, then the scene
const idle = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 700 }) : (f => setTimeout(f, 200));
idle(async () => {
  try {
    A = await import('animejs');
    A = { animate: A.animate, stagger: A.stagger, svg: A.svg };
    flushReveals();
    if (!reduce) {
      const paths = $$('#contours path'), texts = $$('#contours text');
      texts.forEach(t => t.style.opacity = 0);
      A.animate(A.svg.createDrawable(paths), { draw: ['0 0', '0 1'], ease: 'inOutQuad', duration: 2200, delay: A.stagger(120) });
      A.animate(texts, { opacity: [0, 1], ease: 'outQuad', duration: 800, delay: A.stagger(120, { start: 1200 }) });
      $$('.stats').forEach(s => { if (!seen.has(s) && s.getBoundingClientRect().top < innerHeight) { seen.add(s); $$('.count', s).forEach(countUp); } });
    }
  } catch (e) { console.warn('anime.js unavailable; motion disabled', e); glass.forEach(showNow); }
  try {
    const mod = await import('./scene.js'), b3 = $('.momo-3d');
    scene = mod.createScene({ canvas: $('#scene'), stallBtn: b3, onStall: (x, y, vis) => { b3.hidden = !(vis && camMode === 'ride'); if (vis) { const hw = (b3.firstElementChild.offsetWidth || 120) / 2 + 8; b3.style.transform = `translate(${clamp(x, hw, innerWidth - hw).toFixed(0)}px,${(y - 22).toFixed(0)}px) translate(-50%,-100%)`; } } });
    scene.setTheme(root.dataset.theme); sceneStill(); scene.setMode(camMode); syncAccent(); update(true);
  } catch (e) { console.warn('3D scene unavailable; the page works without it', e); cam.dataset.mode = 'off'; camMode = 'off'; }
});
$('.momo-3d').hidden = true;
if (dock) dock.hidden = false;
