"""assets.json -> assets/models/<short>.glb and refresh the stats in assets.json:
USD -> GLB (usd2glb) -> normal/UV-aware simplify (simplify.mjs) -> gltf-transform optimize (webp textures, meshopt).

    py tools/assets/build_models.py [short ...]     # all assets, or just the named ones

Raw GLBs go to level-1/simready-cache/raw/. Needs the pass-2 downloads (fetch_simready.py --download ...), node/npx,
and `npm install` once in tools/assets (for simplify.mjs).
"""
import json, struct, subprocess, sys
from pathlib import Path
import usd2glb

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
CACHE = REPO.parent / "simready-cache"
CREDIT = "{id} from NVIDIA SimReady ({dataset}), CC BY 4.0, converted and simplified"


def glb_tris(path):
    """Triangle count from the GLB's JSON chunk (index accessor counts survive meshopt compression)."""
    b = Path(path).read_bytes()
    j = json.loads(b[20:20 + struct.unpack("<I", b[12:16])[0]])
    return sum(j["accessors"][p["indices"]]["count"] // 3 for m in j["meshes"] for p in m["primitives"])


def main():
    cfg = json.loads((HERE / "assets.json").read_text())
    want = set(sys.argv[1:])
    (CACHE / "raw").mkdir(exist_ok=True)
    (REPO / "assets" / "models").mkdir(parents=True, exist_ok=True)
    for a in cfg["assets"]:
        if want and a["short"] not in want:
            continue
        raw, out = CACHE / "raw" / f'{a["short"]}.glb', REPO / "assets" / "models" / f'{a["short"]}.glb'
        r = usd2glb.convert(CACHE / "models" / a["usd"], raw)
        usd2glb._img.clear()
        s, mid = a["simplify"], CACHE / "raw" / f'{a["short"]}.simplified.glb'
        subprocess.run(f'node "{HERE / "simplify.mjs"}" "{raw}" "{mid}" {s["ratio"]} {s["error"]}', shell=True, check=True, capture_output=True)
        subprocess.run(f'npx --yes @gltf-transform/cli optimize "{mid}" "{out}" --simplify false '
                       f'--texture-compress webp --texture-size {a["texture"]} --compress meshopt', shell=True, check=True, capture_output=True)
        a.update(tris_raw=r["tris"], tris=glb_tris(out), bytes=out.stat().st_size, bbox_m=r["bbox_m"],
                 materials=[{k: m[k] for k in ("src", "base", "normal", "orm", "channels") if k in m} | {"name": m["name"]} for m in r["materials"]],
                 credit=CREDIT.format(**a))
        print(f'{a["short"]:10} tris {r["tris"]:>7} -> {a["tris"]:>6}  {a["bytes"] / 1024:7.0f} KB  bbox {r["bbox_m"]}  unresolved {r["unresolved"]}', flush=True)
    cfg["totals"] = {"tris": sum(a["tris"] * a.get("uses", 1) for a in cfg["assets"] if "tris" in a), "kb": round(sum(a.get("bytes", 0) for a in cfg["assets"]) / 1024)}
    (HERE / "assets.json").write_text(json.dumps(cfg, indent=1) + "\n")
    print("totals", cfg["totals"])


if __name__ == "__main__":
    main()
