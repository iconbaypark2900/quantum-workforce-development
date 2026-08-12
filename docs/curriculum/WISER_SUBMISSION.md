# Quantum Readiness Month

**Submitted to:** The Washington Institute for STEM, Entrepreneurship and Research (WISER)  
**From:** Kevin Robinson, Quantum Global Group  
**Role sought:** Quantum curriculum / workforce development  
**Program length:** 4 weeks (one course per week) · 6–8 hours/week · ~28–34 hours total  
**Live implementation:** Quantum Global Group site, `/learn` (this repository)

---

## 1. Why this program exists

The quantum workforce will not be built by PhDs alone. WISER already says this clearly: technicians, software developers, engineers, educators, business leaders, policy thinkers, communicators, and cross-disciplinary problem solvers all belong in the ecosystem — and most of them cannot see **where they fit**.

This month is the on-ramp Quantum Global Group actually teaches:

1. **Place the person** using the expertise they already have (Quantum Readiness I).
2. **Give them qubit intuition** they can hold — superposition, entanglement, interference, circuits (Qolour).
3. **Give them the industry map** — applications, limits, organizational readiness (IBM Quantum Business Foundations).
4. **Make them professional** — shared vocabulary, a classical baseline, a mapping, an optimization, a comparison.

It is designed for working professionals and career changers (the same population as the Chattanooga Quantum Ready pre-apprenticeship), not as a substitute for a physics degree.

## 2. Alignment with WISER

| WISER workforce stance | How this month implements it |
|------------------------|------------------------------|
| Help people understand **where they fit** | Course 1 Readiness Track → eight pathways (WISER career areas + Applied SME) |
| Accessible pathways, not only advanced degrees | No physics PhD prerequisite; math/code are placed, not gated |
| Connect skills to **real applications** | IBM use-case memo + Portfolio Lab baseline/benchmark |
| Layered skills (foundational → technical → applied → professional) | Weeks 1–4 follow that stack on purpose |
| Separate hype from reality | Week 4 cannot pass without a classical baseline |
| Educators, professionals, and regional partners | Education and business pathways are first-class, not afterthoughts |

WISER career areas mapped in the Readiness Track:

- Quantum Computing & Algorithms  
- Quantum Software & Tools  
- Quantum Hardware & Engineering  
- Quantum Communications & Security  
- Quantum Sensing & Measurement  
- Quantum Business, Policy & Strategy  
- Quantum Education & Communication  
- **Applied Domain Specialist** (QGG addition: finance, logistics, health, energy — bring the problem)

## 3. What was already built vs what this packet adds

The **Quantum Readiness Track** — a placement experience that asks about subject-matter expertise and returns a pathway map — is implemented in this repo at **`/learn/readiness`**. It was not present in the Portfolio Lab product tree; it now lives as a public, unauthenticated section of the Quantum Global Group Next.js site (`web/`), alongside the four-course syllabi, glossary, and classical-baseline lab.

The **Portfolio Lab** (`/portfolio`) remains the applied engine for week 4: classical objectives, QUBO+SA, VQE/QAOA-style hybrid paths, and comparison.

## 4. The four courses

### Week 1 — QR-1 · Quantum Readiness I — Find Your Fit

**Partner:** Quantum Global Group  
**Hours:** 6–8 · **Format:** assessment + orientation + learning plan  

**Outcomes**

- Locate yourself on the eight-pathway map using current expertise.  
- Distinguish compute, sensing, communications/security, and enabling software/hardware roles.  
- Write a one-page plan: primary pathway, stretch pathway, 30-day artifact, and a non-goal.  
- Explain why the workforce cannot be PhD-only.

**Lab:** complete `/learn/readiness` (seven questions: background, work pattern, math, code, motivation, contribution style, time horizon). Scores are weighted; primary + two adjacent pathways are returned with “why” evidence. Not a hiring test.

**Deliverable:** signed learning plan.  
**Assessment:** complete/incomplete on the track + scored plan (clarity, realism, honesty about gaps).

### Week 2 — QR-2 · Qubit Fundamentals (Qolour)

