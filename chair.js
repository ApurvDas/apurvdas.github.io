/* The gaming chair. SimReady has no gaming chair (its only chairs are office, hospital, surgical and wheelchair), so this keeps the SimReady office chair's
   five-star base, castors, gas lift and tilt mechanism (its GLB splits cleanly into meshes and connected parts) and swaps the seat, back and arms for a
   racing-style seat built here: bucket seat with raised bolsters, tall winged backrest with slots near the top, headrest and lumbar pillows, padded arms.
   All the colours live in GAMING, change them there. Convention is the GLB's: +z is the front of the seat, +y up, the back is at -z. */
import * as THREE from 'three';

export const GAMING = { black: '#15171b', red: '#c8202b', stitch: '#ff8a8a', plastic: 0x1a1c21 };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const key = (pts, v) => { for (let i = 1; i < pts.length; i++) if (v <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], sm(pts[i - 1][0], pts[i][0], v)); return pts[pts.length - 1][1]; };

/* faux leather: grain, optional diamond quilting, and a dashed line of stitching inset from the edge (the slab's uv runs 0..1 over its surface) */
function leather(base, { quilt = false, border = null, seam = false } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) { x.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.09)'; x.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
  if (quilt) { x.strokeStyle = 'rgba(0,0,0,.28)'; x.lineWidth = 2; x.beginPath(); for (let k = -256; k < 512; k += 42) { x.moveTo(k, 0); x.lineTo(k + 256, 256); x.moveTo(k, 256); x.lineTo(k + 256, 0); } x.stroke(); }
  if (border) { x.strokeStyle = border; x.lineWidth = 2.5; x.setLineDash([9, 7]); x.strokeRect(14, 14, 228, 228); if (seam) { x.beginPath(); x.moveTo(128, 14); x.lineTo(128, 242); x.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/* a padded slab from two parametric surfaces over (u, v) in [0,1]^2: front(u,v) and back(u,v) -> [x, y, z]; the rim joins them so the edge rounds off */
function slab(nu, nv, front, back) {
  const P = [], UV = [], I = [], at = (i, j) => j * (nu + 1) + i, off = (nu + 1) * (nv + 1);
  for (const f of [front, back]) for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { P.push(...f(i / nu, j / nv)); UV.push(i / nu, j / nv); }
  const quad = (a, b, c, d) => I.push(a, b, d, b, c, d);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)); quad(off + at(i, j), off + at(i, j + 1), off + at(i + 1, j + 1), off + at(i + 1, j)); }
  for (let i = 0; i < nu; i++) { quad(at(i, 0), off + at(i, 0), off + at(i + 1, 0), at(i + 1, 0)); quad(at(i, nv), at(i + 1, nv), off + at(i + 1, nv), off + at(i, nv)); }
  for (let j = 0; j < nv; j++) { quad(at(0, j), at(0, j + 1), off + at(0, j + 1), off + at(0, j)); quad(at(nu, j), off + at(nu, j), off + at(nu, j + 1), at(nu, j + 1)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
  // make the winding agree with the direction from the back surface to the front one
  const pa = g.attributes.position, n = g.attributes.normal, mid = at(nu >> 1, nv >> 1); if (n.getX(mid) * (pa.getX(mid) - pa.getX(off + mid)) + n.getY(mid) * (pa.getY(mid) - pa.getY(off + mid)) + n.getZ(mid) * (pa.getZ(mid) - pa.getZ(off + mid)) < 0) { const a = g.index.array; for (let k = 0; k < a.length; k += 3) { const t = a[k + 1]; a[k + 1] = a[k + 2]; a[k + 2] = t; } g.computeVertexNormals(); }
  return g;
}

export function buildGamingChair(chairM) {
  /* ---- 1. keep the base: drop the fabric seat/back, and the armrest posts (x beyond +-0.24 m, above 0.3 m) from the plastic and screw meshes ---- */
  const drop = [];
  chairM.traverse(m => {
    if (!m.isMesh) return;
    if (/fabric/i.test(m.material.name)) { drop.push(m); return; }
    if (!/plastic|screws/i.test(m.material.name)) return;
    const g = m.geometry, p = g.attributes.position, idx = g.index.array, keep = [], c = new THREE.Vector3();
    for (let k = 0; k < idx.length; k += 3) { c.set(0, 0, 0); for (let q = 0; q < 3; q++) c.x += p.getX(idx[k + q]), c.y += p.getY(idx[k + q]); c.x = c.x / 3 * m.scale.x + m.position.x; c.y = c.y / 3 * m.scale.y + m.position.y; if (!(Math.abs(c.x) > .24 && c.y > .3)) keep.push(idx[k], idx[k + 1], idx[k + 2]); }
    m.geometry = g.clone(); m.geometry.setIndex(keep);
  });
  drop.forEach(m => m.parent.remove(m));

  /* ---- 2. the seat ---- */
  const G = new THREE.Group(); G.name = 'gaming-seat'; chairM.add(G);
  const mat = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: .5, metalness: 0, side: THREE.DoubleSide, ...o });
  const black = mat(leather(GAMING.black, { border: GAMING.red })), red = mat(leather(GAMING.red, { quilt: true, border: GAMING.stitch, seam: true })), redPlain = mat(leather(GAMING.red)), plastic = new THREE.MeshStandardMaterial({ color: GAMING.plastic, roughness: .55 });
  const add = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); G.add(o); return o; };

  // bucket seat: u runs left-right, v back-front. Raised side bolsters, a dished middle, a waterfall front edge, the rim thinning out to the edge.
  const SX = .27, Z0 = -.25, Z1 = .3;
  const seatTop = (u, v, lift = 0) => { const t = 2 * u - 1, w = 1 - .85 * Math.max(sm(.86, 1, Math.abs(t)), sm(.9, 1, v), sm(.1, 0, v));
    const mid = .5, y = .535 - .032 * (1 - t * t) * Math.sin(Math.PI * clamp(v * 1.15, 0, 1)) ** .5 + .05 * Math.abs(t) ** 3 - .06 * sm(.72, 1, v) + .02 * sm(.2, 0, v);
    return [t * (SX - .05 * sm(.55, 1, v)), mid + (y - mid) * w + lift * w, lerp(Z0, Z1, v)]; };
  const seatBot = (u, v) => { const t = 2 * u - 1, w = 1 - .85 * Math.max(sm(.86, 1, Math.abs(t)), sm(.9, 1, v), sm(.1, 0, v)), mid = .5; return [t * (SX - .05 * sm(.55, 1, v)), mid + (.44 + .02 * Math.abs(t) ** 3 - mid) * w, lerp(Z0, Z1, v)]; };
  add(slab(24, 24, (u, v) => seatTop(u, v), seatBot), black);
  const inlay = (u, v) => seatTop(.22 + u * .56, .1 + v * .78, .012);
  add(slab(14, 16, inlay, (u, v) => seatTop(.22 + u * .56, .1 + v * .78, -.004)), red);

  // backrest: v runs up from the seat, t across. Leans back, widest at the shoulders, wings curve forward, rounded top.
  const BY = .5, BH = .78;
  const hw = v => key([[0, .2], [.2, .22], [.55, .31], [.78, .3], [.93, .22], [1, .14]], v) * (v > .93 ? Math.sqrt(Math.max(0, 1 - ((v - .93) / .07) ** 2)) * .92 + .08 : 1);
  const lean = v => -.24 - .15 * v;
  const wing = v => .11 * sm(.12, .45, v) * (1 - .75 * sm(.82, 1, v));
  const rim = (t, v) => 1 - .88 * Math.max(sm(.86, 1, Math.abs(t)), sm(.93, 1, v), sm(.05, 0, v));
  const backFront = (u, v, lift = 0) => { const t = 2 * u - 1, w = rim(t, v), c = lean(v) + wing(v) * Math.abs(t) ** 2.2 - .028 * (1 - t * t), cb = lean(v) - .075 + wing(v) * .5 * Math.abs(t) ** 2.2;
    return [t * hw(v), BY + BH * v, cb + (c - cb) * w + lift * w]; };
  const backBack = (u, v, lift = 0) => { const t = 2 * u - 1, w = rim(t, v), cb = lean(v) - .075 + wing(v) * .5 * Math.abs(t) ** 2.2 + .01 * (1 - t * t); return [t * hw(v), BY + BH * v, cb + .02 * (1 - w) + lift * w]; };
  add(slab(28, 36, (u, v) => backFront(u, v), (u, v) => backBack(u, v)), black);
  add(slab(14, 22, (u, v) => backFront(.25 + u * .5, .05 + v * .74, .018), (u, v) => backFront(.25 + u * .5, .05 + v * .74, -.004)), red);   // front inlay
  add(slab(12, 18, (u, v) => backBack(.3 + u * .4, .25 + v * .55, -.014), (u, v) => backBack(.3 + u * .4, .25 + v * .55, .004)), red);   // rear inlay: the room's camera mostly sees the back
  for (const s of [-1, 1]) add(slab(4, 8, (u, v) => backFront(s < 0 ? .08 + u * .1 : .82 + u * .1, .83 + v * .09, .006), (u, v) => backFront(s < 0 ? .08 + u * .1 : .82 + u * .1, .83 + v * .09, -.006)), redPlain);   // the slots near the top

  // pillows and arms
  const pillow = (sx, sy, sz, m, x, y, z, rx) => { const o = add(new THREE.SphereGeometry(1, 24, 14), m, x, y, z); o.scale.set(sx, sy, sz); o.rotation.x = rx; return o; };
  const hf = backFront(.5, .9), lf = backFront(.5, .28);
  pillow(.17, .075, .05, red, 0, hf[1], hf[2] + .045, -.15);   // headrest
  add(new THREE.BoxGeometry(.34, .035, .15), plastic, 0, hf[1], hf[2] - .03).rotation.x = -.15;   // its strap
  pillow(.15, .06, .05, red, 0, lf[1], lf[2] + .04, -.12);   // lumbar
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(.04, .17, .075), plastic, s * .34, .575, -.03);
    const pad = add(new THREE.CapsuleGeometry(.032, .2, 6, 12), black, s * .34, .685, -.02); pad.rotation.x = Math.PI / 2; pad.scale.set(1.15, 1, .62);
    const cap = add(new THREE.CapsuleGeometry(.02, .12, 4, 10), redPlain, s * .34, .708, -.02); cap.rotation.x = Math.PI / 2; cap.scale.set(1, 1, .5);
  }
  return chairM;
}
