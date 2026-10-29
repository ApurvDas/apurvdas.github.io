"""NVIDIA SimReady USD -> GLB (metres, Y-up, PBR materials).

    py tools/assets/usd2glb.py in.usd out.glb     # prints a JSON summary (tris, bbox in m, materials)
    py tools/assets/usd2glb.py --selftest

Needs: pip install usd-core trimesh pillow numpy
Opens the stage with pxr (composition resolves references/payloads/instances), bakes world transforms,
triangulates, and merges everything that shares a material into one glTF primitive.
Materials: UsdPreviewSurface when present (si assets); otherwise OmniPBR-style MDL parameters, read from
the USD shader inputs and from the small per-material .mdl next to the asset (warehouse assets).
Last resort for an unreadable material: constant grey (reported in "unresolved").
"""
import json, re, sys, tempfile
from pathlib import Path
import numpy as np
from PIL import Image
import trimesh
from trimesh.visual import TextureVisuals
from trimesh.visual.material import PBRMaterial
from pxr import Gf, Sdf, Usd, UsdGeom, UsdShade

Z_TO_Y = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], float)   # (x, y, z) -> (x, z, -y)
_img = {}


def image(path):
    if path not in _img:
        _img[path] = Image.open(path)
        _img[path].load()
    return _img[path]


def asset_path(attr_or_input, fallback_dir=None):
    """Resolved filesystem path of an asset-valued attribute/input, or None."""
    a = attr_or_input.Get()
    if not a or not a.path:
        return None
    for c in (a.resolvedPath, a.path):
        if c and Path(c).is_file():
            return str(Path(c))
    attr = attr_or_input.GetAttr() if hasattr(attr_or_input, "GetAttr") else attr_or_input
    for spec in attr.GetPropertyStack():
        p = Sdf.ComputeAssetPathRelativeToLayer(spec.layer, a.path)
        if p and Path(p).is_file():
            return str(Path(p))
    if fallback_dir:   # authoring-machine absolute path: look for the same file name under the asset folder
        hit = next(Path(fallback_dir).rglob(Path(a.path).name), None)
        return str(hit) if hit else None
    return None


# ---------- materials ----------
def uv_xform(tex_shader):
    """(sx, sy, tx, ty) from a UsdTransform2d feeding the texture's st input; identity otherwise."""
    i = tex_shader.GetInput("st")
    if i and i.HasConnectedSource():
        s = UsdShade.Shader(i.GetConnectedSource()[0].GetPrim())
        if s.GetShaderId() == "UsdTransform2d":
            g = lambda n, d: (s.GetInput(n).Get() if s.GetInput(n) and s.GetInput(n).Get() is not None else d)
            sc, tr = g("scale", (1, 1)), g("translation", (0, 0))
            return (sc[0], sc[1], tr[0], tr[1])   # ponytail: rotation ignored (none in the picked set)
    return (1, 1, 0, 0)


def from_preview(sh, root):
    def src(name):
        i = sh.GetInput(name)
        if not i:
            return None
        if i.HasConnectedSource():
            c = i.GetConnectedSource()
            t = UsdShade.Shader(c[0].GetPrim())
            if t.GetShaderId() == "UsdUVTexture":
                return ("tex", asset_path(t.GetInput("file"), root), str(c[1]), uv_xform(t))
            return None
        v = i.Get()
        return None if v is None else ("const", v)

    m = {}
    base, nrm = src("diffuseColor"), src("normal")
    rough, metal, occ = src("roughness"), src("metallic"), src("occlusion")
    if base and base[0] == "tex":
        m["base"], m["uv"] = base[1], base[3]
    elif base:
        m["color"] = tuple(base[1])
    if nrm and nrm[0] == "tex":
        m["normal"] = nrm[1]
        m.setdefault("uv", nrm[3])
    for k, s in (("rough", rough), ("metal", metal)):
        if s and s[0] == "const":
            m[k] = float(s[1])
        elif s and s[0] == "tex":
            m["orm"], m[k + "_ch"] = s[1], s[2]   # which texture channel feeds the slot; build_material repacks to glTF's G=rough B=metal
    if occ and occ[0] == "tex" and "orm" not in m:
        m["occ_tex"] = occ[1]
    for k, n in (("emissive", "emissiveColor"),):
        s = src(n)
        if s and s[0] == "tex":
            m["emissive_tex"] = s[1]
        elif s and any(s[1]):
            m["emissive"] = tuple(s[1])
    op = src("opacity")
    if op and op[0] == "const" and op[1] < 1:
        m["alpha"] = float(op[1])
    elif op and op[0] == "tex":
        m["alpha_tex"] = op[1]
    return m


