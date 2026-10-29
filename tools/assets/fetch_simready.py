"""SimReady catalogue + thumbnail fetcher (pass 1: browse only, no models).

Lists nvidia/simready-assets and nvidia/PhysicalAI-SimReady-Warehouse-01 on Hugging Face,
keeps assets that fit a dusk-lit control-desk room, downloads only their 256px preview
images, and builds labelled contact sheets so models can be picked by eye.

    py tools/assets/fetch_simready.py            # -> level-1/simready-cache/
    py tools/assets/fetch_simready.py --download dishware_mug_c01 sm_officemonitor_a01_01 ...   # pass 2: USD + Textures only

Never logs in or accepts terms: if a dataset is gated it reports and stops.
"""
import csv, json, re, shutil, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from huggingface_hub import HfApi, hf_hub_download, snapshot_download
from huggingface_hub.errors import HfHubHTTPError
from PIL import Image, ImageDraw, ImageFont

ASSETS, WAREHOUSE = "nvidia/simready-assets", "nvidia/PhysicalAI-SimReady-Warehouse-01"
CACHE = Path(__file__).resolve().parents[3] / "simready-cache"   # level-1/simready-cache (outside the repo)
PER_CAT, CAP, PER_FAMILY = 18, 150, 2
# always shortlist these families whatever their size (smallest-first would crowd them out)
PIN = re.compile(r"lamp_table|adjustableArmBench|notebook_a0[12]|book_open|paper_stack_a0[13]|basket_plastic_a01|dishware_mug|tray_a01|clock_alarm|desk_a01|workbench_standard|monitor_c0|computer_monitor|officemonitor", re.I)                                            # smallest-first per category, then global cap

# category -> exact name tokens (camelCase / snake_case split, lowercased, plural 's' stripped). First match wins.
CATS = {
    "screen":     "monitor screen tv television display projector",
    "printer":    "printer scanner copier fax",
    "lamp":       "lamp light lantern candle tealight",
    "computer":   "computer laptop keyboard mouse tablet pc",
    "desk":       "desk table workbench",
    "chair":      "chair stool sofa armchair",
    "storage":    "shelf shelve shelving rack cabinet locker drawer storage bookcase",
    "boxes":      "box crate bin tray container case basket carton cardbox",
    "stationery": "stationery stationary clipboard paper pen pencil notebook book marker ruler folder envelope stapler scissors binder magazine journal dispenser",
    "phone":      "phone telephone mail letter radio",
    "mug":        "mug cup kettle teapot thermos bottle",
    "plant":      "plant flower vase pot cactus",
    "clock":      "clock watch",
    "toy":        "toy teddy doll ball robot lego puzzle cube",
    "audio":      "speaker headphone headset microphone",
    "frame":      "poster picture painting",
}
CATS = {c: set(w.split()) for c, w in CATS.items()}
SKIP = re.compile(r"/\.thumbs/|/source_assets/|/\.metadata/|/payloads/(MuJoCo|Newton|PhysX|Physics)/|_(physx|mujoco|newton|physics)\b|instances_|LICENSE", re.I)


def tokens(*s):
    t = re.findall(r"[A-Za-z][a-z]*|[A-Z]+(?![a-z])", " ".join(s).replace("_", " "))
    return {w.lower().rstrip("s") for w in t} | {w.lower() for w in t}


NOISE = re.compile(r"box_printer|printersbox|scanner|barcode|safetytape|scissors|wetfloor|sign_(warning|floor|hospital)|warningsign|floorsign|blockpallet|pallet_block|golfball|paintpressure|locker|linearstrip|hospital|food_|vodka|overhead|surgical|uvc|ceiling|tripod|beverage|blood|booth|palletknife|straightening|golf|tape_safety|tape_refill|bearing|marker_alcohol|pencil_watercolor|chalk|pastel|cup_paper|light_?(blue|green|gray)|yellowLight|lightDuty|lightBulb|soap|bottle_spray|jack_|laboratory|ballJoint|robot_(charger|trolley)|3d_printer|patient|wheelChair|displayPanel|(?<!lamp_)table_bedside|pack_paper|paperpack|scotchtape|bodyPart|tailLight|headLight|light_head|main_light|rigidInspection|transportRack|Transporter_Racks|drum", re.I)


