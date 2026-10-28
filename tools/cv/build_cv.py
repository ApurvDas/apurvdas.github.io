"""Generates the four role CVs (HTML) from the Master CV facts. Run: py tools/cv/build_cv.py, then tools/cv/render.ps1.
Every fact is from Personal/Apurv-Das-Master-CV.md; test counts are the 2026-10-28 recount (tools/gen/content.py TESTS).
The phone is a single variable: set PHONE = "" to drop it from all four CVs, then re-render."""
import os, sys
from html import escape as h
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "gen"))
from content import TESTS, TEST_TOTAL, TEST_FLOOR

PHONE = "+91-9016119974"
OUT = os.path.dirname(__file__)
T = {k: f"{v:,}" for k, v in TESTS.items()}

CSS = """
  @page { size: A4; margin: 13mm 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif; font-size: 10.4pt; line-height: 1.32; color: #1d2433; }
  h1 { margin: 0 0 2pt; font-size: 22pt; letter-spacing: .5pt; color: #1f3a68; }
  .headline { font-weight: 700; margin: 0 0 3pt; }
  .contact { margin: 0 0 1.5pt; }
  a { color: inherit; text-decoration: none; }
  h2 { margin: 9pt 0 4pt; padding-bottom: 2pt; border-bottom: 1.4pt solid #1f3a68; font-size: 11.5pt; color: #1f3a68; letter-spacing: .3pt; break-after: avoid; }
  p { margin: 0; }
  ul { margin: 2pt 0 4pt; padding-left: 12pt; }
  li { margin: 0 0 2pt; }
  .role { margin: 5pt 0 1pt; }
  .tools { font-style: italic; font-size: 9.4pt; color: #3a4456; margin: 0 0 1pt; }
  .skills li { list-style: none; margin-left: -12pt; padding-left: 12pt; text-indent: -12pt; }
  .skills li::before { content: "\\2022  "; }
  .keep { break-inside: avoid; }
"""

SUMMARY = {
    "QA": f"Software QA Engineer and MCA graduate with hands-on Quality Assurance (QA) experience in manual testing and automated testing of web applications, Android mobile apps and Windows desktop applications. Currently a QA Tester on an intercity cab-sharing platform, handling test planning, test cases, bug reports, and functional, regression, UI/UX and performance testing. Built {TEST_FLOOR} automated test cases (Playwright, pytest, PHPUnit, Vitest) with CI/CD in GitHub Actions. Strong problem-solving skills, analytical skills, attention to detail, clear English communication skills and close teamwork with developers.",
    "Systems": "Software engineer (MCA, 2026) who builds native software that stays fast on weak hardware. Rewrote a DJ-library app as a single native C++20 / Win32 / Direct2D executable (first paint in about 0.1 s, 0% idle CPU, about 43 MB of RAM) and built DasVis, a Direct3D 11 music visualizer that analyses each song's structure and runs at about 5% of one CPU core on GPUs back to feature level 10_0. Most at home where software meets devices: low-latency audio clocks over WASAPI, GPU timing and quality tiers, Windows device and radio APIs, and network protocols implemented byte for byte. Everything I ship has tests and CI.",
    "Web": "Full-stack developer with hands-on experience across PHP/CodeIgniter, the JavaScript/TypeScript ecosystem (Next.js, React) and Python (FastAPI, Flask). Built and deployed an offline-first project manager on Supabase/PostgreSQL with a Windows desktop app (Tauri), and a Next.js recipe platform with a signature motion system. Comfortable owning a feature end to end: data model, backend, UI, motion and tests.",
    "AI": "MCA graduate who completed an IBM-partnered internship building an AI visual search engine for e-commerce (CNN feature extraction, image similarity, TensorFlow/Keras, OpenCV). Also built NetRisk AI, a home-network risk assessment tool with a per-device anomaly model that learns how often each port is open, running unattended on a 4 GB laptop. Writes tested Python (pytest, mocks) and ships with CI.",
}
HEADLINE = {
    "QA": "Software QA Engineer | Manual & Automated Testing — Web, Android & Windows Desktop Applications",
    "Systems": "Software Engineer — C++20 · Windows · Direct3D 11 · Real-Time Audio & Graphics",
    "Web": "Full-Stack Developer — JavaScript/TypeScript, PHP, Python, PostgreSQL/Supabase",
    "AI": "Python Developer — Computer Vision (CNN Image Search) and Network Risk Modelling",
}
HASH = {"QA": "qa", "Systems": "systems", "Web": "web", "AI": "ai"}

