# Quantum workforce curriculum

## GitHub or the company website?

**Both, with different jobs.**

| Place | Who it is for | What lives there |
|-------|----------------|------------------|
| **Company website (`/learn`)** | Learners, WISER, employers | Readiness Track, roles/hiring, pathway, courses, classroom, events |
| **This GitHub repo** | Facilitators, partners, version control | Syllabi, rubrics, reference PDFs, source for the site |

Do not put the learner experience only on GitHub — mixed-background cohorts will not clone a repo to find where they fit. Do not put only a pretty site with no repo — WISER and IBM Classroom need a citable packet.

Public for learners = **deploy the Next `web/` app** so `https://<your-web-host>/learn` resolves. Merging this branch is not the same as a production deploy (`./scripts/vercel-deploy-web.sh` or Fly per `docs/FLY_DEPLOY.md`).

## Live routes

| Path | What it is |
|------|------------|
| `/learn` | Program home |
| `/learn/readiness` | SME-fit Readiness Track |
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