def parse_mdl(path):
    """name: value pairs of the OmniPBR(...) call in a .mdl (textures, colours, floats, bools)."""
    out = {}
    if not path or not Path(path).is_file():
        return out
    for n, v in re.findall(r"(\w+):\s*(texture_2d\([^)]*\)|(?:color|float2)\([^)]*\)|[-\w.+]+)", Path(path).read_text()):
        if v.startswith("texture_2d"):
            t = re.search(r'"([^"]+)"', v)
            out[n] = str((Path(path).parent / t.group(1)).resolve()) if t else None
        elif v.startswith(("color", "float2")):
            out[n] = tuple(float(x) for x in re.search(r"\(([^)]*)\)", v).group(1).split(","))
        elif v in ("true", "false"):
            out[n] = v == "true"
        else:
            try:
                out[n] = float(v)
            except ValueError:
                pass
    return out


def from_mdl(sh, root):
    p = {}
    sa = sh.GetPrim().GetAttribute("info:mdl:sourceAsset")
    if sa and sa.Get():
        p.update(parse_mdl(asset_path(sa, root)))
    for i in sh.GetInputs():   # USD-side overrides (and the whole definition for OmniPBR instances without a local .mdl)
        v = i.Get()
        n = i.GetBaseName()
        if hasattr(v, "path"):
            p[n] = asset_path(i, root) if v.path else None
        elif v is not None:
            p[n] = tuple(v) if hasattr(v, "__len__") else v
    m = {}
    if p.get("diffuse_texture"):
        m["base"] = p["diffuse_texture"]
        if p.get("diffuse_tint") and tuple(p["diffuse_tint"]) != (1, 1, 1):
            m["color"] = tuple(p["diffuse_tint"])
    else:
        c = np.array(p.get("diffuse_color_constant", (0.8, 0.8, 0.8))) * np.array(p.get("diffuse_tint", (1, 1, 1)))
        m["color"] = tuple(c)
    if p.get("ORM_texture") and p.get("enable_ORM_texture", True):
        m["orm"], m["rough_ch"], m["metal_ch"] = p["ORM_texture"], "g", "b"
    else:
        m["rough"], m["metal"] = float(p.get("reflection_roughness_constant", 0.5)), float(p.get("metallic_constant", 0.0))
    if p.get("normalmap_texture"):
        m["normal"] = p["normalmap_texture"]
    ts = p.get("texture_scale", (1, 1))
    tt = p.get("texture_translate", (0, 0))
    m["uv"] = (ts[0], ts[1], tt[0], tt[1])
    if p.get("enable_emission"):
        if p.get("emissive_color_texture") or p.get("emissive_mask_texture"):   # the monitor's screen image is a mask texture
            m["emissive_tex"] = p.get("emissive_color_texture") or p["emissive_mask_texture"]
        else:
            m["emissive"] = tuple(min(1.0, c) for c in p.get("emissive_color", (1, 1, 1)))
    if p.get("enable_opacity_texture") and p.get("opacity_texture"):
        m["alpha_tex"], m["cutoff"] = p["opacity_texture"], float(p.get("opacity_threshold", 0))
    elif p.get("enable_opacity") and p.get("opacity_constant", 1) < 1:
        m["alpha"] = float(p["opacity_constant"])
    return m


