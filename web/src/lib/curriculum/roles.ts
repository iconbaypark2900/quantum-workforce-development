import type { PathwayId } from "./types";

export interface EmployerExample {
  name: string;
  why: string;
}

export interface RoleFamily {
  pathwayId: PathwayId;
  titles: string[];
  whatTheyDo: string;
  skills: string[];
  typicalBackground: string;
  phdRequired: "usually" | "sometimes" | "rarely";
  employers: EmployerExample[];
  boards: { label: string; href: string }[];
}

export const ROLE_FAMILIES: RoleFamily[] = [
  {
    pathwayId: "applied",
    titles: [
      "Quantum use-case analyst",
      "Industry translation lead",
      "Applied scientist (domain)",
      "Quantum applications specialist",
    ],
    whatTheyDo:
      "Bring a real industry problem (finance, logistics, health, energy) and keep the classical baseline honest while a hybrid method is tried.",
    skills: [
      "Domain modeling and data literacy",
      "Classical optimization or ML baselines",
      "Problem framing / QUBO intuition",
      "Stakeholder interviews",
      "Experiment design and benchmarking",
    ],
    typicalBackground: "Working professional in the domain; quantum layered on top.",
    phdRequired: "rarely",
    employers: [
      { name: "IBM Quantum Network members", why: "Client-facing use-case workshops" },
      { name: "JPMorgan / Goldman Sachs quantum groups", why: "Portfolio, risk, and optimization research" },
      { name: "Consulting and innovation labs", why: "Translation between business and algorithms" },
      { name: "Startups in optimization / chemistry SaaS", why: "Domain + hybrid workflow" },
    ],
    boards: [
      { label: "Quantum Jobs USA", href: "https://www.quantumjobs.us/" },
      { label: "IBM Careers — quantum", href: "https://www.ibm.com/careers/search?field_keyword_05=203604" },
    ],
  },
  {
    pathwayId: "algorithms",
    titles: [
      "Quantum algorithm developer",
      "Hybrid optimization engineer",
      "Research software engineer",
      "Quantum applications scientist",
    ],
    whatTheyDo:
      "Map problems onto circuits or QUBO/Ising forms, run variational or sampling methods, and compare against classical solvers.",
    skills: [
      "Python",
      "Linear algebra and probability",
      "Qiskit / Cirq / PennyLane",
      "QAOA, VQE, Grover-style thinking",
      "Benchmarking and complexity intuition",
    ],
    typicalBackground: "CS, physics, math, or quantitative research.",
    phdRequired: "sometimes",
    employers: [
      { name: "IBM Quantum", why: "Algorithms, Qiskit, Runtime primitives" },
      { name: "Quantinuum", why: "Algorithms and chemistry/optimization" },
      { name: "Xanadu", why: "PennyLane and FTQC software" },
      { name: "National labs", why: "Research software on HPC + QPU" },
    ],
    boards: [
      { label: "Quantum Jobs USA", href: "https://www.quantumjobs.us/" },
      { label: "ORNL / lab careers", href: "https://jobs.ornl.gov/" },
    ],
  },
  {
    pathwayId: "software",
    titles: [
      "Quantum software engineer",
      "SDK / compiler engineer",
      "Cloud workflow / DevOps engineer",
      "Developer experience engineer",
    ],
    whatTheyDo:
      "Ship the platforms that make quantum usable: SDKs, transpilers, CI, APIs, observability, and cloud execution.",
    skills: [
      "Production Python (often C++/Rust)",
      "CI/CD, testing, code review",
      "Cloud (IBM Quantum Platform, Braket, Azure)",
      "Transpilation, OpenQASM, primitives",
      "Technical writing",
    ],
    typicalBackground: "Software engineer moving into quantum; PhD not the ticket.",
    phdRequired: "rarely",
    employers: [
      { name: "IBM", why: "Qiskit, Runtime, platform" },
      { name: "Amazon Braket / AWS", why: "Cloud quantum service layer" },
      { name: "Microsoft Azure Quantum", why: "Stack and developer tools" },
      { name: "IQM, Rigetti, IonQ", why: "Control software and cloud access" },
    ],
    boards: [
      { label: "LinkedIn jobs — quantum software", href: "https://www.linkedin.com/jobs/search/?keywords=quantum%20software%20engineer" },
      { label: "Qiskit GitHub (contribute first)", href: "https://github.com/Qiskit/qiskit" },
    ],
  },
  {
    pathwayId: "hardware",
    titles: [
      "Quantum hardware engineer",
      "Control / calibration engineer",
      "Cryogenics or photonics specialist",
      "Quantum engineer, experiment",
    ],
    whatTheyDo:
      "Build, calibrate, and keep qubits alive — devices, pulses, dilution fridges, optics, and measurement chains.",
    skills: [
      "Experimental physics or EE",
      "Control electronics / RF / FPGA",
      "Cryogenics or photonics (modality-specific)",
      "Python for calibration",
      "Lab practice and error budgets",
    ],
    typicalBackground: "Physics, EE, or optical engineering; lab time matters.",
    phdRequired: "usually",
    employers: [
      { name: "IQM", why: "Superconducting control and calibration" },
      { name: "IonQ / Quantinuum", why: "Trapped-ion hardware" },
      { name: "PsiQuantum / photonic startups", why: "Photonics and manufacturing" },
      { name: "Rigetti, Google Quantum AI", why: "Superconducting processors" },
    ],
    boards: [
      { label: "IQM careers", href: "https://meetiqm.com/careers/" },
      { label: "Quantum Jobs USA — hardware", href: "https://www.quantumjobs.us/" },
    ],
  },
  {
    pathwayId: "security",
    titles: [
      "Post-quantum cryptography lead",
      "Crypto-agility engineer",
      "Quantum-safe program manager",
      "Security architect",
    ],
    whatTheyDo:
      "Migrate RSA/ECC, inventory crypto, and know when QKD is a special link — not a replacement for PQC.",
    skills: [
      "Cryptography and PKI",
      "NIST PQC (ML-KEM, ML-DSA)",
      "Risk, compliance, vendors",
      "Network and certificate lifecycle",
      "Clear writing for executives",
    ],
    typicalBackground: "Cybersecurity, PKI, or network engineering.",
    phdRequired: "rarely",
    employers: [
      { name: "Enterprises with long-lived data", why: "PQC migration programs" },
      { name: "Cloudflare, Apple, Google", why: "Public PQC / TLS work" },
      { name: "Governments and defense", why: "CNSA 2.0 and inventory mandates" },
      { name: "Security consultancies", why: "Assessments and crypto-agility" },
    ],
    boards: [
      { label: "PQC / crypto-agility search", href: "https://www.linkedin.com/jobs/search/?keywords=post-quantum%20cryptography" },
    ],
  },
  {
    pathwayId: "sensing",
    titles: [
      "Quantum sensing engineer",
      "Metrology specialist",
      "Field applications scientist",
      "Instrumentation engineer",
    ],
    whatTheyDo:
      "Precision measurement — navigation, imaging, health, geology, defense — where noise and statistics are the job.",
    skills: [
      "Signal processing and statistics",
      "Lab measurement",
      "Domain physics (atomic, NV, photonics)",
      "Error analysis",
      "Field support",
    ],
    typicalBackground: "Instrumentation, medical devices, geoscience, or defense electronics.",
    phdRequired: "sometimes",
    employers: [
      { name: "Sensing startups and defense primes", why: "Magnetometry, gravimetry, timing" },
      { name: "National labs", why: "Metrology programs" },
      { name: "Medical / imaging firms", why: "Quantum-enhanced measurement" },
    ],
    boards: [
      { label: "Quantum Jobs USA", href: "https://www.quantumjobs.us/" },
    ],
  },
  {
    pathwayId: "business",
    titles: [
      "Quantum program manager",
      "Partnerships / BD lead",
      "Innovation strategist",
      "Policy analyst",
    ],
    whatTheyDo:
      "Decide what to fund, who to partner with, and how the organization becomes quantum ready without buying hype.",
    skills: [
      "Use-case evaluation",
      "Roadmapping and procurement",
      "Stakeholder communication",
      "IBM Business Foundations-level literacy",
      "Ethics and governance",
    ],
    typicalBackground: "Product, strategy, policy, or investment; not a physicist.",
    phdRequired: "rarely",
    employers: [
      { name: "IBM Quantum Network companies", why: "Internal quantum champions" },
      { name: "VC / corporate venture", why: "Diligence on quantum startups" },
      { name: "WISER-style workforce orgs", why: "Program design" },
      { name: "Government innovation offices", why: "Policy and regional strategy" },
    ],
    boards: [
      { label: "LinkedIn — quantum program manager", href: "https://www.linkedin.com/jobs/search/?keywords=quantum%20program%20manager" },
    ],
  },
  {
    pathwayId: "education",
    titles: [
      "Curriculum designer",
      "Quantum learning guide",
      "Science communicator",
      "Outreach / workforce coordinator",
    ],
    whatTheyDo:
      "Open the door: teach, facilitate, host Fall Fest, write the glossary, and keep mixed-background cohorts moving.",
    skills: [
      "Instructional design",
      "Facilitation",
      "Qiskit or Black Opal as a teaching tool",
      "Assessment design",
      "Community building",
    ],
    typicalBackground: "Educators, community builders, Qiskit Advocates.",
    phdRequired: "rarely",
    employers: [
      { name: "Universities and HBCUs", why: "Qiskit Fall Fest, classroom accounts" },
      { name: "IBM Quantum Education", why: "Modules, advocates, events" },
      { name: "Q-CTRL (Black Opal)", why: "Education platform" },
      { name: "Nonprofits (WISER, CQC)", why: "Workforce programs" },
    ],
    boards: [
      { label: "Qiskit Advocate program", href: "https://www.ibm.com/quantum/blog/qiskit-advocate-program" },
    ],
  },
];

export function roleFamilyFor(id: PathwayId): RoleFamily | undefined {
  return ROLE_FAMILIES.find((r) => r.pathwayId === id);
}