**Partner:** [Qolour](https://www.qolour.io/) (Qubi course + instructor-led workshops)  
**Hours:** 6–8 · **Format:** workshop + guided chapters + circuit lab  

Qolour (often heard as “Qulour”) is the hands-on qubit partner: model qubits, games, and a course that starts with *what is quantum*, measurement, superposition, the qubit, entanglement, then gates, circuits, and fidelity.

**Outcomes**

- Explain superposition, measurement, entanglement, and interference without mixing them.  
- Describe qubit vs bit, and what a gate and a circuit do.  
- Read a tiny circuit (H, X, Z, CNOT) and predict the qualitative result.  
- State fidelity and noise at practitioner level.

**Core sequence (Qubi):** 1.1–1.6; selected Chapter 2 at facilitator discretion; 3.1, 3.3, 3.4 plus H / Pauli / CNOT / measurement explainers. Workshop formats (2 hours to a day, in-person or remote kits) are used when the cohort can be gathered; otherwise the course + a facilitated game session.

**Deliverable:** one-page qubit card (four definitions + one retired misconception).  
**Assessment:** 10-item concept check + the card. Category mix-ups fail.

### Week 3 — QR-3 · Quantum Business Foundations (IBM)

**Partner:** [IBM Quantum Business Foundations](https://quantum.cloud.ibm.com/learning/courses/quantum-business-foundations)  
**Hours:** 6–8 (IBM core content ~2–3 hours; we add a seminar and a memo)  
**Credential:** IBM Quantum Business Foundations badge (Credly), exam via IBM Training  

**IBM lessons we assign, in order**

1. Start your quantum journey  
2. Introduction to quantum computing  
3. Quantum computing fundamentals  
4. Quantum technology  
5. Business impacts  
6. How to become quantum ready  
7. Exam (encouraged)

**Outcomes**

- Describe the current state of quantum computing without over-claiming advantage.  
- Identify industries and problem types under exploration (including financial services).  
- Explain IBM’s readiness levers: talent, use cases, protection against quantum threats.  
- Evaluate a candidate use case as good, premature, or the wrong problem.

**Deliverable:** ~400-word use-case memo (good vs poor choice) + badge when passed.  
**Assessment:** memo rubric. Badge recorded; a strong memo can pass the week if the exam is delayed.

### Week 4 — QR-4 · Quantum Vocabulary and the Classical Baseline

**Partner:** Quantum Global Group · Portfolio Lab  
**Hours:** 8–10 · **Format:** glossary studio + worked lab  

Two jobs share the week on purpose.

**A. Vocabulary.** The cohort must define the primary lexicon explicitly (see `/learn/glossary` and the glossary section below). No circular slogans.

**B. Classical baseline → mapping → optimize → compare.** The only workflow that makes applied quantum honest.

**Outcomes**

- Define the month’s primary vocabulary in writing.  
- State a classical baseline (problem, data, method, metric, threshold).  
- Describe how the problem maps — or fails to map — onto a quantum / hybrid algorithm.  
- Run or read an optimization and a comparison (quality, cost, runtime, robustness).  
- Write a results paragraph a skeptical engineer would accept.

**Worked example:** small equity universe in Portfolio Lab; classical objective first; QUBO+SA or VQE/QAOA path on the **same instance**; fill the benchmark table.

**Deliverable:** 3–4 page capstone brief (vocabulary appendix, baseline, mapping, optimization notes, table, go/no-go).  
**Assessment:** definition precision, baseline completeness, mapping honesty, comparison quality. A beautiful circuit with no baseline cannot pass.

## 5. Primary vocabulary (assessed)

Learners must be able to define, in their own words and without mixing categories:

Qubit · Bit · Superposition · Measurement · Entanglement · Interference · Amplitude · Quantum gate · Hadamard · CNOT · Circuit · Fidelity · Noise · NISQ · Fault tolerance · Quantum advantage · Quantum supremacy · Classical baseline · Benchmark · QUBO · QAOA · VQE · Hybrid algorithm · Quantum readiness · Use case · Post-quantum cryptography · Shot · Transpilation · Ansatz

Full definitions: `/learn/glossary` and the in-app glossary module.

## 6. What “done” looks like for a learner

| Artifact | Week |
|----------|------|
| Readiness Track result + learning plan | 1 |
| Qubit card + concept check | 2 |
| Use-case memo (+ IBM badge when earned) | 3 |
| Capstone brief with baseline table | 4 |

Optional portable credentials: IBM Quantum Business Foundations badge; QGG/WISER certificate of completion for the month (if WISER co-brands).

## 7. Facilitation model

- **Learning guide** (QGG): office hours 2× per week, plan review, capstone critique.  
- **Qolour session:** one workshop block in week 2 (live or remote kit).  
- **IBM:** self-paced with a mid-week seminar.  
- **Lab:** Portfolio Lab accounts or a shared demo tenant for week 4.  
- **Cohort size:** 12–24 for discussion quality; Readiness Track itself scales.

This matches how mixed-industry pre-apprenticeship cohorts actually run: professionals keep their day jobs, show up for structured hours, and leave with a named pathway plus evidence.

## 8. What QGG is asking of WISER

- Review this as a **modular month** that can sit inside WISER Learn / workforce pathways (Quantum 101 → this month → applied project / summer-style challenge).  
- Co-list or co-brand the Readiness Track as a public “where do I fit?” tool.  
- If useful, slot Qolour and IBM as named week partners rather than generic “guest content.”  
- Use week 4’s baseline discipline as a shared bar for applied projects in later WISER programs.

## 9. Author note

Kevin Robinson — IBM Qiskit Advocate; IBM Quantum Center HBCU mentor; Quantum Learning Guide, Chattanooga Quantum Collaborative Quantum Ready pre-apprenticeship; founder, Progression’s U STEAM Academy. This month is the curriculum form of work already done with mixed-background professionals: place them, teach the qubit, teach the business, then demand a baseline.

---

*Implementation in this repository: `web/src/app/(learn)/`, `web/src/lib/curriculum/`, `docs/curriculum/`.*
