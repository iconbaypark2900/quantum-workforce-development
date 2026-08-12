# Quantum Career Navigator + Workforce Intelligence Engine

**Vendored into Quantum Global Group `/learn/navigator`.** Upstream:
https://github.com/QuantumKev/ibm-quantum-navigation — see `SOURCE.md`.

An interactive, single-page concept for **IBM Quantum workforce development**, built for an
interview. It treats workforce development as an **ecosystem navigation problem** and a
**workforce intelligence engine**: it connects IBM Quantum roles, learning pathways,
university programs, enterprise readiness, ecosystem projects, and workforce outcomes into
one personalized navigation system that helps learners, universities, employers, and
workforce partners answer a single question — **"What should we do next?"**

> Translate IBM's quantum roadmap into workforce pathways, curriculum pathways, and career
> pathways.

## What it does

- **Navigator** — choose your profile (13 user types incl. *Workforce Board*), interest
  (15 areas incl. *Quantum Safe Security* and *Quantum Foundry & Manufacturing*), and goal
  (13 outcomes incl. *Assess Enterprise Quantum Readiness* and *Build a Talent Pipeline*),
  then **Generate my quantum pathway**.
- **Dynamic board-game pathway** — a winding route of Start → Skill Unlocks → Missions →
  Community → Mentor/Research/Industry Gates → Project Quest → Opportunity → Outcome, plus a
  **summary panel** with recommended IBM resources, required skills, suggested badges,
  projects, community engagement, and the opportunity target + recommended role family. An
  inline **Advisor view** gives a tailored **Next Best Action**.
- **IBM Quantum role families** — six families (Research, Software & Infrastructure,
  Hardware & Engineering, Consulting & Client Success, Business & Ecosystem, Quantum Safe &
  Security) built from real IBM Careers roles, each with example jobs, core skills, and a
  learning pathway.
- **Role-to-skills mapper** — pick a role family to map it to jobs, skills, learning
  resources, badges, projects, opportunities, and best-fit profiles.
- **1·2·3-year workforce forecast** — connects the roadmap and hiring patterns to staged
  talent preparation.
- **Enterprise quantum readiness assessment** — an interactive six-category self-assessment
  (Low/Medium/High) with a live readiness meter, verdict, and recommended next step.
- **Build the quantum team** — selectable business scenarios with a nine-role
  cross-functional team (what they do, skills, learning, contribution).
- **University quantum pathway builder** — pick a target role family to generate a
  four-year curriculum with an outcome.
- **IBM assets as power-ups** — every resource shows what it helps with, the pathway stage
  it supports, and the role families it feeds; filterable by purpose; lights up when a
  pathway unlocks it.
- **Outcomes dashboard** — 18 workforce KPIs with animated count-ups (incl. *enterprise
  readiness assessments* and *quantum teams mapped*); goal-relevant KPIs are highlighted.
- **Quick start** — a "Load example student (Quantum Kevin)" button (Physics Student ·
  Medicine · Prepare for a PhD · Research) and a reset.

The board is **not** one fixed route. Templates (learner, university, employer, community,
enterprise) plus gate logic produce different journeys per selection.

## Run locally

It's a static site — no build step or backend. From the project folder:

```bash
python -m http.server 8765
```

Then open <http://localhost:8765>. Append `?demo=1` to auto-load the "Quantum Kevin" example.

## Structure

```
index.html   # page markup: hero, navigator, board+summary, role families, mapper,
             # forecast, enterprise readiness, team builder, curriculum builder,
             # asset power-ups, KPI dashboard, final message
app.js       # one central DATA object (avatars, interests, goals, roleFamilies,
             # learningResources, workforceForecast, enterpriseReadiness, team,
             # universityCurriculum, kpis) + pathway generator + all interactivity
styles.css   # IBM-inspired styling (blue/purple/magenta/cyan/charcoal) + animations
images/      # low-poly geometric "bird" watermarks named after IBM Quantum
             # processors (falcon, eagle, heron, nighthawk, starling, blue jay)
             # + ecosystem scene art
```

## Data model

`app.js` is powered by a single `DATA` object so the app is easy to extend: `avatars`,
`interests`, `goals`, `roleFamilies` (with embedded skills, learning, badges, projects,
opportunities, best-fit profiles, and curriculum), `learningResources`, `workforceForecast`,
`enterpriseReadiness`, `teamScenarios` / `teamRoles`, `kpis`, and `purposes`.

## Design language

- **IBM Plex Sans / IBM Plex Mono**, Carbon-inspired flat surfaces.
- Palette: IBM blue `#0f62fe`, purple `#8a3ffc`, magenta `#ee5396`, cyan `#1192e8`,
  deep purple `#6929c4`, teal `#009d9a`, charcoal `#161616`, light gray.
- Low-poly geometric "bird" watermarks named after IBM Quantum processors — Nighthawk
  (hero/top), Blue Jay, Starling, Falcon, Heron, and Eagle — sit behind section header
  bands as translucent backdrops, plus an ecosystem scene illustration.
- Motion respects `prefers-reduced-motion`.

## Notes

- IBM Quantum product names and links are IBM property — fine for an interview/demo, but
  review usage rights before publishing publicly.