def read_material(mat, root):
    """UsdShade.Material -> plain dict (paths + factors) describing a glTF PBR material, or {} if unreadable."""
    if not mat:
        return {}
    for ctx in ("", "mdl"):
        sh = mat.ComputeSurfaceSource(ctx)[0]
        if sh and sh.GetShaderId() == "UsdPreviewSurface":
            return {**from_preview(sh, root), "src": "preview"}
    for ctx in ("mdl", ""):
        sh = mat.ComputeSurfaceSource(ctx)[0]
        if sh and sh.GetPrim().HasAttribute("info:mdl:sourceAsset"):
            return {**from_mdl(sh, root), "src": "mdl"}
    return {}


def build_material(m, name):
    """dict -> trimesh PBRMaterial (loads and composes textures)."""
    kw = dict(name=name, doubleSided=m.get("double", False), metallicFactor=m.get("metal", 1.0), roughnessFactor=m.get("rough", 1.0))
    col = list(m.get("color", (1, 1, 1))) + [m.get("alpha", 1.0)]
    base = image(m["base"]).convert("RGBA") if m.get("base") else None
    if m.get("alpha_tex"):
        a = image(m["alpha_tex"]).convert("L")
        base = base or Image.new("RGBA", a.size, tuple(int(c * 255) for c in m.get("color", (1, 1, 1))) + (255,))
        base.putalpha(a.resize(base.size))
        kw["alphaMode"], kw["alphaCutoff"] = ("MASK", m["cutoff"]) if m.get("cutoff") else ("BLEND", None)
    elif col[3] < 1:
        kw["alphaMode"] = "BLEND"
    if base is not None and not (m.get("alpha_tex") or col[3] < 1) and base.getchannel("A").getextrema() == (255, 255):
        base = base.convert("RGB")
    kw["baseColorFactor"] = col
    if base is not None:
        kw["baseColorTexture"] = base
    if m.get("normal"):
        kw["normalTexture"] = image(m["normal"]).convert("RGB")
    if m.get("orm"):
        r, g, b = image(m["orm"]).convert("RGB").split()
        ch, white = {"r": r, "g": g, "b": b}, Image.new("L", r.size, 255)
        mr = Image.merge("RGB", (r, ch[m["rough_ch"]] if m.get("rough_ch") else white, ch[m["metal_ch"]] if m.get("metal_ch") else white))
        kw["metallicRoughnessTexture"] = mr
        if m.get("rough_ch") == "g":   # standard ORM packing: R is ambient occlusion
            kw["occlusionTexture"] = mr
    if m.get("occ_tex"):
        kw["occlusionTexture"] = image(m["occ_tex"]).convert("RGB")
    if m.get("emissive_tex"):
        kw["emissiveTexture"], kw["emissiveFactor"] = image(m["emissive_tex"]).convert("RGB"), [1, 1, 1]
    elif m.get("emissive"):
        kw["emissiveFactor"] = list(m["emissive"])
    return PBRMaterial(**kw)


