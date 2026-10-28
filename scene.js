/* Ropeway scene: Gangtok -> Tsomgo Lake -> Nathu La. Low-poly, built from primitives, shared materials,
   boxes merged per material. Lazy-loaded by main.js after first paint. */
import * as THREE from 'three';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

export function createScene({ canvas, stallBtn, onStall }) {
  const root = document.documentElement;
  let reduce = false, frozen = false, dirty = true, mode = 'hero', moonOK = true;
  // loop state: render while anything moves; ~1 s after the last change only slow ambient things (flags, steam, kids) keep
  // going, and only if they are on screen; otherwise the loop stops until something pokes it.
  // Everything is paced at a steady 60 fps: every frame on a 60 Hz screen, every other frame or so on 120/144 Hz ones.
  const FRAME = 1000 / 60;
  let raf = 0, last = 0, lastAct = 0, nextDraw = 0, settled = false, ready = false, clock = 0, distS = 68;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  /* Quality tiers. Slow frames first switch expensive features off (tier steps down), and only when none are left drop the resolution (q).
     high: shadows, grass, snowfall, more clouds, denser terrain. mid: outlines, medium clouds. low: today's cost plus toon shading, painted colours, a few clouds. */
  const TIERS = ['low', 'mid', 'high'], tierQS = new URLSearchParams(location.search).get('tier');   // ?tier=low|mid|high pins one: no auto-detect, no step-down (testing)
  const gpuName = (() => { try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return String(gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER)); } catch { return ''; } })();
  const weakGPU = /swiftshader|llvmpipe|softpipe|basic render|(?<!U)HD Graphics (?:[2-5][0-9]{2,3})(?![0-9])/i.test(gpuName) || !renderer.capabilities.isWebGL2 || renderer.capabilities.maxTextureSize < 8192;
  let tier = TIERS.includes(tierQS) ? tierQS : weakGPU ? 'low' : (innerWidth < 700 || matchMedia('(pointer: coarse)').matches) ? 'mid' : 'high';
  const pinned = TIERS.includes(tierQS), startTier = tier, atLeast = t => TIERS.indexOf(tier) >= TIERS.indexOf(t);
  // adaptive render scale: drop the internal resolution while frames run under 60
  let q = 1, ft = FRAME, prevDraw = 0, pace = FRAME, chained = false, grace = 30;   // pace: 60 fps, or 30 on GPUs that can't hold 60 even at the lowest scale; grace: frames ignored after start / a tier step (shader compiles)
  let scale = 1;   // the scale actually rendered: q while moving, full resolution once the view rests
  const Q_MIN = .7;
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;   // flat painted colours: no tone curve
  // toon ramp: shadow / three lit bands with soft edges (a 64-texel ramp read with linear filtering, so the band edges don't alias)
  const grad = (() => {
    const S = (x, a, b) => sm(a, b, x), d = new Uint8Array(64);
    for (let i = 0; i < 64; i++) { const nl = (i + .5) / 32 - 1; d[i] = 255 * (.55 * S(nl, .02, .1) + .23 * S(nl, .3, .4) + .13 * S(nl, .55, .65) + .09 * S(nl, .78, .88)); }
    const t = new THREE.DataTexture(d, 64, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
  })();
  const toon = o => new THREE.MeshToonMaterial({ gradientMap: grad, ...o });
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe8eef4, 45, 260);
  const camera = new THREE.PerspectiveCamera(36, 1, 1, 700);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xaebccb, 2.3);
  const dir = new THREE.DirectionalLight(0xffffff, 1);
  const glow = new THREE.PointLight(0xffc27a, 0, 24, 2);      // cabin
  const warm = new THREE.PointLight(0xffa24d, 0, 34, 1.6);     // nearest lodge / stall
  scene.add(hemi, dir, dir.target, warm);
  // soft shadows (high tier only). The scene is static, so the map is only redrawn when a caster moved or the light changed (needsUpdate).
  renderer.shadowMap.enabled = tier === 'high'; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  dir.castShadow = tier === 'high'; dir.target.position.set(45, 15, 0);
  Object.assign(dir.shadow.camera, { left: -150, right: 150, top: 75, bottom: -75, near: 1, far: 320 }); dir.shadow.mapSize.set(2048, 2048); dir.shadow.bias = -.0006; dir.shadow.normalBias = .5;
  let shDirty = true;

  /* ---------- layout of the route (x grows uphill) ---------- */
  const gY = x => 0.33 * x + 11.8;
  const BX = -72, MX = 26, TX = 130;                  // base, mid, top stations
  const PYL = [-48, -24, 0, 52, 78, 108];
  const LK = { x: MX - 9, z: 12, rx: 12, rz: 7.5 };  // Tsomgo Lake, beside the mid station
  const ridge = u => 1 - Math.abs(Math.sin(u));
  const SNOW = new THREE.Color('#f4f7fc'), ROCK_LO = new THREE.Color('#867f88'), ROCK_HI = new THREE.Color('#b3b0ba'), rk = new THREE.Color();
  const tintMats = []; let lakeMat = null;

  /* painted terrain: colour by altitude (Gangtok green -> meadow gold -> brown -> grey rock -> snow), patchy via smooth noise, smooth normals */
  const vnoise = (x, z) => {   // smooth value noise, 0..1
    const xi = Math.floor(x), zi = Math.floor(z), u = sm(0, 1, x - xi), v = sm(0, 1, z - zi);
    const h = (i, j) => { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0; n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
    return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
  };
  const fbm = (x, z) => .6 * vnoise(x, z) + .3 * vnoise(x * 2.1 + 7, z * 2.1 + 3) + .1 * vnoise(x * 4.3, z * 4.3 + 9);
  const MEAD_A = new THREE.Color('#7fae5a'), MEAD_B = new THREE.Color('#a8c66c'), MEAD_D = new THREE.Color('#5f9150'), DRY = new THREE.Color('#bcb274'), BROWN = new THREE.Color('#8c7656');
  const alt = (x, y, z) => y + (fbm(x * .045, z * .06) - .5) * 15;   // the altitude the colours see: world height with a patchy wobble
  const greenAt = (x, z) => 1 - sm(-2, 7, alt(x, nearH(x, z), z));
  const HAZE = new THREE.Color('#c3d0ec'), kidsPatch = (x, z) => 1 - sm(.5, 1, Math.hypot((x + 59) / 8.5, (z - 3.6) / 4.2));   // a snowy patch where the kids play
  const cc = new THREE.Color();
  function paint(c, x, y, z, ny) {
    const a = alt(x, y, z), n1 = fbm(x * .11 + 3, z * .13);
    c.copy(MEAD_A).lerp(MEAD_B, sm(.3, .75, n1)).lerp(MEAD_D, sm(.55, .92, 1 - ny) * .8);
    c.lerp(DRY, sm(-1, 9, a) * .6).lerp(BROWN, sm(6, 17, a) * (.55 + .4 * (1 - ny)));
    c.lerp(rk.copy(ROCK_LO).lerp(ROCK_HI, clamp(y / 80, 0, 1)), Math.max(sm(14, 30, a) * .85, sm(.82, .6, ny) * sm(0, 12, a)));
    c.lerp(SNOW, sm(0, 1, (a - 22) / 12 + (ny - .62) * 1.3));
    return c;
  }
  function terrain({ x0, x1, z0, z1, nx, nz, h, seed, jit = .3, hz = 0, patch }) {
    const rnd = mulberry(seed), dx = (x1 - x0) / nx, dz = (z1 - z0) / nz, P = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const edge = i === 0 || j === 0 || i === nx || j === nz;
      const x = x0 + i * dx + (edge ? 0 : (rnd() - .5) * jit * dx), z = z0 + j * dz + (edge ? 0 : (rnd() - .5) * jit * dz);
      P.push(x, h(x, z), z);
    }
    const idx = [], w = nx + 1;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      (i + j) % 2 ? idx.push(a, c, b, b, c, d) : idx.push(a, c, d, a, d, b);
    }
    const g = new THREE.BufferGeometry();   // indexed: shared vertices, so the normals are smooth
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals();
    const n = g.attributes.normal, col = new Float32Array((P.length / 3) * 3);
    for (let v = 0; v < P.length / 3; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      paint(cc, x, y, z, n.getY(v));
      if (patch) cc.lerp(SNOW, patch(x, z));
      cc.lerp(HAZE, hz);   // atmospheric perspective: every range further back is lighter and bluer
      col.set([cc.r, cc.g, cc.b], v * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = toon({ vertexColors: true });
    tintMats.push(m); const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = !!patch; return mesh;   // only the near layer takes shadows
  }
  const range = (seed, k, base, A, z0, z1) => (x, z) => {
    const tz = (z1 - z) / (z1 - z0);
    const pk = .55 * ridge(x * .034 + seed + z * .02) + .3 * ridge(x * .081 + seed * 2.3) + .15 * ridge(x * .17 + seed * 3.1 + z * .05);
    return k * gY(x) + base + A * pk * (.22 + .78 * sm(0, .85, tz));
  };
  const lakeY = gY(LK.x) - .42 * LK.z - .6;
  const nearH = (x, z) => {
    const w = clamp(Math.abs(z + 1) / 12, 0, 1);
    const b = Math.sin(x * .11 + z * .2) * .9 + Math.sin(x * .23 - z * .15) * .6 + Math.sin(x * .05 + z * .07) * 1.6;
    const h = gY(x) - .42 * z + b * w;
    const t = 1 - sm(.8, 1.45, Math.hypot((x - LK.x) / LK.rx, (z - LK.z) / LK.rz));   // flat basin for the lake
    return h + (lakeY - h) * t;
  };
  // ponytail: terrain density is fixed at the start tier (rebuilding on a step-down would cost a hitch); only high gets the finer grid
  const dens = tier === 'high' ? 1.4 : 1;
  scene.add(
    terrain({ x0: -300, x1: 330, z0: -160, z1: -110, nx: 110 * dens | 0, nz: 6, h: range(1.3, .75, 18, 64, -160, -110), seed: 11, hz: .6 }),
    terrain({ x0: -280, x1: 310, z0: -102, z1: -62, nx: 104 * dens | 0, nz: 6, h: range(4.1, .8, 12, 54, -102, -62), seed: 22, hz: .42 }),
    terrain({ x0: -250, x1: 290, z0: -58, z1: -26, nx: 96 * dens | 0, nz: 6, h: range(7.7, .85, 6, 44, -58, -26), seed: 33, hz: .22 }),
    terrain({ x0: -170, x1: 260, z0: -24, z1: 40, nx: 190 * dens | 0, nz: 22 * dens | 0, h: nearH, seed: 44, jit: .25, patch: kidsPatch })
  );
  { // Tsomgo Lake: one flat disc
    const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2), toon({ color: '#86bccb', transparent: true, opacity: .92 }));
    lake.scale.set(LK.rx * .92, 1, LK.rz * .92); lake.position.set(LK.x, lakeY + .1, LK.z); scene.add(lake); lakeMat = lake.material;
  }

  /* ---------- box merging (all wood/roof/snow parts share one mesh per material) ---------- */
  const unit = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const E = new THREE.Euler(), V = new THREE.Vector3(), Nn = new THREE.Vector3();
  function merge(items, withUV) {
    const n = unit.attributes.position.count, P = new Float32Array(items.length * n * 3), N = new Float32Array(items.length * n * 3), UV = withUV ? new Float32Array(items.length * n * 2) : null;
    let o = 0, q = 0;
    for (const [w, h, d, x, y, z, rx, ry, rz] of items) {
      E.set(rx || 0, ry || 0, rz || 0);
      for (let i = 0; i < n; i++) {
        V.fromBufferAttribute(unit.attributes.position, i).multiply(new THREE.Vector3(w, h, d)).applyEuler(E).add(new THREE.Vector3(x, y, z));
        Nn.fromBufferAttribute(unit.attributes.normal, i).applyEuler(E);
        P.set([V.x, V.y, V.z], o); N.set([Nn.x, Nn.y, Nn.z], o); o += 3;
        if (UV) { UV[q++] = (Math.abs(Nn.x) > .5 ? V.z : V.x) * .55; UV[q++] = V.y * .4; }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (UV) g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    return g;
  }
  const L = { wood: [], dark: [], roof: [], snow: [], rock: [], win: [], bamboo: [] };
  const addRaw = (k, w, h, d, x, y, z, rx, ry, rz) => L[k].push([w, h, d, x, y, z, rx, ry, rz]);
  let xf = null;                                     // while a lodge is built: uniform scale k about (cx, y0)
  const add = (k, w, h, d, x, y, z, rx, ry, rz) => xf ? addRaw(k, w * xf.k, h * xf.k, d * xf.k, xf.cx + (x - xf.cx) * xf.k, xf.y0 + (y - xf.y0) * xf.k, z * xf.k, rx, ry, rz) : addRaw(k, w, h, d, x, y, z, rx, ry, rz);

  /* ---------- materials (shared) ---------- */
  const plankTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const tones = ['#a2724b', '#98693f', '#a97a52', '#936440'];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = tones[i]; g.fillRect(i * 16, 0, 16, 64);
      g.fillStyle = 'rgba(40,20,8,.45)'; g.fillRect(i * 16, 0, 1.5, 64);
      g.fillStyle = 'rgba(40,20,8,.12)'; for (let k = 0; k < 5; k++) g.fillRect(i * 16 + 3 + (k * 7 + i * 3) % 10, (k * 23 + i * 11) % 60, 1, 8);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const mWood = toon({ map: plankTex, color: '#ffffff' });
  const mDark = toon({ color: '#5a3e2a' });
  const mRoof = toon({ color: '#8c4b3b' });
  const mSnow = toon({ color: '#f4f7fc' });
  const mRock = toon({ color: '#8a929d' });
  const mBamboo = toon({ color: '#c9a45c' });
  const mMetal = toon({ color: '#2b323d' });
  const steel = toon({ color: '#4d5767' });
  const mWin = new THREE.MeshBasicMaterial({ color: '#e6eef6' });
  const woodMats = [mWood, mDark, mRoof, mRock, mBamboo];
  /* thin dark warm-brown outlines (inverted hulls: back faces, slightly bigger) on stations, cabin, pylons and trees; mid + high tiers */
  const mLine = new THREE.MeshBasicMaterial({ color: '#3d2a1e', side: THREE.BackSide });
  const mLineTree = new THREE.MeshBasicMaterial({ color: '#3d2a1e', side: THREE.BackSide });
  mLineTree.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normal * .045;'); };   // push each instance's shell out along its normals
  const outlines = [];   // every outline mesh; shown from mid up
  tintMats.push(mSnow); mSnow.userData.base = new THREE.Color('#f4f7fc');

  /* ---------- cable (catenary spans): base wheel -> pylons -> mid -> pylons -> top wheel ---------- */
  const SUP = [
    { x: BX - 3, y: gY(BX - 3) + 7.5 },
    ...PYL.slice(0, 3).map(x => ({ x, y: gY(x) + 9 })),
    { x: MX, y: gY(MX) + 7.5 },
    ...PYL.slice(3).map(x => ({ x, y: gY(x) + 9 })),
    { x: TX + 3, y: gY(TX + 3) + 7.5 },
  ];
  const KC = 1.8, cat = t => (Math.cosh(KC) - Math.cosh(KC * (2 * t - 1))) / (Math.cosh(KC) - 1);
  const cp = [];
  for (let i = 0; i < SUP.length - 1; i++) {
    const a = SUP[i], b = SUP[i + 1], span = b.x - a.x, sag = Math.min(.0016 * span * span, 4.6);
    for (let s = i ? 1 : 0; s <= 36; s++) { const t = s / 36; cp.push(new THREE.Vector3(a.x + span * t, a.y + (b.y - a.y) * t - sag * cat(t), 0)); }
  }
  const cum = [0]; for (let i = 1; i < cp.length; i++) cum.push(cum[i - 1] + cp[i].distanceTo(cp[i - 1]));
  const CL = cum[cum.length - 1];
  const uAtX = x => { let i = 1; while (i < cp.length - 1 && cp[i].x < x) i++; return (cum[i - 1] + (cum[i] - cum[i - 1]) * (x - cp[i - 1].x) / (cp[i].x - cp[i - 1].x)) / CL; };
  const cableAt = u => { const s = clamp(u, 0, 1) * CL; let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1]); return cp[i - 1].clone().lerp(cp[i], t); };
  const cableY = x => cableAt(uAtX(x)).y;
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp, false, 'centripetal'), cp.length * 2, .07, 5), toon({ color: '#232b37' })));

  /* ---------- lattice pylons: 4 tapered legs, ring + X braces, cross-arm, sheave ---------- */
  {
    const bars = [];                          // [ax,ay,az,bx,by,bz]
    PYL.forEach(x => {
      const top = gY(x) + 9, base = nearH(x, -2) - 1.4, h = top - base - .3, N = 5, bw = 1.15, tw = .3;
      const lvl = i => { const t = i / N, w = bw + (tw - bw) * t; return [base + h * t, w]; };
      for (let i = 0; i <= N; i++) {
        const [y, w] = lvl(i), C = [[-w, -w], [w, -w], [w, w], [-w, w]];
        for (let k = 0; k < 4; k++) { const a = C[k], b = C[(k + 1) % 4]; bars.push([x + a[0], y, -2 + a[1], x + b[0], y, -2 + b[1], .07]); }
        if (i < N) {
          const [y2, w2] = lvl(i + 1), D = [[-w2, -w2], [w2, -w2], [w2, w2], [-w2, w2]];
          for (let k = 0; k < 4; k++) {
            const a = C[k], b = C[(k + 1) % 4], a2 = D[k], b2 = D[(k + 1) % 4];
            bars.push([x + a[0], y, -2 + a[1], x + a2[0], y2, -2 + a2[1], .1]);
            bars.push([x + a[0], y, -2 + a[1], x + b2[0], y2, -2 + b2[1], .045]);
            bars.push([x + b[0], y, -2 + b[1], x + a2[0], y2, -2 + a2[1], .045]);
          }
        }
      }
      bars.push([x - 1.9, top - .3, -2, x + 1.9, top - .3, -2, .12]);               // cross-arm
      bars.push([x, top - .3, -2, x, top - .3, 0, .12]);                           // arm to the cable
      bars.push([x - 1.9, top - .3, -2, x - 1.9, top - 1.05, -2, .06], [x + 1.9, top - .3, -2, x + 1.9, top - 1.05, -2, .06]);
    });
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 4, 1), steel, bars.length);
    const d = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3();
    bars.forEach((r, i) => {
      a.set(r[0], r[1], r[2]); b.set(r[3], r[4], r[5]);
      d.position.copy(a).add(b).multiplyScalar(.5); d.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
      d.scale.set(r[6], a.distanceTo(b), r[6]); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    });
    scene.add(im);
    const hl = new THREE.InstancedMesh(im.geometry, mLine, bars.length); hl.instanceMatrix = im.instanceMatrix; scene.add(hl); outlines.push(hl);   // thin hull: same instances, slightly fatter
    bars.forEach((r, i) => { a.set(r[0], r[1], r[2]); b.set(r[3], r[4], r[5]); d.position.copy(a).add(b).multiplyScalar(.5); d.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize()); d.scale.set(r[6] + .04, a.distanceTo(b) + .08, r[6] + .04); d.updateMatrix(); hl.setMatrixAt(i, d.matrix); });
    im.castShadow = true;
    PYL.forEach(x => { const top = gY(x) + 9; const w = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .3, 10).rotateX(Math.PI / 2), steel); w.position.set(x, top - .45, 0); scene.add(w); });
  }

  /* ---------- wooden lodge (station) ---------- */
  const signs = [];
  function makeSign(text, w = 1024, h = 200, size = 108) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const draw = () => {
      const g = c.getContext('2d');
      g.fillStyle = '#efe4cb'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#7b2d22'; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24);
      g.fillStyle = '#2a1d14'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 ${size}px Geist, system-ui, "Segoe UI", sans-serif`; g.fillText(text, w / 2, h / 2 + 6, w - 70);
      tex.needsUpdate = true;
    };
    draw(); signs.push(draw); return toon({ map: tex });
  }
  document.fonts?.ready.then(() => { signs.forEach(f => f()); poke(); });

  const wheels = [];
  const park = {};
  function lodge(cx0, sides, label, key, parkX, wheelDx, K = 1) {
    const wx = cx0 + wheelDx, cx = wx - wheelDx * K;                                    // the wheel stays on the cable end; the lodge shrinks around it
    const y0 = cableY(parkX) - 3.9, W = 9, D = 6, hw = W / 2, hd = D / 2, H = 4.6 + (1 - K) * 3.5, X = (x) => cx + x;
    xf = { k: K, cx, y0 };
    add('wood', W + .7, .3, D + .7, cx, y0 - .15, 0);                                     // deck
    for (const px of [-4.1, 0, 4.1]) for (const pz of [-2.7, 2.7]) {                      // stilts + stone footing (unscaled, they reach the ground)
      const X = cx + px * K, Z = pz * K, gnd = nearH(X, Z) - .9, h = y0 - .3 * K - gnd;
      addRaw('dark', .5 * K, h, .5 * K, X, gnd + h / 2, Z); addRaw('rock', 1.1 * K, .55, 1.1 * K, X, gnd + .1, Z);
    }
    for (const pz of [-2.7, 2.7]) add('dark', W, .28, .28, cx, y0 - .95, pz);
    add('dark', .28, .28, D, cx - 4.1, y0 - .95, 0); add('dark', .28, .28, D, cx + 4.1, y0 - .95, 0);
    add('wood', W, H, .26, cx, y0 + H / 2, -hd + .13);                                     // back wall
    add('win', 1.3, .95, .06, cx - 2.3, y0 + 2.7, -hd + .3); add('win', 1.3, .95, .06, cx + 2.3, y0 + 2.7, -hd + .3);
    for (const sx of [-1, 1]) {
      const isOpen = sides === 'both' || (sides === '+x' && sx > 0) || (sides === '-x' && sx < 0);
      if (!isOpen) { add('wood', .26, H, D, cx + sx * (hw - .13), y0 + H / 2, 0); add('win', .06, .9, 1.2, cx + sx * (hw - .3), y0 + 2.6, 1.0); }
      else { for (const pz of [-hd + .3, hd - .3]) add('dark', .32, H, .32, cx + sx * (hw - .16), y0 + H / 2, pz); add('dark', .36, .4, D, cx + sx * (hw - .16), y0 + H - .1, 0); }
    }
    for (let i = 0; i <= 5; i++) add('dark', .14, 1.05, .14, cx - hw + .3 + i * (W - .6) / 5, y0 + .52, hd - .12);  // railing
    add('dark', W - .2, .12, .14, cx, y0 + 1.05, hd - .12); add('dark', W - .2, .1, .12, cx, y0 + .55, hd - .12);
    // roof: ridge along x, slabs slope to +/-z, flared eave, snow cap on the upper faces
    const ridgeY = y0 + H + 2.4, th = Math.atan2(2.4, hd + .9), len = Math.hypot(hd + .9, 2.4), RX = W + 1.3;
    for (const s of [1, -1]) {
      const ang = s * th, sin = Math.sin(th), cos = Math.cos(th);
      const slab = (k, a0, a1, off, t, lenX) => { const sc = (a0 + a1) / 2; add(k, lenX, t, a1 - a0, cx, ridgeY - sc * sin + cos * (off + t / 2), s * (sc * cos) - s * sin * (off + t / 2), ang, 0, 0); };
      slab('roof', 0, len, 0, .24, RX);
      slab('snow', .15, len * .82, .24, .16, RX - .1);
      // flared eave
      const ex = s * (hd + .9), ey = ridgeY - 2.4, th2 = th * .45, l2 = 1.0;
      add('roof', RX, .2, l2, cx, ey - Math.sin(th2) * l2 / 2 + .1, ex + s * Math.cos(th2) * l2 / 2, s * th2, 0, 0);
    }
    add('dark', RX + .1, .3, .36, cx, ridgeY + .05, 0); add('snow', RX, .2, .5, cx, ridgeY + .27, 0);
    add('dark', W, .26, .26, cx, y0 + H, hd + .55);                                           // eave beam for the board
    // name board (painted wood), hung from the front eave
    const bm = makeSign(label), bw = 6.3, bh = 1.2;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), bm), bk = Math.max(K, .9); board.scale.setScalar(bk); board.position.set(cx, y0 - .95 * K, hd * K + .5 * bk); scene.add(board);
    addRaw('dark', (bw + .3) * bk, (bh + .3) * bk, .12, cx, y0 - .95 * K, hd * K + .42 * bk);
    // bullwheel: dark metal ring + spokes, turns with the cable
    const R = 1.3 * K, g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TorusGeometry(R, .13, 6, 22), mMetal));
    for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(2 * R, .09, .09), mMetal); sp.rotation.z = k * Math.PI / 3; g.add(sp); }
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .35, 8).rotateX(Math.PI / 2), mMetal));
    g.position.set(wx, cableY(wx) - R, 0); scene.add(g); wheels.push({ g, R });
    xf = null;
    park[key] = { x: parkX, y0, ridgeY: y0 + (ridgeY - y0) * K, cx, hw: hw * K, hd: hd * K };
  }
  lodge(BX, '+x', 'GANGTOK · 1,650 m', 'base', BX + .5, -3.0, .72);
  lodge(MX, 'both', 'TSOMGO LAKE · 3,753 m', 'mid', MX - .9, 3.0);
  lodge(TX, '-x', 'NATHU LA · 4,310 m', 'top', TX - .5, 3.0);

  /* ---------- the momo stall near the top station ---------- */
  const SX = TX + 11, SZ = 4.4, SG = nearH(SX, SZ) - .15;
  let stallPos = new THREE.Vector3(SX, SG + 3.2, SZ);
  const steam = [];
  {
    for (const [px, pz] of [[-1.6, -1.1], [1.6, -1.1], [-1.6, 1.1], [1.6, 1.1]]) add('dark', .2, 2.5, .2, SX + px, SG + 1.25, SZ + pz);
    add('rock', 3.8, .3, 3.0, SX, SG + .05, SZ);
    add('wood', 3.4, 2.3, .18, SX, SG + 1.3, SZ - 1.15);
    add('wood', .18, 2.3, 2.3, SX - 1.6, SG + 1.3, SZ);
    add('wood', 3.2, .95, .75, SX, SG + .78, SZ + 1.0);                                       // counter
    add('wood', 3.5, .1, .95, SX, SG + 1.27, SZ + 1.0);
    const pr = .26, rl = Math.hypot(1.7, .55);                                              // sloped tin roof
    add('roof', 4.0, .16, 3.3, SX, SG + 2.75, SZ, pr, 0, 0); add('snow', 4.0, .12, 2.2, SX, SG + 2.93, SZ - .35, pr, 0, 0);
    const sm_ = makeSign('ARMY CANTEEN · VEG MOMO', 1024, 160, 76);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.5, .55), sm_); sg.position.set(SX, SG + 2.35, SZ + 1.58); scene.add(sg);
    add('dark', 3.7, .75, .08, SX, SG + 2.35, SZ + 1.52);
    // bamboo steamer: two tiers + a few momos
    const tier = new THREE.CylinderGeometry(.5, .5, .28, 12);
    for (let i = 0; i < 2; i++) { const t = new THREE.Mesh(tier, mBamboo); t.position.set(SX - .7, SG + 1.45 + i * .3, SZ + 1.0); scene.add(t); }
    const momoG = new THREE.SphereGeometry(.13, 6, 4), mMomo = toon({ color: '#f4efe6' }), mom = new THREE.InstancedMesh(momoG, mMomo, 5), d = new THREE.Object3D();
    tintMats.push(mMomo); mMomo.userData.base = new THREE.Color('#f6efe2');
    [[0, 0], [.22, .1], [-.2, .12], [.08, -.22], [-.12, -.18]].forEach(([a, b], i) => { d.position.set(SX - .7 + a, SG + 1.66, SZ + 1.0 + b); d.scale.set(1, .7, 1); d.updateMatrix(); mom.setMatrixAt(i, d.matrix); });
    scene.add(mom);
    // steam wisps
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const st = new THREE.CanvasTexture(c);
    for (let i = 0; i < 5; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, color: '#c9d4e0', transparent: true, opacity: 0, depthWrite: false, fog: false })); sp.userData.o = i / 5; scene.add(sp); steam.push(sp); }
  }
  const steamAt = (t, still) => steam.forEach((sp, i) => {
    const k = still ? (i === 0 ? .45 : 0) : (t * .16 + sp.userData.o) % 1;
    sp.position.set(SX - .7 + Math.sin(k * 6 + i) * .18, SG + 1.8 + k * 2.1, SZ + 1.0);
    sp.scale.setScalar(.45 + k * .9); sp.material.opacity = still ? (i === 0 ? .5 : 0) : Math.sin(Math.PI * k) * .6;
  });

  /* ---------- boundary marker stone + fence along the ridge (decorative) ---------- */
  {
    const bx = 114, bz = -4.2, gy = nearH(bx, bz);
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(.32, .55, 2.3, 4).rotateY(Math.PI / 4), toon({ color: '#d3d8de' })); stone.position.set(bx, gy + 1.0, bz);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.05, .32, .35, 4).rotateY(Math.PI / 4), toon({ color: '#8b95a3' })); cap.position.set(bx, gy + 2.3, bz);
    scene.add(stone, cap); tintMats.push(stone.material); stone.material.userData.base = new THREE.Color('#d8d3c8');
    const pts = [], posts = [];
    for (let x = 120; x <= 158; x += 3.2) { const y = nearH(x, -9); posts.push([x, y]); pts.push([x, y]); }
    posts.forEach(([x, y]) => add('dark', .16, 1.5, .16, x, y + .65, -9));
    const seg = [];
    for (let i = 0; i < posts.length - 1; i++) for (const hy of [1.15, .75]) seg.push(posts[i][0], posts[i][1] + hy, -9, posts[i + 1][0], posts[i + 1][1] + hy, -9);
    const wl = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(seg, 3)), new THREE.LineBasicMaterial({ color: '#3a4352' }));
    scene.add(wl);
  }

  /* ---------- trees + greenery (instanced). counts are per tier: applyTier() sets InstancedMesh.count / visibility ---------- */
  const counted = [], highOnly = [];   // [{ im, n: {low,mid,high}, per }]  and  meshes shown on the high tier only
  const grassT = { value: 0 }, GRASS_X0 = -128, GRASS_X1 = -34;
  {
    const rnd = mulberry(5), rc = mulberry(61), spots = [], d = new THREE.Object3D(), c = new THREE.Color();
    const clear = (x, z) => [[BX, 9], [MX, 9], [TX, 9]].some(([cx, r]) => Math.abs(x - cx) < 8 && z < r + 1) ||
      (x > -68 && x < -48 && z < 9) || (Math.hypot((x - LK.x) / (LK.rx + 2), (z - LK.z) / (LK.rz + 2)) < 1) || (x > TX + 6 && x < TX + 18 && z < 9) || (x > 106 && x < 120 && z < 2);
    const clusters = [-98, -40, -8, 16, 46, 70, 98, 150, 176];
    for (let i = 0; spots.length < 64 && i < 400; i++) {
      const cl = clusters[i % clusters.length], x = cl + (rnd() - .5) * 22, z = 3 + rnd() * 12;
      if (clear(x, z)) continue;
      spots.push({ x, z, s: (.5 + rnd() * .5) * 1.35, y: nearH(x, z) - .3 });   // the first 26 are today's spots
    }
    // conifers: three stacked cones, varied greens, snow on the upper tiers above the snow line
    const GREENS = ['#3b6b4d', '#47795a', '#2f5d47', '#55845a', '#3f7350'].map(h => new THREE.Color(h));
    const cone = new THREE.ConeGeometry(1, 1, 8, 1), trunk = new THREE.CylinderGeometry(.12, .16, 1, 6);
    const mk = (geo, n, per) => { const m = toon(); tintMats.push(m); const im = new THREE.InstancedMesh(geo, m, spots.length); im.userData.max = spots.length; counted.push({ im, n, per: per || 1 }); scene.add(im); im.castShadow = true; im.receiveShadow = true; return im; };
    const hullOf = im => { const o = counted.find(e => e.im === im), h = new THREE.InstancedMesh(im.geometry, mLineTree, im.instanceMatrix.count); h.instanceMatrix = im.instanceMatrix; h.userData.max = im.userData.max; counted.push({ im: h, n: o.n, per: o.per }); scene.add(h); outlines.push(h); };
    const PN = { low: 26, mid: 40, high: 64 };
    const lv = [[1.7, 2.6, 1.0, 0, .1], [1.3, 2.3, 2.3, .25, .55], [.85, 2.0, 3.5, .55, .95]];
    spots.forEach(sp => { sp.g = GREENS[Math.floor(rc() * GREENS.length)]; sp.snow = sm(14, 27, sp.y); });
    lv.forEach(([r, h, yo, lift, snowK]) => {
      const im = mk(cone, PN);
      spots.forEach((sp, i) => { d.position.set(sp.x, sp.y + (yo + h / 2) * sp.s, sp.z); d.scale.set(r * sp.s, h * sp.s, r * sp.s); d.rotation.y = i; d.updateMatrix(); im.setMatrixAt(i, d.matrix); im.setColorAt(i, c.copy(sp.g).lerp(MEAD_B, lift * .35).lerp(SNOW, sp.snow * snowK)); });
    });
    const cones = counted.map(e => e.im);   // the three conifer tiers
    const tr = mk(trunk, PN);
    spots.forEach((sp, i) => { d.position.set(sp.x, sp.y + .5 * sp.s, sp.z); d.scale.set(sp.s, 1.4 * sp.s, sp.s); d.rotation.y = 0; d.updateMatrix(); tr.setMatrixAt(i, d.matrix); tr.setColorAt(i, c.set('#5a4636')); });

    // rounded, puffy broadleaf trees near the base: a trunk and a clump of three spheres each
    const bl = [];
    for (let i = 0; bl.length < 14 && i < 300; i++) {
      const x = -118 + rnd() * 80, z = 4 + rnd() * 13;
      if (clear(x, z) || bl.some(t => Math.hypot(t.x - x, t.z - z) < 6)) continue;
      bl.push({ x, z, s: .9 + rnd() * .6, y: nearH(x, z) - .3 });
    }
    const BN = { low: 5, mid: 8, high: 14 }, puff = new THREE.SphereGeometry(1, 10, 8);
    const bt = mk(trunk, BN), bp = mk(puff, BN, 3);
    const LEAF = ['#79b254', '#8cc063', '#6aa653', '#9bc96a'].map(h => new THREE.Color(h));
    bl.forEach((t, i) => {
      d.position.set(t.x, t.y + .9 * t.s, t.z); d.scale.set(t.s * 1.2, 2.2 * t.s, t.s * 1.2); d.updateMatrix(); bt.setMatrixAt(i, d.matrix); bt.setColorAt(i, c.set('#6a5240'));
      [[0, 2.7, 0, 1.55], [-.95, 2.3, .25, 1.15], [.9, 2.4, -.2, 1.2]].forEach(([px, py, pz, r], k) => {
        d.position.set(t.x + px * t.s, t.y + py * t.s, t.z + pz * t.s); d.scale.set(r * t.s, r * t.s * .9, r * t.s); d.updateMatrix();
        bp.setMatrixAt(i * 3 + k, d.matrix); bp.setColorAt(i * 3 + k, c.copy(LEAF[(i + k) % 4]).lerp(MEAD_B, k === 0 ? .25 : 0));
      });
    });
    bt.userData.max = bp.userData.max = bl.length;
    cones.forEach(hullOf); hullOf(bp);

    // high tier: swaying grass tufts + tiny flowers on the base meadow (wind in the vertex shader)
    const blade = [], bc = [], W = .09, H = .85;
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a);
      [[-W, 0, 0], [W, 0, 0], [(k - 1) * .06, H * (.8 + k * .1), 0]].forEach(([x, y, z], v) => { blade.push(x * ca - z * sa, y, x * sa + z * ca); const t = v === 2 ? 1 : 0; bc.push(.5 + .75 * t, .62 + .62 * t, .42 + .2 * t); });
    }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(blade, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3)); gg.computeVertexNormals();
    const gm = toon({ vertexColors: true, side: THREE.DoubleSide }); tintMats.push(gm);
    gm.onBeforeCompile = sh => {
      sh.uniforms.uT = grassT;
      sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n float sw = sin(uT * 1.8 + instanceMatrix[3].x * .45 + instanceMatrix[3].z * .3 + position.y * 2.5) + .5 * sin(uT * 3.1 + instanceMatrix[3].x * .9);\n transformed.x += sw * .09 * position.y; transformed.z += sw * .04 * position.y;');
    };
    const spotsG = [], flw = [];
    for (let i = 0; spotsG.length < 1800 && i < 12000; i++) {
      const x = GRASS_X0 + rnd() * (GRASS_X1 - GRASS_X0), z = -3 + rnd() * 24;
      if (clear(x, z) || kidsPatch(x, z) > .12 || greenAt(x, z) < .55 || Math.abs(z + 2) < 1.6 && Math.abs(x - BX) < 10) continue;
      spotsG.push([x, nearH(x, z) - .05, z, .7 + rnd() * .7]);
    }
    const gi = new THREE.InstancedMesh(gg, gm, spotsG.length); gi.frustumCulled = true;
    spotsG.forEach(([x, y, z, k], i) => { d.position.set(x, y, z); d.scale.setScalar(k); d.rotation.y = rnd() * 6.28; d.updateMatrix(); gi.setMatrixAt(i, d.matrix); gi.setColorAt(i, c.copy(MEAD_A).lerp(MEAD_B, rnd() * .6).lerp(MEAD_D, rnd() * .5)); if (i % 6 === 0) flw.push([x + (rnd() - .5) * .3, y + .3 * k, z + (rnd() - .5) * .3, i % 12 === 0]); });
    const fm = toon(), fi = new THREE.InstancedMesh(new THREE.SphereGeometry(.11, 6, 5), fm, flw.length); tintMats.push(fm);
    flw.forEach(([x, y, z, yel], i) => { d.position.set(x, y, z); d.scale.setScalar(1); d.rotation.y = 0; d.updateMatrix(); fi.setMatrixAt(i, d.matrix); fi.setColorAt(i, c.set(yel ? '#f4cf4a' : '#fffaf0')); });
    scene.add(gi, fi); highOnly.push(gi, fi);
  }

  /* ---------- flush merged parts ---------- */
  [['wood', mWood, 1], ['dark', mDark], ['roof', mRoof], ['snow', mSnow], ['rock', mRock], ['win', mWin]].forEach(([k, m, uv]) => {
    if (!L[k].length) return;
    const mesh = new THREE.Mesh(merge(L[k], !!uv), m); mesh.castShadow = mesh.receiveShadow = k !== 'win'; scene.add(mesh);
    if (k === 'wood' || k === 'roof' || k === 'rock') {   // outline hull from the chunky boxes only (a thin rail would turn into a fat brown bar)
      const big = L[k].filter(it => Math.min(it[0], it[1], it[2]) >= .24).map(it => [it[0] + .16, it[1] + .16, it[2] + .16, ...it.slice(3)]);
      const hl = new THREE.Mesh(merge(big, false), mLine); scene.add(hl); outlines.push(hl);
    }
  });
  tintMats.push(mRock); mRock.userData.base = new THREE.Color('#a39a8d');

  /* ---------- kids playing in the snow under the cable ---------- */
  const kids = [];
  {
    const skin = toon({ color: '#e9bd98' }), pom = toon({ color: '#f4f1ea' });
    const jk = { blue: '#4f78b0', red: '#bd4a41', yellow: '#d6b44c', green: '#528f62' }, jm = {};
    Object.entries(jk).forEach(([k, v]) => jm[k] = toon({ color: v }));
    const body = new THREE.CapsuleGeometry(.2, .42, 2, 6), head = new THREE.SphereGeometry(.17, 6, 5), beanie = new THREE.SphereGeometry(.19, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), pomG = new THREE.SphereGeometry(.06, 5, 4), armG = new THREE.CapsuleGeometry(.055, .26, 2, 4).translate(0, -.16, 0);
    const mSnowball = toon({ color: '#ffffff' }); tintMats.push(mSnowball); mSnowball.userData.base = new THREE.Color('#f4f7fc');
    function kid(x, z, jacket, hat, face) {
      const gr = new THREE.Group(), y = nearH(x, z) - .1; gr.position.set(x, y, z); gr.rotation.y = face; gr.scale.setScalar(1.25);
      const b = new THREE.Mesh(body, jm[jacket]); b.position.y = .45; gr.add(b);
      const h = new THREE.Mesh(head, skin); h.position.y = .93; gr.add(h);
      const bn = new THREE.Mesh(beanie, jm[hat]); bn.position.y = .96; gr.add(bn);
      const pp = new THREE.Mesh(pomG, pom); pp.position.y = 1.16; gr.add(pp);
      const mkArm = sx => { const a = new THREE.Group(); a.position.set(sx * .22, .68, 0); a.add(new THREE.Mesh(armG, jm[jacket])); gr.add(a); return a; };
      const kd = { gr, y, x, z, armL: mkArm(-1), armR: mkArm(1), body: b, head: h, bn, pp };
      scene.add(gr); kids.push(kd); return kd;
    }
    const A = kid(-63, 3.2, 'red', 'yellow', .5);          // throws a snowball
    const Bk = kid(-58.5, 3.9, 'blue', 'red', -.35);       // builds a snowman
    const C = kid(-54.2, 2.8, 'green', 'blue', -.2);       // waves at the cabin
    A.kind = 'throw'; Bk.kind = 'build'; C.kind = 'wave';
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.15, 6, 5), mSnowball); scene.add(ball); A.ball = ball;
    const puffM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
    const puff = new THREE.Mesh(new THREE.SphereGeometry(.3, 6, 5), puffM); scene.add(puff); A.puff = puff;
    A.tx = -57.2; A.tz = 5.2; A.ty = nearH(A.tx, A.tz) + .12;
    // snowman beside the builder
    const sx = -56.3, sz = 4.1, sy = nearH(sx, sz) - .1, snowman = new THREE.Group();
    [[.42, .3], [.3, .84], [.22, 1.28]].forEach(([r, yy]) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), mSnowball); s.position.y = yy; snowman.add(s); });
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.04, .2, 4), toon({ color: '#e0762a' })); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.3, .24); snowman.add(nose);
    snowman.position.set(sx, sy, sz); scene.add(snowman);
  }
  function updateKids(t, cabinX, still) {
    for (const kd of kids) {
      const bob = still ? 0 : Math.sin(t * 2 + kd.x) * .02;
      kd.gr.position.y = kd.y + bob;
      if (kd.kind === 'throw') {
        const ph = still ? .62 : (t % 4.2) / 4.2;                       // 0..1
        if (ph < .3) kd.armR.rotation.z = -2.3 * sm(0, .22, ph);
        else if (ph < .5) kd.armR.rotation.z = -2.3 + 4.4 * sm(.3, .38, ph);
        else kd.armR.rotation.z = 2.1 * (1 - sm(.5, .75, ph));
        const f = clamp((ph - .36) / .36, 0, 1);                          // flight
        kd.ball.visible = ph >= .36 && ph < .72;
        const hx = kd.gr.position.x + .35, hy = kd.y + 1.15, hz = kd.gr.position.z + .2;
        kd.ball.position.set(hx + (kd.tx - hx) * f, hy + (kd.ty - hy) * f + Math.sin(Math.PI * f) * 1.9, hz + (kd.tz - hz) * f);
        const pf = clamp((ph - .72) / .2, 0, 1);
        kd.puff.visible = ph >= .72 && ph < .92; kd.puff.position.set(kd.tx, kd.ty + .15, kd.tz);
        kd.puff.scale.setScalar(.3 + pf * 1.4); kd.puff.material.opacity = .65 * (1 - pf);
      } else if (kd.kind === 'build') {
        kd.armR.rotation.z = 2.35 + (still ? .12 : Math.sin(t * 3.2) * .22);
        kd.armL.rotation.z = -.3;
      } else {
        const near = still ? .55 : 1 - sm(7, 17, Math.abs(cabinX - kd.x));
        kd.armR.rotation.z = (1 - near) * .1 + near * (-2.75 + (still ? 0 : Math.sin(t * 8.5) * .32));
      }
    }
  }

  /* ---------- cabin ---------- */
  const mBody = toon({ color: '#2f4a6b' }), mCRoof = toon({ color: '#c3ccd8' }), mCDark = toon({ color: '#2a3340' });
  const pivot = new THREE.Group(), swing = new THREE.Group(); pivot.add(swing); scene.add(pivot);
  const cbox = (w, h, d, m, y, x = 0) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, 0); o.castShadow = true; swing.add(o);
    if (Math.min(w, h, d) > .2) { const l = new THREE.Mesh(new THREE.BoxGeometry(w + .12, h + .12, d + .12), mLine); l.position.copy(o.position); swing.add(l); outlines.push(l); }
    return o;
  };
  cbox(.5, .36, .42, mCDark, -.1); cbox(.12, 1.3, .12, mCDark, -.85);
  cbox(3.3, .2, 2.3, mCRoof, -1.6); cbox(3, 1.9, 2, mBody, -2.64);
  cbox(3.05, .7, 2.05, mWin, -2.44); cbox(.07, .7, 2.1, mBody, -2.44, -.55); cbox(.07, .7, 2.1, mBody, -2.44, .55);
  cbox(3.1, .14, 2.1, mCDark, -3.66);
  glow.position.set(0, -4.6, 2.4); swing.add(glow);

  /* ---------- prayer flags: near the top pylon, plus two strings off the top lodge ---------- */
  const tp = park.top, tpe = nearH(TX + 9.5, -2.4), tpw = nearH(TX - 12.5, -2.4);
  const strings = [
    { A: new THREE.Vector3(PYL[5] - .8, gY(PYL[5]) + 8.1, 2.2), B: new THREE.Vector3(PYL[5] - 10.5, gY(PYL[5] - 10.5) + 4.6, 2.2), n: 13, sag: 1.3 },
    { A: new THREE.Vector3(TX + tp.hw + .7, tp.ridgeY, 0), B: new THREE.Vector3(TX + 9.5, tpe + 3.3, -2.4), n: 9, sag: 1.0 },
    { A: new THREE.Vector3(TX - tp.hw - .7, tp.ridgeY, 0), B: new THREE.Vector3(TX - 12.5, tpw + 3.3, -2.4), n: 9, sag: 1.0 },
  ];
  const strAt = (s, t) => new THREE.Vector3().lerpVectors(s.A, s.B, t).setY(s.A.y + (s.B.y - s.A.y) * t - s.sag * 4 * t * (1 - t));
  {
    strings.slice(0, 1).forEach(s => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .1, s.B.y - nearH(s.B.x, 2.2) + 1, 5), steel);
      pole.position.set(s.B.x, (s.B.y + nearH(s.B.x, 2.2) - 1) / 2, 2.2); scene.add(pole);
    });
    strings.slice(1).forEach(s => {
      const g = nearH(s.B.x, s.B.z), pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .09, s.B.y - g + .8, 5), mDark);
      pole.position.set(s.B.x, (s.B.y + g - .8) / 2, s.B.z); scene.add(pole);
    });
    const lm = new THREE.LineBasicMaterial({ color: '#3a4352' });
    strings.forEach(s => scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 21 }, (_, i) => strAt(s, i / 20))), lm)));
  }
  const NF = strings.reduce((a, s) => a + s.n, 0);
  const flags = new THREE.InstancedMesh(new THREE.PlaneGeometry(.85, .6).translate(0, -.3, 0), toon({ side: THREE.DoubleSide }), NF);
  scene.add(flags);
  { let k0 = 0; strings.forEach(s => { for (let i = 0; i < s.n; i++) flags.setColorAt(k0 + i, new THREE.Color(['#4f78b0', '#eef0f2', '#bd4a41', '#528f62', '#d6b44c'][i % 5])); k0 += s.n; }); }
  const fd = new THREE.Object3D();
  function updateFlags(t, still) {
    let k0 = 0;
    strings.forEach((s, si) => {
      for (let i = 0; i < s.n; i++) {
        fd.position.copy(strAt(s, (i + .6) / (s.n + .2)));
        fd.rotation.set(still ? 0 : Math.sin(t * 2.1 + i * .6 + si) * .07, still ? .25 : Math.sin(t * 1.5 + i * .85 + si) * .32 + .1, still ? 0 : Math.sin(t * 2.6 + i * .5) * .05);
        fd.updateMatrix(); flags.setMatrixAt(k0 + i, fd.matrix);
      }
      k0 += s.n;
    });
    flags.instanceMatrix.needsUpdate = true;
  }

  /* ---------- night: stars + moon ---------- */
  const stars = (() => {
    const rnd = mulberry(9), a = [];
    for (let i = 0; i < 360; i++) a.push((rnd() - .5) * 460, (rnd() - .35) * 200, -200 - rnd() * 60);
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: '#dbe6ff', size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    p.frustumCulled = false; p.visible = false; scene.add(p); return p;
  })();
  const moonMat = new THREE.MeshBasicMaterial({ color: '#e9efff', transparent: true, opacity: 0, fog: false, depthWrite: false });
  const haloMat = new THREE.MeshBasicMaterial({ color: '#8ea6e6', transparent: true, opacity: 0, fog: false, depthWrite: false });
  const moon = new THREE.Mesh(new THREE.CircleGeometry(6.5, 40), moonMat), halo = new THREE.Mesh(new THREE.CircleGeometry(16, 40), haloMat);
  moon.visible = halo.visible = false; scene.add(halo, moon);

  /* ---------- gentle snowfall around Tsomgo Lake and Nathu La (high tier; still with reduced motion). The fall is in the vertex shader. ---------- */
  const snowT = { value: 0 };
  const snowfall = (() => {
    const rnd = mulberry(33), N = 360, H = 32, pos = [], aux = [];
    [[LK.x, lakeY - 2], [TX + 6, gY(TX) - 6]].forEach(([cx, y0]) => { for (let i = 0; i < N; i++) { pos.push(cx + (rnd() - .5) * 70, rnd() * H, -14 + rnd() * 38); aux.push(y0, rnd()); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aux', new THREE.Float32BufferAttribute(aux, 2));
    const m = new THREE.PointsMaterial({ color: '#ffffff', size: 2.4, sizeAttenuation: false, transparent: true, opacity: .85, depthWrite: false, fog: false });
    m.onBeforeCompile = sh => {
      sh.uniforms.uT = snowT;
      sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + String.fromCharCode(10) + 'if (length(gl_PointCoord - .5) > .5) discard;');   // round flakes
      sh.vertexShader = 'uniform float uT; attribute vec2 aux;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.y = aux.x + ' + H.toFixed(1) + ' - mod(position.y + uT * (1.6 + aux.y * 1.2), ' + H.toFixed(1) + ');\n transformed.x += sin(uT * .8 + aux.y * 40.) * .8;');
    };
    const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); return p;   // the shader moves the points, so the raw bounding sphere would be wrong
  })();

  /* ---------- clouds: big soft cumulus billboards, canvas-painted (warm lit tops, cool undersides, flat bottoms) ---------- */
  const cloudTex = [3, 17, 29].map(seed => {
    const rnd = mulberry(seed), c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d'), yb = 196, n = 8 + (seed % 3);
    const puffs = Array.from({ length: n }, (_, i) => { const t = (i + .5) / n, r = 34 + 62 * Math.sin(Math.PI * t) * (.7 + rnd() * .5); return { x: 50 + 412 * t + (rnd() - .5) * 20, y: yb - r * (.55 + rnd() * .25), r }; });
    const blob = (x, y, r, rgb, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(.9, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); };
    puffs.forEach(p => blob(p.x, p.y, p.r, '150,168,208', 1));                       // cool blue-grey body, shows at the undersides
    puffs.forEach(p => blob(p.x - p.r * .1, p.y - p.r * .22, p.r * .84, '255,248,236', 1));   // warm-lit tops, offset toward the light
    g.globalCompositeOperation = 'destination-out'; const fl = g.createLinearGradient(0, yb - 4, 0, yb + 26); fl.addColorStop(0, 'rgba(0,0,0,0)'); fl.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = fl; g.fillRect(0, yb - 4, 512, 256);   // soft flat bottom
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  });
  const CLOUD_N = { low: 3, mid: 8, high: 12 }, CLOUD_W = 260;   // 3 parallax depths behind the mountains
  const clouds = (() => {
    const rnd = mulberry(77), grp = new THREE.Group(), L3 = [[-190, 95, 40], [-250, 120, 52], [-330, 150, 66]], out = [];
    for (let i = 0; i < 12; i++) {
      const l = i % 3, [z, w, yy] = L3[l];   // layers alternate, so the first four already span the depths
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshBasicMaterial({ map: cloudTex[i % 3], transparent: true, depthWrite: false, fog: false }));
      m.position.z = z; const o = { m, x0: (rnd() * 2 - 1) * CLOUD_W, y: yy * (.9 + rnd() * .9) - 4, v: (.5 + rnd() * .5) * (3 - l) * .45, l }; m.scale.setScalar(.85 + rnd() * .3);
      m.userData.o = o; grp.add(m); out.push(o);
    }
    scene.add(grp); return { grp, out };
  })();
  function updateClouds(t) {   // drift: driven by the loop's own clock, so clouds only move while something else keeps the loop running
    clouds.out.forEach(o => { o.m.position.x = ((o.x0 + t * o.v + CLOUD_W) % (2 * CLOUD_W) + 2 * CLOUD_W) % (2 * CLOUD_W) - CLOUD_W; o.m.position.y = o.y; });
  }
  updateClouds(0);

  /* ---------- theme (cross-faded) ---------- */
  const C = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? new THREE.Color(v) : v]));
  const TH = {
    light: C({ skyTop: '#79aee6', skyMid: '#b8d3ee', skyBot: '#fbe1c8', fog: '#e2e1ea', cloud: '#ffffff', cloudO: .97, tint: '#ffffff', wood: '#ffffff', hemiSky: '#d9e5f6', hemiGnd: '#9aaed6', hemiI: 1.95, dirC: '#ffe2b8', dirI: 2.1, win: '#e6eef6', glow: 0, warm: 0, stars: 0, moon: 0, dx: -55, dy: 42, dz: 38 }),
    dark: C({ skyTop: '#050a1a', skyMid: '#0c1631', skyBot: '#1c2c58', fog: '#162243', cloud: '#6d82bc', cloudO: .7, tint: '#6c80b8', wood: '#9aa3c0', hemiSky: '#4b61a0', hemiGnd: '#0b1226', hemiI: 1.15, dirC: '#a9c0ff', dirI: 1.7, win: '#ffc77a', glow: 55, warm: 60, stars: 1, moon: 1, dx: 50, dy: 60, dz: 30 }),
  };
  const colorKeys = ['skyTop', 'skyMid', 'skyBot', 'fog', 'cloud', 'tint', 'wood', 'hemiSky', 'hemiGnd', 'dirC', 'win'], numKeys = ['cloudO', 'hemiI', 'dirI', 'glow', 'warm', 'stars', 'moon', 'dx', 'dy', 'dz'];
  const _c = new THREE.Color(), cur = C({ skyTop: '#000', skyMid: '#000', skyBot: '#000', fog: '#000', cloud: '#000', tint: '#000', wood: '#000', hemiSky: '#000', hemiGnd: '#000', dirC: '#000', win: '#000' });
  let mix = root.dataset.theme === 'dark' ? 1 : 0, mixTarget = mix, warmI = 0;
  function applyTheme() {
    const k = sm(0, 1, mix), A = TH.light, B = TH.dark, n = {};
    colorKeys.forEach(c => cur[c].lerpColors(A[c], B[c], k)); numKeys.forEach(c => n[c] = A[c] + (B[c] - A[c]) * k);
    root.style.setProperty('--sky-top', '#' + cur.skyTop.getHexString()); root.style.setProperty('--sky-mid', '#' + cur.skyMid.getHexString()); root.style.setProperty('--sky-bot', '#' + cur.skyBot.getHexString());
    clouds.out.forEach(o => { o.m.material.color.copy(cur.cloud); o.m.material.opacity = n.cloudO * [1, .88, .76][o.l]; });
    scene.fog.color.copy(cur.fog);
    tintMats.forEach(m => { m.color.copy(cur.tint); if (m.userData.base) m.color.multiply(m.userData.base); });
    mWood.color.copy(cur.wood); mDark.color.copy(cur.wood).multiply(new THREE.Color('#5a3e2a')); mRoof.color.copy(cur.wood).multiply(new THREE.Color('#8c4b3b')); mBamboo.color.copy(cur.wood).multiply(new THREE.Color('#c9a45c'));
    hemi.color.copy(cur.hemiSky); hemi.groundColor.copy(cur.hemiGnd); hemi.intensity = n.hemiI;
    dir.color.copy(cur.dirC); dir.intensity = n.dirI; dir.position.set(n.dx, n.dy, n.dz).normalize().multiplyScalar(130).add(dir.target.position); shDirty = true;
    lakeMat && lakeMat.color.set('#86bccb').lerp(new THREE.Color('#27406a'), k);
    mLine.color.set('#3d2a1e').lerp(_c.set('#0b0f1c'), k); mLineTree.color.copy(mLine.color);
    mWin.color.copy(cur.win); glow.intensity = n.glow; warmI = n.warm;
    glow.visible = n.glow > .01; warm.visible = n.warm > .01;   // unlit point lights still cost every pixel; leave them out by day
    stars.material.opacity = n.stars * .85; stars.visible = n.stars > .01;
    moonMat.opacity = n.moon; haloMat.opacity = n.moon * .1; moon.visible = halo.visible = n.moon > .01 && moonOK;
    dirty = true;
  }
  applyTheme();

  /* ---------- layout ---------- */
  const Lo = { dist: 68, sx: 0, up: 0, mdx: 0, mdy: 0, w: 1, h: 1 };
  function setRes() {   // drawing-buffer size only. mid/high render up to 2x (sharp on 1.5-2x laptops and phones); low keeps the old, cheap 1.25x / 1x cap
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier === 'low' ? (Lo.w < 700 ? 1 : 1.25) : 2) * scale);
    renderer.setSize(Lo.w, Lo.h, false);
  }
  function applyTier() { setRes(); snowfall.material.size = 2.4 * renderer.getPixelRatio(); snowfall.visible = tier === 'high' && !reduce; outlines.forEach(o => { o.visible = atLeast('mid'); }); shDirty = true; counted.forEach(({ im, n, per }) => { im.count = Math.min(n[tier], im.userData.max ?? 1e9) * per; }); highOnly.forEach(m => { m.visible = tier === 'high'; }); clouds.out.forEach((o, i) => { o.m.visible = i < CLOUD_N[tier]; }); dirty = true; }
  function tierDown() { tier = TIERS[TIERS.indexOf(tier) - 1]; if (tier !== 'high') dir.castShadow = false; applyTier(); }   // dropping the shadow caster recompiles the lit shaders once
  function layout() {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight), a = w / h;
    Lo.w = w; Lo.h = h;
    setRes(); camera.aspect = a; camera.updateProjectionMatrix();
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), narrow = 1.34 * (.45 + .55 * a);
    if (mode === 'hero') {
      Lo.dist = 68 * (a >= 1 ? 1 + Math.max(0, 1.6 - a) * .25 : narrow);   // closer on narrow screens (still clear of the text above)
      const hh = t * Lo.dist, hw = hh * a;
      Lo.sx = a > 1 ? hw * .3 : hw * .04; Lo.up = a > 1 ? hh * .08 : hh * .74;
    } else {   // riding: the text panels take the left, so the cabin travels in the clear right third (centred on portrait screens)
      Lo.dist = 60 * (a >= 1 ? 1 : narrow);
      const hh = t * Lo.dist, hw = hh * a;
      Lo.sx = a > 1.15 ? hw * .5 : a > 1 ? hw * .2 : 0; Lo.up = hh * (a > 1 ? .1 : .04);
    }
    const mh = t * (Lo.dist + 250);
    Lo.mdx = -mh * a * .09; Lo.mdy = mh * .47;
    moonOK = a >= 1; moon.visible = halo.visible = moonOK && moonMat.opacity > .01;   // portrait frames have no clear sky, so no moon there
    poke();
  }

  /* ---------- state + loop ---------- */
  const UP = [uAtX(park.base.x), uAtX(park.mid.x), uAtX(park.top.x)];
  const uOfStage = s => s <= 1 ? UP[0] + (UP[1] - UP[0]) * clamp(s, 0, 1) : UP[1] + (UP[2] - UP[1]) * clamp(s - 1, 0, 1);
  let stage = 0;
  const S = { u: UP[0], uv: 0, th: 0, thv: 0, vw: 0, cx: 0, cy: 0, init: false, dip: 0 };
  let lastCabinX = 0;
  const proj = new THREE.Vector3();

  function poke() { dirty = true; lastAct = performance.now(); wake(); }
  function wake() { if (ready && !raf && !document.hidden) { last = performance.now(); chained = false; raf = requestAnimationFrame(frame); } }
  // flags/steam live near the top station, the kids at the base: is any of that in the frame?
  const ambientInView = () => { const hw = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distS * camera.aspect + 8; return (S.cx + hw > -68 && S.cx - hw < -46) || (S.cx + hw > 94 && S.cx - hw < 166); };

  function frame(now) {
    raf = 0;
    const calm = settled && !dirty && mix === mixTarget && now - lastAct > 1000;
    if (calm && (reduce || !ambientInView()) && scale === 1) return;             // nothing moves: stop until poke() (after one sharp frame)
    const want = calm ? 1 : q;                                                 // at rest the view is what people look at: always full resolution
    if (want !== scale) { scale = want; setRes(); }
    const step = calm && q < 1 ? 1000 / 30 : pace;                             // a weak GPU idles the ambient motion at 30 fps to afford it
    if (now < nextDraw - 1) { raf = requestAnimationFrame(frame); return; }      // 60 fps pacing on faster screens
    nextDraw = Math.max(nextDraw, now - step / 2) + step;                      // stay on the grid; after a pause, resync
    const dt = Math.min(.05, Math.max(.001, (now - last) / 1000)); last = now;
    if (mix !== mixTarget) { mix = mix < mixTarget ? Math.min(mixTarget, mix + dt / .4) : Math.max(mixTarget, mix - dt / .4); applyTheme(); }
    const target = uOfStage(reduce ? Math.round(stage) : stage);
    if (reduce) {
      S.u = target;   // reduced motion: no travel, the cabin rests at the nearest station
      S.uv = S.th = S.thv = S.vw = 0; S.dip = 0;
      updateFlags(0, true); updateKids(0, 1e3, true); steamAt(0, true);
    } else {
      clock += dt;
      const k = 11, a = (target - S.u) * k - S.uv * 2 * Math.sqrt(k);
      S.uv += a * dt; S.u += S.uv * dt;
      const vw = S.uv * CL, aw = (vw - S.vw) / dt; S.vw = vw;
      const thT = clamp(-(vw * .004 + aw * .0012), -.25, .25), w0 = 2.4, z = .18;
      S.thv += (-w0 * w0 * (S.th - thT) - 2 * z * w0 * S.thv) * dt; S.th += S.thv * dt;
      if (now - lastAct > 1000) { const d = Math.exp(-dt * 3); S.th *= d; S.thv *= d; }   // let the sway die so the loop can rest
      S.dip += (clamp(Math.abs(aw) * .012, 0, .22) - S.dip) * Math.min(1, dt * 6);
      wheels.forEach(w => { w.g.rotation.z -= vw / w.R * dt; });
      updateFlags(clock, false); updateKids(clock, lastCabinX, false); steamAt(clock, false);
    }
    const p = cableAt(S.u); lastCabinX = p.x;
    if (!reduce) { updateClouds(clock); grassT.value = snowT.value = clock; }
    pivot.position.copy(p); pivot.position.y -= S.dip;
    swing.rotation.z = reduce ? 0 : S.th + Math.sin(clock * .8) * .012;
    const tx = p.x - Lo.sx, ty = p.y + Lo.up;
    if (!S.init || reduce) { S.cx = tx; S.cy = ty; distS = Lo.dist; S.init = true; }
    else { const f = 1 - Math.exp(-dt * 5); S.cx += (tx - S.cx) * f; S.cy += (ty - S.cy) * f; distS += (Lo.dist - distS) * f; }
    camera.position.set(S.cx, S.cy + distS * .1, distS); camera.lookAt(S.cx, S.cy, 0);
    clouds.grp.position.set(S.cx * .82, S.cy * .9, 0);
    stars.position.set(S.cx, S.cy, 0); moon.position.set(S.cx + Lo.mdx, S.cy + Lo.mdy, -250); halo.position.copy(moon.position);
    settled = reduce || (Math.abs(target - S.u) < 2e-5 && Math.abs(S.uv) < 2e-4 && Math.abs(S.th) < .003 && Math.abs(S.thv) < .004 &&
      Math.abs(tx - S.cx) < .02 && Math.abs(ty - S.cy) < .02 && Math.abs(Lo.dist - distS) < .03);

    // warm light follows the nearest lodge / the stall
    const wx = p.x > (MX + TX) / 2 ? (p.x > TX - 14 ? SX : TX) : (p.x > (BX + MX) / 2 ? MX : BX);
    const wp = wx === SX ? stallPos : new THREE.Vector3(wx, park[wx === BX ? 'base' : wx === MX ? 'mid' : 'top'].y0 + 3, 2.5);
    warm.position.lerp(wp, reduce ? 1 : Math.min(1, dt * 3)); warm.intensity = warmI;

    renderer.shadowMap.needsUpdate = dir.castShadow && (!settled || shDirty); shDirty = false;   // redraw the shadow map only when the cabin moved or the light / tier changed
    renderer.render(scene, camera); dirty = false;
    const gap = now - prevDraw; prevDraw = now;
    if (chained && (!calm || step === pace)) {   // frames of an unbroken run (the gap is real frame time, however slow); resting frames at a 30 fps idle are on purpose
      if (grace > 0) grace--;
      else {
        ft += (Math.min(gap, 250) - ft) * .1;   // one hitch can't shove it too far
        if (ft > 18.5 && tier !== 'low' && !pinned) { tierDown(); ft = FRAME; grace = 12; }   // under ~54 fps: switch expensive features off first (also while resting at the base)
        else if (calm) { /* resolution only drops while moving */ }
        else if (ft > 26 && q <= Q_MIN && pace === FRAME) { pace = 1000 / 30; ft = pace; }   // still under ~38 fps at the lowest scale: a steady 30 beats a stutter
        else if (ft > 18.5 && q > Q_MIN && pace === FRAME) { q = Math.max(Q_MIN, q - .15); ft = FRAME; scale = q; setRes(); }   // then render fewer pixels while moving
      }
      // ponytail: only steps down (once per visit); stepping back up made edge-of-60 GPUs flip sharp/soft every few seconds
    }
    if (stallBtn) {   // anchor the focusable stall label to the 3D stall
      proj.copy(stallPos).project(camera);
      const sx = (proj.x * .5 + .5) * Lo.w, sy = (-proj.y * .5 + .5) * Lo.h, vis = proj.z < 1 && sx > 8 && sx < Lo.w - 8 && sy > 8 && sy < Lo.h - 8;
      onStall && onStall(sx, sy, vis);
    }
    chained = true;
    if (!reduce || mix !== mixTarget) raf = requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else poke(); });   // nothing renders in a hidden tab
  new ResizeObserver(layout).observe(canvas);
  applyTier(); renderer.compile(scene, camera);   // build the shaders now, so the first moving frames are not measured as slow
  ready = true; layout();
  if (/[?&]fps\b/.test(location.search)) {   // ?fps: a tiny readout of the scene's tier, frame rate and render scale, for testing on real hardware
    const hud = document.createElement('div');
    hud.style.cssText = 'position:fixed;z-index:99;left:8px;top:64px;padding:4px 8px;border-radius:6px;background:#000c;color:#9f9;font:12px/1.3 monospace;pointer-events:none';
    document.body.appendChild(hud);
    setInterval(() => { hud.textContent = `${tier}${tier === startTier ? '' : ' (from ' + startTier + ')'} · ${Math.round(1000 / ft)} fps · moving ${Math.round(q * 100)}% · now ${Math.round(scale * 100)}% · ${canvas.width}px · ${pace === FRAME ? '60' : '30'} cap`; }, 500);
  }

  return {
    setTheme(t) { mixTarget = t === 'dark' ? 1 : 0; poke(); },
    setAccent(hex) { mBody.color.set(hex); poke(); },
    setReduced(b) { reduce = b; applyTier(); poke(); },
    setStatic(b) { frozen = b; if (b) stage = 0; poke(); },   // data-saver: one still frame at the base station
    setStage(s) { s = frozen ? 0 : clamp(s, 0, 2); if (Math.abs(s - stage) > 1e-4) { stage = s; poke(); } },
    setMode(m) { if (m !== mode) { mode = m; layout(); } },
    layout,
  };
}
