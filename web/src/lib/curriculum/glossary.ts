import type { GlossaryEntry } from "./types";

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Qubit",
    shortDef: "The basic unit of quantum information; unlike a bit, it has a state that can be a combination of 0 and 1 until measured.",
    fullDef:
      "A qubit is a two-level quantum system whose state is a normalized vector in a two-dimensional complex space, often written α|0⟩ + β|1⟩. Measurement in a chosen basis yields a classical outcome and generally destroys the prior superposition. Hardware implementations vary (superconducting circuits, trapped ions, photonics, spins); the information model is shared.",
    whyItMatters:
      "If you cannot say what a qubit is without saying “it’s like a bit but magic,” you are not ready to evaluate a vendor or a paper.",
    related: ["Superposition", "Measurement", "Bit"],
    courseSlugs: ["qubit-fundamentals", "vocabulary-and-baseline"],
  },
  {
    term: "Bit",
    shortDef: "A classical unit of information that is either 0 or 1.",
    fullDef:
      "A bit is a definite binary value. Classical computers store, copy, and error-correct bits cheaply. Quantum algorithms still read out bits at the end; the quantum part is the state evolution before measurement.",
    whyItMatters: "Every quantum workflow still ends in bits. That is why classical baselines remain the comparison point.",
    related: ["Qubit", "Measurement"],
    courseSlugs: ["qubit-fundamentals"],
  },
  {
    term: "Superposition",
    shortDef: "A qubit (or register) can occupy a combination of basis states, with complex amplitudes, until it is measured.",
    fullDef:
      "Superposition is not “being in two places” as a metaphor for indecision. It is a linear combination of basis states. Algorithms use superposition so that a circuit can act on many basis states at once; interference then shapes which outcomes become likely.",
    whyItMatters: "Without superposition there is no quantum parallelism to interfere. It is necessary, not sufficient, for advantage.",
    related: ["Interference", "Measurement", "Amplitude"],
    courseSlugs: ["qubit-fundamentals", "vocabulary-and-baseline"],
  },
  {
    term: "Measurement",
    shortDef: "The operation that produces a classical outcome from a quantum state and typically collapses the state.",
    fullDef:
      "Measurement is defined relative to a basis. Repeating an experiment builds a distribution. You do not get the amplitudes themselves from a single shot. Shot count, readout error, and basis choice all belong in a results paragraph.",
    whyItMatters: "People under-count shots and over-claim certainty. Measurement is where statistics re-enter the story.",
    related: ["Superposition", "Shot", "Fidelity"],
    courseSlugs: ["qubit-fundamentals", "vocabulary-and-baseline"],
  },
  {
    term: "Entanglement",
    shortDef: "A correlation between quantum systems that cannot be explained by assigning each system its own independent state.",
    fullDef:
      "An entangled state of two or more qubits cannot be written as a product of single-qubit states. Measurement statistics can violate classical bounds (Bell). Entanglement is a resource for algorithms and communication; it is not faster-than-light signaling.",
    whyItMatters: "CNOT-after-Hadamard is the first circuit that makes this real. If you skip it, “entanglement” stays a slogan.",
    related: ["CNOT", "Bell pair", "No-signaling"],
    courseSlugs: ["qubit-fundamentals", "vocabulary-and-baseline"],
  },
  {
    term: "Interference",
    shortDef: "Amplitudes add and cancel, so some measurement outcomes become more likely and others less.",
    fullDef:
      "Because amplitudes are complex, paths through a circuit can constructively or destructively interfere. Grover, QAOA phase separators, and many textbook algorithms are interference engineering. Noise wrecks interference, which is why NISQ results need careful baselines.",
    whyItMatters: "This is the mechanism behind most “why would this be faster?” stories that are not just analog simulation of chemistry.",
    related: ["Amplitude", "Superposition", "QAOA"],
    courseSlugs: ["qubit-fundamentals", "vocabulary-and-baseline"],
  },
  {
    term: "Amplitude",
    shortDef: "The complex number in front of a basis state; probability is the squared magnitude.",
    fullDef:
      "If a state is Σ α_i |i⟩, then |α_i|² is the probability of outcome i in the computational basis (Born rule). Phases (the arguments of the α_i) do not show up in that basis’s probabilities, but they drive interference in other bases and later in the circuit.",
    whyItMatters: "Confusing amplitude with probability is the most common week-2 error.",
    related: ["Superposition", "Interference", "Measurement"],
    courseSlugs: ["qubit-fundamentals", "vocabulary-and-baseline"],
  },
  {
    term: "Quantum gate",
    shortDef: "A reversible operation on one or more qubits; the analog of a logic gate, but unitary.",
    fullDef:
      "Gates are unitary matrices (or physically, calibrated pulses that approximate them). Common one-qubit gates: H, X, Y, Z, T. The workhorse two-qubit gate is CNOT. A universal set can approximate any unitary to arbitrary accuracy.",
    whyItMatters: "If you cannot say what H and CNOT are for, you cannot read a circuit diagram in a paper or a vendor demo.",
    related: ["Circuit", "Hadamard", "CNOT"],
    courseSlugs: ["qubit-fundamentals"],
  },
  {
    term: "Hadamard",
    shortDef: "The gate that turns |0⟩ into an equal superposition of |0⟩ and |1⟩ (and vice versa, up to phase conventions).",
    fullDef:
      "H|0⟩ = (|0⟩+|1⟩)/√2. It is the usual way to open superposition in textbook circuits. Applying H to every qubit of |00…0⟩ prepares the uniform superposition used in many algorithms.",
    whyItMatters: "It is the most-used single-qubit gate in introductory circuits and in Qolour’s teaching sequence.",
    related: ["Superposition", "Quantum gate"],
    courseSlugs: ["qubit-fundamentals"],
  },
  {
    term: "CNOT",
    shortDef: "A two-qubit gate: flip the target if the control is |1⟩. The standard way to create entanglement from a product state.",
    fullDef:
      "CNOT|c⟩|t⟩ → |c⟩|t ⊕ c⟩ in the computational basis. Starting from H on the control and |0⟩ on the target yields a Bell pair. In algorithms it is the workhorse “if” of reversible computing.",
    whyItMatters: "Entanglement is not a feeling; it is usually this gate plus superposition.",
    related: ["Entanglement", "Circuit"],
    courseSlugs: ["qubit-fundamentals"],
  },
  {
    term: "Circuit",
    shortDef: "A sequence of gates and measurements on a register of qubits.",
    fullDef:
      "A quantum circuit is the standard programming model for gate-model machines. Depth, two-qubit gate count, and connectivity all affect whether a circuit is runnable on a given chip. Transpilation rewrites the circuit to the device’s native gates.",
    whyItMatters: "“We ran it on a quantum computer” always means some compiled circuit, shots, and a backend — not a metaphor.",
    related: ["Quantum gate", "Transpilation", "Shot"],
    courseSlugs: ["qubit-fundamentals", "vocabulary-and-baseline"],
  },
  {
    term: "Fidelity",
    shortDef: "A score for how close two quantum states or how accurate a gate/process is; 1 is perfect.",
    fullDef:
      "State fidelity is a standard overlap-based measure between an ideal state and an experimental one. Gate and process fidelity describe operations. Reported “99.9% two-qubit fidelity” is about that operation, not about your full algorithm succeeding.",
    whyItMatters: "Vendor headlines quote fidelities. Practitioners ask: of what, on which gate, and what does that do to my circuit depth?",
    related: ["Noise", "NISQ"],
    courseSlugs: ["qubit-fundamentals", "business-foundations"],
  },
  {
    term: "Noise",
    shortDef: "Unwanted processes that make the real device differ from the ideal circuit.",
    fullDef:
      "Decoherence, gate error, crosstalk, and readout error all fall under noise. Simulators can be noiseless, noisy, or fake-backends. Ignoring noise is how toy demos become false advantage claims.",
    whyItMatters: "Week 4 comparisons must say whether the quantum path was noiseless simulation, noisy simulation, or hardware.",
    related: ["Fidelity", "NISQ", "Shot"],
    courseSlugs: ["qubit-fundamentals", "vocabulary-and-baseline"],
  },
  {
    term: "NISQ",
    shortDef: "Noisy Intermediate-Scale Quantum: today’s devices, too noisy for full error correction, large enough to run interesting circuits.",
    fullDef:
      "Coined to name the era of 50–1000+ noisy qubits. Variational algorithms (VQE, QAOA) and analog / annealing approaches are NISQ-era bets. Fault-tolerant algorithms (Shor at cryptographically relevant scale, large Grover) are not NISQ deliverables.",
    whyItMatters: "Business Foundations week is partly about not selling fault-tolerant timelines as this quarter’s IT project.",
    related: ["Fault tolerance", "VQE", "QAOA"],
    courseSlugs: ["business-foundations", "vocabulary-and-baseline"],
  },
  {
    term: "Fault tolerance",
    shortDef: "Computing with encoded logical qubits so that errors can be corrected faster than they accumulate.",
    fullDef:
      "Logical qubits are built from many physical qubits plus error-correcting codes. Resource estimates for useful fault-tolerant algorithms are still large. “We will have fault tolerance soon” is a research statement, not a procurement spec, unless a vendor gives a logical-qubit experiment with stated assumptions.",
    whyItMatters: "Separates roadmap slides from runnable work. Learners must know which bucket a claim is in.",
    related: ["NISQ", "Logical qubit"],
    courseSlugs: ["business-foundations", "vocabulary-and-baseline"],
  },
  {
    term: "Quantum advantage",
    shortDef: "A quantum (or hybrid) method that is better than the best relevant classical method on a stated metric for a stated problem.",
    fullDef:
      "Advantage is not a vibe. It requires a problem, a classical baseline, a quantum method, and a comparison (time, quality, energy, memory, cost). Quantum supremacy / quantum computational advantage historically referred to a contrived sampling task, not a business KPI.",
    whyItMatters: "This is the word executives misuse most. Week 4 exists so the cohort will not.",
    related: ["Classical baseline", "Benchmark", "Quantum supremacy"],
    courseSlugs: ["business-foundations", "vocabulary-and-baseline"],
  },
  {
    term: "Quantum supremacy",
    shortDef: "A historical term for a quantum device performing a task believed to be infeasible for classical computers, often not a useful task.",
    fullDef:
      "Google’s 2019 sampling experiment popularized the phrase. The community has largely moved to “quantum computational advantage” and, for applications, to domain-specific advantage. Do not use supremacy when you mean “our optimizer looked good in a slide.”",
    whyItMatters: "Vocabulary hygiene. Using the wrong word destroys trust with technical reviewers.",
    related: ["Quantum advantage"],
    courseSlugs: ["vocabulary-and-baseline"],
  },
  {
    term: "Classical baseline",
    shortDef: "The best honest classical method, metric, and setup you will compare against before claiming anything quantum.",
    fullDef:
      "A baseline names the problem instance, data, classical algorithm (or family), hyperparameters, hardware, and metric. “We beat a random guess” is not a baseline. “We beat a tuned classical solver on the same QUBO” might be. Hybrid work still needs the classical-only number.",
    whyItMatters: "This is Quantum Global Group’s non-negotiable. The Portfolio Lab exists to make the habit concrete.",
    related: ["Benchmark", "Quantum advantage", "QUBO"],
    courseSlugs: ["vocabulary-and-baseline", "quantum-readiness"],
  },
  {
    term: "Benchmark",
    shortDef: "A defined comparison: same problem, stated metrics, stated conditions, reproducible enough to argue about.",
    fullDef:
      "Good benchmarks fix the instance, the metric (e.g. Sharpe, energy, PR-AUC, feasibility), the budget (time, shots, iterations), and the uncertainty. Bad benchmarks change the instance when the method changes. Hardware-vs-simulator must be labeled.",
    whyItMatters: "Week 4 capstones are graded on the table, not the adjective.",
    related: ["Classical baseline", "Metric"],
    courseSlugs: ["vocabulary-and-baseline"],
  },
  {
    term: "QUBO",
    shortDef: "Quadratic Unconstrained Binary Optimization: a standard way to write discrete problems for annealers and many quantum-inspired solvers.",
    fullDef:
      "A QUBO minimizes xᵀ Q x for binary x. Many portfolio, routing, and selection problems can be encoded this way, often with penalty terms for constraints. QAOA and quantum annealing families consume QUBO / Ising forms. Encoding quality often matters more than the solver brand.",
    whyItMatters: "This is the bridge from “I have a business constraint” to “I have something a quantum-inspired method can eat.”",
    related: ["QAOA", "Ising", "Classical baseline"],
    courseSlugs: ["vocabulary-and-baseline"],
  },
  {
    term: "QAOA",
    shortDef: "Quantum Approximate Optimization Algorithm: a variational circuit for combinatorial problems, usually from an Ising / QUBO cost.",
    fullDef:
      "QAOA alternates cost and mixer unitaries, with parameters tuned classically. It is a hybrid algorithm. Depth p, parameter training, and the quality of the QUBO encoding dominate results. It is not a magic replacement for Gurobi.",
    whyItMatters: "Appears in the Portfolio Lab and in IBM-adjacent application stories. Learners should know it is variational and hybrid.",
    related: ["QUBO", "VQE", "Hybrid algorithm"],
    courseSlugs: ["vocabulary-and-baseline", "business-foundations"],
  },
  {
    term: "VQE",
    shortDef: "Variational Quantum Eigensolver: a hybrid method that uses a parameterized circuit and a classical optimizer to estimate an energy / cost.",
    fullDef:
      "VQE was designed for chemistry Hamiltonians and is also used as a variational cost minimizer in other encodings. The ansatz, optimizer, and shot noise determine whether you are doing science or fitting a random landscape.",
    whyItMatters: "IBM Runtime paths in this repo use VQE-shaped workflows. The cohort should not confuse “we ran VQE” with “we beat classical.”",
    related: ["Hybrid algorithm", "Ansatz", "QAOA"],
    courseSlugs: ["vocabulary-and-baseline"],
  },
  {
    term: "Hybrid algorithm",
    shortDef: "A loop that uses both classical and quantum (or quantum-inspired) pieces, each doing what it is good at.",
    fullDef:
      "Almost all near-term application work is hybrid: classical data prep, encoding, parameter updates, and post-processing around a quantum or quantum-inspired kernel. “Hybrid” is not a dodge; it is the architecture.",
    whyItMatters: "IBM Business Foundations and this lab agree: quantum will not replace classical computers.",
    related: ["VQE", "QAOA", "Classical baseline"],
    courseSlugs: ["business-foundations", "vocabulary-and-baseline"],
  },
  {
    term: "Quantum readiness",
    shortDef: "A moving measure of whether a person or organization can use quantum technology and respond to quantum-era risk — not a certificate you hang once.",
    fullDef:
      "IBM describes organizational quantum readiness across strategy, technology, and operations: talent, use-case skill, hybrid architecture, governance, and protection against quantum threats. For a person, this month treats readiness as: know your fit, share the vocabulary, hold qubit intuition, and refuse results without a baseline.",
    whyItMatters: "It is the name of the program. It is not a synonym for “we bought a time on a QPU.”",
    related: ["Use case", "Post-quantum cryptography"],
    courseSlugs: ["quantum-readiness", "business-foundations"],
  },
  {
    term: "Use case",
    shortDef: "A specific problem, owner, data, and success metric — not an industry name on a slide.",
    fullDef:
      "IBM’s course distinguishes good use cases (strategic, scalable, explorably small, hybrid-near-term) from poor ones (mission-critical bets on unproven theory, or problems that do not scale). A use case that cannot name a classical baseline is not ready for a quantum pilot.",
    whyItMatters: "Week 3 memo. If you cannot write it, you cannot fund it.",
    related: ["Quantum readiness", "Classical baseline"],
    courseSlugs: ["business-foundations", "quantum-readiness"],
  },
  {
    term: "Post-quantum cryptography",
    shortDef: "Classical cryptographic algorithms designed to resist attacks by large quantum computers (especially Shor’s algorithm).",
    fullDef:
      "PQC is not quantum communication and not QKD. NIST has standardized algorithms (e.g. ML-KEM, ML-DSA). Migration is a multi-year crypto-agility program: inventory, vendors, certificates, protocols. It is a parallel workforce track to quantum computing.",
    whyItMatters: "Security-pathway learners must not confuse “we need PQC” with “we need a quantum computer.”",
    related: ["Shor’s algorithm", "Quantum readiness"],
    courseSlugs: ["business-foundations", "quantum-readiness"],
  },
  {
    term: "Shot",
    shortDef: "One execution of a circuit ending in measurement; statistics need many shots.",
    fullDef:
      "Estimating an expectation or a probability to useful precision can take thousands of shots. Hardware queues, cost, and noise all scale with shots. Always report shot count next to a quantum number.",
    whyItMatters: "Missing shot counts are a grading fail in week 4.",
    related: ["Measurement", "Benchmark"],
    courseSlugs: ["vocabulary-and-baseline", "qubit-fundamentals"],
  },
  {
    term: "Transpilation",
    shortDef: "Rewriting a circuit to the gates and connectivity a specific backend actually supports.",
    fullDef:
      "Logical CNOT on non-adjacent qubits becomes a chain of swaps. That inflates depth and error. Comparing two “same” circuits on different backends without transpilation notes is not a benchmark.",
    whyItMatters: "Software-pathway people live here. Everyone else must know it exists.",
    related: ["Circuit", "Noise"],
    courseSlugs: ["vocabulary-and-baseline"],
  },
  {
    term: "Ansatz",
    shortDef: "The parameterized circuit shape you choose to variationally optimize (VQE/QAOA).",
    fullDef:
      "Hardware-efficient ansatze, problem-inspired ansatze, and QAOA layers are different bets. A bad ansatz cannot be saved by a better classical optimizer. Document it like you would document a neural-net architecture.",
    whyItMatters: "“We used VQE” is incomplete without the ansatz name and depth.",
    related: ["VQE", "QAOA"],
    courseSlugs: ["vocabulary-and-baseline"],
  },
];

export function glossarySorted(): GlossaryEntry[] {
  return [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term));
}