# ---------- geometry ----------
def prim_data(prim, xf):
    """-> (pos[N,3] world, nrm[N,3] world or None, uv[N,2] or None, tri_face[T], tris[T,3]) as per-corner arrays."""
    m = UsdGeom.Mesh(prim)
    pts = np.array(m.GetPointsAttr().Get(), np.float64).reshape(-1, 3)
    cnt = np.array(m.GetFaceVertexCountsAttr().Get(), np.int64)
    fvi = np.array(m.GetFaceVertexIndicesAttr().Get(), np.int64)
    off = np.cumsum(cnt) - cnt
    nt = np.maximum(cnt - 2, 0)
    face = np.repeat(np.arange(len(cnt)), nt)
    k = np.arange(nt.sum()) - np.repeat(np.cumsum(nt) - nt, nt)
    corner = np.stack([off[face], off[face] + k + 1, off[face] + k + 2], 1)   # fan triangulation, as corner ids
    M = np.array(xf, np.float64)
    L = M[:3, :3]
    flip = np.linalg.det(L) < 0
    if m.GetOrientationAttr().Get() == UsdGeom.Tokens.leftHanded:
        flip = not flip
    if flip:
        corner = corner[:, [0, 2, 1]]

    def per_corner(vals, interp):
        vals = np.asarray(vals)
        if interp == UsdGeom.Tokens.faceVarying:
            return vals[corner]
        if interp in (UsdGeom.Tokens.vertex, UsdGeom.Tokens.varying):
            return vals[fvi[corner]]
        if interp == UsdGeom.Tokens.uniform:
            return vals[face][:, None].repeat(3, 1)
        return np.broadcast_to(vals[0], corner.shape + vals.shape[1:])

    P = (pts @ L + M[3, :3])[fvi[corner]]
    nrm = None
    na, ni = m.GetNormalsAttr(), m.GetNormalsInterpolation()
    if na.HasAuthoredValue():
        nv = na.Get()
    elif UsdGeom.PrimvarsAPI(prim).HasPrimvar("normals"):
        pv = UsdGeom.PrimvarsAPI(prim).GetPrimvar("normals")
        nv, ni = pv.ComputeFlattened(), pv.GetInterpolation()
    else:
        nv = None
    if nv is not None:
        nrm = per_corner(np.array(nv, np.float64).reshape(-1, 3), ni) @ np.linalg.inv(L).T
        nrm /= np.maximum(np.linalg.norm(nrm, axis=-1, keepdims=True), 1e-12)
    else:   # ponytail: flat normals when none authored (none of the picked set lack them)
        n = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
        nrm = (n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12))[:, None].repeat(3, 1)
    uv = None
    pv = UsdGeom.PrimvarsAPI(prim).GetPrimvar("st")
    if pv:
        uv = per_corner(np.array(pv.ComputeFlattened(), np.float64).reshape(-1, 2), pv.GetInterpolation())
    return P, nrm, uv, face


