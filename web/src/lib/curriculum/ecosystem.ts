import type { PathwayId } from "./types";

/** Canonical interactive navigator (public): QuantumKev/ibm-quantum-navigation. */
export const NAVIGATION_REPO = {
  owner: "QuantumKev",
  name: "ibm-quantum-navigation",
  href: "https://github.com/QuantumKev/ibm-quantum-navigation",
} as const;

/** Static SPA vendored at web/public/learn/navigator. */
export const NAVIGATOR_HREF = "/learn/navigator" as const;

/** Encoded from Quantum Global Group “IBM Quantum Ecosystem Navigation Framework” one-pager. */
export const ECOSYSTEM_PATHWAY = {
  title: "IBM Quantum Ecosystem Navigation Framework",
  goal: "Help learners, universities, and employers navigate the quantum ecosystem from curiosity to contribution.",
  source: "docs/curriculum/references/Quantum_Ecosystem_Pathway_OnePager.pptx",
  repo: NAVIGATION_REPO.href,
  live: NAVIGATOR_HREF,
} as const;

export const ECOSYSTEM_STEPS = [
  {
    id: "interests",
    title: "Start with interests",
    body: "Name the subject you already care about — medicine, finance, music, logistics, security — before you pick a quantum job title. The Career Navigator does this first; the eight-pathway quiz is the WISER-aligned complement.",
  },
  {
    id: "learn",
    title: "IBM Learning + Composer + Qiskit",
    body: "Build literacy on IBM Quantum Learning, play in Composer, then write circuits in Qiskit. Classroom Accounts let a whole cohort touch real hardware without student credit cards.",
  },
  {
    id: "choose",
    title: "Choose a path",
    body: "University path (MS/PhD, faculty, research labs) or industry path (internships, IBM Quantum Network, employment). Most working professionals in this month take the industry path and keep the university path as a later option.",
  },
  {
    id: "contribute",
    title: "Projects, Advocate, research",
    body: "Contribution is the product: hackathons, Fall Fest, Summer School, GitHub, and the Qiskit Advocate program. Research projects sit here too — including the Portfolio Lab baseline work.",
  },
] as const;

export const UNIVERSITY_PATH = [
  "MS / PhD in physics, CS, EE, or a domain + quantum minor",
  "Faculty and teaching (IBM Classroom Account)",
  "Research labs and national-lab internships",
] as const;

export const INDUSTRY_PATH = [
  "Internships and apprenticeships (including Quantum Ready pre-apprenticeship models)",
  "IBM Quantum Network member companies",
  "Employment in software, applications, security, or program roles",
] as const;

export const PATHWAY_TO_ECOSYSTEM: Record<
  PathwayId,
  { fork: "university" | "industry" | "either"; note: string }
> = {
  applied: { fork: "industry", note: "Stay close to the domain employer; internships inside the industry beat a second degree for most." },
  algorithms: { fork: "either", note: "Industry for hybrid solvers; university/lab if you want theory depth." },
  software: { fork: "industry", note: "Ship code. Contribute to Qiskit. Sit C1000-179." },
  hardware: { fork: "university", note: "Lab time and often a graduate degree; internships at hardware vendors." },
  security: { fork: "industry", note: "PQC programs live in enterprises and government, not only in physics departments." },
  sensing: { fork: "either", note: "Instrumentation employers and national labs both hire." },
  business: { fork: "industry", note: "IBM Network, strategy, and workforce orgs." },
  education: { fork: "either", note: "Teach in universities or run nonprofit / Advocate community programs." },
};