SK = {  # skill lines straight from the Master CV
    "Testing": "Manual Testing, Automated Testing, Functional Testing, Regression Testing, Smoke Testing, Exploratory Testing, UI/UX Testing, Usability Testing, Mobile App Testing, API Testing, End-to-End (E2E) Testing, Integration Testing, Unit Testing, Performance Testing, Security Testing, Accessibility Testing, Cross-Browser & Compatibility Testing, Installation Testing, User Acceptance Testing (UAT)",
    "QA Process": "SDLC, STLC, Test Planning, Test Strategy, Test Cases, Test Scenarios, Bug Reports, Defect Tracking, Bug Life Cycle, Severity & Priority, Retesting, Requirements Analysis, Test Documentation, Agile/Scrum",
    "Test Tools": "Playwright, pytest, PHPUnit, Vitest, CTest, unittest, JIRA, Android Studio, Android Debug Bridge (ADB), Android Emulator, Chrome DevTools",
    "Languages": "C++20, Python, JavaScript, TypeScript, PHP, SQL, HLSL (Shader Model 4), HTML5, CSS3, Rust (basic, Tauri)",
    "Web Frameworks & Libraries": "Next.js, React, FastAPI, Flask, CodeIgniter 4, Tailwind CSS, Jinja2, anime.js, three.js / react-three-fiber, Prisma, Auth.js / NextAuth, CodeIgniter Shield, Tauri, pywebview",
    "Windows & Systems": "Win32, COM, Direct2D / DirectWrite, Direct3D 11 / DXGI, WASAPI (miniaudio), Media Foundation, WIC, WinHTTP, CNG, SetupAPI, WLAN API, WinRT Bluetooth, multithreading",
    "Audio, Video & Graphics": "FFT / DSP (own SSE2 FFT), STFT, harmonic-percussive separation, beat tracking, BPM and key detection, HDR rendering and bloom, GPU fluid and reaction-diffusion simulation, GPU timestamp profiling, H.264 encoding, libVLC, projectM, TagLib",
    "Machine Learning / AI": "CNN, Feature Extraction, Image Similarity Matching, Model Training & Fine-Tuning, TensorFlow, Keras, OpenCV, pandas, Probabilistic Anomaly Detection",
    "Databases": "PostgreSQL, Supabase (Row-Level Security, RPCs), MySQL, SQLite, IndexedDB",
    "Networking & Security": "TCP / UDP sockets, HTTP servers and clients, binary protocol implementation, REST APIs, OAuth 2.0 (PKCE, Google OAuth), JWT, nmap, XSS / CSRF / IDOR testing",
    "DevOps & Tools": "Git, GitHub Actions (CI/CD), GitHub Pages, CMake, vcpkg, MSVC, PowerShell, Docker, AWS",
    "Concepts": "MVC Architecture, CRUD, Role-Based Access Control, Offline-First Sync, OOP, Responsive & Accessible UI, Reduced-Motion Support",
    "Soft Skills": "Problem-Solving Skills, Analytical Skills, Attention to Detail, English Communication, Teamwork & Collaboration, Time Management",
}
SKILLS = {
    "QA": ["Testing", "QA Process", "Test Tools", "Languages", "Databases", "DevOps & Tools", "Soft Skills"],
    "Systems": ["Languages", "Windows & Systems", "Audio, Video & Graphics", "Test Tools", "Networking & Security", "DevOps & Tools"],
    "Web": ["Languages", "Web Frameworks & Libraries", "Databases", "Test Tools", "Networking & Security", "DevOps & Tools", "Concepts"],
    "AI": ["Machine Learning / AI", "Languages", "Databases", "Test Tools", "DevOps & Tools"],
}

ZENTRAX = ("QA Tester & Product Contributor (Part-Time)", "Zentrax Solutions LLP", "Apr 2026 – Present", [
    "Perform manual functional, regression, exploratory and UI/UX testing of an intercity cab-sharing platform: the Android app, the web admin panel (backoffice) and its backend APIs.",
    "Reported 8 backoffice defects in one test cycle (3 High priority) covering navigation, CSV export data integrity and UI layout.",
    "Write test plans, test cases and test scenarios from feature requirements; retest fixes and verify bugs before each release.",
    "Log bug reports in JIRA with steps to reproduce, expected vs actual results, severity and priority, and track them through the bug life cycle.",
    "Test Android builds on devices and emulators with Android Studio and ADB across screen sizes.",
    "Contribute to requirements analysis and product brainstorming on features, flows and improvements, collaborating with developers and the product team."])
