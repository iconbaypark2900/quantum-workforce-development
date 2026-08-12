import type { PathwayId } from "./types";

export interface Opportunity {
  id: string;
  name: string;
  kind: "hackathon" | "summer-school" | "festival" | "credential" | "community" | "classroom";
  when: string;
  where: string;
  href: string;
  who: string;
  pathways: PathwayId[] | "all";
}

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "qgss",
    name: "Qiskit Global Summer School",
    kind: "summer-school",
    when: "Annual (2026 ran 13–24 July; watch IBM Quantum blog for the next cohort)",
    where: "Virtual, global",
    href: "https://www.ibm.com/quantum/blog/qiskit-summer-school-2026",
    who: "Students, researchers, developers — beginner track available",
    pathways: "all",
  },
  {
    id: "fall-fest",
    name: "Qiskit Fall Fest",
    kind: "festival",
    when: "October–November each year (2026 host cycle: events Oct–Nov)",
    where: "Local campuses and communities worldwide — attend or host",
    href: "https://github.com/QuantumKev/qiskitFallFest",
    who: "Students, educators, community leads. QGG workshop notebooks (Colab + IBMid) live in QuantumKev/qiskitFallFest.",
    pathways: "all",
  },
  {
    id: "qiskit-hackathons",
    name: "IBM / Qiskit hackathons and challenges",
    kind: "hackathon",
    when: "Rolling — IBM Quantum Developer Conference, regional challenges",
    where: "Virtual + regional",
    href: "https://www.ibm.com/quantum/blog",
    who: "Builders who need a public project on GitHub",
    pathways: ["algorithms", "software", "applied", "education"],
  },
  {
    id: "c1000-179",
    name: "IBM Certified Associate Developer — Quantum Computation using Qiskit v2.X (C1000-179)",
    kind: "credential",
    when: "On demand via Pearson VUE after the assessment exam",
    where: "Online / test center",
    href: "https://www.ibm.com/quantum/blog/qiskit-v2x-developer-certification",
    who: "Software and algorithms pathways; required to advance past Advocate Tier 0",
    pathways: ["software", "algorithms", "education"],
  },
  {
    id: "advocate",
    name: "Qiskit Advocate Program (v2.0)",
    kind: "community",
    when: "Applications year-round, reviewed monthly",
    where: "Global (Discord + events)",
    href: "https://www.ibm.com/quantum/blog/qiskit-advocate-program",
    who: "Need Basics of Quantum Information, Fundamentals of Quantum Algorithms, QGSS Excellence badge, or C1000-179",
    pathways: "all",
  },
  {
    id: "classroom",
    name: "IBM Quantum Classroom Account",
    kind: "classroom",
    when: "Educator application; 365-day instance, 10 min QPU / 28 days per student",
    where: "IBM Quantum Platform — no student credit card",
    href: "https://quantum.cloud.ibm.com/docs/en/guides/classroom-accounts",
    who: "This cohort: QGG holds Classroom approval to provision hardware access",
    pathways: "all",
  },
  {
    id: "business-foundations",
    name: "IBM Quantum Business Foundations badge",
    kind: "credential",
    when: "Self-paced (~2–3 hours) + IBM Training exam",
    where: "IBM Quantum Learning",
    href: "https://quantum.cloud.ibm.com/learning/courses/quantum-business-foundations",
    who: "Week 3 of this month — all pathways",
    pathways: "all",
  },
  {
    id: "enigmas",
    name: "Quantum Enigmas (IBM SkillsBuild + coding labs)",
    kind: "classroom",
    when: "Self-paced puzzles; coding track uses Qiskit",
    where: "https://enigmesquantiques.com/en/",
    href: "https://enigmesquantiques.com/en/",
    who: "Week 2–3 practice; education and software pathways especially",
    pathways: ["education", "software", "algorithms"],
  },
  {
    id: "black-opal",
    name: "Q-CTRL Black Opal",
    kind: "classroom",
    when: "Self-paced; free intro then Pro / educator cohort",
    where: "https://q-ctrl.com/black-opal",
    href: "https://q-ctrl.com/black-opal",
    who: "Interactive fundamentals (superposition, qubits, entanglement, circuits, noise, programming)",
    pathways: ["algorithms", "software", "education", "applied"],
  },
];

