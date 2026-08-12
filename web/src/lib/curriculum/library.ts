export const LIBRARY_ITEMS = [
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
] as const;