PHEME = ("AI / ML Intern (Remote Mentoring Program)", "Pheme Software Pvt. Ltd. (IBM Platinum Business Partner), Remote", "Jan 2026 – May 2026", [
    "Built \"AI Visual Search Engine for E-Commerce\", an image-based product search system using CNN feature extraction and image similarity matching in Python.",
    "Trained and fine-tuned Convolutional Neural Network (CNN) models to improve visual search relevance and retrieval accuracy.",
    "Applied deep learning and computer vision (TensorFlow/Keras, OpenCV) to a real-world e-commerce use case, mentored by Mr. Krishna K."])
TECHNO = ("Web Developer Intern", "Technotask Business Solutions, Bhopal", "May 2023 – Jun 2024", [
    "Developed and maintained web applications using PHP, CodeIgniter (MVC), HTML5, CSS3, JavaScript and MySQL.",
    "Contributed to the company HRMS portal supporting employee records and management workflows.",
    "Improved system stability and sped up issue resolution with structured logging; worked in Agile sprints with Git and code reviews."])


def cut(job, idx):  # same job with only the bullets at idx (None = all)
    t, o, d, b = job
    return (t, o, d, b if idx is None else [b[i] for i in idx])


# primary role: all bullets; the others: 1 bullet
JOBS = {
    "QA": [cut(ZENTRAX, None), cut(PHEME, [0]), cut(TECHNO, [2])],
    "Systems": [cut(ZENTRAX, [0]), cut(PHEME, [0]), cut(TECHNO, [0])],
    "Web": [cut(ZENTRAX, [0]), cut(PHEME, [0]), cut(TECHNO, None)],
    "AI": [cut(ZENTRAX, [0]), cut(PHEME, None), cut(TECHNO, [0])],
}

# projects: key -> (title, kind, dates, tools line, bullets)
P = {}
P["pm_test"] = ("Project Manager — Offline-First Web App + Windows Desktop App", "Personal Project", "Aug 2026 – Present",
                "Tools: Playwright, Supabase/PostgreSQL, PHPUnit, GitHub Actions | Live: apurvdas.github.io/project-manager", [
    "Built 60 Playwright end-to-end (E2E) test cases on a shared test automation framework, covering offline editing, conflict merging, live sync and sign-out data wiping; 32 role-based API permission tests across 6 user roles.",
    "Ran a responsive testing sweep of 20 screen sizes × 5 pages and a performance regression test guarding a fix that cut idle CPU time from ~320 ms to under 64 ms per 10 s.",
    "The first version (PHP 8.3, CodeIgniter 4, MySQL) had 18 Playwright tests and 244 PHPUnit tests covering authorization, output escaping, XSS, CSRF, IDOR and mass assignment."])
P["pm_web"] = ("Project Manager — Offline-First Web App + Windows Desktop App", "Personal Project", "Aug 2026 – Present",
               "Tools: Supabase/PostgreSQL (row-level security), JavaScript, Tauri (Rust), Playwright, PHPUnit, GitHub Actions | Code: github.com/ApurvDas/project-manager | Live: apurvdas.github.io/project-manager", [
    "Rebuilt a PHP project manager as a live Supabase app on GitHub Pages: projects, a role ladder (owner / manager / member / viewer), tasks with multiple assignees, a drag-and-drop Kanban board, tags, checklists, comments, notifications and an activity log.",
    "Built an offline-first sync engine: an IndexedDB copy plus an outbox replayed through server RPCs, with per-field conflict merging and data wiped on sign-out.",
    "Shipped a Tauri Windows desktop app with tray, notifications, browser sign-in and signed auto-updates, using about 170 MB idle against about 315 MB for Chrome; released through a GitHub Actions pipeline.",
    "60 Playwright end-to-end tests and 32 role-based API permission tests across 6 user roles; the first version (PHP 8.3, CodeIgniter 4, MySQL) had 244 PHPUnit tests."])
P["pm_short"] = ("Project Manager — Offline-First Web App + Windows Desktop App", "Personal Project", "Aug 2026 – Present",
                "Tools: Supabase/PostgreSQL, JavaScript, Tauri (Rust), Playwright, GitHub Actions | Code: github.com/ApurvDas/project-manager", [
    "Live Supabase app with an offline-first sync engine (IndexedDB plus an outbox replayed through server RPCs) and a Tauri Windows desktop app using about 170 MB idle against about 315 MB for Chrome; 60 Playwright E2E tests and 32 API permission tests."])
