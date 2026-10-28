/* Data behind the connections. Content text lives in index.html; this file holds the graph. */
export const WAYPOINTS = { base: 1650, mid: 3753, top: 4310 };   // Gangtok, Tsomgo (Changu) Lake, Nathu La
export const NAMES = {
 "wreckbox": "WreckBox for Windows",
 "dasvis": "DasVis",
 "pm": "Project Manager",
 "focus": "Focus",
 "ciba": "Ciba Library",
 "khaata": "Khaata",
 "unigen": "Unigen Manager",
 "netrisk": "NetRisk AI",
 "smartthings": "SmartThings A/C",
 "zentrax": "Zentrax Solutions",
 "pheme": "Pheme Software",
 "technotask": "Technotask",
 "numbers": "By the numbers",
 "releases": "Shipping log",
 "skills": "Skills",
 "summit": "Summit",
 "base": "Base"
};
export const ROLES = {
 "all": {
  "label": "All",
  "headline": "Software engineer · QA · Systems · Web · AI/ML",
  "summary": "MCA graduate (2026) who tests software for a living, writes native C++ for weak Windows PCs, builds full-stack web apps and has trained CNN image-search models. Pick a role above and the route re-orders to what matters for it.",
  "tagline": "I build software, test it hard, and make it run well on cheap PCs.",
  "avail": "Open to software roles · Ahmedabad · can join immediately",
  "cv": "QA",
  "blocks": [
   "experience",
   "projects"
  ],
  "jobs": [
   "zentrax",
   "pheme",
   "technotask"
  ],
  "projects": [
   "wreckbox",
   "pm",
   "dasvis",
   "unigen",
   "netrisk",
   "ciba",
   "focus",
   "khaata"
  ],
  "groups": [
   "testing",
   "systems",
   "web",
   "ai",
   "delivery"
  ],
  "panels": [
   "memory",
   "tests",
   "paint",
   "cpu"
  ],
  "primary": []
 },
 "qa": {
  "label": "QA",
  "headline": "Software QA Engineer | Manual & Automated Testing — Web, Android & Windows Desktop Applications",
  "summary": "I'm a QA tester and MCA graduate (2026). At Zentrax Solutions I test an intercity cab-sharing platform, its Android app, web admin panel and APIs: I write test cases, log bugs in JIRA with clear steps to reproduce, and retest fixes before each release. In my own projects I've written 1,100+ automated tests, mostly with Playwright and pytest, run in CI on every change.",
  "tagline": "I find the bugs before your users do.",
  "avail": "Open to QA roles, manual and automation · Ahmedabad · can join immediately",
  "cv": "QA",
  "blocks": [
   "experience",
   "projects"
  ],
  "jobs": [
   "zentrax",
   "technotask",
   "pheme"
  ],
  "projects": [
   "pm",
   "unigen",
   "wreckbox",
   "dasvis",
   "focus",
   "netrisk",
   "ciba",
   "khaata"
  ],
  "groups": [
   "testing",
   "delivery",
   "systems",
   "web",
   "ai"
  ],
  "panels": [
   "tests",
   "paint",
   "cpu",
   "memory"
  ],
  "primary": [
   "zentrax"
  ]
 },
 "systems": {
  "label": "Systems",
  "headline": "Software Engineer — C++20 · Windows · Direct3D 11 · Real-Time Audio & Graphics",
  "summary": "Software engineer (MCA, 2026) who builds native software that stays fast on weak hardware. I rewrote a DJ-library app as a single native C++20 / Win32 / Direct2D executable (first paint in about 0.1 s, 0% idle CPU, about 43 MB of RAM) and built DasVis, a Direct3D 11 music visualizer that analyses each song's structure and runs at about 5% of one CPU core on GPUs back to feature level 10_0. I'm most at home where software meets devices: low-latency audio over WASAPI, GPU timing, Windows device and radio APIs, and network protocols implemented byte for byte. Everything I ship has tests and CI.",
  "tagline": "I build fast, good-looking software that still runs well on old, cheap PCs.",
  "avail": "Open to software roles · Ahmedabad · can join immediately",
  "cv": "Systems",
  "blocks": [
   "projects",
   "experience"
  ],
  "jobs": [
   "zentrax",
   "pheme",
   "technotask"
  ],
  "projects": [
   "wreckbox",
   "dasvis",
   "unigen",
   "pm",
   "netrisk",
   "focus",
   "ciba",
   "khaata"
  ],
  "groups": [
   "systems",
   "testing",
   "delivery",
   "web",
   "ai"
  ],
  "panels": [
   "memory",
   "paint",
   "cpu",
   "tests"
  ],
  "primary": []
 },
 "web": {
  "label": "Web",
  "headline": "Full-Stack Developer — JavaScript/TypeScript, PHP, Python, PostgreSQL/Supabase",
  "summary": "I'm a full-stack developer who has worked in PHP/CodeIgniter, JavaScript/TypeScript (Next.js, React) and Python (FastAPI, Flask). I built and deployed an offline-first project manager on Supabase/PostgreSQL with a Windows desktop app (Tauri), and a Next.js recipe platform with a signature motion system. I'm comfortable owning a feature end to end: data model, backend, UI, motion and tests.",
  "tagline": "I build web apps end to end: data, backend, UI and tests.",
  "avail": "Open to software roles · Ahmedabad · can join immediately",
  "cv": "Web",
  "blocks": [
   "experience",
   "projects"
  ],
  "jobs": [
   "technotask",
   "zentrax",
   "pheme"
  ],
  "projects": [
   "pm",
   "ciba",
   "focus",
   "khaata",
   "unigen",
   "wreckbox",
   "dasvis",
   "netrisk"
  ],
  "groups": [
   "web",
   "delivery",
   "testing",
   "systems",
   "ai"
  ],
  "panels": [
   "tests",
   "memory",
   "paint",
   "cpu"
  ],
  "primary": [
   "technotask"
  ]
 },
 "ai": {
  "label": "AI/ML",
  "headline": "Python Developer — Computer Vision (CNN Image Search) and Network Risk Modelling",
  "summary": "I'm an MCA graduate. In an IBM-partnered internship I built an AI visual search engine for e-commerce: CNN feature extraction and image similarity, with TensorFlow/Keras and OpenCV. I also built NetRisk AI, a home-network risk assessment tool whose per-device anomaly model learns how often each port is open, running unattended on a 4 GB laptop. I write tested Python (pytest, mocks) and ship with CI.",
  "tagline": "I train models and ship them as tested Python.",
  "avail": "Open to software roles · Ahmedabad · can join immediately",
  "cv": "AI",
  "blocks": [
   "experience",
   "projects"
  ],
  "jobs": [
   "pheme",
   "zentrax",
   "technotask"
  ],
  "projects": [
   "netrisk",
   "dasvis",
   "wreckbox",
   "unigen",
   "pm",
   "focus",
   "ciba",
   "khaata"
  ],
  "groups": [
   "ai",
   "web",
   "systems",
   "testing",
   "delivery"
  ],
  "panels": [
   "tests",
   "cpu",
   "memory",
   "paint"
  ],
  "primary": [
   "pheme"
  ]
 }
};
// from, to, why, quiet (quiet links show on hover/focus and in 'Related', not as a standing cable)
export const LINKS = [["wreckbox", "dasvis", "DasVis was spun out of WreckBox's visualizer.", false], ["ciba", "focus", "Focus reuses Ciba's design tokens and motion.", false], ["pm", "rel:pm-0.2.1", "The Tauri desktop app shares the web UI. Release desktop-v0.2.1.", false], ["unigen", "netrisk", "Both work on devices and networks: Wi-Fi and Bluetooth adapters, and the devices on a home network.", false], ["netrisk", "smartthings", "Same ground: devices on a home network.", false], ["pheme", "netrisk", "Applied ML again: CNN image search at Pheme, an anomaly model here.", false], ["zentrax", "numbers", "The test counts behind the QA work.", false], ["technotask", "pm", "Technotask's PHP/CodeIgniter work is the stack of Project Manager v1.", true], ["zentrax", "wreckbox", "Testing habits from the QA job: this project ships with automated tests.", true], ["zentrax", "dasvis", "Testing habits from the QA job: this project ships with automated tests.", true], ["zentrax", "pm", "Testing habits from the QA job: this project ships with automated tests.", true], ["zentrax", "focus", "Testing habits from the QA job: this project ships with automated tests.", true], ["zentrax", "ciba", "Testing habits from the QA job: this project ships with automated tests.", true], ["zentrax", "khaata", "Testing habits from the QA job: this project ships with automated tests.", true], ["zentrax", "unigen", "Testing habits from the QA job: this project ships with automated tests.", true], ["zentrax", "netrisk", "Testing habits from the QA job: this project ships with automated tests.", true]];
// id, label, group, used by
export const SKILLS = [["playwright", "Playwright", "testing", ["pm", "unigen", "ciba"]], ["pytest", "pytest", "testing", ["unigen", "focus", "netrisk"]], ["phpunit", "PHPUnit", "testing", ["pm"]], ["vitest", "Vitest", "testing", ["ciba"]], ["ctest", "CTest", "testing", ["wreckbox", "dasvis"]], ["manual", "Manual & exploratory testing", "testing", ["zentrax", "unigen"]], ["jira", "JIRA bug reports", "testing", ["zentrax"]], ["android", "Android testing (ADB)", "testing", ["zentrax"]], ["regression", "Regression & smoke testing", "testing", ["zentrax", "wreckbox", "pm"]], ["cpp", "C++20", "systems", ["wreckbox", "dasvis"]], ["win32", "Win32 · Direct2D", "systems", ["wreckbox"]], ["d3d", "Direct3D 11 · HLSL", "systems", ["dasvis"]], ["audio", "WASAPI · low-latency audio", "systems", ["wreckbox"]], ["dsp", "FFT · DSP · beat tracking", "systems", ["wreckbox", "dasvis"]], ["windev", "SetupAPI · WLAN · WinRT", "systems", ["unigen"]], ["cmake", "CMake · vcpkg", "systems", ["wreckbox", "dasvis"]], ["js", "JavaScript · TypeScript", "web", ["pm", "ciba", "technotask"]], ["react", "Next.js · React", "web", ["ciba"]], ["php", "PHP · CodeIgniter", "web", ["technotask", "pm"]], ["python", "Python", "web", ["unigen", "focus", "khaata", "netrisk", "pheme"]], ["fastapi", "FastAPI · Flask", "web", ["focus", "khaata"]], ["postgres", "PostgreSQL · Supabase", "web", ["pm", "ciba"]], ["sqlite", "SQLite · MySQL", "web", ["focus", "netrisk", "technotask"]], ["tauri", "Tauri · Rust", "web", ["pm"]], ["anime", "anime.js", "web", ["ciba", "focus", "unigen"]], ["three", "three.js", "web", ["ciba"]], ["cnn", "CNN · TensorFlow · Keras", "ai", ["pheme"]], ["opencv", "OpenCV · computer vision", "ai", ["pheme"]], ["anomaly", "Probabilistic anomaly detection", "ai", ["netrisk"]], ["nmap", "nmap · network scanning", "ai", ["netrisk"]], ["ci", "GitHub Actions CI/CD", "delivery", ["pm", "wreckbox", "focus"]], ["git", "Git · code review · Agile", "delivery", ["technotask"]]];
export const RELEASES = [{"id": "pm-0.2.1", "project": "pm", "tag": "desktop-v0.2.1", "date": "2026-10-05"}, {"id": "wb-0.1.0", "project": "wreckbox", "tag": "v0.1.0", "date": "2026-10-07"}, {"id": "wb-0.7.0", "project": "wreckbox", "tag": "v0.7.0", "date": "2026-10-09"}, {"id": "wb-0.7.6", "project": "wreckbox", "tag": "v0.7.6", "date": "2026-10-15"}, {"id": "unigen-1.0.7", "project": "unigen", "tag": "v1.0.7", "date": "2026-10-18"}];
