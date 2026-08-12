import type { Pathway, PathwayId } from "./types";

export const PATHWAY_DISPLAY_ORDER: PathwayId[] = [
  "applied",
  "algorithms",
  "software",
  "business",
  "education",
  "security",
  "hardware",
  "sensing",
];

export const PATHWAYS: Record<PathwayId, Pathway> = {
  algorithms: {
    id: "algorithms",
    name: "Quantum Computing & Algorithms",
    shortName: "Algorithms",
    tagline: "Turn hard computational problems into circuits, mappings, and hybrid solvers.",
    whoItFits:
      "People who already think in models, optimization, simulation, or code — and want to learn how those problems map onto qubits.",
    exampleRoles: [
      "Quantum algorithm developer",
      "Hybrid optimization engineer",
      "Research software engineer",
      "Quantitative researcher exploring quantum methods",
    ],
    adjacentSkills: [
      "Linear algebra",
      "Python",
      "Optimization",
      "Complexity / algorithms",
      "Benchmarking",
    ],
    monthEmphasis:
      "Lean into Qolour circuit intuition in week 2, then use week 4 to map a classical solver onto a QUBO / variational form and compare results.",
  },
  software: {
    id: "software",
    name: "Quantum Software & Tools",
    shortName: "Software",
    tagline: "Build the platforms, SDKs, workflows, and user-facing systems that make quantum usable.",
    whoItFits:
      "Software engineers, platform, DevOps, and tooling people who can ship reliable systems and want to sit next to the quantum stack.",
    exampleRoles: [
      "Quantum software engineer",
      "SDK / compiler contributor",
      "Cloud workflow engineer",
      "Developer-experience lead",
    ],
    adjacentSkills: [
      "Python or systems programming",
      "APIs and cloud",
      "CI/CD",
      "Observability",
      "Technical writing",
    ],
    monthEmphasis:
      "Treat IBM Business Foundations as product context, then use the Portfolio Lab in week 4 as a real hybrid workflow to instrument, reproduce, and explain.",
  },
  hardware: {
    id: "hardware",
    name: "Quantum Hardware & Engineering",
    shortName: "Hardware",
    tagline: "Devices, control electronics, cryogenics, photonics, and the systems that keep qubits alive.",
    whoItFits:
      "Physicists, electrical / optical / mechanical engineers, and lab technicians who already work close to instruments.",
    exampleRoles: [
      "Quantum hardware engineer",
      "Control systems engineer",
      "Cryogenics / dilution technician",
      "Photonics or fabrication specialist",
    ],
    adjacentSkills: [
      "Electronics",
      "Lab practice",
      "Materials",
      "Signal integrity",
      "Measurement",
    ],
    monthEmphasis:
      "Use Qolour to lock superposition, measurement, and fidelity in physical terms, then connect week 3 hardware-vs-simulator language to week 4 noise and benchmarking.",
  },
  security: {
    id: "security",
    name: "Quantum Communications & Security",
    shortName: "Security",
    tagline: "Cryptography, networks, post-quantum migration, and the governance of quantum risk.",
    whoItFits:
      "Cybersecurity, PKI, compliance, and network people who need to separate hype from harvest-now-decrypt-later reality.",
    exampleRoles: [
      "Post-quantum cryptography lead",
      "Crypto-agility engineer",
      "Quantum-safe program manager",
      "Security architect",
    ],
    adjacentSkills: [
      "Cryptography",
      "Risk and compliance",
      "PKI",
      "Vendor assessment",
      "Technical communication",
    ],
    monthEmphasis:
      "Keep Qolour entanglement / no-cloning intuition, then use IBM Business Foundations to frame organizational readiness and PQC as a parallel track to compute.",
  },
  sensing: {
    id: "sensing",
    name: "Quantum Sensing & Measurement",
    shortName: "Sensing",
    tagline: "Precision measurement for navigation, imaging, health, geology, and defense.",
    whoItFits:
      "People from instrumentation, metrology, medical devices, geoscience, or defense who already live in signal-to-noise tradeoffs.",
    exampleRoles: [
      "Quantum sensing engineer",
      "Metrology specialist",
      "Field applications scientist",
      "Instrumentation engineer",
    ],
    adjacentSkills: [
      "Signal processing",
      "Statistics",
      "Lab measurement",
      "Domain physics",
      "Error analysis",
    ],
    monthEmphasis:
      "Week 2 measurement and interference are the core; week 4 benchmarking language (baseline, noise, comparison) transfers directly to sensing claims.",
  },
  business: {
    id: "business",
    name: "Quantum Business, Policy & Strategy",
    shortName: "Business",
    tagline: "Adoption, commercialization, standards, investment, and organizational readiness.",
    whoItFits:
      "Operators, product, policy, and investment people who will not become physicists — and should not have to — but must make sound decisions.",
    exampleRoles: [
      "Quantum program manager",
      "Innovation / strategy lead",
      "Policy analyst",
      "Investor or partnership lead",
    ],
    adjacentSkills: [
      "Use-case evaluation",
      "Stakeholder communication",
      "Roadmapping",
      "Procurement",
      "Ethics and governance",
    ],
    monthEmphasis:
      "The IBM Quantum Business Foundations badge is the week-3 centerpiece; week 4 teaches you to demand a classical baseline before anyone claims quantum advantage.",
  },
  education: {
    id: "education",
    name: "Quantum Education & Communication",
    shortName: "Education",
    tagline: "Teaching, curriculum, outreach, and making the field legible to new audiences.",
    whoItFits:
      "Educators, community builders, and communicators who already translate hard ideas — and can open the door without flattening the science.",
    exampleRoles: [
      "Curriculum designer",
      "Quantum learning guide",
      "Science communicator",
      "Outreach / workforce coordinator",
    ],
    adjacentSkills: [
      "Instructional design",
      "Facilitation",
      "Plain-language writing",
      "Assessment",
      "Community building",
    ],
    monthEmphasis:
      "You will run the Readiness Track as a facilitation tool, teach Qolour concepts, and own the week-4 glossary so the cohort shares one vocabulary.",
  },
  applied: {
    id: "applied",
    name: "Applied Domain Specialist",
    shortName: "Applied SME",
    tagline: "Bring finance, logistics, health, energy, or manufacturing expertise into quantum use-case work.",
    whoItFits:
      "Working professionals whose value is the problem, the data, and the constraints — not a physics pedigree. This is the Quantum Global Group home track.",
    exampleRoles: [
      "Quantum use-case analyst",
      "Industry translation lead",
      "Hybrid workflow specialist",
      "Domain-embedded researcher",
    ],
    adjacentSkills: [
      "Domain modeling",
      "Data literacy",
      "Classical baselines",
      "Stakeholder interviews",
      "Experiment design",
    ],
    monthEmphasis:
      "Keep your industry problem in view all month. Week 4 is built for you: define the classical baseline, map it, optimize, and compare — using portfolio optimization as the worked example.",
  },
};

export const PATHWAY_LIST: Pathway[] = PATHWAY_DISPLAY_ORDER.map((id) => PATHWAYS[id]);
