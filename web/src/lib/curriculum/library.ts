export type LibraryItem = {
  id: string;
  title: string;
  source: string;
  href: string;
  note: string;
  week: 1 | 2 | 3 | 4 | "any";
};

/** Downloadable / viewable Classroom references (PQC kept; Qulture sheets added). */
export const LIBRARY_ITEMS: LibraryItem[] = [
  {
    id: "pqc-qkd",
    title: "PQC vs QKD — which shield fits the problem?",
    source: "Quantum Ready Cohort · Module 4 (QGG)",
    href: "/learn/references/QRC_Module_4_PQC_vs_QKD_Quick_Reference.pdf",
    note: "Default PQC for software, certificates, signatures. QKD only on dedicated links. QKD never replaces PQC.",
    week: 3,
  },
  {
    id: "iqm-cheat",
    title: "IQM cheat sheet for circuit magicians",
    source: "IQM Quantum Computers · CC-BY-SA",
    href: "/learn/references/IQM-Cheat-Sheet-for-Circuit-Magicians.pdf",
    note: "Gates, entanglement circuit, QFT, Grover amplification, swap test. Credit: academy@meetiqm.com",
    week: 2,
  },
  {
    id: "qmmv-01a",
    title: "From qubits to bitstrings",
    source: "Quantum for the Qulture · QMMV",
    href: "/learn/references/QMMV_01a_From_Quantum_to_Bitstrings.png",
    note: "We manipulate the quantum state so useful bitstrings are more likely when we measure.",
    week: 2,
  },
  {
    id: "qmmv-01b",
    title: "Vectors and quantum states",
    source: "Quantum for the Qulture · QMMV",
    href: "/learn/references/QMMV_01b_Vectors_and_Quantum_States.png",
    note: "Column vectors, basis kets, amplitudes vs probabilities.",
    week: 2,
  },
  {
    id: "qmmv-02",
    title: "Matrices and quantum gates",
    source: "Quantum for the Qulture · QMMV",
    href: "/learn/references/QMMV_02_Matrices_and_Quantum_Gates.png",
    note: "Gates are unitary matrices. Sequence is the program.",
    week: 2,
  },
  {
    id: "qmmv-03",
    title: "Complex numbers, magnitude, and phase",
    source: "Quantum for the Qulture · QMMV",
    href: "/learn/references/QMMV_03_Complex_Numbers_Magnitude_Phase.png",
    note: "Magnitude → probability. Phase → interference.",
    week: 2,
  },
  {
    id: "qmmv-04",
    title: "Probability, measurement, and shots",
    source: "Quantum for the Qulture · Lesson 4",
    href: "/learn/references/QMMV_04_Probability_Measurement_and_Shots.png",
    note: "A shot is prepare → measure → record. Counts / N estimate probabilities.",
    week: 2,
  },
  {
    id: "qmmv-05",
    title: "Statistics, noise, and quantum results",
    source: "Quantum for the Qulture · Lesson 5",
    href: "/learn/references/QMMV_05_Statistics_Noise_and_Quantum_Results.png",
    note: "Mean, variance, SE. Results are statistical — report uncertainty.",
    week: 4,
  },
  {
    id: "qmmv-06",
    title: "Tensor products and multiple qubits",
    source: "Quantum for the Qulture · Lesson 6",
    href: "/learn/references/QMMV_06_Tensor_Products_and_Multiple_Qubits.png",
    note: "n qubits → 2ⁿ amplitudes. Product states vs entanglement.",
    week: 2,
  },
  {
    id: "qmmv-07",
    title: "Eigenvalues, eigenvectors, and observables",
    source: "Quantum for the Qulture · Lesson 7",
    href: "/learn/references/QMMV_07_Eigenvalues_Eigenvectors_and_Observables.png",
    note: "Observables ask questions. Eigenvalues are the allowed answers.",
    week: 2,
  },
  {
    id: "qmmv-08",
    title: "Trigonometry and the Bloch sphere",
    source: "Quantum for the Qulture · Lesson 8",
    href: "/learn/references/QMMV_08_Trigonometry_and_the_Bloch_Sphere.png",
    note: "Angles and rotations visualize a qubit. Foundation for parameterized circuits.",
    week: 2,
  },
  {
    id: "qmmv-09",
    title: "Calculus and variational algorithms",
    source: "Quantum for the Qulture · Lesson 9",
    href: "/learn/references/QMMV_09_Calculus_and_Variational_Algorithms.png",
    note: "Gradient descent steers VQE / QAOA. Calculus is the steering wheel.",
    week: 4,
  },
  {
    id: "qmmv-10",
    title: "Graph theory, Boolean logic, and quantum optimization",
    source: "Quantum for the Qulture · Lesson 10",
    href: "/learn/references/QMMV_10_Graph_Theory_Boolean_Logic_and_Optimization.png",
    note: "Map problems to graphs, encode with bitstrings / XOR, optimize with QAOA.",
    week: 4,
  },
  {
    id: "maxcut-1",
    title: "Max Cut for job readiness (workforce map)",
    source: "Quantum for the Qulture · Max Cut slide 1",
    href: "/learn/references/MaxCut1.png",
    note: "Talent vs opportunity graph. Cut edges = job-readiness bridges.",
    week: 4,
  },
  {
    id: "maxcut-2",
    title: "The math behind Max Cut and QAOA",
    source: "Quantum for the Qulture · Max Cut slide 2",
    href: "/learn/references/MaxCut2.png",
    note: "Hamiltonian, mixer, hybrid loop — then interpret the split for workforce decisions.",
    week: 4,
  },
  {
    id: "navigator",
    title: "Quantum Career Navigator",
    source: "QuantumKev/ibm-quantum-navigation (public GitHub + Pages)",
    href: "/learn/navigator",
    note: "Interactive pathway engine: profile × interest × goal → board, role family, forecast, enterprise meter.",
    week: 1,
  },
  {
    id: "ecosystem",
    title: "Quantum ecosystem pathway one-pager",
    source: "Quantum Global Group",
    href: "/learn/pathway",
    note: "Interests → IBM Learning / Composer / Qiskit → university or industry fork → Advocate and projects.",
    week: 1,
  },
];
