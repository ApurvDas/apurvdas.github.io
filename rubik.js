/* The playable Rubik's cube: the view and the touch/mouse/keyboard handling around rubik-core.js (which holds the logic).
   Built lazily the first time the desk cube is opened. 27 rounded cubies with stickers in the SimReady cube's colours.
   Physics: a layer follows the finger, carries the release speed, and settles on the nearest quarter turn with a damped spring (small overshoot).
   room.js owns the render loop: it calls step(dt) each frame and keeps the loop alive while step() returns true; at rest this costs 0 rAF. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as core from './rubik-core.js';

export const selftest = core.selftest;
const PAL = { white: 0xf2f0e8, yellow: 0xf1cd28, red: 0xd22a2a, orange: 0xee7f1c, blue: 0x1c4ecf, green: 0x1b9a46 };
const HP = Math.PI / 2, EDGE = .2, PROP_EDGE = .072;   // metres: the floating cube, and the desk prop it grows from
const AX = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const springC = (k, z) => 2 * z * Math.sqrt(k);   // damping from stiffness and damping ratio

export function createCube({ scene, camera, canvas, from, to, reduced, onChange, onSolved, onHidden }) {
  const state0 = core.create(); let state = state0;
  const root = new THREE.Group(), cubeG = new THREE.Group(), turnG = new THREE.Group(); root.add(cubeG); cubeG.add(turnG); root.visible = false; scene.add(root);
  cubeG.quaternion.setFromEuler(new THREE.Euler(.5, -.65, 0));

  /* ---------- the 27 cubies ---------- */
  const black = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: .5, metalness: 0 });
  const sticker = Object.fromEntries(Object.entries(PAL).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, roughness: .36, metalness: 0, emissive: c, emissiveIntensity: .16, polygonOffset: true, polygonOffsetFactor: -1 })]));
  const bodyGeo = new RoundedBoxGeometry(.98, .98, .98, 3, .12);
  const stickerGeo = (() => { const s = .405, r = .11, p = new THREE.Shape(); p.moveTo(-s + r, -s); p.lineTo(s - r, -s); p.quadraticCurveTo(s, -s, s, -s + r); p.lineTo(s, s - r); p.quadraticCurveTo(s, s, s - r, s); p.lineTo(-s + r, s); p.quadraticCurveTo(-s, s, -s, s - r); p.lineTo(-s, -s + r); p.quadraticCurveTo(-s, -s, -s + r, -s); return new THREE.ShapeGeometry(p, 4); })();
  const cubies = state.cubies.map((c, i) => {
    const g = new THREE.Group(); g.userData.cid = i; g.add(new THREE.Mesh(bodyGeo, black));
    for (let a = 0; a < 3; a++) if (c.home[a]) {
      const n = new THREE.Vector3(); n.setComponent(a, c.home[a]);
      const m = new THREE.Mesh(stickerGeo, sticker[core.COLORS[(c.home[a] > 0 ? '+' : '-') + 'xyz'[a]]]); m.position.copy(n).multiplyScalar(.4925); m.quaternion.setFromUnitVectors(AX[2], n); g.add(m);
    }
    cubeG.add(g); return g;
  });
  const m4 = new THREE.Matrix4();
  const sync = i => { const c = state.cubies[i], g = cubies[i], r = c.rot; g.position.set(c.pos[0], c.pos[1], c.pos[2]); m4.set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1); g.quaternion.setFromRotationMatrix(m4); };
  const syncAll = () => cubies.forEach((_, i) => sync(i));
  syncAll();

  /* ---------- game state ---------- */
  let turn = null, queue = [], history = [], moves = 0, t0 = 0, secs = 0, scrambled = false, wasSolved = true, auto = null;   // auto: 'scramble' | 'solve' while a machine sequence runs
  const info = () => ({ moves, seconds: t0 ? (performance.now() - t0) / 1000 : secs, running: !!t0, solved: core.isSolved(state), auto: !!auto, scrambled });
  const emit = () => onChange && onChange(info());

  function begin(m, mode, k, z) {   // start turning a layer; a is the angle about +axis
    commit();
    const ids = state.cubies.map((c, i) => (c.pos[m.axis] === m.layer ? i : -1)).filter(i => i >= 0);
    turn = { axis: m.axis, layer: m.layer, ids, a: 0, v: 0, T: null, k, c: springC(k, z), mode };
    ids.forEach(i => turnG.add(cubies[i])); turnG.quaternion.identity();
    if (mode === 'user' && scrambled && !t0) { t0 = performance.now(); emit(); }
    return turn;
  }
  function commit() {   // the turn is over: apply the quarter turns to the logical state, then rewrite every moved cubie from it (no float drift)
    if (!turn) return; const t = turn; turn = null;
    const qt = Math.round((t.T ?? t.a) / HP); t.ids.forEach(i => cubeG.add(cubies[i])); turnG.quaternion.identity();
    if (qt) {
      core.move(state, t.axis, t.layer, qt); t.ids.forEach(sync); const m = { axis: t.axis, layer: t.layer, qt };
      if (t.mode === 'solve') history.pop(); else history.push(m);
      if (t.mode === 'user') moves++;
    }
    const solved = core.isSolved(state);
    if (solved && !wasSolved) {
      const how = t.mode === 'user' ? 'player' : t.mode; if (t0) { secs = (performance.now() - t0) / 1000; t0 = 0; }
      if (how === 'player' && scrambled) { scrambled = false; celebrate(); onSolved && onSolved({ how, moves, seconds: secs }); }
      else if (how !== 'player') { scrambled = false; onSolved && onSolved({ how, moves, seconds: secs }); }   // a player turn that merely undoes a turn is not a solve
    }
    wasSolved = solved; emit();
  }
  const spin = (t, T, k = 380, z = .6) => { t.T = T; t.k = k; t.c = springC(k, z); };

  /* machine sequences: a queue of moves played one after another */
  function play(list, mode, k, z) { commit(); queue = list.map(m => ({ ...m, mode, k, z })); auto = mode; emit(); }
  const next = () => { const m = queue.shift(); const t = begin(m, m.mode, m.k, m.z); spin(t, m.qt * HP, m.k, m.z); };
  function scramble() { if (auto) return; moves = 0; t0 = 0; secs = 0; scrambled = true; wasSolved = false; play(core.scrambleMoves(20), 'scramble', 2600, .9); }
  function solve() {
    if (auto || !history.length) return; const out = [];
    for (const m of history.slice().reverse().map(core.inverse)) { const l = out[out.length - 1]; if (l && l.axis === m.axis && l.layer === m.layer) { l.qt = ((l.qt + m.qt + 5) % 4) - 1; if (!l.qt) out.pop(); } else out.push({ ...m }); }   // merge neighbours on the same layer
    if (t0) { secs = (performance.now() - t0) / 1000; t0 = 0; } scrambled = false;
    if (!out.length) { history = []; return; }
    play(out, 'solve', out.length > 24 ? 1700 : 900, .9);
  }
  function reset() { queue = []; auto = null; drag = null; turn = null; turnG.quaternion.identity(); state = core.create(); history = []; moves = 0; t0 = 0; secs = 0; scrambled = false; wasSolved = true; syncAll(); cubies.forEach(g => cubeG.add(g)); emit(); }

  /* ---------- the whole cube: orbit with inertia, or a 90 degree step to a target ---------- */
  const ov = { x: 0, y: 0 }; let orbT = null;
  const camRight = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  function orbit(dx, dy) { camRight.set(1, 0, 0).applyQuaternion(camera.quaternion); _q.setFromAxisAngle(UPV, dx); _q2.setFromAxisAngle(camRight, dy); cubeG.quaternion.premultiply(_q2.multiply(_q)).normalize(); }
  function turnView(dir) {   // arrow keys: 'left' 'right' 'up' 'down'
    camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const ax = dir === "left" || dir === "right" ? UPV : camRight, sg = dir === 'left' || dir === 'up' ? -1 : 1;
    orbT = (orbT || cubeG.quaternion).clone().premultiply(_q.setFromAxisAngle(ax, sg * HP)).normalize(); ov.x = ov.y = 0;
    if (reduced()) { cubeG.quaternion.copy(orbT); orbT = null; }
  }

  /* ---------- open / close (the cube grows from the desk prop and floats up toward the camera) ---------- */
  let p = 0, pT = 0;
  const place = () => { const e = p * p * (3 - 2 * p); root.position.lerpVectors(from, to, e); root.scale.setScalar((PROP_EDGE + (EDGE - PROP_EDGE) * e) / 3); };
  place();
  function open() { root.visible = true; pT = 1; if (reduced()) p = 1; place(); }
  function close() { commit(); queue = []; auto = null; drag = null; pT = 0; if (reduced()) { p = 0; place(); root.visible = false; onHidden && onHidden(); } }

  /* ---------- confetti ---------- */
  const NC = 120, cp = new Float32Array(NC * 3), cc = new Float32Array(NC * 3), cv = new Float32Array(NC * 3); let clife = 0;
  const confGeo = new THREE.BufferGeometry(); confGeo.setAttribute('position', new THREE.BufferAttribute(cp, 3)); confGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const conf = new THREE.Points(confGeo, new THREE.PointsMaterial({ size: .011, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false })); conf.frustumCulled = false; conf.visible = false; scene.add(conf);
  function celebrate() {
    if (reduced()) return; const col = new THREE.Color(), cs = Object.values(PAL);
    for (let i = 0; i < NC; i++) {
      const a = Math.random() * 6.283, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), sp = .45 + Math.random() * .75;
      cp.set([root.position.x, root.position.y, root.position.z], i * 3); cv.set([r * Math.cos(a) * sp, Math.abs(u) * sp + .35, r * Math.sin(a) * sp], i * 3); col.setHex(cs[i % 6]); cc.set([col.r, col.g, col.b], i * 3);
    }
    clife = 1.7; conf.visible = true; conf.material.opacity = 1; ov.y = 6; confGeo.attributes.position.needsUpdate = confGeo.attributes.color.needsUpdate = true;
  }

  /* ---------- per frame ---------- */
  function step(dt) {
    let busy = false;
    if (pT !== p) {
      p += (pT - p) * (1 - Math.exp(-dt * 9)); if (Math.abs(pT - p) < .004) p = pT; place(); busy = true;
      if (p === 0 && pT === 0) { root.visible = false; onHidden && onHidden(); }
    }
    if (!turn && queue.length) next();
    if (turn) {
      busy = true;
      if (turn.T !== null) {
        for (let rem = dt; rem > 0;) { const h = Math.min(rem, 1 / 240); turn.v += (-turn.k * (turn.a - turn.T) - turn.c * turn.v) * h; turn.a += turn.v * h; rem -= h; }
        if (Math.abs(turn.a - turn.T) < .003 && Math.abs(turn.v) < .08) { turn.a = turn.T; turnG.quaternion.setFromAxisAngle(AX[turn.axis], turn.a); commit(); }
        else turnG.quaternion.setFromAxisAngle(AX[turn.axis], turn.a);
      }
    } else if (auto && !queue.length) { auto = null; emit(); }
    if (orbT) { cubeG.quaternion.slerp(orbT, 1 - Math.exp(-dt * 11)); if (cubeG.quaternion.angleTo(orbT) < .002) { cubeG.quaternion.copy(orbT); orbT = null; } busy = true; }
    else if (!drag && (Math.abs(ov.x) + Math.abs(ov.y)) > .2) { orbit(ov.y * dt, ov.x * dt); const d = Math.exp(-dt * 3.2); ov.x *= d; ov.y *= d; busy = true; }
    else if (!drag) ov.x = ov.y = 0;
    if (clife > 0) {
      clife -= dt; for (let i = 0; i < NC; i++) { cv[i * 3 + 1] -= 1.9 * dt; for (let k = 0; k < 3; k++) cp[i * 3 + k] += cv[i * 3 + k] * dt; }
      confGeo.attributes.position.needsUpdate = true; conf.material.opacity = clamp(clife / .6, 0, 1); busy = true; if (clife <= 0) conf.visible = false;
    }
    return busy || !!drag;
  }

  /* ---------- pointer: drag a sticker = turn that layer; drag empty space = orbit the whole cube ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), _p = new THREE.Vector3(), _d = new THREE.Vector3();
  let drag = null;
  const rect = () => canvas.getBoundingClientRect();
  function pick(e) {
    const r = rect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    const h = ray.intersectObject(root, true)[0]; if (!h) return null;
    let o = h.object; while (o && o.userData.cid === undefined) o = o.parent; if (!o) return null;
    const c = state.cubies[o.userData.cid], loc = cubeG.worldToLocal(h.point.clone()).sub(_p.set(c.pos[0], c.pos[1], c.pos[2]));
    const fa = Math.abs(loc.x) > Math.abs(loc.y) ? (Math.abs(loc.x) > Math.abs(loc.z) ? 0 : 2) : (Math.abs(loc.y) > Math.abs(loc.z) ? 1 : 2);
    return { cid: o.userData.cid, fa, sf: Math.sign(loc.getComponent(fa)) || 1, point: h.point.clone(), local: cubeG.worldToLocal(h.point.clone()) };
  }
  const toPx = v => { _p.copy(v).project(camera); const r = rect(); return [(_p.x * .5 + .5) * r.width, (-_p.y * .5 + .5) * r.height]; };
  function down(e) {
    if (drag || auto || pT !== 1) return;
    if (turn) commit();   // a turn still settling is finished at once
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, hit: pick(e), mode: null, slop: e.pointerType === 'mouse' ? 5 : 10, lx: e.clientX, ly: e.clientY, s: [] };
    if (e.pointerType === 'mouse') canvas.setPointerCapture(e.pointerId); ov.x = ov.y = 0; orbT = null; canvas.classList.add('drag');
  }
  function decide(e) {   // which way was it dragged? the layer axis b is perpendicular to the face normal; pick the one that carries the grabbed point most nearly along the drag
    const h = drag.hit, dx = e.clientX - drag.x0, dy = e.clientY - drag.y0, scr = loc => toPx(cubeG.localToWorld(loc.clone())), p0 = scr(h.local); let best = null;
    for (const b of [0, 1, 2]) {
      if (b === h.fa) continue; const p1 = scr(h.local.clone().applyQuaternion(_q.setFromAxisAngle(AX[b], .05))), sx = (p1[0] - p0[0]) / .05, sy = (p1[1] - p0[1]) / .05, n2 = sx * sx + sy * sy;   // sx, sy: where the grabbed point goes on screen per radian about +b
      if (n2 < 1e-6) continue; const al = Math.abs(dx * sx + dy * sy) / Math.sqrt(n2); if (!best || al > best.al) best = { al, b, sx, sy, n2 };
    }
    drag.mode = 'turn'; drag.ax = best; drag.dx0 = dx; drag.dy0 = dy;
    begin({ axis: best.b, layer: state.cubies[h.cid].pos[best.b] }, 'user', 0, 1);   // the sticker then follows the finger: angle = drag . (px per radian) / |px per radian|^2
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.mode && Math.hypot(dx, dy) > drag.slop) { if (drag.hit) decide(e); else drag.mode = 'orbit'; }
    const now = performance.now();
    if (drag.mode === 'turn') {
      const A = drag.ax; turn.a = clamp(((dx - drag.dx0) * A.sx + (dy - drag.dy0) * A.sy) / A.n2, -Math.PI, Math.PI); turnG.quaternion.setFromAxisAngle(AX[turn.axis], turn.a);
      drag.s.push([now, turn.a]); while (drag.s.length > 1 && now - drag.s[0][0] > 90) drag.s.shift();
    } else if (drag.mode === 'orbit') {
      orbit((e.clientX - drag.lx) * .009, (e.clientY - drag.ly) * .009); drag.s.push([now, (e.clientX - drag.lx) * .009, (e.clientY - drag.ly) * .009]); while (drag.s.length > 1 && now - drag.s[0][0] > 90) drag.s.shift();
    }
    drag.lx = e.clientX; drag.ly = e.clientY;
  }
  function up(e, cancel) {
    if (!drag || e.pointerId !== drag.id) return; const d = drag; drag = null; canvas.classList.remove('drag');
    if (d.mode === 'turn') {
      const s = d.s, v = s.length > 1 ? (s[s.length - 1][1] - s[0][1]) / Math.max(.016, (s[s.length - 1][0] - s[0][0]) / 1000) : 0, vv = cancel ? 0 : v;
      let T = Math.round((turn.a + vv * .12) / HP) * HP; if (Math.abs(turn.a) < .08 && Math.abs(vv) < 1) T = 0; T = clamp(T, -2 * HP, 2 * HP);
      turn.v = clamp(vv, -14, 14); spin(turn, T, 260, .55);
    } else if (d.mode === 'orbit' && !cancel && d.s.length > 1) {
      const s = d.s, dt = Math.max(.016, (s[s.length - 1][0] - s[0][0]) / 1000); let sx = 0, sy = 0; for (let i = 1; i < s.length; i++) { sx += s[i][1]; sy += s[i][2]; }
      ov.y = clamp(sx / dt, -10, 10); ov.x = clamp(sy / dt, -10, 10);   // ov.y is the yaw rate, ov.x the pitch rate
      if (performance.now() - s[s.length - 1][0] > 90) ov.x = ov.y = 0;
    }
  }

  /* ---------- keyboard: U D L R F B turn the faces now facing up, down, left, right, front, back (Shift = the other way); arrows turn the whole cube ---------- */
  function faceFor(key) {
    camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const upV = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion), toCam = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
    const want = { U: [upV, 1], D: [upV, -1], R: [camRight, 1], L: [camRight, -1], F: [toCam, 1], B: [toCam, -1] }[key]; let best = null;
    for (let a = 0; a < 3; a++) for (const s of [-1, 1]) { const w = AX[a].clone().multiplyScalar(s).applyQuaternion(cubeG.quaternion), sc = w.dot(want[0]) * want[1]; if (!best || sc > best.sc) best = { sc, a, s }; }
    return best;
  }
  function key(e) {   // returns true when the key was a cube key
    if (e.ctrlKey || e.altKey || e.metaKey || pT !== 1) return false;
    const onControl = e.target.closest?.('button, a, summary, input, select'), c = e.code;
    if (c === 'Space' || c === 'Enter') { if (onControl) return false; if (!e.repeat) (c === 'Space' ? scramble : solve)(); return true; }
    const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[c]; if (dir) { turnView(dir); return true; }
    const f = /^Key([UDLRFB])$/.exec(c); if (!f) return false;
    if (!e.repeat && !auto && !drag) { const b = faceFor(f[1]), m = core.faceMove(b.a, b.s, e.shiftKey); spin(begin(m, 'user', 380, .6), m.qt * HP); }
    return true;
  }

  return {
    group: root, step, open, close, down, move, up, key, scramble, solve, reset, info, selftest,
    get isOpen() { return pT === 1; }, get shown() { return root.visible; },
    debug: { project: () => { if (!drag || !drag.hit) return null; const v = drag.hit.local.clone().applyQuaternion(turnG.quaternion); cubeG.localToWorld(v); const r = rect(); v.project(camera); return [(v.x * .5 + .5) * r.width, (-v.y * .5 + .5) * r.height]; }, drag: () => drag, turn: () => turn && { a: turn.a, T: turn.T, axis: turn.axis, layer: turn.layer }, state: () => state, history: () => history, turnLayer: (axis, layer, qt) => { const t = begin({ axis, layer }, 'user', 380, .6); spin(t, qt * HP); } },
  };
}
