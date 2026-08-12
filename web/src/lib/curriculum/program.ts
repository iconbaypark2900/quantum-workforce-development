import type { Course, CourseSlug } from "./types";

export const PROGRAM = {
  name: "Quantum Readiness Month",
  org: "Quantum Global Group",
  audience:
    "Working professionals, career changers, educators, and domain specialists who need a legitimate on-ramp into the quantum workforce — without a physics PhD as the ticket.",
  duration: "4 weeks · ~6–8 hours per week",
  promise:
    "Find where your subject-matter expertise already fits, build qubit intuition, learn the business map, then speak and measure quantum with a classical baseline.",
} as const;

export const COURSES: Course[] = [
  {
    slug: "quantum-readiness",
    week: 1,
    code: "QR-1",
    title: "Quantum Readiness I — Find Your Fit",
    subtitle: "Subject-matter expertise first. Job titles second.",
    partner: "Quantum Global Group",
    hours: "6–8 hours",
    format: "Guided self-assessment, live orientation, personal learning plan",
    summary:
      "Most people meet quantum as a wall of physics. This course starts the other way: what you already know, how that knowledge shows up in the quantum ecosystem, and which of eight pathways is the honest next step. The Readiness Track on this site is the primary lab.",
    whyThisWeek:
      "Workforce programs fail when everyone is treated as a future algorithm researcher. Week 1 names the real roles — applied SME, software, hardware, security, sensing, business, education, algorithms — so the rest of the month has a reason.",
    learningOutcomes: [
      "Locate yourself on the Quantum Global Group / WISER-aligned pathway map using current expertise, not aspiration alone.",
      "Distinguish quantum computing, sensing, communications/security, and enabling software/hardware roles.",
      "Write a one-page learning plan that states a target pathway, a stretch pathway, and a non-goal.",
      "Explain, in plain language, why the quantum workforce cannot be built by PhDs alone.",
    ],
    modules: [
      {
        title: "The ecosystem is wider than the lab",
        duration: "90 min",
        outcomes: [
          "Name the eight pathways and one example role in each.",
          "Separate compute hype from sensing, PQC, and tooling work.",
        ],
        activities: [
          "Read the pathway cards on /learn.",
          "Watch or facilitate a 20-minute orientation: “where people actually get hired.”",
        ],
      },
      {
        title: "Run the Quantum Readiness Track",
        duration: "60–90 min",
        outcomes: [
          "Complete the SME-fit assessment.",
          "Interpret primary and secondary pathway scores without treating them as destiny.",
        ],
        activities: [
          "Complete /learn/readiness.",
          "Save or screenshot the result card for the cohort folder.",
        ],
      },
      {
        title: "Personal learning plan",
        duration: "2 hours",
        outcomes: [
          "State a 30-day goal tied to a real role family.",
          "Identify one skill you already have that the field is short on.",
        ],
        activities: [
          "Fill the learning-plan template (problem, pathway, evidence you will produce in week 4).",
          "Optional 25-minute office hours with the learning guide.",
        ],
      },
    ],
    deliverable:
      "Signed learning plan: primary pathway, secondary pathway, 30-day artifact, and a sentence on what you will not try to become this month.",
    assessment:
      "Complete / incomplete on the Readiness Track plus a scored learning plan (clarity of fit, realism of artifact, honesty about gaps).",
  },
  {
    slug: "qubit-fundamentals",
    week: 2,
    code: "QR-2",
    title: "Qubit Fundamentals — Superposition, Entanglement, Interference, Circuits",
    subtitle: "Hands-on intuition before formalism.",
    partner: "Qolour",
    partnerUrl: "https://www.qolour.io/",
    hours: "6–8 hours",
    format: "Qolour / Qubi workshop + guided course chapters + circuit lab",
    summary:
      "Week 2 is the physics-without-the-gatekeeping week. Using Qolour’s qubit workshops and the Qubi course, learners hold the ideas — superposition, measurement, entanglement, interference, gates, and simple circuits — before anyone asks them to write a Hamiltonian.",
    whyThisWeek:
      "Business and baseline work only stick if people share a physical picture of a qubit. Qolour’s model qubits and games are the fastest path we have seen for mixed-background cohorts.",
    learningOutcomes: [
      "Explain superposition, measurement, entanglement, and interference without mixing them up.",
      "Describe a qubit versus a bit, and what a gate and a circuit actually do.",
      "Read a tiny circuit (H, X, Z, CNOT) and predict the qualitative result.",
      "State what fidelity and noise mean at a practitioner level.",
    ],
    modules: [
      {
        title: "What is quantum, and what is a qubit?",
        duration: "2 hours",
        outcomes: [
          "Contrast classical bits with qubits.",
          "Connect measurement to the loss of superposition.",
        ],
        activities: [
          "Qolour Qubi course: 1.1–1.4 (what is quantum, measurement, qubit, math of a qubit).",
          "Workshop game: discover the rules by play, not lecture.",
        ],
      },
      {
        title: "Entanglement, interference, and no-signaling",
        duration: "2 hours",
        outcomes: [
          "Give a working definition of entanglement that a colleague could repeat.",
          "Say what interference is for in algorithms, not only in physics class.",
        ],
        activities: [
          "Qubi course: 1.5–1.6 and selected Chapter 2 (Bell, at facilitator discretion).",
          "Pair discussion: “what entanglement is not.”",
        ],
      },
      {
        title: "Gates, circuits, and fidelity",
        duration: "2–3 hours",
        outcomes: [
          "Identify Hadamard, Pauli, and CNOT by what they are for.",
          "Relate circuit depth and noise to why NISQ experiments need baselines.",
        ],
        activities: [
          "Qubi course: 3.1, 3.3, 3.4 plus gate explainers (H, X, Z, CNOT, measurement).",
          "Optional: build the same tiny circuit in a simulator after the physical model.",
        ],
      },
    ],
    deliverable:
      "One-page “qubit card”: four definitions in your own words (superposition, entanglement, interference, circuit) plus one misconception you used to hold.",
    assessment:
      "Short concept check (10 items) plus the qubit card. Passing = no category mix-ups (e.g. calling entanglement “a vibe” or superposition “being in two cities”).",
  },
  {
    slug: "business-foundations",
    week: 3,
    code: "QR-3",
    title: "Quantum Business Foundations",
    subtitle: "Where the technology actually sits in industry — and how to become quantum ready.",
    partner: "IBM Quantum",
    partnerUrl: "https://quantum.cloud.ibm.com/learning/courses/quantum-business-foundations",
    hours: "6–8 hours (IBM course is ~2–3 hours of core content; we add application)",
    format: "IBM Quantum Business Foundations + cohort seminar + use-case memo",
    summary:
      "IBM’s Quantum Business Foundations course is the cleanest public map of the paradigm, the hardware/software stack, industry applications, and organizational readiness. We do not rewrite it. We teach it, then force a written judgment: what is a good use case for your domain, and what is a poor one.",
    whyThisWeek:
      "After qubit intuition, people need the market and the org chart. IBM’s badge also gives the cohort a portable credential that hiring managers already recognize.",
    learningOutcomes: [
      "Describe the current state of quantum computing without over-claiming advantage.",
      "Identify industries and problem types where quantum is being explored (including financial services).",
      "Explain IBM’s three readiness levers: talent, use cases, and protecting against quantum threats.",
      "Evaluate a candidate use case as good, premature, or the wrong problem.",
    ],
    modules: [
      {
        title: "Start the journey and the computing paradigm",
        duration: "2 hours",
        outcomes: [
          "Complete IBM lessons: Start your quantum journey; Introduction to quantum computing.",
          "Restate why quantum will not replace classical computers.",
        ],
        activities: ["IBM course modules 1–2.", "Journal: one claim you will stop repeating."],
      },
      {
        title: "Fundamentals, technology, and business impact",
        duration: "2–3 hours",
        outcomes: [
          "Connect week-2 qubit language to IBM’s technology lesson.",
          "Name two industry applications relevant to your SME.",
        ],
        activities: [
          "IBM lessons: Quantum computing fundamentals; Quantum technology; Business impacts.",
          "Seminar: financial services, optimization, chemistry — what is real now.",
        ],
      },
      {
        title: "How to become quantum ready + badge exam",
        duration: "2 hours",
        outcomes: [
          "Map strategy, technology, and operations capabilities from the IBM readiness lesson.",
          "Sit the IBM Training exam (optional but strongly encouraged).",
        ],
        activities: [
          "IBM lesson: How to become quantum ready.",
          "Write a 400-word use-case memo for your organization or a chosen sector.",
          "Exam at IBM Training for the Credly badge.",
        ],
      },
    ],
    deliverable:
      "Use-case memo (good choice vs poor choice) plus, when passed, the IBM Quantum Business Foundations badge.",
    assessment:
      "Memo rubric (strategic importance, scalability, hybrid near-term path, honesty about hardware limits). Badge is recorded but not required to pass the month if the memo is strong.",
  },
  {
    slug: "vocabulary-and-baseline",
    week: 4,
    code: "QR-4",
    title: "Quantum Vocabulary and the Classical Baseline",
    subtitle: "Say the words precisely. Then prove a result the old way before you claim a new one.",
    partner: "Quantum Global Group · Portfolio Lab",
    hours: "8–10 hours",
    format: "Glossary studio + worked lab on classical → quantum mapping, optimization, and benchmarking",
    summary:
      "Two jobs share this week on purpose. First, the cohort locks a shared vocabulary — the words that get abused in decks and papers. Second, learners walk the only workflow that makes applied quantum honest: define a classical baseline, map the problem toward a quantum algorithm or quantum computer, optimize, and compare. The Quantum Hybrid Portfolio lab is the reference implementation.",
    whyThisWeek:
      "A readiness program that ends on inspiration is incomplete. Week 4 is the professional habit: language + baseline + mapping + benchmark.",
    learningOutcomes: [
      "Define the primary vocabulary of the month in writing, with no circular definitions.",
      "State a classical baseline for a chosen problem, including metric, data, and method.",
      "Describe how that problem maps (or fails to map) onto a quantum / hybrid algorithm.",
      "Run or read an optimization and a comparison (quality, cost, runtime, robustness).",
      "Write a results paragraph that a skeptical engineer would accept.",
    ],
    modules: [
      {
        title: "Vocabulary studio",
        duration: "2 hours",
        outcomes: [
          "Produce exact definitions for the core lexicon (see /learn/glossary).",
          "Catch three common misuses (quantum supremacy vs advantage, annealing vs gate-model, etc.).",
        ],
        activities: [
          "Closed-book definition drill.",
          "Peer review: swap cards and mark vagueness.",
        ],
      },
      {
        title: "Define the classical baseline",
        duration: "2 hours",
        outcomes: [
          "Write problem, data, method, metric, and success threshold.",
          "Explain why a quantum claim without this paragraph is incomplete.",
        ],
        activities: [
          "Worked example: Markowitz / min-variance / HRP on a small ticker universe.",
          "Learners draft the same five fields for their own SME problem (or the portfolio example).",
        ],
      },
      {
        title: "Map, optimize, compare",
        duration: "3–4 hours",
        outcomes: [
          "Describe QUBO / variational mapping at a conceptual level.",
          "Compare at least two methods on the same instance.",
        ],
        activities: [
          "Portfolio Lab: classical objective vs QUBO+SA / VQE / QAOA path (simulator is enough).",
          "Fill the benchmark table: metric, runtime, feasibility, notes on noise.",
          "Office hours: “is this a good use case or a demo?”",
        ],
      },
    ],
    deliverable:
      "Capstone brief (3–4 pages or equivalent slides): vocabulary appendix, classical baseline, mapping, optimization notes, benchmark table, and a go / no-go recommendation.",
    assessment:
      "Rubric on definition precision, baseline completeness, mapping honesty, and comparison quality. A beautiful circuit with no baseline cannot pass.",
  },
];

export function courseBySlug(slug: string): Course | undefined {
  return COURSES.find((c) => c.slug === slug);
}

export const COURSE_SLUGS: CourseSlug[] = COURSES.map((c) => c.slug);
