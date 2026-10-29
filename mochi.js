/* Mochi, the user's cat, curled up in her round pink plush bed. Built in code (SimReady has no animals): smooth merged ellipsoids, a tapered tube for the tail,
   fur painted on two small canvases (tabby stripes + white chest on the body, a face with a white muzzle and cheek patch on the head). About 6k triangles for her.
   Cat-local frame: the bed centre is the origin on the floor, +y up, she faces +x and her right side (+z) is the camera side.
   Only a few things move: ears, eyelids, tail, head. step(dt) returns true while any of them is moving, so a resting Mochi costs 0 rAF. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rnd = (() => { let a = 11; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
const FUR = { base: '#857c6f', dark: '#52493f', light: '#9d9484', white: '#f1ece2' };   // brown-grey tabby

function canvasMap(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

/* body fur, planar: u runs along the cat (x), v up (y). Vertical wavy tabby stripes, a darker back, a white chest at the front-low corner. */
const bodyTex = () => canvasMap(512, 256, (x, w, h) => {
  x.fillStyle = FUR.base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) { x.fillStyle = rnd() < .5 ? FUR.light : FUR.dark; x.globalAlpha = .1 + rnd() * .14; x.fillRect(rnd() * w, rnd() * h, 2, 5 + rnd() * 6); } x.globalAlpha = 1;
  for (let sx = 6; sx < w; sx += 13 + rnd() * 9) {
    x.strokeStyle = FUR.dark; x.globalAlpha = .22 + rnd() * .2; x.lineWidth = 3 + rnd() * 5; x.lineCap = 'round'; x.beginPath(); const ph = rnd() * 6;
    for (let y = 0; y <= h; y += 8) { const px = sx + Math.sin(y / 20 + ph) * 5; y ? x.lineTo(px, y) : x.moveTo(px, y); } x.stroke();
  } x.globalAlpha = 1;
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(40,32,24,.55)'); g.addColorStop(.3, 'rgba(40,32,24,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);   // dorsal line, darker on top
  const wg = x.createRadialGradient(w * .95, h * .85, 4, w * .95, h * .85, w * .3); wg.addColorStop(0, 'rgba(244,239,228,1)'); wg.addColorStop(.62, 'rgba(244,239,228,.95)'); wg.addColorStop(1, 'rgba(244,239,228,0)'); x.fillStyle = wg; x.fillRect(0, 0, w, h);   // white chest
});
/* head fur, projected from the front (u = across the face, v = up): darker forehead with the tabby M, cheek stripes, a white patch on her right cheek */
const headTex = () => canvasMap(256, 256, (x, w, h) => {
  x.fillStyle = FUR.base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) { x.fillStyle = rnd() < .5 ? FUR.light : FUR.dark; x.globalAlpha = .12 + rnd() * .12; x.fillRect(rnd() * w, rnd() * h, 2, 4 + rnd() * 4); } x.globalAlpha = 1;
  x.strokeStyle = FUR.dark; x.lineCap = 'round'; x.lineWidth = 7;   // M on the forehead
  x.beginPath(); x.moveTo(w * .35, h * .3); x.lineTo(w * .42, h * .15); x.lineTo(w * .5, h * .27); x.lineTo(w * .58, h * .15); x.lineTo(w * .65, h * .3); x.stroke();
  x.lineWidth = 5; for (const s of [0, 1]) for (let k = 0; k < 3; k++) { x.beginPath(); const sx = s ? w * .93 : w * .07, d = s ? -1 : 1; x.moveTo(sx, h * (.5 + k * .08)); x.quadraticCurveTo(sx + d * 26, h * (.5 + k * .08) + 4, sx + d * 52, h * (.54 + k * .09)); x.stroke(); }
  const g = x.createLinearGradient(0, 0, 0, h * .5); g.addColorStop(0, 'rgba(40,32,24,.5)'); g.addColorStop(1, 'rgba(40,32,24,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h * .5);
  const pg = x.createRadialGradient(w * .72, h * .66, 3, w * .72, h * .66, w * .22); pg.addColorStop(0, 'rgba(244,239,228,1)'); pg.addColorStop(.6, 'rgba(244,239,228,.9)'); pg.addColorStop(1, 'rgba(244,239,228,0)'); x.fillStyle = pg; x.fillRect(0, 0, w, h);   // white cheek patch (her right = +z = the right of the texture)
});
const plushTex = () => canvasMap(256, 128, (x, w, h) => {
  x.fillStyle = '#f4a3b8'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 4500; i++) { x.fillStyle = rnd() < .5 ? '#fbc3d2' : '#e98aa3'; x.globalAlpha = .25 + rnd() * .3; x.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); }
});

