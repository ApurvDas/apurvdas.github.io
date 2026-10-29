// node simplify.mjs in.glb out.glb <ratio> <error>
// meshoptimizer simplify that also weighs vertex normals + UVs. The stock `gltf-transform optimize --simplify` is
// position-only, which smears hard-edged normals (keycaps, printer panels) once ratios get aggressive.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [inp, out, ratio, error] = process.argv.slice(2);
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
await doc.transform(weld({ overwrite: false }));
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION').getArray();
    const N = prim.getAttribute('NORMAL')?.getArray();
    const UV = prim.getAttribute('TEXCOORD_0')?.getArray();
    const acc = prim.getIndices();
    const idx = new Uint32Array(acc.getArray());
    const n = P.length / 3, A = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      if (N) A.set(N.subarray(3 * i, 3 * i + 3), 5 * i);
      if (UV) A.set(UV.subarray(2 * i, 2 * i + 2), 5 * i + 3);
    }
    const target = Math.floor(Number(ratio) * idx.length / 3) * 3;
    const [dst] = MeshoptSimplifier.simplifyWithAttributes(idx, P, 3, A, 5, [1, 1, 1, 0.5, 0.5], null, target, Number(error), []);
    acc.setArray(dst);
    compactPrimitive(prim);
  }
}
await io.write(out, doc);
