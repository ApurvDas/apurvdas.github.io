import json, math, os, struct, sys
from html import escape as h
sys.path.insert(0, os.path.dirname(__file__))
from content import *

OUT = r"C:\Users\Noisemaker\Desktop\level-1\apurvdas.github.io"
SHOTS = os.path.join(OUT, "assets", "shots")
caps = {s["file"]: s["caption"] for s in json.load(open(os.path.join(SHOTS, "shots.json"), encoding="utf8"))}


def webp_size(f):
    d = open(os.path.join(SHOTS, f), "rb").read(40)
    if d[12:16] == b"VP8 ":
        w, hh = struct.unpack("<HH", d[26:30]); return w & 0x3fff, hh & 0x3fff
    if d[12:16] == b"VP8L":
        b = struct.unpack("<I", d[21:25])[0]; return (b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1
    return (d[24] | d[25] << 8 | d[26] << 16) + 1, (d[27] | d[28] << 8 | d[29] << 16) + 1


def name_of(k):
    if k.startswith("rel:"):
        r = next(r for r in RELEASES if r["id"] == k[4:]); return f"Release {r['tag']}"
    return NAMES[k]


def href_of(k):
    return "#rel-" + k[4:] if k.startswith("rel:") else "#" + k


def related(e, tag='h4'):
    items = []
    for a, b, why, q in LINKS:
        o = b if a == e else a if b == e else None
        if o: items.append((o, why))
    if not items: return ""
    from collections import Counter
    cnt = Counter(w for _, w in items); li = ""; done = set()
    for o, w in items:
        if cnt[w] >= 3:
            if w in done: continue
            done.add(w)
            chips = "".join(f'<a href="{href_of(x)}" data-hl="{h(x)}">{h(name_of(x))}</a>' for x, ww in items if ww == w)
            li += f'<li class="multi"><b>{cnt[w]} projects</b><span>{h(w)}</span><span class="chips">{chips}</span></li>'
        else:
            li += f'<li><a href="{href_of(o)}" data-hl="{h(o)}">{h(name_of(o))}</a><span>{h(w)}</span></li>'
    return f'<div class="related" data-hl="{e}"><{tag}>Related</{tag}><ul>{li}</ul></div>'


def stat(s):
    n, unit, lab, dec = s[0], s[1], s[2], s[3]
    pre = f'<span class="pre">{h(s[4])}</span>' if len(s) > 4 else ""
    return f'<div class="stat"><dt>{h(lab)}</dt><dd>{pre}<span class="count" data-to="{n}" data-dec="{dec}">{n}</span><small>{h(unit)}</small></dd></div>'


def shots_html(name, files):
    out = []
    for f in files:
        fn = f + ".webp"; w, hh = webp_size(fn); r = w / hh; fit = "cover" if 1.35 <= r <= 1.95 else "contain"
        out.append(f'<figure data-fit="{fit}"><img src="assets/shots/{fn}" width="{w}" height="{hh}" alt="{h(caps[fn])}" loading="lazy" decoding="async"><figcaption aria-hidden="true">{h(caps[fn])}</figcaption></figure>')
    return f'<div class="shots" tabindex="0" role="region" aria-label="Screenshots: {h(name)}">{"".join(out)}</div>'


def lst(items, cls=""):
    return f'<ul{" class=%s" % cls if cls else ""}>' + "".join(f"<li>{h(i)}</li>" for i in items) + "</ul>"


def station(sid):
    s = STATIONS[sid]; c = s["case"]
    links = "".join(f'<a class="btn" href="{h(u)}" rel="noopener">{h(t)}<span aria-hidden="true"> ↗</span></a>' for t, u in s["links"])
    if not s["links"]: links = '<span class="pill">Course project · source not published</span>'
    cs = (f'<details class="case" data-hl="{sid}"><summary><span>Case study</span></summary><div class="case-body">'
          f'<h4>Problem</h4><p>{h(c["problem"])}</p><h4>Limits</h4><p>{h(c["limits"])}</p>'
          f'<h4>What I built</h4>{lst(c["built"])}<h4>Numbers</h4>{lst(c["numbers"])}<h4>Testing</h4>{lst(c["testing"])}</div></details>')
    return (f'<article class="station glass" id="{sid}" data-id="{sid}" data-key="{sid}" data-node="project">'
            f'<header class="st-head" data-hl="{sid}"><p class="eyebrow node-anchor"><span class="alt-tag" data-alt></span><span class="kind">{h(s["kind"])}</span></p>'
            f'<h3>{h(s["name"])}</h3><p class="lead">{h(s["lead"])}</p>'
            f'<ul class="tags">{"".join(f"<li>{h(t)}</li>" for t in s["tags"])}</ul></header>'
            f'<dl class="stats" data-hl="{sid}">{"".join(stat(x) for x in s["stats"])}</dl>'
            f'<p class="links" data-hl="{sid}">{links}</p>'
            f'{shots_html(s["name"], s["shots"])}{cs}{related(sid)}</article>')


def job(jid):
    j = JOBS[jid]
    st = f'<dl class="stats" data-hl="{jid}">{"".join(stat(x) for x in j["stats"])}</dl>' if j["stats"] else ""
    lis = "".join(f"<li>{h(b)}</li>" for b in j["bullets"])
    more = f'<button type="button" class="more" hidden data-n="{len(j["bullets"])}" aria-expanded="false">Show all {len(j["bullets"])}</button>' if len(j["bullets"]) > 1 else ""
    return (f'<article class="station job glass" id="{jid}" data-id="{jid}" data-key="{jid}" data-node="job">'
            f'<header class="st-head" data-hl="{jid}"><p class="eyebrow node-anchor"><span class="alt-tag" data-alt></span><span class="kind">{h(j["kind"])}</span></p>'
            f'<h3>{h(j["name"])}</h3><p class="lead">{h(j["lead"])}</p></header>{st}<ul class="bul">{lis}</ul>{more}{related(jid)}</article>')


# ---------- contours (static, so the hero has its map without JS) ----------
def smooth_path(pts, closed=False):
    n = len(pts)
    def P(i): return pts[i % n] if closed else pts[max(0, min(n - 1, i))]
    d = f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"
    for k in range(n if closed else n - 1):
        p0, p1, p2, p3 = P(k - 1), P(k), P(k + 1), P(k + 2)
        d += f"C{p1[0]+(p2[0]-p0[0])/6:.1f},{p1[1]+(p2[1]-p0[1])/6:.1f} {p2[0]-(p3[0]-p1[0])/6:.1f},{p2[1]-(p3[1]-p1[1])/6:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d + ("Z" if closed else "")


def hero_contours():
    wy = lambda i, x: 330 + i * 58 + 30 * math.sin(x * .0042 + i * .8) + 14 * math.sin(x * .012 + i * 1.9)
    out = []
    for i in range(9):
        pts = [(x, wy(i, x)) for x in range(-100, 1541, 100)]
        out.append(f'<path d="{smooth_path(pts)}"/>')
    for i in range(9):
        lx = 800 + (i % 4) * 130
        out.append(f'<text x="{lx}" y="{wy(i, lx) - 7:.0f}">{4300 - i * 300:,} m</text>')
    out.append('<text class="mk" x="150" y="838">■ GANGTOK · 1,650 m</text>')
    return "".join(out)


def rings(cx, cy, radii, sy=.8, seed=0, n=14):
    out = []
    for k, R in enumerate(radii):
        pts = []
        for j in range(n):
            a = 2 * math.pi * j / n
            r = R * (1 + .12 * math.sin(3 * a + k + seed) + .06 * math.sin(5 * a + 2 * k + seed))
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a) * sy))
        out.append(f'<path d="{smooth_path(pts, True)}"/>')
    return "".join(out)