export const CERT_OBJECTIVES = [
  { section: "1. Perform quantum operations", weight: "16%", tasks: ["Define Pauli operators", "Apply quantum operations"] },
  { section: "2. Visualize circuits, measurements, and states", weight: "11%", tasks: ["Circuits", "Measurements", "States (Bloch, Q-sphere)"] },
  { section: "3. Create quantum circuits", weight: "18%", tasks: ["Dynamic circuits", "Parameterized circuits", "Transpile and optimize", "Basic circuits"] },
  { section: "4. Run quantum circuits", weight: "15%", tasks: ["Session / batch / priority modes", "Runtime primitives and broadcasting"] },
  { section: "5. Sampler primitive", weight: "12%", tasks: ["Options (e.g. dynamical decoupling)", "Theory of Sampler"] },
  { section: "6. Estimator primitive", weight: "12%", tasks: ["Options (resilience, ZNE)", "Theory of Estimator"] },
  { section: "7. Retrieve and analyze results", weight: "10%", tasks: ["Prior jobs / sessions", "Monitor jobs"] },
  { section: "8. Operate with OpenQASM", weight: "6%", tasks: ["OpenQASM 3 types", "Semantics", "Interoperate with Qiskit", "Runtime REST API"] },
];

export const LINKEDIN_MOVES = [
  {
    title: "Headline that names the pathway, not ‘quantum enthusiast’",
    body: "Example: ‘Portfolio analyst exploring quantum optimization | IBM Business Foundations | Qiskit’ or ‘Software engineer | Qiskit v2 | seeking quantum SDK roles’.",
  },
  {
    title: "Feature the month’s artifacts",
    body: "Learning plan, qubit card, use-case memo, capstone brief with baseline table, GitHub repo from a hackathon or Fall Fest.",
  },
  {
    title: "Follow the rooms where jobs are posted",
    body: "IBM Quantum, Qiskit, WISER, Chattanooga Quantum Collaborative, Q-CTRL, IQM — then comment with substance, not emoji-only.",
  },
  {
    title: "Ask for informational conversations after the Track",
    body: "Once you know the role family, message people in that family in your region. Attach the one-pager, not a cold ‘any jobs?’",
  },
];

export interface RegionHub {
  id: string;
  name: string;
  region: string;
  fits: PathwayId[];
  assets: string[];
  next: string;
}

export const REGION_HUBS: RegionHub[] = [
  {
    id: "miami",
    name: "Miami / South Florida",
    region: "Southeast US",
    fits: ["applied", "education", "software", "business"],
    assets: [
      "Miami Dade College Qiskit Fall Fest history",
      "Florida Memorial University × IBM HBCU Quantum Center",
      "Progression’s U / QGG facilitation",
    ],
    next: "Best first stop for education, applied finance, and community hosting.",
  },
  {
    id: "chattanooga",
    name: "Chattanooga / Hamilton County",
    region: "Tennessee",
    fits: ["applied", "business", "software"],
    assets: [
      "Chattanooga Quantum Collaborative",
      "Quantum Ready pre-apprenticeship (DOL framework)",
      "Industry cohort: healthcare, logistics, energy, manufacturing",
    ],
    next: "Best for working professionals who will take quantum back into an existing company.",
  },
  {
    id: "dc",
    name: "Washington, DC / WISER network",
    region: "Mid-Atlantic + global virtual",
    fits: ["education", "business", "security"],
    assets: [
      "WISER Learn, summer programs, executive education",
      "Policy and workforce partners",
    ],
    next: "Best for educators, policy, and stacked credentials after this month.",
  },
  {
    id: "virtual-ibm",
    name: "IBM Quantum Platform (virtual)",
    region: "Anywhere with a Classroom or Open Plan account",
    fits: ["algorithms", "software", "education", "applied"],
    assets: [
      "QPU minutes via Classroom Account",
      "Learning courses, Composer, Runtime",
      "Advocate Discord after acceptance",
    ],
    next: "Hardware access is not geography-limited. Use it for week 2–4 labs.",
  },
];

export function opportunitiesFor(id: PathwayId): Opportunity[] {
  return OPPORTUNITIES.filter((o) => o.pathways === "all" || o.pathways.includes(id));
}

export function hubsFor(id: PathwayId): RegionHub[] {
  return REGION_HUBS.filter((h) => h.fits.includes(id));
}