def category(*s):
    if NOISE.search(" ".join(s)):
        return None
    t = tokens(*s)
    return next((c for c, kw in CATS.items() if t & kw), None)


def retry(fn):
    """Unauthenticated API limit is 500 req / 300 s: on 429 wait out 'Retry after N seconds' and retry."""
    while True:
        try:
            return fn()
        except HfHubHTTPError as e:
            if "429" not in str(e):
                raise
            time.sleep(int((re.search(r"Retry after (\d+)", str(e)) or [0, 60])[1]) + 2)


def survey(api, repo, folder, asset):
    """One recursive listing of an asset folder -> (MB of base usd+textures, thumbnail repo path)."""
    return retry(lambda: _survey(api, repo, folder, asset))


def _survey(api, repo, folder, asset):
    size, thumb = 0, None
    for f in api.list_repo_tree(repo, path_in_repo=folder, repo_type="dataset", recursive=True):
        p = f.path
        if re.search(r"/\.thumbs/256x256/[^/]+\.usda?\.png$", p) and "/Textures/" not in p and "/materials/" not in p \
                and "/source_assets/" not in p and not re.search(r"_(light|transparent|physics)\.usda?\.png$", p):
            if thumb is None or asset in p:
                thumb = p
        elif getattr(f, "size", None) and not SKIP.search("/" + p):
            size += f.size
    return round(size / 1e6, 2), thumb


def candidates(api):
    out = []  # (dataset, asset, category, repo_folder)
    names = retry(lambda: [i.path for i in api.list_repo_tree(ASSETS, repo_type="dataset", recursive=False) if "." not in i.path])
    for n in names:
        if c := category(n):
            out.append(("simready-assets", n, c, f"{n}/simready_usd"))
    csv_path = retry(lambda: hf_hub_download(WAREHOUSE, "physical_ai_simready_warehouse_01.csv", repo_type="dataset", local_dir=CACHE / "warehouse"))
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
    seen = set()
    for r in rows:
        rel = r["relative_path"]
        folder = rel.rsplit("/", 1)[0] if rel.endswith((".usd", ".usda")) else rel
        if folder in seen or folder.startswith("Props/skies"):
            continue
        if c := category(r["asset_name"], r["label"], folder.rsplit("/", 1)[-1]):
            seen.add(folder)
            out.append(("warehouse-01", re.sub(r"_physics$", "", r["asset_name"]), c, folder))
    print(f"assets listed: {len(names)}; warehouse csv rows: {len(rows)}; keyword candidates: {len(out)}")
    return out


def fetch(repo, path, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(f"https://huggingface.co/datasets/{repo}/resolve/main/{path}") as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)


def sheets(rows):
    """rows sorted by category; <=6 tiles x 5 rows per sheet, category header on each break."""
    W, H, COLS, ROWS = 256, 256 + 34, 6, 5
    font, bold = ImageFont.load_default(), ImageFont.load_default()
    pages, cur = [], []
    for cat in dict.fromkeys(r["category"] for r in rows):
        items = [r for r in rows if r["category"] == cat]
        for i in range(0, len(items), COLS):
            if len(cur) >= ROWS:
                pages.append(cur); cur = []
            cur.append((cat if i == 0 else None, items[i:i + COLS]))
    pages.append(cur)
    for n, page in enumerate(pages, 1):
        img = Image.new("RGB", (W * COLS, sum(H + (18 if h else 0) for h, _ in page)), (28, 30, 36))
        d, y = ImageDraw.Draw(img), 0
        for head, items in page:
            if head:
                d.rectangle([0, y, img.width, y + 17], fill=(60, 64, 80)); d.text((6, y + 3), head.upper(), fill="white", font=bold); y += 18
            for x, r in enumerate(items):
                t = Image.open(r["thumb"]).convert("RGBA"); bg = Image.new("RGBA", t.size, (90, 94, 104, 255))
                img.paste(Image.alpha_composite(bg, t).convert("RGB").resize((W, W)), (x * W, y))
                d.text((x * W + 4, y + W + 2), r["asset"][:44], fill="white", font=font)
                d.text((x * W + 4, y + W + 16), f'{r["MB"]} MB  [{r["dataset"][:9]}]', fill=(160, 200, 255), font=font)
            y += H
        img.save(CACHE / f"contact-sheet-{n:02d}.png")
    print(f"{len(pages)} contact sheets in {CACHE}")


