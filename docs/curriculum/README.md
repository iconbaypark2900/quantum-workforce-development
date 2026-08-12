# Quantum workforce curriculum

## GitHub or the company website?

**Both, with different jobs.**

| Place | Who it is for | What lives there |
|-------|----------------|------------------|
| **Company website (`/learn`)** | Learners, WISER, employers | Career Navigator, Readiness Track, roles/hiring, pathway, courses, classroom, events |
| **This GitHub repo** | Facilitators, partners, version control | Syllabi, rubrics, reference PDFs, source for the site |

Public for learners has two layers:

1. **This GitHub repo (today):** [Quantum-Global-Group/quantum-hybrid-portfolio](https://github.com/Quantum-Global-Group/quantum-hybrid-portfolio) is **public**. Packet: [`docs/curriculum/WISER_SUBMISSION.md`](WISER_SUBMISSION.md). Until this branch is merged, send the PR: [pull/4](https://github.com/Quantum-Global-Group/quantum-hybrid-portfolio/pull/4).
2. **Career Navigator:** [QuantumKev/ibm-quantum-navigation](https://github.com/QuantumKev/ibm-quantum-navigation) (public). GitHub Pages (Settings → Pages → `main` / root): [https://quantumkev.github.io/ibm-quantum-navigation/](https://quantumkev.github.io/ibm-quantum-navigation/). Same app at `/learn/navigator` once `web/` is deployed.
3. **Full `/learn` month in a browser:** deploy the Next `web/` app (`./scripts/vercel-deploy-web.sh` or Fly per `docs/FLY_DEPLOY.md`). A public GitHub repo is not the same as `https://<host>/learn`.

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