P["unigen_test"] = ("Unigen Manager — Windows Wi-Fi & Bluetooth Manager", "Personal Project", "Oct 2026",
                    "Tools: Python, pytest, Playwright | Code: github.com/ApurvDas/unigen-manager", [
    f"Wrote {T['unigen']} pytest tests (unit, API contract and Playwright UI tests in Microsoft Edge) plus 20 read-only hardware checks on the real adapters, and a 24-case manual test checklist for system-changing actions; diagnosed releases from the app's own log and the Windows event log."])
P["unigen_sys"] = ("Unigen Manager — Windows Wi-Fi & Bluetooth Manager", "Personal Project", "Oct 2026",
                   "Tools: Python, ctypes (SetupAPI, WLAN API), WinRT, pywebview + WebView2, anime.js, pytest, Playwright | Code: github.com/ApurvDas/unigen-manager", [
    "Manages a USB Wi-Fi 6 + Bluetooth dongle and a laptop's built-in card side by side from one dark-mode window with live charts and an always-on tray widget; ships as one 33 MB executable with no installer.",
    "Moves Wi-Fi and Bluetooth between the dongle and the built-in card by switching radios and devices through SetupAPI and the WLAN API (Wi-Fi moves in about 3 s with no driver restart), with an unplug / replug watchdog and rollback on failure; reads device battery levels from Windows device properties.",
    f"Wrote {T['unigen']} pytest tests (unit, API contract, Playwright UI tests in Microsoft Edge) plus 20 read-only hardware checks on the real adapters and a 24-case manual test checklist for system-changing actions."])
P["wb_test"] = ("WreckBox for Windows — Native C++ Desktop App", "Personal Project", "Oct 2026", "Tools: C++20, CTest, GitHub Actions", [
    "Wrote 12 CTest suites (690+ assertions) and configured CI that builds, tests, smoke-tests and packages each release.",
    "Smoke testing caught a crash on every app exit (2 root causes fixed); compatibility testing of 18 audio formats found 3 audio defects, each locked in with a regression test."])
P["wb_sys"] = ("WreckBox for Windows — Native C++ Desktop App", "Personal Project", "Oct 2026",
               "Tools: C++20, Win32, Direct2D, libVLC, miniaudio (WASAPI), projectM, TagLib, CMake / vcpkg, CTest, PowerShell, GitHub Actions (a native rewrite of an existing DJ-library app) | Download: github.com/moloyb301-eng/wreckbox-releases", [
    "Rewrote the app as one native executable: first paint in 105–147 ms (300 ms budget), search across 5,000 tracks in 0.8 ms, 0% idle CPU (no frame loop), about 43 MB of RAM at rest.",
    "Halved memory after scrolling (about 92 to 50 MB) by fixing GPU brush retention and moving to the Windows segment heap.",
    "Ported the Rust audio-analysis engine (tempo, key, energy) to C++ with my own SSE2 FFT, computed frame by frame so a 5-minute track needs no spectrogram in memory; results match the Rust engine on every file both can read.",
    "Built a low-latency playback path (libVLC into a 0.25 s ring, miniaudio / WASAPI at 20 ms periods) with a sample-accurate \"heard\" clock that keeps visuals on the beat, including automatic Bluetooth latency compensation.",
    "Implemented the Soulseek peer-to-peer protocol natively (server, peers, relayed transfers), with 28 messages verified byte for byte against a reference implementation.",
    "Wrote 12 CTest suites (690+ assertions) and configured CI that builds, tests, smoke-tests and packages each release; smoke testing caught a crash on every app exit (2 root causes fixed)."])
P["dasvis"] = ("DasVis — Direct3D 11 Music Visualizer", "Personal Project", "Oct 2026 – Present",
              "Tools: C++20, Direct3D 11 (feature level 10_0, Shader Model 4), HLSL, Media Foundation | Code: github.com/ApurvDas/dasvis", [
    "Streaming song analysis (STFT, harmonic-percussive separation, dynamic-programming beat tracking, novelty-based section detection) maps a song's beats, build-ups and drops in about 4–6 s using about 6 MB, so the visuals anticipate drops.",
    "15 GPU scenes, including stable-fluids, reaction-diffusion and a one-million-star galaxy, all as pixel shaders on ping-pong textures; quality tier and render scale chosen from GPU timestamp queries; about 5% of one CPU core and +20 MB of RAM at the low tier.",
    "Photosensitivity-safe flash limiter (at most 3 flashes a second), frame-exact H.264 video export through Media Foundation, Spout GPU texture sharing, and WLED LED-strip control over realtime UDP.",
    "Automated GPU rendering tests on a software renderer (WARP), including determinism tests (same input, bit-identical frames) and a photosensitivity (accessibility) test."])
