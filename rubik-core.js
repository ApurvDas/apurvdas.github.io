/* The Rubik's cube as pure logic: no three.js, no DOM, so a node script can run the self-check (`node tools/rubik-selftest.mjs`).
   27 cubies, each with an integer position (x, y, z in -1..1) and an integer 3x3 rotation (row-major). The view only reads this state; it never
   decides a move from the scene graph. A move = rotate the layer where pos[axis] === layer by qt quarter turns about +axis (right-handed). */

export const FACES = [['+x', 'R'], ['-x', 'L'], ['+y', 'U'], ['-y', 'D'], ['+z', 'F'], ['-z', 'B']];   // outward normals, standard names
export const COLORS = { '+x': 'red', '-x': 'orange', '+y': 'white', '-y': 'yellow', '+z': 'green', '-z': 'blue' };   // the SimReady cube's scheme

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const QUARTER = [   // one +90 degree turn about x, y, z: (x,y,z) -> (x,-z,y), (z,y,-x), (-y,x,z)
  [1, 0, 0, 0, 0, -1, 0, 1, 0],
  [0, 0, 1, 0, 1, 0, -1, 0, 0],
  [0, -1, 0, 1, 0, 0, 0, 0, 1],
];
const mul = (a, b) => { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return o; };
const vec = (m, v) => [0, 1, 2].map(i => m[i * 3] * v[0] + m[i * 3 + 1] * v[1] + m[i * 3 + 2] * v[2]);
export const rotMat = (axis, qt) => { let m = I3; for (let i = ((qt % 4) + 4) % 4; i > 0; i--) m = mul(QUARTER[axis], m); return m; };

export function create() {
  const cubies = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) cubies.push({ home: [x, y, z], pos: [x, y, z], rot: I3.slice() });
  return { cubies };
}
export const layerOf = (state, axis, layer) => state.cubies.filter(c => c.pos[axis] === layer);

export function move(state, axis, layer, qt) {
  const m = rotMat(axis, qt);
  for (const c of state.cubies) if (c.pos[axis] === layer) { c.pos = vec(m, c.pos); c.rot = mul(m, c.rot); }
}

/* what each of the six outward directions currently shows: every sticker, by the world normal it faces */
export function facelets(state) {
  const out = { '+x': [], '-x': [], '+y': [], '-y': [], '+z': [], '-z': [] };
  for (const c of state.cubies) for (let a = 0; a < 3; a++) {
    if (!c.home[a]) continue;
    const f = [0, 0, 0]; f[a] = c.home[a]; const n = vec(c.rot, f), k = n.findIndex(v => v);
    out[(n[k] > 0 ? '+' : '-') + 'xyz'[k]].push(COLORS[(c.home[a] > 0 ? '+' : '-') + 'xyz'[a]]);
  }
  return out;
}
/* solved = every face shows one colour. Not "every cubie is home": a slice turn moves the centres, and a cube turned over by slices still counts. */
export const isSolved = state => Object.values(facelets(state)).every(l => l.length === 9 && l.every(c => c === l[0]));

/* a face turn, clockwise as seen looking at that face from outside (= -90 degrees about its outward normal); prime = counter-clockwise */
export const faceMove = (axis, sign, prime = false) => ({ axis, layer: sign, qt: prime ? sign : -sign });
export const inverse = m => ({ axis: m.axis, layer: m.layer, qt: -m.qt });

export function scrambleMoves(n = 20, rnd = Math.random) {
  const out = []; let last = '';
  while (out.length < n) {
    const axis = Math.floor(rnd() * 3), layer = rnd() < .5 ? -1 : 1, key = axis + ':' + layer; if (key === last) continue; last = key;
    out.push({ axis, layer, qt: rnd() < .25 ? 2 : rnd() < .5 ? 1 : -1 });
  }
  return out;
}

export function selftest() {
  const ok = (c, msg) => { if (!c) throw new Error('rubik selftest: ' + msg); };
  const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const s = create(); ok(isSolved(s), 'a new cube is solved');
  for (let axis = 0; axis < 3; axis++) for (const layer of [-1, 0, 1]) for (const qt of [1, -1]) {   // 4 turns of any layer (faces and slices) come home
    const t = create(); for (let i = 0; i < 4; i++) move(t, axis, layer, qt); ok(isSolved(t) && t.cubies.every(c => c.pos.every((v, k) => v === c.home[k])), `4 turns of layer ${axis}:${layer}:${qt}`);
    const u = create(); move(u, axis, layer, qt); ok(layer === 0 ? true : !isSolved(u), `1 turn of face ${axis}:${layer} is not solved`);
  }
  const u = create(); move(u, 0, 1, 2); move(u, 0, 1, 1); move(u, 0, 1, 1); ok(isSolved(u), 'a half turn is two quarters');
  for (const seed of [1, 2, 3]) {   // scramble, then the inverse in reverse order: solved again
    const t = create(), moves = scrambleMoves(20, rng(seed)); moves.forEach(m => move(t, m.axis, m.layer, m.qt)); ok(!isSolved(t), 'a scramble is not solved');
    moves.slice().reverse().forEach(m => { const i = inverse(m); move(t, i.axis, i.layer, i.qt); }); ok(isSolved(t), 'scramble + inverse is solved (seed ' + seed + ')');
  }
  const sx = create(); for (const layer of [-1, 0, 1]) move(sx, 0, layer, 1);   // the whole cube turned by its three layers: solved by colour, yet no cubie is home
  ok(isSolved(sx) && sx.cubies.some(c => c.pos.some((v, k) => v !== c.home[k])), 'slices that turn the whole cube leave it solved');
  const sm = create(); move(sm, 0, 0, 1); ok(!isSolved(sm), 'one middle slice is not solved'); for (let i = 0; i < 3; i++) move(sm, 0, 0, 1); ok(isSolved(sm), '4 slice turns are solved');
  const sx2 = create(), R = faceMove(0, 1), U = faceMove(1, 1), Ri = faceMove(0, 1, true), Ui = faceMove(1, 1, true);   // R U R' U' has order 6
  for (let i = 0; i < 6; i++) [R, U, Ri, Ui].forEach(m => move(sx2, m.axis, m.layer, m.qt)); ok(isSolved(sx2), "(R U R' U') x6 is solved");
  ok(JSON.stringify(Object.values(facelets(create())).map(l => l.length)) === '[9,9,9,9,9,9]', '9 stickers per face');
  return true;
}
