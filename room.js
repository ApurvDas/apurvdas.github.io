/* The desk room: a dusk-lit corner of a QA engineer's workspace, built from NVIDIA SimReady models (CC BY 4.0, converted and simplified) plus a few
   hand-made shell pieces (floor, walls, desk, window, whiteboard, screens). Lazy-loaded by main.js in room mode only.
   Playful in the spirit of Bruno Simon's portfolio (things react physically, the camera flies, small surprises), not a copy of it.
   Render loop: draws only while something moves (springs, camera, theme fade), so a resting room costs 0 rAF. Quality is probed once at start-up. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { NAMES, SHORT, ROLES, RELEASES, TESTS, TEST_TOTAL, SKILLS, GROUPS } from './data.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const MONO = '"Geist Mono", ui-monospace, Consolas, monospace', SANS = '"Geist", system-ui, "Segoe UI", sans-serif';
const ACC = { all: '#8fb4ff', qa: '#6fd3ac', systems: '#8fb4ff', web: '#f2a27b', ai: '#c4aaf2' };
const DESK_Y = .75, CX = -.15;                    // desk top height, desk centre x
const PROJECTS = ['wreckbox', 'dasvis', 'pm', 'unigen', 'netrisk', 'ciba', 'focus', 'khaata'];
const BOX_LABEL = { wreckbox: 'WreckBox', dasvis: 'DasVis', pm: 'Project Mgr', unigen: 'Unigen', netrisk: 'NetRisk AI', ciba: 'Ciba', focus: 'Focus', khaata: 'Khaata' };
export const PANEL_KEYS = ['numbers', 'releases', 'skills', 'experience', ...PROJECTS, 'cv', 'summit'];
const LABELS = { numbers: 'By the numbers', releases: 'Shipping log', skills: 'Skills', experience: 'Experience', cv: 'Download CV', summit: 'Contact', rubik: 'Rubik’s cube', lamp: 'Desk lamp', chair: 'Office chair', ...Object.fromEntries(PROJECTS.map(p => [p, NAMES[p]])) };

/* ---------- canvas helpers ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const redraw = (...a) => { draw(ctx, w, h, ...a); tex.needsUpdate = true; };
  return { c, ctx, tex, redraw };
}
function wrap(ctx, text, x, y, maxW, lh, maxLines) {   // returns the y after the last line; ends with an ellipsis if it had to cut
  const words = text.split(' '); let line = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const t = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(t).width > maxW && line) {
      n++; if (n === maxLines) { let l = line; while (ctx.measureText(l + '…').width > maxW) l = l.slice(0, -1); ctx.fillText(l + '…', x, y); return y + lh; }
      ctx.fillText(line, x, y); y += lh; line = words[i];
    } else line = t;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}
const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

/* the three screens: centre = test dashboard, left = shipping log, right = the current role */
function drawDash(ctx, w, h, role) {
  const a = ACC[role] || ACC.all;
  ctx.fillStyle = '#0a1020'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#121c38'; ctx.fillRect(0, 0, w, 46);
  ctx.fillStyle = '#b3c0d5'; ctx.font = `500 17px ${MONO}`; ctx.textBaseline = 'middle'; ctx.fillText('TEST DASHBOARD', 20, 24);
  const lab = ROLES[role].label.toUpperCase(), tw = ctx.measureText(lab).width + 26;
  ctx.fillStyle = a; rr(ctx, w - tw - 16, 9, tw, 28, 14); ctx.fill(); ctx.fillStyle = '#0a1020'; ctx.font = `600 16px ${MONO}`; ctx.fillText(lab, w - tw - 3, 24);
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = a; ctx.font = `600 104px ${SANS}`; ctx.fillText(TEST_TOTAL.toLocaleString('en-US'), 22, 168);
  ctx.fillStyle = '#eef2f9'; ctx.font = `500 22px ${SANS}`; ctx.fillText('automated tests', 26, 204);
  ctx.fillStyle = '#98a7c0'; ctx.font = `400 16px ${MONO}`; ctx.fillText('six projects, all in CI', 26, 230);
  ctx.fillStyle = '#98a7c0'; ctx.font = `400 15px ${MONO}`; ctx.fillText('collected from the real suites, 28 Oct 2026', 26, h - 24);
  const rows = Object.entries(TESTS).sort((p, q) => q[1] - p[1]), max = rows[0][1], x0 = 440, bw = w - x0 - 64;
  rows.forEach(([k, v], i) => {
    const y = 84 + i * 50;
    ctx.fillStyle = '#b3c0d5'; ctx.font = `500 15px ${MONO}`; ctx.textAlign = 'right'; ctx.fillText((SHORT[k] || NAMES[k]).slice(0, 16), x0 - 12, y + 3); ctx.textAlign = 'left';
    ctx.fillStyle = '#1c2a4f'; rr(ctx, x0, y - 12, bw, 16, 8); ctx.fill();
    ctx.fillStyle = a; rr(ctx, x0, y - 12, Math.max(16, bw * v / max), 16, 8); ctx.fill();
    ctx.fillStyle = '#eef2f9'; ctx.font = `600 17px ${MONO}`; ctx.fillText(String(v), x0 + bw + 10, y + 3);
  });
}
function drawShip(ctx, w, h, role) {
  const a = ACC[role] || ACC.all;
  ctx.fillStyle = '#0a1020'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#121c38'; ctx.fillRect(0, 0, w, 46);
  ctx.textBaseline = 'middle'; ctx.fillStyle = '#b3c0d5'; ctx.font = `500 17px ${MONO}`; ctx.fillText('SHIPPING LOG', 20, 24); ctx.textAlign = 'right'; ctx.fillText('OCT 2026', w - 20, 24); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  RELEASES.slice().reverse().forEach((r, i) => {
    const y = 62 + i * 70;
    ctx.fillStyle = a; ctx.beginPath(); ctx.arc(34, y + 14, 7, 0, 7); ctx.fill(); if (i < 4) { ctx.fillStyle = '#2a3a66'; ctx.fillRect(32, y + 24, 4, 56); }
    ctx.fillStyle = '#eef2f9'; ctx.font = `600 22px ${MONO}`; ctx.fillText(r.tag, 58, y + 20);
    ctx.fillStyle = '#b3c0d5'; ctx.font = `500 17px ${SANS}`; ctx.fillText(SHORT[r.project] || NAMES[r.project], 58 + ctx.measureText(r.tag).width + 70 > w - 100 ? 58 : 58 + 190, y + 20);
    ctx.textAlign = 'right'; ctx.fillStyle = '#98a7c0'; ctx.font = `400 16px ${MONO}`; ctx.fillText(r.label, w - 22, y + 20); ctx.textAlign = 'left';
    ctx.fillStyle = '#98a7c0'; ctx.font = `400 15px ${SANS}`; wrap(ctx, r.what, 58, y + 44, w - 90, 18, 1);
  });
}
function drawRole(ctx, w, h, role) {
  const a = ACC[role] || ACC.all, R = ROLES[role];
  ctx.fillStyle = '#0a1020'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#121c38'; ctx.fillRect(0, 0, w, 46);
  ctx.textBaseline = 'middle'; ctx.fillStyle = '#b3c0d5'; ctx.font = `500 17px ${MONO}`; ctx.fillText('NOW SHOWING', 20, 24); ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = a; ctx.font = `600 52px ${SANS}`; ctx.fillText(R.label, 22, 114);
  ctx.fillStyle = '#eef2f9'; ctx.font = `600 22px ${SANS}`; let y = wrap(ctx, R.headline, 22, 156, w - 44, 28, 4);
  ctx.fillStyle = '#b3c0d5'; ctx.font = `400 17px ${SANS}`; wrap(ctx, R.summary.split(' Pick a role')[0], 22, y + 14, w - 44, 24, Math.floor((h - y - 30) / 24));
}
function drawBoard(ctx, w, h) {
  ctx.fillStyle = '#f5f2ea'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = 'rgba(0,0,0,.035)'; for (let i = 0; i < 40; i++) ctx.fillRect(0, i * h / 40, w, 1);
  ctx.fillStyle = '#244a8f'; ctx.font = `700 54px ${SANS}`; ctx.textBaseline = 'alphabetic'; ctx.fillText('What I use', 40, 74);
  ctx.strokeStyle = '#d2452f'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(42, 90); ctx.quadraticCurveTo(190, 80, 330, 92); ctx.stroke();
  const cols = ['#244a8f', '#1d7157', '#a8481f', '#62419a', '#2b2b2b'], ids = Object.keys(GROUPS);
  ids.forEach((g, i) => {
    const col = i % 3, row = i < 3 ? 0 : 1, x = 40 + col * 316, y = 150 + row * 210;
    ctx.fillStyle = cols[i]; ctx.font = `700 29px ${SANS}`; ctx.fillText(GROUPS[g], x, y);
    ctx.font = `500 21px ${SANS}`; ctx.fillStyle = '#222';
    SKILLS.filter(s => s[2] === g).slice(0, 5).forEach((s, j) => { ctx.fillStyle = cols[i]; ctx.fillText('•', x, y + 34 + j * 28); ctx.fillStyle = '#222'; let t = s[1]; while (ctx.measureText(t).width > 268) t = t.slice(0, -2) + '…'; ctx.fillText(t, x + 18, y + 34 + j * 28); });
  });
  ctx.fillStyle = '#d2452f'; ctx.font = `600 22px ${MONO}`; ctx.fillText('+ 1,152 tests', 700, 408);
}
function drawLabel(ctx, w, h, text, dark) {
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = dark ? '#e9e5da' : '#f4f1e8'; rr(ctx, 6, 6, w - 12, h - 12, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#16202e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; let s = 40; ctx.font = `700 ${s}px ${SANS}`; while (ctx.measureText(text).width > w - 40 && s > 18) { s -= 2; ctx.font = `700 ${s}px ${SANS}`; } ctx.fillText(text, w / 2, h / 2 + 2);
}
function drawWood(ctx, w, h, base, dark, planks) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  const pw = w / planks;
  for (let i = 0; i < planks; i++) {
    ctx.fillStyle = `rgba(${i % 2 ? '255,230,190' : '0,0,0'},${.03 + (i * 37 % 7) / 140})`; ctx.fillRect(i * pw, 0, pw, h);
    ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(i * pw, 0); ctx.lineTo(i * pw, h); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.07)'; ctx.lineWidth = 1;
    for (let k = 0; k < 9; k++) { const x = i * pw + ((k * 53 + i * 31) % 100) / 100 * pw; ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 6, h * .3, x - 6, h * .6, x + 2, h); ctx.stroke(); }
  }
}
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* ================================================================================================================================ */
export async function createRoom({ canvas, hotLayer, role = 'all', theme = 'light', onProgress, onActivate, onToast }) {
  const qs = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: qs.get('aa') !== '0', powerPreference: 'high-performance' });
  const gpuName = (() => { try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return String(gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER)); } catch { return ''; } })();
  const giveUp = msg => { try { renderer.dispose(); renderer.forceContextLoss(); } catch { /* already gone */ } throw new Error(msg); };   // free the context before the classic page boots its own
  if (!renderer.capabilities.isWebGL2 || /swiftshader|llvmpipe|softpipe|basic render/i.test(gpuName)) giveUp('no usable GPU: ' + gpuName);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x0d1020);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, .05, 40);
  let W = 1, H = 1, R = 1, raf = 0, last = 0, tier = 'high', dirty = true, probing = true, ready = false, curRole = role;
  let mix = theme === 'dark' ? 1 : 0, mixT = mix;
  let envTex = null;

  /* ---------- lights: hemisphere + one directional + the lamp's warm point light. No shadow map; blobs fake the contact shadows ---------- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1), key = new THREE.DirectionalLight(0xffffff, 1), lampL = new THREE.PointLight(0xffb066, 1, 5, 1.6);
  key.position.set(-3, 3.4, 3.2); key.target.position.set(0, .8, -.4); scene.add(hemi, key, key.target, lampL);
  const TH = {
    light: { hemiS: new THREE.Color('#fff0e0'), hemiG: new THREE.Color('#8d7a76'), hemiI: 2.0, keyC: new THREE.Color('#ffd2a6'), keyI: 1.7, lampI: .5, env: 1.1, wall: new THREE.Color('#d9d2c8'), sky: ['#31457f', '#b86a86', '#ff9f66', '#ffd49a'], stars: 0, blob: .5 },
    dark: { hemiS: new THREE.Color('#5a72b8'), hemiG: new THREE.Color('#141b33'), hemiI: 1.15, keyC: new THREE.Color('#7f9be0'), keyI: .9, lampI: 4.2, env: .5, wall: new THREE.Color('#a9a6b8'), sky: ['#050a1a', '#0c1631', '#1c2c58', '#2d3f7a'], stars: 1, blob: .7 },
  };
  const cur = { hemiS: new THREE.Color(), hemiG: new THREE.Color(), keyC: new THREE.Color(), wall: new THREE.Color() };

  /* ---------- procedural shell ---------- */
  // the shell covers most pixels, so it uses the cheap Lambert shader (no specular, no reflections); only the models are PBR
  const std = (o) => new THREE.MeshLambertMaterial(o);
  const wallMat = std({ color: 0xffffff }), trimMat = std({ color: 0xf1ebe0 });
  const floorTex = canvasTex(1024, 1024, (c, w, h) => drawWood(c, w, h, '#6b4a33', 'rgba(20,10,5,.55)', 8)); floorTex.redraw();
  floorTex.tex.wrapS = floorTex.tex.wrapT = THREE.RepeatWrapping; floorTex.tex.repeat.set(2.2, 1.6);
  const deskTex = canvasTex(1024, 512, (c, w, h) => drawWood(c, w, h, '#a98c6c', 'rgba(60,30,10,.35)', 5)); deskTex.redraw();
  const box = (w, h, d, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const WL = -2.05, WR = 2.95, WB = -.9, WH = 2.8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WR - WL, 5.2), std({ map: floorTex.tex })); floor.rotation.x = -Math.PI / 2; floor.position.set((WL + WR) / 2, 0, WB + 2.6); scene.add(floor);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(WR - WL, WH), wallMat); back.position.set((WL + WR) / 2, WH / 2, WB); scene.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(5.2, WH), wallMat); left.rotation.y = Math.PI / 2; left.position.set(WL, WH / 2, WB + 2.6); scene.add(left);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(5.2, WH), wallMat); right.rotation.y = -Math.PI / 2; right.position.set(WR, WH / 2, WB + 2.6); scene.add(right);
  box(WR - WL, .1, .02, trimMat, (WL + WR) / 2, .05, WB + .01); box(.02, .1, 5.2, trimMat, WL + .01, .05, WB + 2.6); box(.02, .1, 5.2, trimMat, WR - .01, .05, WB + 2.6);
  // desk
  const deskMat = std({ map: deskTex.tex }), legMat = std({ color: 0x2b2f38 });
  const dX0 = -1.35, dX1 = 1.12, dZ0 = -.88, dZ1 = -.02;
  box(dX1 - dX0, .04, dZ1 - dZ0, deskMat, (dX0 + dX1) / 2, DESK_Y - .02, (dZ0 + dZ1) / 2);
  for (const x of [dX0 + .05, dX1 - .05]) for (const z of [dZ0 + .05, dZ1 - .05]) box(.05, DESK_Y - .04, .05, legMat, x, (DESK_Y - .04) / 2, z);
  box(dX1 - dX0 - .2, .3, .02, std({ color: 0x3a3f4a }), (dX0 + dX1) / 2, DESK_Y - .2, dZ0 + .07);   // modesty panel
  // window (sky is a small canvas redrawn only while the theme fades)
  const sky = canvasTex(128, 256, (c, w, h, k) => {
    const A = TH.light.sky, B = TH.dark.sky, g = c.createLinearGradient(0, 0, 0, h), cc = new THREE.Color();
    [0, .45, .8, 1].forEach((s, i) => g.addColorStop(s, '#' + cc.set(A[i]).lerp(new THREE.Color(B[i]), k).getHexString()));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    if (k > .02) { const r = mulberry(7); c.fillStyle = `rgba(255,255,255,${k * .9})`; for (let i = 0; i < 26; i++) { const s = r() < .2 ? 2 : 1; c.fillRect(r() * w, r() * h * .7, s, s); } c.fillStyle = `rgba(255,244,214,${k})`; c.beginPath(); c.arc(92, 52, 9, 0, 7); c.fill(); }
    else { c.fillStyle = 'rgba(255,214,150,.55)'; c.beginPath(); c.arc(40, h * .78, 34, 0, 7); c.fill(); }
  }); sky.redraw(mix);
  const wx = -1.5, wy = 1.7, ww = .95, wh = 1.3, frameM = std({ color: 0xf5f0e6 });
  const winSky = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshBasicMaterial({ map: sky.tex, toneMapped: false })); winSky.position.set(wx, wy, WB + .004); scene.add(winSky);
  for (const [w, h, x, y] of [[ww + .1, .05, 0, wh / 2 + .025], [ww + .1, .05, 0, -wh / 2 - .025], [.05, wh, -ww / 2 - .025, 0], [.05, wh, ww / 2 + .025, 0], [.03, wh, 0, 0], [ww, .03, 0, .1]]) box(w, h, .05, frameM, wx + x, wy + y, WB + .025);
  box(ww + .2, .04, .12, frameM, wx, wy - wh / 2 - .07, WB + .06);
  // whiteboard
  const board = canvasTex(1024, 576, drawBoard); board.redraw();
  const bw = 1.5, bh = bw * 576 / 1024, bx = CX + .05, by = 1.88;
  const boardG = new THREE.Group(); boardG.position.set(bx, by, WB + .02); scene.add(boardG);
  box(bw + .06, bh + .06, .03, std({ color: 0xc8ccd2 }), 0, 0, 0, boardG);
  const boardFace = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshLambertMaterial({ map: board.tex })); boardFace.position.z = .017; boardG.add(boardFace);
  // rug under the chair
  const rug = new THREE.Mesh(new THREE.CircleGeometry(.95, 48), std({ color: 0x3d5a6c })); rug.rotation.x = -Math.PI / 2; rug.position.set(-.7, .003, .45); rug.scale.y = .78; scene.add(rug);

  /* ---------- contact shadows (blob textures) ---------- */
  const blobTex = canvasTex(128, 128, (c, w, h) => { const g = c.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(0,0,0,.65)'); g.addColorStop(.55, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }); blobTex.redraw();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex.tex, transparent: true, depthWrite: false, opacity: .5, toneMapped: false });
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blob = (x, y, z, w, d, rot = 0) => { const m = new THREE.Mesh(blobGeo, blobMat); m.position.set(x, y + .002, z); m.scale.set(w, 1, d); m.rotation.y = rot; m.renderOrder = 1; scene.add(m); return m; };
  blob((dX0 + dX1) / 2, 0, (dZ0 + dZ1) / 2, 3.3, 1.6); blob(.4, 0, .45, 1.4, 1.2);

  /* ---------- models ---------- */
  const manager = new THREE.LoadingManager(); let maxP = 0;
  manager.onProgress = (u, l, t) => { maxP = Math.max(maxP, l / t); onProgress && onProgress(maxP * .92); };
  const loader = new GLTFLoader(manager); loader.setMeshoptDecoder(MeshoptDecoder);
  const names = ['monitor', 'keyboard', 'mouse', 'printer', 'rack', 'box-black', 'box-gray', 'tray', 'paperstack', 'pen', 'rubik', 'lamp', 'mug', 'chair'];
  const gl = {}; await Promise.all(names.map(async n => { gl[n] = (await loader.loadAsync(`assets/models/${n}.glb`)).scene; }));
  if (document.fonts) try { await Promise.all([document.fonts.load(`500 17px ${MONO}`), document.fonts.load(`600 22px ${MONO}`), document.fonts.load(`600 40px ${SANS}`), document.fonts.load(`500 21px ${SANS}`), document.fonts.load(`700 29px ${SANS}`)]); } catch { /* system font */ }
  const envMats = [];   // metals and glossy plastics get reflections on the high tier only; the big shell never samples the environment
  const inst = n => { const o = gl[n].clone(true); o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); if (/metal|chrome|gloss/i.test(m.material.name)) envMats.push(m.material); if (m.material.transparent) { m.material.depthWrite = false; m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; } } }); return o; };
  const fix = (o, f) => o.traverse(m => m.isMesh && f(m.material, m));

  const things = [], byKey = {}, pickables = [];
  /* a thing = a pivot at the object's base centre (it wobbles about that point), the model(s) inside, an invisible hit box on layer 1 and a hotspot */
  function thing(k, parts, o = {}) {
    const pivot = new THREE.Group(); pivot.position.set(o.x, o.y, o.z); scene.add(pivot); parts.forEach(p => pivot.add(p));
    scene.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(pivot); bb.min.sub(pivot.position); bb.max.sub(pivot.position);
    const size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3()), pad = o.pad ?? 0;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x + pad, .07), Math.max(size.y + pad, .07), Math.max(size.z + pad, .07)), new THREE.MeshBasicMaterial()); hit.position.copy(ctr); hit.layers.set(1); pivot.add(hit);
    const mats = []; pivot.traverse(m => { if (m.isMesh && m !== hit && m.material.emissive && m.material.emissiveIntensity !== undefined && !m.material.userData.noGlow) mats.push({ m: m.material, e: m.material.emissive.clone() }); else if (m.isMesh && m !== hit && m.material.isMeshBasicMaterial && m.material.map) mats.push({ m: m.material, basic: true }); });
    const t = { key: k, name: LABELS[k], pivot, hit, ctr, size, radius: size.length() / 2, mats, h: 0, hT: 0, a: [0, 0], av: [0, 0], y: 0, yv: 0, hot: o.hot !== false, fit: o.fit ?? 1.7, front: o.front ?? 0, dir: o.dir, onAct: o.onAct, tick: o.tick, active: false, anchor: o.anchor ? new THREE.Vector3(...o.anchor) : new THREE.Vector3(ctr.x, bb.max.y + .035, ctr.z) };
    hit.userData.thing = t; pickables.push(hit); things.push(t); (byKey[k] = byKey[k] || []).push(t); return t;
  }
  const place = (obj, { x = 0, y = 0, z = 0, ry = 0, s = 1, sx, sy, sz } = {}) => { obj.position.set(x, y, z); obj.rotation.y = ry; obj.scale.set(sx ?? s, sy ?? s, sz ?? s); return obj; };

  // monitors: the screen mesh ("emission") gets a canvas texture
  const screens = {};
  function monitor(slot, x, z, ry, draw) {
    const m = inst('monitor'), tex = canvasTex(768, 416, draw);
    fix(m, (mat, mesh) => { if (mat.name === 'emission') { const sc = new THREE.MeshBasicMaterial({ map: tex.tex, toneMapped: false }); mesh.material = sc; screens[slot] = tex; } });
    tex.tex.flipY = false;   // glTF UVs run top-down
    tex.tex.center.set(.5, .5); tex.tex.repeat.set(1.08, 1);   // the converted screen quad shows ~3% less than the full canvas on each side
    tex.redraw(curRole);
    return thing(slot === 'c' ? 'numbers' : slot === 'l' ? 'releases' : 'skills', [place(m, { ry })], { x, y: DESK_Y, z, hot: slot !== 'r', fit: 1.5, front: ry });
  }
  monitor('c', CX, -.5, 0, drawDash); monitor('l', CX - .6, -.47, .4, drawShip); monitor('r', CX + .6, -.47, -.4, drawRole);
  blob(CX, DESK_Y, -.48, .75, .45); blob(CX - .6, DESK_Y, -.45, .7, .42, .4); blob(CX + .6, DESK_Y, -.45, .7, .42, -.4);
  // whiteboard thing (the "Skills" hotspot; the right monitor is a second hit target for the same key)
  { const hitOnly = new THREE.Group(); const t = thing('skills', [hitOnly], { x: bx, y: by, z: WB + .05, fit: 1.35 }); t.size.set(bw, bh, .06); t.hit.geometry.dispose(); t.hit.geometry = new THREE.BoxGeometry(bw, bh, .06); t.hit.position.set(0, 0, 0); t.ctr.set(0, 0, 0); t.anchor.set(0, 0, 0); t.radius = bw * .5; t.pivot.add(boardG); boardG.position.set(0, 0, -.03); t.noWobbleY = true; }
  const kb = inst('keyboard'); thing('kb', [place(kb, { ry: Math.PI / 2 })], { x: CX, y: DESK_Y, z: -.2, hot: false }); blob(CX, DESK_Y, -.2, .5, .22);
  const mouseO = inst('mouse'); thing('mouse', [place(mouseO)], { x: CX + .42, y: DESK_Y, z: -.2, hot: false }); blob(CX + .42, DESK_Y, -.2, .3, .24);
  const mug = inst('mug'); thing('mug', [place(mug, { ry: -Math.PI / 2 - .4 })], { x: -.8, y: DESK_Y, z: -.12, hot: false }); blob(-.8, DESK_Y, -.12, .17, .17);
  // tray with the paper stack = Experience
  { const tray = inst('tray'), ps = inst('paperstack'); place(tray, { ry: Math.PI / 2 }); place(ps, { x: 0, y: .012, z: 0, ry: Math.PI / 2 + .06, s: .9 });
    thing('experience', [tray, ps], { x: .82, y: DESK_Y, z: -.26, fit: 1.9 }); blob(.82, DESK_Y, -.26, .55, .34); }
  // printer = CV
  { const pr = inst('printer'); thing('cv', [place(pr, { ry: 0 })], { x: .88, y: DESK_Y, z: -.62, fit: 1.9, front: 0, dir: [-.1, .3, 1] }); blob(.88, DESK_Y, -.62, .55, .62); }
  // second paper stack + pen = Contact
  { const ps = inst('paperstack'), pen = inst('pen'); place(ps, { ry: .25 }); fix(pen, (m, mesh) => { if (!m.transparent) m.color.set(0x1a2233); }); place(pen, { x: .02, y: .0335, z: .02, ry: -.5 });
    thing('summit', [ps, pen], { x: -1.0, y: DESK_Y, z: -.3, fit: 2.8, pad: .02, dir: [.75, .6, 1] }); blob(-1.0, DESK_Y, -.3, .34, .42, .25); }
  // lamp: clamped to the left edge of the desk; its head carries the warm light
  let lampThing; { const la = inst('lamp'); lampThing = thing('lamp', [place(la, { ry: Math.PI / 2 + .35 })], { x: -1.22, y: DESK_Y, z: -.55, fit: 1.9 }); lampThing.lampOn = 1; lampThing.lampT = 1; }
  // rubik's cube
  const rubik = thing('rubik', [place(inst('rubik'), { ry: .4 })], { x: -.5, y: DESK_Y, z: -.1, pad: .03, fit: 4 }); blob(-.5, DESK_Y, -.1, .12, .12);
  rubik.q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, .4, 0)); rubik.fly = 0; rubik.axis = new THREE.Vector3(1, 0, 0); rubik.qT = rubik.q.clone();
  rubik.pivot.children[0].rotation.set(0, 0, 0); rubik.pivot.children[0].quaternion.copy(rubik.q);
  // chair (spins when clicked)
  const chairM = inst('chair'); fix(chairM, m => { if (m.color && m.color.getHex() === 0 && !m.map) { m.color.set(0x3a3f4a); m.roughness = .85; } });
  const chair = thing('chair', [place(chairM, { ry: Math.PI })], { x: -1.1, y: 0, z: .45, fit: 1.6 }); chair.pivot.rotation.y = .55; chair.spin = 0; chair.spinV = 0; blob(-1.1, 0, .45, .8, .8);
  // rack against the right-hand wall, 8 boxes, one per project
  const RK = { x: 2.1, z: -.62, sx: .55, sy: .56, sz: .55 }, SHELF = [1.192, 2.59];
  { const rk = inst('rack'); place(rk, { sx: RK.sx, sy: RK.sy, sz: RK.sz }); const g = new THREE.Group(); g.position.set(RK.x, 0, RK.z); g.add(rk); scene.add(g); blob(RK.x, 0, RK.z + .1, 1.9, 1.1); }
  const BS = .5, bwid = .6 * BS;
  PROJECTS.forEach((p, i) => {
    const row = i < 4 ? 0 : 1, col = i % 4, black = (i + row) % 2 === 0, b = inst(black ? 'box-black' : 'box-gray');
    fix(b, mat => { if (black) { mat.color.set(0x141619); mat.roughness = .5; } });
    place(b, { s: BS });
    const lab = canvasTex(256, 90, (c, w, h) => drawLabel(c, w, h, BOX_LABEL[p], black)); lab.redraw();
    const lw = .6 * .78, lp = new THREE.Mesh(new THREE.PlaneGeometry(lw, lw * 90 / 256), new THREE.MeshBasicMaterial({ map: lab.tex, transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    lp.position.set(0, .2, .2 + .006); b.add(lp);   // the label is a child of the (scaled) box, so it is in the box's own units
    thing(p, [b], { x: RK.x + (col - 1.5) * (bwid + .04), y: SHELF[row] * RK.sy + .006, z: RK.z + .09, fit: 3.4 });
  });


  /* ---------- environment (reflections for the metals), only on the high tier ---------- */
  { const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose(); }
  const setEnv = on => envMats.forEach(m => { m.userData.m0 ??= m.metalness; m.envMap = on ? envTex : null; m.metalness = on ? m.userData.m0 : Math.min(m.userData.m0, .3); m.needsUpdate = true; });   // no reflections on the low tier: metals fall back to painted-looking colour

  /* ---------- hotspots (real buttons over each object) ---------- */
  const hot = [];
  const order = ['numbers', 'releases', 'skills', 'experience', ...PROJECTS, 'cv', 'summit', 'rubik', 'lamp', 'chair'];
  order.forEach(k => {
    const t = byKey[k].find(x => x.hot); if (!t) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rm-pin'; b.dataset.key = k; b.hidden = true;
    b.innerHTML = `<span class="rm-dot" aria-hidden="true"></span><span class="rm-lab">${LABELS[k]}</span>`;
    b.setAttribute('aria-haspopup', PANEL_KEYS.includes(k) ? 'dialog' : 'false');
    if (!PANEL_KEYS.includes(k)) b.setAttribute('aria-label', { rubik: 'Rubik’s cube: give it a spin', lamp: 'Desk lamp: switch it on or off', chair: 'Office chair: give it a spin' }[k]);
    b.addEventListener('click', () => activate(k)); b.addEventListener('focus', () => { if (b.matches(':focus-visible')) hover(k, true); }); b.addEventListener('blur', () => hover(null));
    b.addEventListener('pointerenter', () => hover(k)); b.addEventListener('pointerleave', () => hover(null));
    hotLayer.appendChild(b); hot.push({ k, t, b, x: 0, y: 0, v: false });
  });

  /* ---------- hover, wobble, activation ---------- */
  let hoverK = null;
  const kick = (t, s = 1) => { t.av[0] += (Math.random() - .5) * 2.4 * s; t.av[1] += (Math.random() - .5) * 2.4 * s; t.yv += .55 * s; t.active = true; };
  function hover(k, kb) {
    if (k === hoverK) return; hoverK = k;
    things.forEach(t => { const on = t.key === k; if (on && t.hT === 0) kick(t, .7); t.hT = on ? 1 : 0; t.active = true; });
    hot.forEach(h => h.b.classList.toggle('hover', h.k === k)); canvas.style.cursor = k ? 'pointer' : '';
    poke();
  }
  function activate(k) {
    if (PANEL_KEYS.includes(k)) { things.filter(t => t.key === k).forEach(t => kick(t, 1.6)); onActivate && onActivate(k); poke(); return; }
    if (k === 'rubik') { const t = rubik; if (t.fly > 0) return; t.fly = 1e-4; t.axis.set(Math.random() - .5, Math.random(), Math.random() - .5).normalize(); t.qT.setFromEuler(new THREE.Euler(0, Math.floor(Math.random() * 4) * Math.PI / 2 + Math.PI / 4, 0)); t.qStart = t.pivot.children[0].quaternion.clone(); t.active = true; onToast && onToast(['1,152 tests and still can’t solve this', 'Found the bug: it was me, holding it wrong', 'Works on my cube', 'Step 1: reproduce the issue. Step 2: there is no step 2.'][Math.floor(Math.random() * 4)]); poke(); }
    else if (k === 'lamp') { lampThing.lampT = lampThing.lampT ? 0 : 1; kick(lampThing, 1.2); lampThing.active = true; onToast && onToast(lampThing.lampT ? 'Lamp on' : 'Lamp off'); poke(); }
    else if (k === 'chair') { chair.spinV += 14 + Math.random() * 6; chair.active = true; onToast && onToast('Wheeee'); poke(); }
  }

  /* ---------- camera: spring-driven fly-to, limited orbit ---------- */
  const cam = { p: new THREE.Vector3(), pv: new THREE.Vector3(), t: new THREE.Vector3(), tv: new THREE.Vector3(), pT: new THREE.Vector3(), tT: new THREE.Vector3(), shift: 0, shiftV: 0, shiftT: 0, yaw: 0, pitch: 0, yawT: 0, pitchT: 0, moving: true };
  const home = { p: new THREE.Vector3(), t: new THREE.Vector3() };
  const STAGE = { cx: .8, cy: 1.1, cz: -.35, w: 4.5, h: 2.9 };
  let focusK = null;
  function fitHome() {
    const a = W / H, tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), th = tv * a;
    const d = Math.max(STAGE.w / 2 / th, STAGE.h / 2 / tv) + .5;
    home.t.set(STAGE.cx, STAGE.cy - .02, STAGE.cz); home.p.set(STAGE.cx + d * .1, STAGE.cy + d * .2 + .15, STAGE.cz + d);
  }
  function poseFor(t) {
    const c = t.ctr.clone().applyMatrix4(t.pivot.matrixWorld), r = t.radius;
    const front = new THREE.Vector3(Math.sin(t.front), 0, Math.cos(t.front)), toHome = home.p.clone().sub(c).setY(0).normalize();
    const dir = t.dir ? new THREE.Vector3(...t.dir).normalize() : front.multiplyScalar(.5).add(toHome.multiplyScalar(.5)).normalize(); if (!t.dir) dir.y = .22; dir.normalize();
    const dist = Math.max(.55, r / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * t.fit);
    return { p: c.clone().addScaledVector(dir, dist), t: c };
  }
  function flyTo(k) {
    const t = byKey[k] && (byKey[k].find(x => x.hot) || byKey[k][0]); if (!t) return Promise.resolve();
    focusK = k; const pose = poseFor(t); cam.pT.copy(pose.p); cam.tT.copy(pose.t); cam.shiftT = 1; cam.moving = true; poke();
    return new Promise(res => setTimeout(res, 420));
  }
  function release() { focusK = null; cam.pT.copy(home.p); cam.tT.copy(home.t); cam.shiftT = 0; cam.moving = true; poke(); }
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
  function stepCamera(dt) {
    const w0 = 8.5, z = .78;   // slightly under-damped: a small settle at the end of a fly-to
    for (const [x, v, T] of [[cam.p, cam.pv, cam.pT], [cam.t, cam.tv, cam.tT]]) { v.addScaledVector(_v.copy(x).sub(T), -w0 * w0 * dt).multiplyScalar(Math.exp(-2 * z * w0 * dt)); x.addScaledVector(v, dt); }
    cam.shiftV += (-w0 * w0 * (cam.shift - cam.shiftT)) * dt; cam.shiftV *= Math.exp(-2 * z * w0 * dt); cam.shift += cam.shiftV * dt;
    const f = 1 - Math.exp(-dt * 9); if (focusK) { cam.yawT *= .9; cam.pitchT *= .9; }
    cam.yaw += (cam.yawT - cam.yaw) * f; cam.pitch += (cam.pitchT - cam.pitch) * f;
    cam.moving = cam.p.distanceToSquared(cam.pT) > 1e-6 || cam.t.distanceToSquared(cam.tT) > 1e-6 || cam.pv.lengthSq() > 1e-6 || cam.tv.lengthSq() > 1e-6 || Math.abs(cam.shift - cam.shiftT) > 1e-4 || Math.abs(cam.shiftV) > 1e-4 || Math.abs(cam.yawT - cam.yaw) > 1e-4 || Math.abs(cam.pitchT - cam.pitch) > 1e-4;
    if (!cam.moving) { cam.p.copy(cam.pT); cam.t.copy(cam.tT); cam.shift = cam.shiftT; cam.pv.set(0, 0, 0); cam.tv.set(0, 0, 0); cam.shiftV = 0; }
    _q.setFromEuler(_e.set(cam.pitch, cam.yaw, 0, 'YXZ')); camera.position.copy(cam.t).add(_v.copy(cam.p).sub(cam.t).applyQuaternion(_q)); camera.lookAt(cam.t);
    camera.updateMatrixWorld();
    if (Math.abs(cam.shift) > 1e-4) camera.setViewOffset(W, H, cam.shift * W * .17, 0, W, H); else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  }

  /* ---------- per-frame object physics: springs for wobble, the rubik's hop, the chair's spin, the lamp's fade ---------- */
  function stepThings(dt) {
    let any = false;
    for (const t of things) {
      let act = false;
      t.h += (t.hT - t.h) * (1 - Math.exp(-dt * 14)); if (Math.abs(t.hT - t.h) > .004) act = true; else t.h = t.hT;
      for (let i = 0; i < 2; i++) { t.av[i] += (-170 * t.a[i] - 9 * t.av[i]) * dt; t.a[i] += t.av[i] * dt; if (Math.abs(t.a[i]) > 1e-3 || Math.abs(t.av[i]) > 1e-2) act = true; else { t.a[i] = 0; t.av[i] = 0; } }
      if (!t.noWobbleY) { t.yv += (-260 * t.y - 12 * t.yv) * dt; t.y += t.yv * dt; if (Math.abs(t.y) > 1e-4 || Math.abs(t.yv) > 1e-3) act = true; else { t.y = 0; t.yv = 0; } }
      t.pivot.rotation.x = t.a[0]; t.pivot.rotation.z = t.a[1]; if (t !== chair) t.pivot.rotation.y = 0;
      t.pivot.position.y = t.pivot.userData.y0 ?? (t.pivot.userData.y0 = t.pivot.position.y); t.pivot.position.y += Math.max(0, t.y) + t.h * .004;
      t.pivot.scale.setScalar(1 + t.h * .018);
      for (const m of t.mats) { if (m.basic) m.m.color.setScalar(1 + t.h * .35); else m.m.emissive.copy(m.e).addScalar(t.h * .09); }
      t.active = act; any = any || act;
    }
    // rubik: a hop with a few turns; lands on a random quarter turn
    const r = rubik; if (r.fly > 0) {
      r.fly += dt / .8; const s = Math.min(1, r.fly), e = 1 - (1 - s) * (1 - s), m = r.pivot.children[0];
      r.pivot.userData.hop = Math.sin(Math.PI * s) * .32; m.quaternion.copy(r.qStart).slerp(r.qT, e); _q.setFromAxisAngle(r.axis, (1 - e) * Math.PI * 4); m.quaternion.premultiply(_q);
      r.pivot.position.y = r.pivot.userData.y0 + r.pivot.userData.hop; any = true;
      if (s >= 1) { r.fly = 0; r.pivot.userData.hop = 0; m.quaternion.copy(r.qT); kick(r, 1.8); }
    }
    // chair
    if (Math.abs(chair.spinV) > .02) { chair.spin += chair.spinV * dt; chair.spinV *= Math.exp(-1.6 * dt); chair.pivot.rotation.y = .55 + chair.spin; any = true; } else if (chair.spinV) { chair.spinV = 0; }
    // lamp on/off fade
    const L = lampThing; if (Math.abs(L.lampOn - L.lampT) > .003) { L.lampOn += (L.lampT - L.lampOn) * (1 - Math.exp(-dt * 8)); any = true; } else L.lampOn = L.lampT;
    return any;
  }

  /* ---------- theme ---------- */
  const lampHead = new THREE.Vector3();
  function applyTheme() {
    const k = sm(0, 1, mix), A = TH.light, B = TH.dark;
    cur.hemiS.lerpColors(A.hemiS, B.hemiS, k); cur.hemiG.lerpColors(A.hemiG, B.hemiG, k); cur.keyC.lerpColors(A.keyC, B.keyC, k); cur.wall.lerpColors(A.wall, B.wall, k);
    hemi.color.copy(cur.hemiS); hemi.groundColor.copy(cur.hemiG); hemi.intensity = A.hemiI + (B.hemiI - A.hemiI) * k;
    key.color.copy(cur.keyC); key.intensity = A.keyI + (B.keyI - A.keyI) * k;
    wallMat.color.copy(cur.wall); envMats.forEach(m => { m.envMapIntensity = A.env + (B.env - A.env) * k; }); blobMat.opacity = A.blob + (B.blob - A.blob) * k;
    sky.redraw(k); dirty = true;
  }

  /* ---------- sizing, render, loop ---------- */
  const hotPos = new THREE.Vector3();
  function updateHot() {
    for (const h of hot) {
      hotPos.copy(h.t.anchor).applyMatrix4(h.t.pivot.matrixWorld); if (h.k === 'lamp') hotPos.y += .08; hotPos.project(camera);
      const x = (hotPos.x * .5 + .5) * W, y = (-hotPos.y * .5 + .5) * H, v = hotPos.z < 1 && x > -20 && x < W + 20 && y > -20 && y < H + 20;
      if (v !== h.v) { h.v = v; h.b.hidden = !v; }
      if (v && (Math.abs(x - h.x) > .3 || Math.abs(y - h.y) > .3)) { h.x = x; h.y = y; h.b.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`; }
    }
  }
  function lampSync() { lampHead.set(.12, .5, .3).applyMatrix4(lampThing.pivot.matrixWorld); lampL.position.copy(lampHead); lampL.intensity = (TH.light.lampI + (TH.dark.lampI - TH.light.lampI) * sm(0, 1, mix)) * lampThing.lampOn; }
  function setRes() { renderer.setPixelRatio(R); renderer.setSize(W, H, false); }
  function resize() {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight); if (w === W && h === H && !dirty) return;
    W = w; H = h; setRes(); camera.aspect = W / H; camera.updateProjectionMatrix(); fitHome();
    if (!focusK) { cam.pT.copy(home.p); cam.tT.copy(home.t); if (!ready) { cam.p.copy(home.p); cam.t.copy(home.t); } } else { const p = poseFor((byKey[focusK].find(x => x.hot) || byKey[focusK][0])); cam.pT.copy(p.p); cam.tT.copy(p.t); }
    cam.moving = true; poke();
  }
  function draw() { lampSync(); renderer.render(scene, camera); dirty = false; }
  function frame(now) {
    raf = 0; const dt = Math.min(.05, Math.max(.001, (now - last) / 1000)); last = now;
    let more = false;
    if (mix !== mixT) { mix = mix < mixT ? Math.min(mixT, mix + dt / .45) : Math.max(mixT, mix - dt / .45); applyTheme(); more = mix !== mixT; }
    if (stepThings(dt)) more = true;
    stepCamera(dt); if (cam.moving) more = true;
    updateHot(); draw();
    if (more) raf = requestAnimationFrame(frame);
  }
  function poke() { if (ready && !raf && !probing && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else poke(); });
  new ResizeObserver(() => { resize(); }).observe(canvas);

  /* ---------- pointer: hover, click, limited orbit drag ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); ray.layers.set(1);
  function pick(e) {
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(pickables, false)[0]; return h ? h.object.userData.thing : null;
  }
  let down = null, lastHoverT = 0;
  canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; down = { x: e.clientX, y: e.clientY, yaw: cam.yawT, pitch: cam.pitchT, drag: false }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y; if (!down.drag && Math.hypot(dx, dy) > 5) { down.drag = true; canvas.classList.add('drag'); }
      if (down.drag && !focusK) { cam.yawT = clamp(down.yaw - dx * .0016, -.2, .2); cam.pitchT = clamp(down.pitch - dy * .001, -.07, .09); cam.moving = true; poke(); }
      return;
    }
    if (e.pointerType !== 'mouse') return; const now = performance.now(); if (now - lastHoverT < 40) return; lastHoverT = now;
    const t = pick(e); hover(t && t.key !== 'kb' && t.key !== 'mouse' && t.key !== 'mug' ? t.key : null);
  });
  const up = e => { if (!down) return; const d = down; down = null; canvas.classList.remove('drag'); if (!d.drag) { const t = pick(e); if (t && !['kb', 'mouse', 'mug'].includes(t.key)) activate(t.key); else if (t && t.key !== 'chair') { kick(t, 2); poke(); } else if (!t) onActivate && onActivate(null); } };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', () => { down = null; canvas.classList.remove('drag'); });
  canvas.addEventListener('pointerleave', () => { if (!down) hover(null); });

  /* ---------- start-up probe: pick the pixel ratio (and whether reflections are on) once, while the room is still invisible ---------- */
  const BUDGET = 12.5, defR = Math.min(1.5, Math.max(devicePixelRatio || 1, 1));   // ms per back-to-back frame; this Intel UHD held 60 fps at ~12 ms (GPU time only)
  let probeLog = null;
  function probe() {
    const g = renderer.getContext(), px = new Uint8Array(4), seen = new Set();
    const rungs = [['high', defR], ['high', 1.25], ['high', 1], ['low', 1]].filter(([t, r]) => r <= defR + .01 && !seen.has(t + r) && seen.add(t + r));
    if (qs.get('pr')) rungs.splice(0, rungs.length, [qs.get('tier') || 'high', parseFloat(qs.get('pr'))]);
    let i = 0; const trail = [];
    return new Promise((resolve, reject) => {
      const apply = () => { const [t, r] = rungs[i]; tier = t; R = r; setEnv(t === 'high'); setRes(); };
      const burst = () => {
        const ts = [];
        for (let k = 0; k < 11; k++) { const t0 = performance.now(); renderer.render(scene, camera); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px); if (k > 2) ts.push(performance.now() - t0); }
        if (document.hidden && !qs.get('pr')) { tier = 'low'; R = 1; setEnv(false); setRes(); probeLog = { tier, R, med: 0, trail: ['hidden'] }; return resolve(); }   // a background tab gives meaningless timings: take the safe rung
        const med = ts.sort((a, b) => a - b)[ts.length >> 1], lastRung = i === rungs.length - 1; trail.push(`${tier}@${R}:${med.toFixed(1)}`);
        if (med <= BUDGET || lastRung || qs.get('pr')) { probeLog = { tier, R, med: +med.toFixed(1), trail }; return med > 16 && !qs.get('pr') ? (() => { try { renderer.dispose(); renderer.forceContextLoss(); } catch { /* gone */ } reject(new Error('too slow: ' + trail.join(' '))); })() : resolve(); }
        i++; apply(); setTimeout(burst, 16);
      };
      apply(); setTimeout(burst, 30);
    });
  }

  /* ---------- go ---------- */
  applyTheme(); resize(); onProgress && onProgress(.95);
  renderer.compile(scene, camera); stepCamera(1 / 60); stepThings(1 / 60); updateHot();
  await probe();
  probing = false; ready = true; applyTheme(); dirty = true; resize(); poke(); onProgress && onProgress(1);
  if (/[?&]fps\b/.test(location.search)) { const hud = document.createElement('div'); hud.style.cssText = 'position:fixed;z-index:99;left:8px;top:64px;padding:4px 8px;border-radius:6px;background:#000c;color:#9f9;font:12px/1.3 monospace;pointer-events:none'; document.body.appendChild(hud); let n = 0, t0 = performance.now(); const rf = renderer.render.bind(renderer); renderer.render = (...a) => { n++; rf(...a); }; setInterval(() => { hud.textContent = `${tier}@${R} · ${Math.round(n * 1000 / (performance.now() - t0))} fps drawn · ${probeLog.med} ms probe · ${canvas.width}px`; n = 0; t0 = performance.now(); }, 1000); }

  return {
    keys: order,
    probe: probeLog,
    flyTo, release, activate,
    setTheme(t) { mixT = t === 'dark' ? 1 : 0; poke(); },
    setRole(r) { curRole = r; screens.c.redraw(r); screens.l.redraw(r); screens.r.redraw(r); dirty = true; poke(); },
    hoverKey: hover,
    get size() { return [W, H, R, tier]; },
    state: () => ({ raf, moving: cam.moving, tier, R, focusK }),
    dbg: /[?&]debug/.test(location.search) ? { L: THREE.MeshLambertMaterial, renderer, scene, camera, setRes: (r) => { R = r; setRes(); }, things } : null,
  };
}