/* ellipsoid / tube pieces baked into cat-local coordinates, so one planar uv projection runs seamlessly across all of them */
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3();
function ell(rx, ry, rz, x, y, z, rot = [0, 0, 0], seg = [24, 16]) { const g = new THREE.SphereGeometry(1, seg[0], seg[1]).rotateY(Math.PI / 2 + .6); g.applyMatrix4(M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(...rot)), new THREE.Vector3(rx, ry, rz))); return g; }   // rotateY puts the uv seam at the back
function project(g, f) { const p = g.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { const [u, v] = f(p.getX(i), p.getY(i), p.getZ(i)); uv[i * 2] = clamp(u, .001, .999); uv[i * 2 + 1] = clamp(v, .001, .999); } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }
function taperedTube(curve, segs, radial, r0, r1) {
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false), p = g.attributes.position, n = g.attributes.normal, pts = curve.getSpacedPoints(segs);
  for (let i = 0; i <= segs; i++) { const r = r0 + (r1 - r0) * (i / segs) ** .8, c = pts[i]; for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; p.setXYZ(k, c.x + n.getX(k) * r, c.y + n.getY(k) * r, c.z + n.getZ(k) * r); } }
  p.needsUpdate = true; return g;
}

export function createMochi({ reduced = () => false } = {}) {
  const root = new THREE.Group(); root.name = 'mochi';
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  const earM = lam({ color: 0x6a5e4f }), furM = lam({ map: bodyTex() }), headM = lam({ map: headTex() }), pink = lam({ color: 0xe9a2a8 }), whiteM = lam({ color: 0xf1ece2 }), noseM = lam({ color: 0xd8868e });

  /* ---------- the bed: a fat soft ring on a flat cushion, pink plush, with a white tag on one side ---------- */
  const plush = plushTex(); plush.wrapS = plush.wrapT = THREE.RepeatWrapping; plush.repeat.set(7, 2);
  const bedM = new THREE.MeshStandardMaterial({ map: plush, bumpMap: plush, bumpScale: 1.6, roughness: 1, color: 0xffffff });
  const R = .1925, r = .0825, ring = new THREE.Mesh(new THREE.TorusGeometry(R, r, 16, 40), bedM); ring.rotation.x = Math.PI / 2; ring.scale.z = .86; ring.position.y = r * .86; root.add(ring);
  const cush = new THREE.Mesh(new THREE.CylinderGeometry(.165, .18, .05, 36), bedM); cush.position.y = .025; root.add(cush);
  const tagG = new THREE.Group(), tagR = new THREE.Group(), tag = new THREE.Mesh(new THREE.TorusGeometry(R, r * 1.045, 16, 8, .2), whiteM);   // a white band across the tube, like the tag on her bed
  tag.rotation.z = -.1; tagR.rotation.x = Math.PI / 2; tagR.scale.z = .86; tagR.position.y = r * .86; tagR.add(tag); tagG.add(tagR); tagG.rotation.y = -.55; root.add(tagG);

  /* ---------- body: ellipsoids merged into one mesh ---------- */
  const bodyUV = (x, y) => [(x + .27) / .47, (y - .035) / .19];
  const parts = [
    ell(.185, .088, .105, -.03, .125, -.005, [0, -.12, 0], [32, 18]),     // torso
    ell(.1, .088, .098, -.115, .125, .05, [0, 0, 0], [24, 14]),           // haunch, bulging toward the camera
    ell(.088, .08, .078, .095, .122, 0, [0, 0, 0], [24, 14]),             // chest
    ell(.05, .08, .048, .128, .165, 0, [0, 0, -.28], [20, 12]),           // neck
    ell(.046, .021, .026, .178, .064, .047, [0, .1, 0], [14, 8]),         // paws, tucked
    ell(.044, .021, .025, .158, .062, -.034, [0, -.15, 0], [14, 8]),
  ].map(g => project(g, (x, y) => bodyUV(x, y)));
  const body = new THREE.Mesh(mergeGeometries(parts.map(g => g.toNonIndexed())), furM); root.add(body);
  parts.forEach(g => g.dispose());

  /* ---------- tail: round the back and along the front of the bed to her paws ---------- */
  const tailPivot = new THREE.Group(); tailPivot.position.set(-.185, .095, .02); root.add(tailPivot);
  const curve = new THREE.CatmullRomCurve3([[-.185, .095, .02], [-.215, .085, .1], [-.15, .075, .17], [-.03, .07, .185], [.09, .068, .15], [.17, .066, .1]].map(p => new THREE.Vector3(...p).sub(tailPivot.position)));
  const tg = taperedTube(curve, 36, 8, .024, .011); const tp = tg.attributes.position, tuv = new Float32Array(tp.count * 2);
  for (let i = 0; i < tp.count; i++) { tuv[i * 2] = clamp((tp.getX(i) + tailPivot.position.x + .27) / .47, .001, .999); tuv[i * 2 + 1] = clamp((tp.getY(i) + tailPivot.position.y - .035) / .19, .001, .999); }
  tg.setAttribute('uv', new THREE.BufferAttribute(tuv, 2)); tailPivot.add(new THREE.Mesh(tg, furM));
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(.011, 10, 8), furM); tailTip.position.copy(curve.getPoint(1)); tailPivot.add(tailTip);

  /* ---------- collar and bell ---------- */
  const neckA = new THREE.Group(); neckA.position.set(.13, .15, 0); neckA.rotation.z = -.28; root.add(neckA);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.048, .0045, 8, 24), lam({ color: 0x1b2236 })); collar.rotation.x = Math.PI / 2; collar.scale.set(1, 1.05, 1); neckA.add(collar);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(.0105, 14, 10), new THREE.MeshStandardMaterial({ color: 0x2a62d6, roughness: .22, metalness: .3 })); bell.position.set(.05, -.012, 0); neckA.add(bell);
  const ringO = new THREE.Mesh(new THREE.TorusGeometry(.0045, .0013, 6, 12), lam({ color: 0xc9b266 })); ringO.position.set(.049, .002, 0); ringO.rotation.y = Math.PI / 2; neckA.add(ringO);

  /* ---------- head: its own pivot (it turns toward the camera), ears and eyelids are pivots inside it ---------- */
  const head = new THREE.Group(); head.position.set(.135, .182, 0); root.add(head);
  const faceUV = (x, y, z) => [.5 + z / .135, .5 + y / .125];
  const skull = project(ell(.06, .054, .062, .035, .02, 0, [0, 0, 0], [28, 18]), (x, y, z) => faceUV(x, y, z)); head.add(new THREE.Mesh(skull, headM));
  const mz = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10).rotateY(2), whiteM); mz.scale.set(.03, .022, .034); mz.position.set(.082, -.012, 0); head.add(mz);   // muzzle
  const chin = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8).rotateY(2), whiteM); chin.scale.set(.026, .016, .028); chin.position.set(.066, -.034, 0); head.add(chin);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), noseM); nose.scale.set(.007, .006, .01); nose.position.set(.112, .0, 0); head.add(nose);
  const ears = [1, -1].map(s => {
    const piv = new THREE.Group(); piv.position.set(.0, .058, s * .04); piv.userData.rest = [-s * .3, 0, -.12]; piv.rotation.set(...piv.userData.rest);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(.026, .056, 12, 1).translate(0, .028, 0), earM); outer.scale.z = .5; piv.add(outer);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(.016, .04, 10, 1).translate(0, .02, 0), pink); inner.scale.z = .4; inner.position.x = .008; piv.add(inner);
    head.add(piv); return piv;
  });
  const eyeM = lam({ color: 0xb8b24e, emissive: 0x2a2a08 }), pupilM = lam({ color: 0x0b0b0b }), lidM = lam({ color: 0x75654f });
  const lids = [1, -1].map(s => {
    const eye = new THREE.Group(); eye.position.set(.088, .018, s * .034); eye.rotation.y = -s * .45; head.add(eye);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.0105, 12, 8), eyeM); eye.add(ball);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), pupilM); pup.scale.set(.002, .0085, .0045); pup.position.set(.0098, 0, 0); eye.add(pup);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(.0118, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lidM); lid.userData.close = 0; eye.add(lid); return lid;
  });
  const wh = new THREE.BufferGeometry(), wp = []; for (const s of [1, -1]) for (let k = -1; k <= 1; k++) wp.push(.098, -.008 + k * .006, s * .02, .098 + .05, -.008 + k * .014, s * (.05 + .03));
  wh.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); head.add(new THREE.LineSegments(wh, new THREE.LineBasicMaterial({ color: 0xf4efe6, transparent: true, opacity: .75 })));   // whiskers

  /* ---------- animation: springs for the head, ears and tail; a clock for the slow blink ---------- */
  const S = () => ({ a: 0, v: 0, t: 0 });
  const st = { yaw: S(), pitch: S(), earL: S(), earR: S(), tail: S(), tailUp: S() }, REST_LID = .55; let clock = -1, kind = '', blinkAt = -1, headBack = 0, busy = false;
  const spring = (o, dt, k = 120, c = 11) => { o.v += (-k * (o.a - o.t) - c * o.v) * dt; o.a += o.v * dt; };
  const settled = o => Math.abs(o.a - o.t) < .002 && Math.abs(o.v) < .02;
  const lidAt = t => t < 0 ? 0 : t < .28 ? (t / .28) ** 2 * (3 - 2 * t / .28) : t < .52 ? 1 : t < 1.05 ? 1 - ((t - .52) / .53) ** 2 * (3 - 2 * (t - .52) / .53) : 0;   // close, hold, reopen slowly
  const cam = new THREE.Vector3();

  function react(camWorld) {   // hover or tap: ears twitch, a slow blink, a tail flick, the head turns toward the camera and settles back
    if (clock >= 0 && clock < .6) return; clock = 0; kind = 'react'; blinkAt = .12; headBack = 1.9;
    cam.copy(camWorld); root.worldToLocal(cam); cam.sub(head.position); st.yaw.t = clamp(-Math.atan2(cam.z, cam.x), -.7, .75); st.pitch.t = clamp(Math.atan2(cam.y, Math.hypot(cam.x, cam.z)) * -.5, -.2, .2);
    st.earL.v += 16; setTimeout(() => { st.earR.v -= 16; }, 160); setTimeout(() => { st.tail.v += 7; }, 380); setTimeout(() => { st.tail.v -= 6; }, 900);
  }
  function idle() {   // a short burst every 10 to 20 s: one of a tail flick, an ear twitch, a slow blink
    if (clock >= 0 || reduced()) return; clock = 0; kind = 'idle'; headBack = 0; const pick = Math.floor(rnd() * 3 + Math.random() * 3) % 3;
    if (pick === 0) { st.tail.v += 6; setTimeout(() => { st.tail.v -= 5; }, 500); } else if (pick === 1) { st.earR.v -= 15; } else blinkAt = 0;
  }
  function step(dt) {
    if (clock < 0 && !busy) return false;
    if (clock >= 0) { clock += dt; if (kind === 'react' && clock > headBack) { st.yaw.t = 0; st.pitch.t = 0; } if (clock > 2.6) clock = -1; }
    for (const k in st) spring(st[k], dt, k === 'yaw' || k === 'pitch' ? 60 : 140, k === 'yaw' || k === 'pitch' ? 9 : 7);
    head.rotation.y = st.yaw.a; head.rotation.z = st.pitch.a;
    ears[0].rotation.set(ears[0].userData.rest[0] + st.earL.a * .5, 0, ears[0].userData.rest[2] + st.earL.a); ears[1].rotation.set(ears[1].userData.rest[0], 0, ears[1].userData.rest[2] + st.earR.a);
    tailPivot.rotation.y = st.tail.a * .22; tailPivot.rotation.z = st.tail.a * .05;
    const b = blinkAt >= 0 && clock >= 0 ? lidAt(clock - blinkAt) : 0;
    for (const lid of lids) lid.rotation.z = -(REST_LID + b * (Math.PI / 2 + .1 - REST_LID));
    busy = clock >= 0 || !Object.values(st).every(settled);
    if (!busy) for (const k in st) { st[k].a = st[k].t; st[k].v = 0; }
    return busy;
  }
  step(.001); for (const lid of lids) lid.rotation.z = -REST_LID; clock = -1; busy = false;   // pose at rest
  const tris = root.children.length && (() => { let n = 0; root.traverse(o => { if (o.isMesh && o !== ring && o !== cush) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return Math.round(n); })();
  return { group: root, step, react, idle, tris, get busy() { return busy; } };
}
