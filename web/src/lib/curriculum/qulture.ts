export interface QultureLesson {
  id: string;
  number: string;
  title: string;
  hook: string;
  takeaway: string;
  week: 1 | 2 | 3 | 4 | "any";
}

/** Quantum for the Qulture / QULTURE classroom sequence (QGG). */
export const QULTURE_LESSONS: QultureLesson[] = [
  {
    id: "bitstrings-1",
    number: "0a",
    title: "From classical bitstrings to quantum measurement",
    hook: "Song-code metaphor: 011 is ‘Progression is U’. Classical stores that string. Equal amplitudes do not favor it.",
    takeaway: "Before the qubit, understand the bitstring. Classical stores one answer. Quantum shapes the chances of possible answers.",
    week: 1,
  },
  {
    id: "bitstrings-2",
    number: "0b",
    title: "Before the qubit, understand the bitstring",
    hook: "Bit → bitstring → encoding → register → basis states → one measured string.",
    takeaway: "We do not manipulate final answers. We manipulate the state so useful bitstrings become more likely.",
    week: 1,
  },
  {
    id: "qubits-to-bitstrings",
    number: "0c",
    title: "From qubits to bitstrings",
    hook: "Gates change amplitudes. One shot returns one string. Many shots return a distribution. Grover / QAOA / sampling live here.",
    takeaway: "Useful bitstrings are made more likely — not typed in.",
    week: 2,
  },
  {
    id: "l1",
    number: "1",
    title: "Vectors and quantum states",
    hook: "Column vectors, basis kets, linear combinations, then amplitudes vs probabilities.",
    takeaway: "Order matters. Amplitudes — not raw probabilities — carry the quantum information.",
    week: 2,
  },
  {
    id: "l2",
    number: "2",
    title: "Matrices and quantum gates",
    hook: "X|0⟩=|1⟩, H|0⟩ equal superposition, X·X=I, order XH ≠ HX.",
    takeaway: "Gates are unitary matrices. Sequence is the program.",
    week: 2,
  },
  {
    id: "l3",
    number: "3",
    title: "Complex numbers, magnitude, and phase",
    hook: "z = a+bi, |z|, conjugate, polar form. Golden rule: magnitude → probability, phase → interference.",
    takeaway: "That split is most of the ‘quantum magic’ beginners miss.",
    week: 2,
  },
  {
    id: "l4",
    number: "4",
    title: "Probability, measurement, and shots",
    hook: "A shot is prepare → measure → record. Counts / N estimate probabilities. Error ~ 1/√N.",
    takeaway: "Always report shot count next to a quantum number.",
    week: 2,
  },
  {
    id: "l5",
    number: "5",
    title: "Statistics, noise, and quantum results",
    hook: "Mean, variance, SE = σ/√n. Gate error, decoherence, readout. Ideal vs noisy histograms.",
    takeaway: "Results are statistical. Benchmarking is statistics plus an honest noise label.",
    week: 4,
  },
  {
    id: "l6",
    number: "6",
    title: "Tensor products and multiple qubits",
    hook: "n qubits → 2ⁿ amplitudes. Product vs Bell state. CNOT after H.",
    takeaway: "Entanglement is a state you cannot factor — not a vibe.",
    week: 2,
  },
  {
    id: "l7",
    number: "7",
    title: "Eigenvalues, eigenvectors, and observables",
    hook: "A|ψ⟩=λ|ψ⟩. Pauli Z example. Expectation ⟨Z⟩. VQE minimizes ⟨H⟩.",
    takeaway: "Observables ask questions. Eigenvalues are the only allowed answers.",
    week: 4,
  },
  {
    id: "l8",
    number: "8",
    title: "Trigonometry and the Bloch sphere",
    hook: "|ψ(θ,φ)⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩. Rx, Ry, Rz. DJ-knob analogy.",
    takeaway: "Radians, sine/cosine, and rotations are the single-qubit control language.",
    week: 2,
  },
  {
    id: "l9",
    number: "9",
    title: "Calculus and variational algorithms",
    hook: "Gradient descent on C(θ). Hybrid loop: circuit U(θ) → measure cost → classical update. VQE / QAOA.",
    takeaway: "Calculus steers. The optimizer drives. The circuit does the lift.",
    week: 4,
  },
  {
    id: "l10",
    number: "10",
    title: "Graph theory, Boolean logic, and quantum optimization",
    hook: "Graph → bitstring decisions → XOR/CNOT → Max-Cut → QAOA. Map → encode → optimize → act.",
    takeaway: "Before the circuit, build the map. This is the classical-baseline week in graph form.",
    week: 4,
  },
];

export const PARTNER_COURSES = [
  {
    id: "qolour",
    name: "Qolour / Qubi",
    href: "https://www.qolour.io/course",
    role: "Week 2 hands-on qubits (games, model qubits, gates).",
  },
  {
    id: "black-opal",
    name: "Q-CTRL Black Opal",
    href: "https://q-ctrl.com/black-opal",
    role: "Interactive fundamentals and programming — Duolingo-like practice beside Qolour.",
  },
  {
    id: "enigmas",
    name: "Quantum Enigmas",
    href: "https://enigmesquantiques.com/en/",
    role: "Puzzle videos + IBM SkillsBuild + optional Qiskit coding labs.",
  },
  {
    id: "ibm-bf",
    name: "IBM Quantum Business Foundations",
    href: "https://quantum.cloud.ibm.com/learning/courses/quantum-business-foundations",
    role: "Week 3 industry map and badge.",
  },
  {
    id: "ibm-learning",
    name: "IBM Quantum Learning (Basics / Algorithms)",
    href: "https://quantum.cloud.ibm.com/learning/en",
    role: "Advocate eligibility badges; Classroom modules.",
  },
] as const;