# pass 2: skip thumbs, source files, physics-engine variants/runnables, OmniPBR mdl (the warehouse's small per-material .mdl are kept:
# usd2glb reads their texture list when a material has no UsdPreviewSurface)
IGNORE = ["*/.thumbs/*", "*/source_assets/*", "*/.metadata/*", "*OmniPBR*", "*_physx*", "*_mujoco*", "*_newton*",
          "*/runnables/*", "*/payloads/Physics/*", "*/.simready/*", "*LICENSE*"]


def download(names):
    """snapshot_download only each named asset's folder (base USD, payloads, Textures) into CACHE/models/<dataset>/."""
    rows = {r["asset"]: r for r in csv.DictReader(open(CACHE / "candidates.csv", encoding="utf-8"))}
    for n in names:
        r = rows[n]
        repo = ASSETS if r["dataset"] == "simready-assets" else WAREHOUSE
        dest = CACHE / "models" / r["dataset"]
        retry(lambda: snapshot_download(repo, repo_type="dataset", local_dir=dest,
                                        allow_patterns=[f'{r["repo_path"]}/**'], ignore_patterns=IGNORE))
        print("downloaded", n, "->", dest / r["repo_path"])


def main():
    if "--download" in sys.argv:
        return download(sys.argv[sys.argv.index("--download") + 1:])
    api = HfApi()
    for repo in (ASSETS, WAREHOUSE):  # gated/auth-only -> report and stop (we never log in or accept terms)
        try:
            retry(lambda: next(iter(api.list_repo_tree(repo, repo_type="dataset", recursive=False))))
        except Exception as e:
            sys.exit(f"{repo}: not accessible without auth/terms ({type(e).__name__}: {str(e)[:120]}). Stopping.")
    CACHE.mkdir(exist_ok=True)
    cands = candidates(api)
    cache_f = CACHE / "survey.json"   # resumable: folder -> [MB, thumb]
    cache = json.loads(cache_f.read_text()) if cache_f.exists() else {}
    cache = {k: v for k, v in cache.items() if v[1]}   # re-survey earlier misses
    def sv(c):
        k = f"{c[0]}/{c[3]}"
        if k not in cache:
            cache[k] = survey(api, ASSETS if c[0] == "simready-assets" else WAREHOUSE, c[3], c[1])
            if len(cache) % 25 == 0:
                cache_f.write_text(json.dumps(cache))
        return cache[k]
    with ThreadPoolExecutor(4) as ex:
        res = list(ex.map(sv, cands))
    cache_f.write_text(json.dumps(cache))
    rows = [dict(dataset=c[0], asset=c[1], category=c[2], MB=mb, repo_path=c[3], thumb_repo=t) for c, (mb, t) in zip(cands, res) if t]
    # smallest-first per category (cheapest to ship), then global cap
    keep = []
    for cat in CATS:
        fam = {}
        for r in sorted((r for r in rows if r["category"] == cat), key=lambda r: (r["MB"] < 0.1, r["MB"])):  # MB~0 = geometry in shared folders, size unknown -> last
            f = re.sub(r"_[a-z]\d\d(_\d\d)?$", "", r["asset"].lower())
            if fam.get(f, 0) < PER_FAMILY and sum(k["category"] == cat for k in keep) < PER_CAT:
                fam[f] = fam.get(f, 0) + 1; keep.append(r)
    keep += [r for r in rows if PIN.search(r["asset"]) and r not in keep]
    keep = keep[:CAP]
    def dl(r):
        repo = ASSETS if r["dataset"] == "simready-assets" else WAREHOUSE
        dest = CACHE / "thumbs" / r["dataset"] / f'{r["asset"]}.png'
        if not dest.exists():
            fetch(repo, r.pop("thumb_repo"), dest)
        r["thumb"] = str(dest)
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(dl, keep))
    with open(CACHE / "candidates.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, ["dataset", "asset", "category", "MB", "thumb", "repo_path"], extrasaction="ignore")
        w.writeheader(); w.writerows(keep)
    print(f"surveyed {len(rows)} with thumbs; kept {len(keep)}")
    sheets(keep)


if __name__ == "__main__":
    main()