P["netrisk_full"] = ("NetRisk AI — Home-Network Risk Assessment", "Course Project", "Oct 2026", "Tools: Python, nmap, SQLite, Windows Task Scheduler", [
    "Finds every device on the home subnet and scans the top 200 TCP ports with versions plus a UDP probe for SNMP and UPnP, every 6 hours, unattended on a 4 GB laptop.",
    "Scores each finding by likelihood × impact into device and network risk (Low to Critical); an anomaly model learns how often each port is open on each device and flags scans far more surprising than that device's history.",
    "Keeps a SQLite history (new devices, newly opened ports), writes a self-contained HTML report with fix steps, and sends a Windows notification only for High/Critical or unusual findings.",
    "Safe by design: alerts only, never changes the network, pins the home network on first run and skips any other network; 44 unit tests with mocks."])
P["netrisk_short"] = ("NetRisk AI — Home-Network Risk Assessment", "Course Project", "Oct 2026", "Tools: Python, nmap, SQLite, Windows Task Scheduler", [
    "Scans the top 200 TCP ports of every device on the home subnet every 6 hours, unattended on a 4 GB laptop, and scores risk with a per-device anomaly model; alerts only; 44 unit tests with mocks."])
P["ciba"] = ("Ciba Library — Motion-First Community Recipe Platform", "Personal Project", "2026",
             "Tools: Next.js 16, React 19, TypeScript, Prisma, PostgreSQL, Auth.js / NextAuth, anime.js, react-three-fiber, Vitest, Playwright | Code: github.com/ApurvDas/ciba-library", [
    "Built a full-stack recipe website with Next.js (App Router), backed by Prisma over PostgreSQL and Auth.js / NextAuth (email + Google OAuth, JWT sessions, bcrypt).",
    "Engineered an anime.js motion system (live servings scaler, FLIP grid re-layout, add-to-cart flight) plus a react-three-fiber WebGL hero, with light/dark and reduced-motion support.",
    "Shipped browse filtering, ratings and comments, a follows/activity feed and a per-user shopping list; 27 Vitest unit tests and 4 Playwright E2E tests."])
P["focus"] = ("Focus — Pomodoro & Reminders Web App", "Personal Project", "2026",
              "Tools: Python, FastAPI, Jinja2, SQLite, anime.js, pytest, GitHub Actions | Code: github.com/ApurvDas/focus-timer", [
    "Built a focus web app: a Pomodoro timer with an animated countdown ring, reminders with recurrence and snooze, focus tasks, streak and stat tracking, and browser notifications.",
    "Kept the timer and reminder logic in pure, tested modules; 46 pytest tests run by GitHub Actions CI."])
P["khaata"] = ("Khaata — Indian Expense Tracker", "Personal Project", "2026",
               "Tools: Python, Flask, Jinja, Tailwind CSS, Tkinter | Code: github.com/ApurvDas/BudgetApplication", [
    "Built a multi-user expense tracker as both a Flask web app and a Tkinter desktop app, sharing UI-agnostic ledger logic through a common core module.",
    "Delivered dashboards (net balance, spending donut, cash-flow charts), per-category budgets, insights and CSV/XLSX import and export with strict validation; hashed-password accounts with CSRF-protected forms; every flow works without JavaScript.",
    "24 tests, including 8 security tests."])
P["khaata_test"] = ("Khaata — Indian Expense Tracker", "Personal Project", "2026", "Tools: Python, Flask, Tkinter | Code: github.com/ApurvDas/BudgetApplication", [
    "Multi-user expense tracker (Flask web app and Tkinter desktop app) with strict CSV/XLSX import validation and CSRF-protected forms; 24 tests, including 8 security tests."])
P["others_test"] = ("Other Projects — Personal & Academic", "", "2026", "", [
    "Focus (FastAPI): 46 pytest tests in GitHub Actions CI; Ciba Library (Next.js): 27 Vitest and 4 Playwright E2E tests; NetRisk AI: 44 unit tests with mocks."])