def convert(src, dst):
    src = Path(src)
    stage = Usd.Stage.Open(str(src))
    mpu = UsdGeom.GetStageMetersPerUnit(stage) or 1.0
    up = UsdGeom.GetStageUpAxis(stage)
    xc = UsdGeom.XformCache()
    root = src.parent
    cache, groups, unresolved = {}, {}, set()

    def mat_of(prim, fallback=None):
        mt = UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial()[0]
        return mt if mt else fallback

    for prim in Usd.PrimRange(stage.GetPseudoRoot(), Usd.TraverseInstanceProxies()):
        if not prim.IsA(UsdGeom.Mesh):
            continue
        img = UsdGeom.Imageable(prim)
        if img.ComputeVisibility() == UsdGeom.Tokens.invisible or img.ComputePurpose() in (UsdGeom.Tokens.guide, UsdGeom.Tokens.proxy) \
                or re.search(r"collision|collider", str(prim.GetPath()), re.I):
            continue
        P, N, UV, face = prim_data(prim, xc.GetLocalToWorldTransform(prim))
        base = mat_of(prim)
        mlist = [base]   # GeomSubset materialBind overrides the mesh binding per face
        fidx = np.zeros(int(face.max()) + 1 if len(face) else 0, int)
        for s in UsdGeom.Subset.GetAllGeomSubsets(UsdGeom.Mesh(prim)):
            if s.GetFamilyNameAttr().Get() == "materialBind":
                sm = mat_of(s.GetPrim(), base)
                if sm not in mlist:
                    mlist.append(sm)
                fidx[list(s.GetIndicesAttr().Get() or [])] = mlist.index(sm)
        mats = {(mt.GetPath() if mt else None): (mt, fidx[face] == j) for j, mt in enumerate(mlist)}
        for pth, (mt, sel) in mats.items():
            if pth not in cache:
                d = read_material(mt, root)
                if not d:
                    unresolved.add(str(pth)); d = {"color": (0.5, 0.5, 0.5), "src": "constant"}
                d["double"] = bool(UsdGeom.Mesh(prim).GetDoubleSidedAttr().Get())
                cache[pth] = d
            d = cache[pth]
            key = json.dumps({k: v for k, v in d.items() if k not in ("uv", "warn")}, sort_keys=True, default=str)
            p, n = P[sel], N[sel]
            uv = None
            if UV is not None:
                sx, sy, tx, ty = d.get("uv", (1, 1, 0, 0))
                uv = UV[sel] * (sx, sy) + (tx, ty)
            groups.setdefault(key, (d, []))[1].append((p, n, uv, pth))

    scene = trimesh.Scene()
    tris, mats_out = 0, []
    for key, (d, parts) in groups.items():
        p = np.concatenate([a[0] for a in parts]).reshape(-1, 3) @ Z_TO_Y.T * mpu if up == "Z" else np.concatenate([a[0] for a in parts]).reshape(-1, 3) * mpu
        n = np.concatenate([a[1] for a in parts]).reshape(-1, 3)
        n = n @ Z_TO_Y.T if up == "Z" else n
        uv = np.concatenate([a[2] for a in parts]).reshape(-1, 2) if all(a[2] is not None for a in parts) else None
        rows = np.hstack([p, n] + ([uv] if uv is not None else [])).astype(np.float32)
        _, first, inv = np.unique(rows, axis=0, return_index=True, return_inverse=True)   # weld identical corners
        r = rows[first]
        name = str(parts[0][3]).rsplit("/", 1)[-1]
        mesh = trimesh.Trimesh(r[:, :3], inv.reshape(-1, 3), vertex_normals=r[:, 3:6], process=False)
        mesh.visual = TextureVisuals(uv=r[:, 6:8] if uv is not None else None, material=build_material(d, name))
        scene.add_geometry(mesh, node_name=name, geom_name=name)
        tris += len(mesh.faces)
        mats_out.append({"name": name, "src": d["src"], "tris": len(mesh.faces), "base": bool(d.get("base")), "normal": bool(d.get("normal")), "orm": bool(d.get("orm")),
                         **({"channels": [d.get("rough_ch"), d.get("metal_ch")]} if (d.get("rough_ch"), d.get("metal_ch")) not in ((None, None), ("g", "b")) else {})})
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    Path(dst).write_bytes(scene.export(file_type="glb"))
    lo, hi = scene.bounds
    return {"tris": tris, "bbox_m": [round(float(x), 4) for x in hi - lo], "min_m": [round(float(x), 4) for x in lo],
            "materials": mats_out, "unresolved": sorted(unresolved)}


def selftest():
    """Z-up cm box 200x100x50 sitting on z=0 -> expect 2 x 0.5 x 1 m, Y-up, 12 tris, base on y=0."""
    with tempfile.TemporaryDirectory() as td:
        st = Usd.Stage.CreateNew(str(Path(td) / "box.usda"))
        UsdGeom.SetStageMetersPerUnit(st, 0.01); UsdGeom.SetStageUpAxis(st, "Z")
        m = UsdGeom.Mesh.Define(st, "/Box")
        m.CreatePointsAttr([(x, y, z) for z in (0, 50) for y in (-50, 50) for x in (-100, 100)])
        m.CreateFaceVertexCountsAttr([4] * 6)
        m.CreateFaceVertexIndicesAttr([0, 2, 3, 1, 4, 5, 7, 6, 0, 1, 5, 4, 2, 6, 7, 3, 0, 4, 6, 2, 1, 3, 7, 5])
        st.Save()
        r = convert(Path(td) / "box.usda", Path(td) / "box.glb")
        assert r["tris"] == 12, r
        assert np.allclose(r["bbox_m"], [2.0, 0.5, 1.0], atol=1e-4), r
        assert abs(r["min_m"][1]) < 1e-4, r
        back = trimesh.load(Path(td) / "box.glb")
        assert len(back.dump()[0].faces) == 12
    print("usd2glb selftest ok")


if __name__ == "__main__":
    if sys.argv[1:] == ["--selftest"]:
        selftest()
    else:
        print(json.dumps(convert(sys.argv[1], sys.argv[2]), indent=1))
