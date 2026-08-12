import type { ReadinessQuestion } from "./types";

export const READINESS_QUESTIONS: ReadinessQuestion[] = [
  {
    id: "background",
    prompt: "What is the subject-matter expertise you already bring?",
    help: "Pick the closest fit. This is about the work you can already do, not a quantum job title.",
    kind: "single",
    options: [
      {
        id: "quant-finance",
        label: "Finance, risk, or quantitative analysis",
        hint: "Portfolios, pricing, operations research",
        weights: { applied: 3, algorithms: 2, business: 1 },
      },
      {
        id: "software",
        label: "Software engineering or data / ML platforms",
        hint: "APIs, pipelines, products",
        weights: { software: 3, algorithms: 1, applied: 1 },
      },
      {
        id: "physics-ee",
        label: "Physics, electrical, optical, or lab engineering",
        hint: "Devices, instruments, materials",
        weights: { hardware: 3, sensing: 2, algorithms: 1 },
      },
      {
        id: "cyber",
        label: "Cybersecurity, cryptography, or networks",
        hint: "PKI, compliance, secure comms",
        weights: { security: 3, business: 1, software: 1 },
      },
      {
        id: "ops-industry",
        label: "Operations, logistics, energy, health, or manufacturing",
        hint: "The problem lives in a real workflow",
        weights: { applied: 3, business: 2, algorithms: 1 },
      },
      {
        id: "policy-biz",
        label: "Strategy, product, policy, or investment",
        hint: "Decisions, roadmaps, capital",
        weights: { business: 3, education: 1, applied: 1 },
      },
      {
        id: "teach",
        label: "Teaching, curriculum, or community building",
        hint: "You already translate hard ideas",
        weights: { education: 3, business: 1, applied: 1 },
      },
      {
        id: "math-cs",
        label: "Mathematics, CS theory, or academic research",
        hint: "Proofs, models, papers",
        weights: { algorithms: 3, software: 1, education: 1 },
      },
    ],
  },
  {
    id: "work-mode",
    prompt: "How do you actually spend most of your working time?",
    help: "Choose the pattern that feels most true in a typical month.",
    kind: "single",
    options: [
      {
        id: "build",
        label: "Building systems, models, or experiments",
        weights: { software: 2, algorithms: 2, hardware: 1, applied: 1 },
      },
      {
        id: "analyze",
        label: "Analyzing data, risk, or process performance",
        weights: { applied: 2, algorithms: 2, business: 1 },
      },
      {
        id: "lead",
        label: "Leading people, programs, or vendor decisions",
        weights: { business: 3, education: 1, applied: 1 },
      },
      {
        id: "secure",
        label: "Defending systems, identity, or compliance",
        weights: { security: 3, software: 1, business: 1 },
      },
      {
        id: "measure",
        label: "Measuring, calibrating, or running instruments",
        weights: { sensing: 3, hardware: 2 },
      },
      {
        id: "explain",
        label: "Teaching, writing, or facilitating others",
        weights: { education: 3, business: 1 },
      },
    ],
  },
  {
    id: "math",
    prompt: "How comfortable are you with the math that shows up in quantum?",
    help: "Be honest. The month is designed so every track can start from here.",
    kind: "single",
    options: [
      {
        id: "low",
        label: "I want plain language first; equations later",
        weights: { business: 2, education: 2, applied: 1, security: 1 },
      },
      {
        id: "mid",
        label: "I can follow probability, vectors, and matrices with a refresher",
        weights: { applied: 2, software: 1, algorithms: 1, sensing: 1 },
      },
      {
        id: "high",
        label: "Linear algebra and complex amplitudes are already in my toolkit",
        weights: { algorithms: 3, hardware: 1, software: 1 },
      },
    ],
  },
  {
    id: "code",
    prompt: "Where are you with programming?",
    help: "Week 4 uses a real hybrid lab. Coding is useful, not a gate.",
    kind: "single",
    options: [
      {
        id: "none",
        label: "Little or no coding — I contribute in other ways",
        weights: { business: 2, education: 2, applied: 1, security: 1 },
      },
      {
        id: "script",
        label: "I can script in Python or similar and read other people's code",
        weights: { applied: 2, algorithms: 1, software: 1, sensing: 1 },
      },
      {
        id: "ship",
        label: "I ship production software or research code regularly",
        weights: { software: 3, algorithms: 2, hardware: 1 },
      },
    ],
  },
  {
    id: "draw",
    prompt: "What is pulling you toward quantum right now?",
    help: "Select all that apply.",
    kind: "multi",
    options: [
      {
        id: "advantage",
        label: "Finding where quantum might beat a classical method on a real problem",
        weights: { applied: 2, algorithms: 2, business: 1 },
      },
      {
        id: "intuition",
        label: "Getting a hands-on feel for qubits, superposition, and entanglement",
        weights: { education: 1, hardware: 1, algorithms: 1 },
      },
      {
        id: "pqc",
        label: "Preparing my organization for post-quantum cryptography",
        weights: { security: 3, business: 1 },
      },
      {
        id: "devices",
        label: "Working close to hardware, control, or precision measurement",
        weights: { hardware: 2, sensing: 2 },
      },
      {
        id: "talent",
        label: "Building talent pathways, curriculum, or community",
        weights: { education: 3, business: 1 },
      },
      {
        id: "strategy",
        label: "Knowing enough to make budget, partnership, or policy calls",
        weights: { business: 3, applied: 1 },
      },
    ],
  },
  {
    id: "contribution",
    prompt: "When a quantum project is healthy, what is your best contribution?",
    help: "This is about how you like to create value, not a hierarchy.",
    kind: "single",
    options: [
      {
        id: "mapper",
        label: "I map a messy real-world problem onto a model someone can run",
        weights: { applied: 3, algorithms: 1, business: 1 },
      },
      {
        id: "builder",
        label: "I implement, debug, and make the pipeline reproducible",
        weights: { software: 3, algorithms: 1, hardware: 1 },
      },
      {
        id: "skeptic",
        label: "I insist on a baseline, a metric, and an honest comparison",
        weights: { applied: 2, algorithms: 2, business: 1 },
      },
      {
        id: "translator",
        label: "I make the work understandable to executives, students, or partners",
        weights: { education: 3, business: 2 },
      },
      {
        id: "owner",
        label: "I own the roadmap, risk, and who needs to be in the room",
        weights: { business: 3, security: 1, applied: 1 },
      },
    ],
  },
  {
    id: "horizon",
    prompt: "Which time horizon matches how you need to use this month?",
    help: "All four courses still run. This only changes the emphasis we recommend.",
    kind: "single",
    options: [
      {
        id: "now",
        label: "I have a live problem or team that needs a next step this quarter",
        weights: { applied: 2, business: 2, security: 1 },
      },
      {
        id: "year",
        label: "I am building skills for a role or program in the next 12 months",
        weights: { software: 1, algorithms: 1, education: 1, applied: 1 },
      },
      {
        id: "field",
        label: "I want to enter the quantum field and need a legitimate on-ramp",
        weights: { education: 2, algorithms: 1, software: 1, hardware: 1 },
      },
    ],
  },
];