P["others_sys"] = ("Other Projects — Personal & Academic", "", "2026", "", [
    "Ciba Library (Next.js 16, React 19, Prisma, anime.js, react-three-fiber), Focus (FastAPI, SQLite), Khaata (Flask, Tkinter) and a one-file SmartThings A/C command-line tool in Python."])
P["others_ai"] = ("Other Projects — Personal", "", "2026", "", [
    "Unigen Manager (Python, pytest) and Focus (FastAPI, pytest, GitHub Actions CI): each with automated tests."])

PROJECTS = {
    "QA": ["pm_test", "unigen_test", "wb_test", "khaata_test", "others_test"],
    "Systems": ["wb_sys", "dasvis", "unigen_sys", "pm_short", "netrisk_short", "others_sys"],
    "Web": ["pm_web", "ciba", "focus", "khaata"],
    "AI": ["netrisk_full", "pm_short", "others_ai"],
}
TESTLINE = (f"{TEST_TOTAL:,} automated tests across six projects: Project Manager {T['pm']} (60 Playwright E2E and 32 API permission in v2; 18 Playwright and 244 PHPUnit in v1), "
            f"Unigen Manager {T['unigen']}, Focus {T['focus']}, NetRisk AI {T['netrisk']}, Ciba Library {T['ciba']}, Khaata {T['khaata']}; plus 12 CTest suites (690+ assertions) in WreckBox.")


def role_block(title, org, dates, bullets):
    return (f'<div class="keep"><p class="role"><b>{h(title)}</b> — {h(org)} | {h(dates)}</p><ul>'
            + "".join(f"<li>{h(b)}</li>" for b in bullets) + "</ul></div>")


def proj_block(k):
    title, kind, dates, tools, bullets = P[k]
    head = f"<b>{h(title)}</b>" + (f" — {h(kind)} | {h(dates)}" if kind else f" | {h(dates)}")
    tl = f'<p class="tools">{h(tools)}</p>' if tools else ""
    return f'<div class="keep"><p class="role">{head}</p>{tl}<ul>' + "".join(f"<li>{h(b)}</li>" for b in bullets) + "</ul></div>"


def page(r):
    contact1 = " | ".join(([f"Phone: {PHONE}"] if PHONE else []) + ["Email: apps.apurv2000@gmail.com", "Location: Ahmedabad, Gujarat, India"])
    sk = "".join(f"<li><b>{h(k)}:</b> {h(SK[k])}</li>" for k in SKILLS[r])
    exp = "".join(role_block(*j) for j in JOBS[r])
    prj = (f"<ul><li>{h(TESTLINE)}</li></ul>" if r == "QA" else "") + "".join(proj_block(k) for k in PROJECTS[r])
    sections = [("WORK EXPERIENCE", exp), ("PROJECTS", prj)]
    if r == "Systems": sections.reverse()
    edu = ('<p class="role"><b>Master of Computer Applications (MCA)</b> — UPES, Dehradun | Aug 2024 – Jul 2026 (Completed)</p>'
           '<p class="role"><b>Bachelor of Computer Applications (BCA)</b> — Christ (Deemed to be University), Delhi NCR | Apr 2024</p>'
           '<p class="role"><b>Higher Secondary</b> — NIOS | Jun 2020</p>')
    act = ('<h2>LEADERSHIP &amp; ACTIVITIES</h2><ul><li><b>Organizer, college tech fests:</b> coordinated across teams to run the events. '
           'Volunteer, Centre for Social Action and School Welfare Office.</li></ul>') if r == "QA" else ""
    body = "".join(f"<h2>{t}</h2>{c}" for t, c in sections)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Apurv Das - CV - {r}</title>
<style>{CSS}</style>
</head>
<body>

<h1>APURV DAS</h1>
<p class="headline">{h(HEADLINE[r])}</p>
<p class="contact">{h(contact1)}</p>
<p class="contact">LinkedIn: linkedin.com/in/apurv-das-bb2050150 | GitHub: github.com/ApurvDas | Portfolio: <a href="https://apurvdas.github.io/#role={HASH[r]}">apurvdas.github.io</a></p>

<h2>SUMMARY</h2>
<p>{h(SUMMARY[r])}</p>

<h2>TECHNICAL SKILLS</h2>
<ul class="skills">{sk}</ul>

{body}

<h2>EDUCATION</h2>
{edu}
{act}
</body>
</html>
"""


for r in SUMMARY:
    open(os.path.join(OUT, f"Apurv-Das-CV-{r}.html"), "w", encoding="utf8", newline="\n").write(page(r))
print("wrote", len(SUMMARY), "CV html files")