MOMO_NOTE = "Veg momos from the army canteen at Nathu La. Easily the best I've had."


def momo_btn(cls, label, pid):
    return (f'<span class="momo {cls}"><button type="button" class="momo-btn" aria-describedby="{pid}">{label}</button>'
            f'<span class="momo-note" id="{pid}" role="tooltip">{h(MOMO_NOTE)}</span></span>')


def survey_sheet():
    boundary = "M268,-6 C280,40 256,84 272,98 S288,170 270,210 S262,270 276,306"
    route = [(24, 274), (84, 208), (140, 132)]
    ticks = ""
    for (x0, y0), (x1, y1) in zip(route, route[1:]):
        L = math.hypot(x1 - x0, y1 - y0); nx, ny = -(y1 - y0) / L, (x1 - x0) / L
        for t in range(1, int(L // 14)):
            px, py = x0 + (x1 - x0) * t * 14 / L, y0 + (y1 - y0) * t * 14 / L
            ticks += f"M{px-nx*2.5:.1f},{py-ny*2.5:.1f}L{px+nx*2.5:.1f},{py+ny*2.5:.1f}"
    line = "M" + "L".join(f"{x},{y}" for x, y in route)
    sq = "".join(f'<rect x="{x-4}" y="{y-4}" width="8" height="8"/>' for x, y in route)
    return (f'<figure class="sheet"><div class="sheet-box"><svg viewBox="0 0 400 300" role="img" aria-labelledby="sheet-t sheet-d">'
            f'<title id="sheet-t">Stylised route sheet</title><desc id="sheet-d">A decorative survey-style sheet, not to scale: the ropeway from Gangtok at 1,650 metres via Tsomgo Lake at 3,753 metres to Nathu La at 4,310 metres, with a conventional boundary symbol crossing the pass.</desc>'
            f'<g class="contour">{rings(215, 120, [26, 48, 72, 98, 126, 156, 190, 226])}</g>'
            f'<ellipse class="lake" cx="150" cy="232" rx="24" ry="9"/>'
            f'<path class="boundary" d="{boundary}"/>'
            f'<path class="route" d="{line}"/><path class="route" d="{ticks}"/><g class="stn">{sq}</g>'
            f'<g class="labels"><text x="34" y="268">GANGTOK · 1,650 m</text><text x="94" y="204">TSOMGO LAKE · 3,753 m</text>'
            f'<text x="132" y="118" text-anchor="end">NATHU LA · 4,310 m</text>'
            f'<text x="252" y="32" text-anchor="end" class="wide">INDIA · SIKKIM</text><text x="288" y="32" class="wide">TIBET (CHINA)</text>'
            f'<text x="262" y="90" text-anchor="end">NATHU LA PASS · 4,310 m</text></g>'
            f'<path class="bm" d="M272,91 L277,99 L267,99 Z"/>'
            f'<text class="note-s" x="14" y="292">STYLISED ROUTE SHEET · NOT TO SCALE</text>'
            f'<rect class="neat" x="5" y="5" width="390" height="290"/></svg>'
            f'{momo_btn("momo-map", "▲ VEG MOMO · ARMY CANTEEN", "momo-note-map")}</div></figure>')


def lake_patch():
    return ('<svg class="lake-patch" viewBox="0 0 240 110" aria-hidden="true" focusable="false"><g class="contour">'
            + rings(120, 56, [40, 62, 88, 118], .55, 3) +
            '</g><ellipse class="lake" cx="108" cy="58" rx="26" ry="9"/><rect class="sq" x="150" y="49" width="8" height="8"/>'
            '<g class="labels"><text x="14" y="100">▲ TSOMGO (CHANGU) LAKE · 3,753 m</text><text x="164" y="44">■ MID STATION</text></g></svg>')


def flags_svg():
    cols = ["#4f78b0", "#eef0f2", "#bd4a41", "#528f62", "#d6b44c"]
    fl = "".join(f'<rect class="fl" style="--i:{i}" x="{14+i*15}" y="{4+ (3.2*math.sin(i*.7+1))+ (i*(4-i))*.2:.1f}" width="11" height="8" rx="1" fill="{c}"/>' for i, c in enumerate(cols))
    return f'<svg class="flags" viewBox="0 0 100 26" aria-hidden="true" focusable="false"><path d="M2,6 Q50,24 98,6" fill="none" stroke="currentColor" stroke-width="1" opacity=".55"/>{fl}</svg>'


def bars_panel(pid, order):
    P = PANELS[pid]; W, RH, top = 320, 42, 4
    H = top + RH * len(P["bars"]) + 2
    rows = ""
    for i, (key, label, val, txt, note) in enumerate(P["bars"]):
        y = top + i * RH; w = 300 * val / P["max"]
        ref = " ref" if key is None else ""
        attrs = f' data-key="{key}" data-hl="{key}"' if key else ""
        bar = f'<rect class="pbar" x="8" y="{y+20}" width="{max(w, 0):.1f}" height="8" rx="4"/>' if val > 0 else ""
        rows += (f'<g class="row{ref}"{attrs}><text class="lab" x="8" y="{y+12}">{h(label)}</text><text class="val" x="312" y="{y+12}" text-anchor="end">{h(txt)}</text>'
                 f'<line class="wire" x1="8" y1="{y+24}" x2="312" y2="{y+24}"/>{bar}<circle class="dot" cx="8" cy="{y+24}" r="4"/></g>')
    tbl = "".join(f"<tr><th scope=row>{h(l)}</th><td>{h(t)}</td></tr>" for _, l, _, t, _ in P["bars"])
    foot = f'<p class="foot">{h(P["foot"])}</p>' if P["foot"] else ""
    ttl = P.get("total")
    return (f'<figure class="panel" data-id="{pid}"><figcaption>{h(P["title"])} <small>({h(P["unit"])})</small></figcaption>'
            f'<svg viewBox="0 0 {W} {H}" role="img" aria-labelledby="{pid}-t {pid}-d"><title id="{pid}-t">{h(P["title"])}</title>'
            f'<desc id="{pid}-d">Horizontal bars, unit {h(P["unit"])}. {" ".join(h(l)+": "+h(t)+"." for _,l,_,t,_ in P["bars"])}</desc>{rows}</svg>'
            f'<table class="sr"><caption>{h(P["title"])}</caption><tbody>{tbl}</tbody></table>{foot}</figure>')


def timeline():
    d0 = 5; PX = 24; top = 14
    ys = [top + (int(r["date"][-2:]) - d0) * PX for r in RELEASES]
    H = ys[-1] + 34
    rows = ""
    for r, y in zip(RELEASES, ys):
        rows += (f'<g class="row" data-key="rel:{r["id"]}" data-hl="rel:{r["id"]}"><circle class="dot" cx="16" cy="{y}" r="5"/>'
                 f'<text class="tag-t" x="34" y="{y-1}">{h(r["tag"])}</text><text class="sub" x="34" y="{y+12}">{h(NAMES[r["project"]])} · {h(r["label"])}</text></g>')
    tbl = "".join(f"<tr><th scope=row>{h(r['tag'])}</th><td>{h(NAMES[r['project']])}</td><td>{h(r['date'])}</td></tr>" for r in RELEASES)
    return (f'<figure class="panel tl"><figcaption>Releases, October 2026 <small>(spaced by date)</small></figcaption><svg viewBox="0 0 300 {H}" role="img" aria-labelledby="tl-t tl-d">'
            f'<title id="tl-t">Release timeline</title><desc id="tl-d">Five releases between 5 and 18 October 2026: {" ".join(h(r["tag"])+" ("+h(NAMES[r["project"]])+", "+h(r["label"])+")." for r in RELEASES)}</desc>'
            f'<line class="wire" x1="16" y1="{top-8}" x2="16" y2="{H-14}"/>{rows}</svg><table class="sr"><caption>Releases</caption><thead><tr><th>Release</th><th>Project</th><th>Date</th></tr></thead><tbody>{tbl}</tbody></table></figure>')


def release_log():
    li = "".join(f'<li id="rel-{r["id"]}" data-key="rel:{r["id"]}" data-hl="rel:{r["id"]}" data-project="{r["project"]}"><time datetime="{r["date"]}">{h(r["label"])}</time>'
                 f'<a href="{h(r["url"])}" rel="noopener"><b>{h(NAMES[r["project"]])}</b> {h(r["tag"])}<span aria-hidden="true"> ↗</span></a><span>{h(r["what"])}</span></li>' for r in RELEASES)
    return f'<ol class="log">{li}</ol>'


def skills_group(g):
    chips = ""
    for sid, label, grp, uses in SKILLS:
        if grp != g: continue
        used = ", ".join(NAMES[u] for u in uses)
        chips += f'<li><button type="button" class="chip" data-key="sk:{sid}" data-hl="sk:{sid}" aria-pressed="false" title="Used in: {h(used)}">{h(label)}</button></li>'
    return f'<div class="sgroup" data-id="{g}"><h3>{h(GROUPS[g])}</h3><ul>{chips}</ul></div>'


def route_li(i):
    n = SHORT.get(i, NAMES[i]); return f'<li data-id="{i}"><a href="#{i}" data-hl="{i}">{h(n)}</a></li>'


def build():
    A = ROLES["all"]
    exp = "".join(job(j) for j in A["jobs"])
    prj = "".join(station(p) for p in A["projects"])
    block = {
        "experience": f'<section class="block" id="experience" data-block="experience"><div class="block-head glass"><h2 class="block-title">Experience</h2></div><div class="group" data-group="jobs">{exp}</div></section>',
        "projects": (f'<section class="block" id="projects" data-block="projects"><div class="block-head glass"><h2 class="block-title">Projects<span class="mid-name"> · Mid station · Tsomgo Lake · 3,753 m</span></h2>{lake_patch()}</div>'
                     f'<div class="group" data-group="projects">{prj}</div>'
                     f'<article class="station mini glass" id="smartthings" data-id="smartthings" data-key="smartthings" data-node="tool"><header class="st-head" data-hl="smartthings"><p class="eyebrow node-anchor"><span class="alt-tag" data-alt></span><span class="kind">Small tool · Python</span></p><h3>SmartThings A/C</h3>'
                     f'<p class="lead">A one-file Python command-line tool to check and control a Samsung air conditioner through the SmartThings REST API: status, power, temperature.</p></header>{related("smartthings")}</article></section>'),
    }
    blocks = "".join(block[b] for b in A["blocks"])
    panels = "".join(bars_panel(p, None) for p in A["panels"])
    numbers = (f'<section class="block glass" id="numbers" data-id="numbers" data-key="numbers" data-node="section"><header class="st-head" data-hl="numbers"><p class="eyebrow node-anchor"><span class="alt-tag" data-alt></span><span class="kind">By the numbers</span></p>'
               f'<h2 class="block-title">1,035 automated tests, and what the apps cost to run</h2><p class="lead">Test counts come from collecting the suites themselves; the other figures are from the project READMEs.</p></header>'
               f'<div class="panels" data-group="panels">{panels}</div>{related("numbers", "h3")}</section>')
    releases = (f'<section class="block glass" id="releases" data-id="releases" data-key="releases" data-node="section"><header class="st-head" data-hl="releases"><p class="eyebrow node-anchor"><span class="alt-tag" data-alt></span><span class="kind">Shipping log</span></p>'
                f'<h2 class="block-title">What I have shipped</h2><p class="lead">Releases with downloads, newest at the bottom of the timeline.</p></header>'
                f'<div class="ship">{timeline()}{release_log()}</div></section>')
    groups = "".join(skills_group(g) for g in A["groups"])
    skills = (f'<section class="block glass" id="skills" data-id="skills" data-key="skills" data-node="section"><header class="st-head" data-hl="skills"><p class="eyebrow node-anchor"><span class="alt-tag" data-alt></span><span class="kind">Skills</span></p>'
              f'<h2 class="block-title">What I use, and where</h2><p class="lead">Hover, focus or tap a skill to see the projects and jobs that use it. Press Enter or tap to pin it.</p></header>'
              f'<div class="sgroups" data-group="groups">{groups}</div>'
              f'<div class="edu"><h3>Education</h3><ul><li><b>Master of Computer Applications (MCA)</b>, UPES, Dehradun · Aug 2024 – Jul 2026 (completed)</li><li><b>Bachelor of Computer Applications (BCA)</b>, Christ (Deemed to be University), Delhi NCR · Apr 2024</li><li><b>Higher Secondary</b>, NIOS · Jun 2020</li></ul></div></section>')
    summit = (f'<section class="block summit glass" id="summit" data-id="summit" data-key="summit" data-node="section"><header class="st-head" data-hl="summit"><p class="eyebrow node-anchor"><span class="alt-tag" data-alt></span><span class="kind">Top station · Nathu La · 4,310 m</span></p>'
              f'<h2 class="block-title">Summit</h2><p class="lead">Hiring for QA, systems, web or AI/ML work, or want to talk about fast software on slow hardware? Write to me.</p></header>'
              f'<div class="summit-grid"><div><p class="contact"><a class="btn pri" href="mailto:apps.apurv2000@gmail.com">apps.apurv2000@gmail.com</a>'
              f'<a class="btn" href="https://www.linkedin.com/in/apurv-das-bb2050150" rel="noopener">LinkedIn<span aria-hidden="true"> ↗</span></a>'
              f'<a class="btn" href="https://github.com/ApurvDas" rel="noopener">GitHub<span aria-hidden="true"> ↗</span></a></p>'
              f'<p class="loc">Ahmedabad, Gujarat, India</p>{flags_svg()}</div>{survey_sheet()}</div></section>')
    route = "".join(route_li(i) for i in (A["jobs"] + A["projects"])) if False else ""
    order = [x for b in A["blocks"] for x in (A["jobs"] if b == "experience" else A["projects"])]
    route = "".join(route_li(i) for i in order)
    roles_btn = lambda cls: "".join(f'<button type="button" data-role="{k}" aria-pressed="{"true" if k=="all" else "false"}">{h(v["short"])}</button>' for k, v in ROLES.items())
    tpl = open(os.path.join(os.path.dirname(__file__), "template.html"), encoding="utf8").read()
    html = (tpl.replace("{{CONTOURS}}", hero_contours()).replace("{{ROLES_HERO}}", roles_btn("")).replace("{{ROLES_BAR}}", roles_btn(""))
            # no-JS has no role switch, so the static summary drops the "Pick a role" hint; main.js restores the full text
            .replace("{{HEADLINE}}", h(A["headline"])).replace("{{SUMMARY}}", h(A["summary"].split(" Pick a role")[0])).replace("{{ROUTE}}", route)
            .replace("{{BLOCKS}}", blocks).replace("{{NUMBERS}}", numbers).replace("{{RELEASES}}", releases).replace("{{SKILLS}}", skills)
            .replace("{{SUMMIT}}", summit).replace("{{MOMO_HERO}}", momo_btn("momo-3d", "▲ Veg momo", "momo-note-3d")))
    assert "{{" not in html, "unfilled template placeholder: " + html[html.index("{{"):html.index("{{") + 30]
    open(os.path.join(OUT, "index.html"), "w", encoding="utf8", newline="").write(html)

    # ---------- data.js ----------
    roles = {k: dict(label=v["label"], headline=v["headline"], summary=v["summary"], blocks=v["blocks"], jobs=v["jobs"],
                     projects=v["projects"], groups=v["groups"], panels=v["panels"], primary=v["primary"]) for k, v in ROLES.items()}
    ents = {k: v for k, v in NAMES.items()}
    js = ("/* Data behind the connections. Content text lives in index.html; this file holds the graph. */\n"
          "export const WAYPOINTS = { base: 1650, mid: 3753, top: 4310 };   // Gangtok, Tsomgo (Changu) Lake, Nathu La\n"
          f"export const NAMES = {json.dumps(ents, indent=1, ensure_ascii=False)};\n"
          f"export const ROLES = {json.dumps(roles, indent=1, ensure_ascii=False)};\n"
          "// from, to, why, quiet (quiet links show on hover/focus and in 'Related', not as a standing cable)\n"
          f"export const LINKS = {json.dumps([list(l) for l in LINKS], ensure_ascii=False)};\n"
          "// id, label, group, used by\n"
          f"export const SKILLS = {json.dumps([list(s) for s in SKILLS], ensure_ascii=False)};\n"
          f"export const RELEASES = {json.dumps([dict(id=r['id'], project=r['project'], tag=r['tag'], date=r['date']) for r in RELEASES], ensure_ascii=False)};\n")
    open(os.path.join(OUT, "data.js"), "w", encoding="utf8", newline="").write(js)
    print(len(html), len(js))


build()
