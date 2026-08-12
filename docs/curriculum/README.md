# Quantum workforce curriculum

## GitHub or the company website?

**Both, with different jobs.**

| Place | Who it is for | What lives there |
|-------|----------------|------------------|
| **Company website (`/learn`)** | Learners, WISER, employers | Career Navigator, Readiness Track, roles/hiring, pathway, courses, classroom, events |
| **This GitHub repo** | Facilitators, partners, version control | Syllabi, rubrics, reference PDFs, source for the site |

Public for learners has two layers:

1. **Career Navigator (today):** [QuantumKev/ibm-quantum-navigation](https://github.com/QuantumKev/ibm-quantum-navigation) is already a **public** repo. Turn on GitHub Pages (Settings → Pages → Deploy from a branch → `main` / `/` root). Live URL: [https://quantumkev.github.io/ibm-quantum-navigation/](https://quantumkev.github.io/ibm-quantum-navigation/). Same app is also at `/learn/navigator` once `web/` is deployed.
2. **Full `/learn` month:** deploy the Next `web/` app (`./scripts/vercel-deploy-web.sh` or Fly per `docs/FLY_DEPLOY.md`). Merging this branch is not that deploy. The org repo `Quantum-Global-Group/quantum-hybrid-portfolio` is still **private** — WISER cannot open the packet on GitHub until someone with admin flips **Settings → General → Danger zone → Change repository visibility → Public**.

Do not put the learner experience only on GitHub — mixed-background cohorts will not clone a repo to find where they fit. Do not put only a pretty site with no repo — WISER and IBM Classroom need a citable packet.

## Live routes

| Path | What it is |
|------|------------|
| `/learn` | Program home |
| `/learn/navigator` | Career Navigator (same SPA as [QuantumKev/ibm-quantum-navigation](https://github.com/QuantumKev/ibm-quantum-navigation); public Pages: [quantumkev.github.io/ibm-quantum-navigation](https://quantumkev.github.io/ibm-quantum-navigation/)) |
| `/learn/readiness` | WISER-aligned eight-pathway SME-fit quiz (complement) |
| `/learn/roles` | Role families, skills, example employers |
| `/learn/pathway` | Ecosystem one-pager (university vs industry) |
| `/learn/courses` | Four-week syllabi |
| `/learn/glossary` | Vocabulary |
| `/learn/baseline` | Classical → quantum lab |
| `/learn/classroom` | IBM Classroom, Black Opal, Enigmas, Qulture lessons, PDFs |
| `/learn/next` | Hubs, LinkedIn, Fall Fest, Summer School, C1000-179, Advocate |

## Documents for WISER

| File | Use |
|------|-----|
| [WISER_SUBMISSION.md](WISER_SUBMISSION.md) | **Send this.** |
| [WEEKLY_CALENDAR.md](WEEKLY_CALENDAR.md) | Facilitator calendar |
| [ASSESSMENT_AND_RUBRICS.md](ASSESSMENT_AND_RUBRICS.md) | Rubrics |
| [PARTNER_ATTRIBUTIONS.md](PARTNER_ATTRIBUTIONS.md) | Partners |
| [references/README.md](references/README.md) | PDFs / PPTX inventory |

## Local preview

```bash
./scripts/run-next-web.sh
# http://localhost:3042/learn
```
