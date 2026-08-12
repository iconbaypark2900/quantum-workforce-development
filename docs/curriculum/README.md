# Quantum workforce curriculum

Public site (this repo’s Next app): **`/learn`**

| Path | What it is |
|------|------------|
| [`/learn`](../../web/src/app/(learn)/learn/page.tsx) | Program home |
| [`/learn/readiness`](../../web/src/app/(learn)/learn/readiness/page.tsx) | Quantum Readiness Track (SME-fit assessment) |
| [`/learn/courses`](../../web/src/app/(learn)/learn/courses/page.tsx) | Four-course index |
| [`/learn/courses/[slug]`](../../web/src/app/(learn)/learn/courses/[slug]/page.tsx) | Week syllabi |
| [`/learn/glossary`](../../web/src/app/(learn)/learn/glossary/page.tsx) | Primary vocabulary |
| [`/learn/baseline`](../../web/src/app/(learn)/learn/baseline/page.tsx) | Classical → quantum lab steps |

Scoring and content live in [`web/src/lib/curriculum/`](../../web/src/lib/curriculum/).

## Documents for WISER

| File | Use |
|------|-----|
| [WISER_SUBMISSION.md](WISER_SUBMISSION.md) | **Send this.** Cover letter, program design, four syllabi, calendar, outcomes. |
| [WEEKLY_CALENDAR.md](WEEKLY_CALENDAR.md) | Facilitator week-by-week schedule |
| [ASSESSMENT_AND_RUBRICS.md](ASSESSMENT_AND_RUBRICS.md) | Deliverables and scoring |
| [PARTNER_ATTRIBUTIONS.md](PARTNER_ATTRIBUTIONS.md) | Qolour, IBM, WISER alignment, what QGG owns |

## Local preview

```bash
cd web && npm install
# from repo root:
./scripts/run-next-web.sh
# open http://localhost:3042/learn
```
