<div align="center">

# Ropeway to Nathu La

**Apurv Das, software engineer: a portfolio told as a cable-car ride from Gangtok (1,650 m) up to Nathu La (4,310 m).**

![HTML, CSS, JS](https://img.shields.io/badge/stack-plain%20HTML%20%7C%20CSS%20%7C%20JS-2f4a6b)
![three.js](https://img.shields.io/badge/3D-three.js-black?logo=threedotjs)
![anime.js](https://img.shields.io/badge/motion-anime.js-ff4b4b)
![No build step](https://img.shields.io/badge/build-none-brightgreen)

</div>

One page, no framework, no build step. Scrolling carries a cabin up the pass, station by station. A role switch (All, QA, Systems, Web, AI/ML) re-orders the page for the reader, and hovering, focusing or tapping any skill, project, job or release lights the cables to everything it connects to.

| Part | What it does |
|---|---|
| Role switch | Re-orders blocks, jobs, projects and charts; deep link with `#role=qa`, `#role=systems`, `#role=web`, `#role=ai` |
| Cable and connections | One SVG cable down the page; branch cables come from the `LINKS` list in `data.js` |
| Charts | Inline SVG with a hidden data table each: tests, memory, first paint, CPU, releases, altitude |
| 3D scene | three.js: peaks, pylons, lodges, cabin, kids in the snow, a momo stall. Hero first, then a small picture-in-picture on wide screens |
| Themes | Light by default, dark toggle (saved in `localStorage`), reduced-motion and no-JS paths |

The page is complete HTML without JavaScript; everything in `main.js` and `scene.js` is enhancement.

## Run it locally

```bash
py -m http.server 8911        # or: python -m http.server 8911
# open http://localhost:8911/
```

three.js and anime.js load from jsDelivr as pinned ES modules (see the import map in `index.html`), so you need a connection for the 3D and the motion; the page still works without them.

## Where things live

| Path | What | Edit by hand? |
|---|---|---|
| `tools/gen/content.py` | All text, numbers, links, skills, roles | Yes, this is the place to change content |
| `tools/gen/template.html` | Page shell | Yes |
| `tools/gen/build.py` | Generator | Yes |
| `index.html`, `data.js` | Generated output | No, regenerate |
| `styles.css`, `main.js`, `scene.js` | Hand-written styles, behaviour, 3D scene | Yes |
| `assets/shots/` | Project screenshots (WebP) and `shots.json` (project, caption, theme) | Add a file, then list it in `shots.json` |
| `fonts/` | Geist and Geist Mono variable fonts, Latin subset (OFL) | No |

## Regenerate after editing content

```bash
py tools/gen/build.py          # rewrites index.html and data.js in this folder
```

Test counts in the "tests" chart come from collecting each project's suites (`pytest --collect-only`, `vitest list`, `playwright test --list`, `phpunit --list-tests`, `ctest -N`), not from the CV.

## Status

Built and checked locally (axe-core clean, keyboard and touch passes, zero console errors). Not yet in its own git repository and not published.
