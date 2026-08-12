/* ====================================================================
   Quantum Career Navigator + Workforce Intelligence Engine
   Vanilla JS. A single DATA object powers every section so the app is
   easy to extend. No backend required.
   ==================================================================== */

(function () {
  "use strict";

  /* ================================================================ *
   *  DATA
   * ================================================================ */

  const DATA = {

    avatars: [
      { id: "undergrad", title: "Undergraduate Student", track: "learner", start: "Curious undergraduate",
        desc: "I'm exploring quantum and want to know which courses, communities, and experiences move me forward." },
      { id: "grad", title: "Graduate Student", track: "learner", start: "Graduate student",
        desc: "I want to connect my studies to research labs, papers, and quantum career options." },
      { id: "physics", title: "Physics Student", track: "learner", start: "Physics student",
        desc: "I understand the science, but I need help turning my interest into research, internships, or a career pathway." },
      { id: "developer", title: "Software Developer", track: "learner", start: "Software developer",
        desc: "I can code, but I need to understand how to enter the quantum ecosystem and build useful projects." },
      { id: "datascientist", title: "Data Scientist", track: "learner", start: "Data scientist",
        desc: "I work with data and models and want to apply quantum methods to optimization and machine learning." },
      { id: "faculty", title: "Faculty Member", track: "university", start: "Faculty member",
        desc: "I want to bring quantum into my teaching and research and connect students to opportunities." },
      { id: "admin", title: "University Administrator", track: "university", start: "University",
        desc: "We want to build a quantum program, but we need guidance on curriculum, faculty, students, and industry alignment." },
      { id: "researcher", title: "Researcher", track: "learner", start: "Researcher",
        desc: "I want to align my work with the IBM Quantum Network, papers, and collaborators." },
      { id: "changer", title: "Career Changer", track: "learner", start: "Career changer",
        desc: "I'm moving into quantum from another field and need a clear, credible path to a role." },
      { id: "industry", title: "Industry Professional", track: "learner", start: "Industry professional",
        desc: "I want to upskill into quantum and bring it back to my organization." },
      { id: "employer", title: "Employer", track: "employer", start: "Employer",
        desc: "We need quantum-aware talent and want to create internships, projects, or hiring pipelines." },
      { id: "partner", title: "Community Partner", track: "community", start: "Community partner",
        desc: "We want to host events and build local quantum community and talent." },
      { id: "workforceboard", title: "Workforce Board", track: "employer", start: "Regional workforce board",
        desc: "We coordinate regional talent strategy and want to align education with emerging quantum jobs." }
    ],

    interests: [
      { id: "medicine", label: "Medicine & Drug Discovery", focus: "quantum chemistry, Hamiltonians, and molecular simulation", project: "a molecular simulation / drug-discovery notebook", partners: "healthcare & life-sciences partners (Cleveland Clinic, Moderna, BasQ)", family: "research" },
      { id: "finance", label: "Finance", focus: "optimization, Monte Carlo, and portfolio modeling", project: "a portfolio-optimization / QAOA finance demo", partners: "financial-services members of the IBM Quantum Network", family: "software" },
      { id: "logistics", label: "Logistics", focus: "routing, scheduling, and combinatorial optimization", project: "a vehicle-routing / scheduling optimization demo", partners: "supply-chain & logistics partners", family: "software" },
      { id: "sports", label: "Sports Analytics", focus: "optimization and probabilistic modeling", project: "a lineup / strategy optimization analytics demo", partners: "analytics-driven sports organizations", family: "software" },
      { id: "cybersecurity", label: "Cybersecurity", focus: "cryptography, quantum-safe security, and Shor's algorithm", project: "a quantum-safe cryptography demo", partners: "security & infrastructure partners", family: "security" },
      { id: "ai", label: "Artificial Intelligence", focus: "quantum machine learning and kernel methods", project: "a quantum machine-learning classifier", partners: "AI & machine-learning research groups", family: "software" },
      { id: "software", label: "Quantum Software", focus: "Qiskit, circuits, transpilation, and tooling", project: "an open-source Qiskit tool or library contribution", partners: "the Qiskit ecosystem & IBM Quantum software teams", family: "software" },
      { id: "hardware", label: "Quantum Hardware", focus: "qubits, gates, noise, and device characterization", project: "a noise-characterization / calibration study", partners: "hardware & device-physics labs", family: "hardware" },
      { id: "materials", label: "Materials Science", focus: "condensed matter and materials simulation", project: "a materials / lattice-simulation project", partners: "materials & energy research institutions", family: "research" },
      { id: "energy", label: "Energy", focus: "optimization and chemistry for energy systems", project: "a grid-optimization / battery-chemistry demo", partners: "energy & utilities partners", family: "software" },
      { id: "optimization", label: "Optimization", focus: "QAOA, VQE, and combinatorial optimization", project: "a constrained-optimization benchmark", partners: "operations-research & industry partners", family: "software" },
      { id: "research", label: "Research", focus: "algorithms, papers, and reproducible experiments", project: "a reproducible algorithm study tied to recent papers", partners: "IBM Quantum Network universities & labs", family: "research" },
      { id: "education", label: "Education & Community", focus: "teaching, curriculum, and community building", project: "a teaching module or community workshop", partners: "universities, educators & community programs", family: "business" },
      { id: "quantumsafe", label: "Quantum Safe Security", focus: "post-quantum cryptography and enterprise risk", project: "a quantum-safe migration assessment", partners: "enterprises modernizing cryptography", family: "security" },
      { id: "foundry", label: "Quantum Foundry & Manufacturing", focus: "fabrication, cleanroom, and device manufacturing", project: "a fabrication / yield-analysis study", partners: "foundry & semiconductor manufacturing partners", family: "hardware" }
    ],

    goals: [
      { id: "internship", label: "Get an Internship", gate: "industry", outcome: "Quantum internship candidate", apply: "Apply to internships and IBM Quantum roles", prep: "polish your resume, GitHub, and a technical story", badge: "Quantum readiness portfolio", kpis: ["internships", "jobs"] },
      { id: "apprenticeship", label: "Get an Apprenticeship", gate: "industry", outcome: "Apprenticeship-ready candidate", apply: "Apply to apprenticeships & earn-and-learn programs", prep: "build a hands-on skills portfolio", badge: "Hands-on skills credential", kpis: ["apprenticeships", "jobs"] },
      { id: "job", label: "Get a Full-Time Job", gate: "industry", outcome: "Quantum-ready hire", apply: "Apply to full-time quantum & quantum-adjacent roles", prep: "rehearse technical interviews and storytelling", badge: "Qiskit Developer credential", kpis: ["jobs", "internships"] },
      { id: "gradschool", label: "Prepare for Graduate School", gate: "research", outcome: "Graduate-school-ready applicant", apply: "Identify advisors and submit strong applications", prep: "read papers, contact labs, and draft a statement", badge: "Research foundations badge", kpis: ["gradschool", "research"] },
      { id: "phd", label: "Prepare for a PhD", gate: "research", outcome: "PhD-ready quantum researcher", apply: "Contact labs, secure summer research, apply to PhD programs", prep: "read recent papers and identify advisors", badge: "Advanced quantum information badge", kpis: ["gradschool", "research"] },
      { id: "researchlab", label: "Join a Research Lab", gate: "research", outcome: "Research-lab contributor", apply: "Reach out to faculty and apply to lab openings", prep: "study the lab's recent work and prepare outreach", badge: "Research foundations badge", kpis: ["research", "gradschool"] },
      { id: "portfolio", label: "Build a Portfolio Project", gate: "project", outcome: "Portfolio-ready builder", apply: "Publish your project and share it with mentors", prep: "document your project with results and a README", badge: "Project portfolio badge", kpis: ["projects", "opensource"] },
      { id: "opensource", label: "Contribute to Open Source", gate: "project", outcome: "Open-source contributor", apply: "Open pull requests in the Qiskit ecosystem", prep: "find good-first-issues and engage maintainers", badge: "Open-source contributor badge", kpis: ["opensource", "projects"] },
      { id: "advocate", label: "Become a Qiskit Advocate", gate: "community", outcome: "Qiskit Advocate & community leader", apply: "Apply to the Qiskit Advocates program", prep: "contribute, mentor, and show community impact", badge: "Qiskit Advocate", kpis: ["advocates", "projects"] },
      { id: "campusprogram", label: "Host a Campus Quantum Program", gate: "university", outcome: "Active campus quantum program", apply: "Launch events and recruit a student cohort", prep: "secure faculty sponsorship and Classroom Accounts", badge: "Campus program badge", kpis: ["universities", "students"] },
      { id: "universitypathway", label: "Build a University Quantum Pathway", gate: "university", outcome: "University quantum workforce pathway", apply: "Stand up curriculum, research tracks, and partnerships", prep: "align faculty, courses, and the IBM Quantum Network", badge: "Program design badge", kpis: ["universities", "faculty"] },
      { id: "enterprise", label: "Assess Enterprise Quantum Readiness", gate: "enterprise", outcome: "Enterprise quantum readiness plan", apply: "Run a readiness assessment and assign a quantum team", prep: "map use cases, data, and skills gaps", badge: "Enterprise readiness assessment", kpis: ["readiness", "teams"] },
      { id: "talentpipeline", label: "Build a Talent Pipeline", gate: "industry", outcome: "Quantum-ready hiring pipeline", apply: "Sponsor projects, internships, and apprenticeships", prep: "translate roles into skills and partner with universities", badge: "Talent pipeline blueprint", kpis: ["employers", "internships"] }
    ],

    /* IBM Quantum role families (built from IBM Careers role examples) */
    roleFamilies: [
      {
        id: "research", letter: "A", name: "Research", color: "#6929c4",
        overview: "Advances the science of quantum computing — algorithms, processors, and error correction toward quantum-centric supercomputing.",
        examples: ["Quantum Algorithm Theorist", "Quantum Processor Scientist", "Quantum Error Correction Theorist", "Quantum Hardware Research Scientist", "Research Scientist, Quantum-Centric Supercomputing"],
        skills: ["Quantum information science", "Algorithms", "Error correction", "Research methods", "Scientific writing", "Advanced math & physics"],
        learning: ["Quantum foundations", "Quantum algorithms", "Error correction", "Research papers", "Qiskit research projects"],
        badges: ["Basics of Quantum Information", "Advanced quantum information", "Research foundations"],
        projects: ["Reproduce a recent algorithm paper", "VQE / quantum chemistry study", "Error-mitigation experiment"],
        opportunities: ["Summer research", "PhD pathways", "IBM Research roles", "IBM Quantum Network labs"],
        bestFit: ["Physics Student", "Graduate Student", "Researcher"],
        curriculum: { y1: ["Linear algebra", "Intro quantum mechanics", "IBM Quantum Learning foundations"], y2: ["Quantum algorithms", "Qiskit", "Probability & statistics"], y3: ["Error correction", "Research methods", "Reproduce a paper"], y4: ["Summer research", "Thesis / capstone", "IBM Quantum Network engagement"], outcome: "Graduate ready for a PhD or research role." }
      },
      {
        id: "software", letter: "B", name: "Software & Infrastructure", color: "#0f62fe",
        overview: "Builds the software, tooling, and infrastructure that make quantum usable — from Qiskit to cloud and HPC workflows.",
        examples: ["Qiskit Software Developer", "Full Stack Software Developer", "Software Developer, Quantum-Centric Supercomputing", "Data Engineer — IBM Quantum", "Security Engineer"],
        skills: ["Python", "Qiskit", "GitHub", "APIs", "Cloud", "HPC workflows", "Software engineering"],
        learning: ["IBM Quantum Learning", "Qiskit coding labs", "Composer", "Open-source contribution", "GitHub portfolio"],
        badges: ["Qiskit Developer", "Use a Quantum Computer Today", "Open-source contributor"],
        projects: ["Bell State tutorial", "QAOA demo", "Quantum chemistry notebook", "Resolve an open-source issue"],
        opportunities: ["Internship", "Open-source contribution", "IBM Quantum software role", "IBM Quantum Network company"],
        bestFit: ["Software Developer", "Data Scientist", "Career Changer"],
        curriculum: { y1: ["Python", "Linear algebra", "Intro quantum", "IBM Quantum Learning"], y2: ["Qiskit", "Circuits", "GitHub", "Composer", "Basic algorithms"], y3: ["Projects", "Open-source contribution", "QAOA", "VQE", "Quantum chemistry"], y4: ["Internship", "Capstone", "Research lab", "IBM Quantum Network engagement"], outcome: "Graduate with a portfolio and a path into internship, grad school, or employment." }
      },
      {
        id: "hardware", letter: "C", name: "Hardware & Engineering", color: "#1192e8",
        overview: "Designs, builds, and operates quantum hardware — from cryogenics and control systems to the quantum foundry.",
        examples: ["Quantum Hardware Design Engineer", "Quantum Control Systems Engineer", "Cryogenic Engineer", "Signal Integrity Engineer", "Data Center Engineer Technician", "Quantum Foundry & Manufacturing roles"],
        skills: ["Electrical engineering", "Mechanical engineering", "Cryogenics", "RF systems", "Embedded systems", "Semiconductor manufacturing", "Cleanroom operations", "Control systems"],
        learning: ["Quantum hardware fundamentals", "Lab experience", "Electronics", "Fabrication", "Control systems", "Internships / apprenticeships"],
        badges: ["Quantum hardware fundamentals", "Hands-on lab credential"],
        projects: ["Noise-characterization study", "Control-electronics prototype", "Fabrication / yield analysis"],
        opportunities: ["Apprenticeship", "Lab internship", "Foundry & manufacturing roles", "Hardware engineering roles"],
        bestFit: ["Physics Student", "Industry Professional", "Career Changer"],
        curriculum: { y1: ["Physics", "Electronics", "Intro quantum"], y2: ["RF & control systems", "Cryogenics basics", "Lab methods"], y3: ["Fabrication / cleanroom", "Embedded systems", "Hardware project"], y4: ["Apprenticeship / internship", "Capstone", "Foundry engagement"], outcome: "Graduate ready for hardware, control, or foundry apprenticeships and roles." }
      },
      {
        id: "consulting", letter: "D", name: "Consulting & Client Success", color: "#ee5396",
        overview: "Connects quantum to real business value — discovering use cases and delivering client engagements.",
        examples: ["Industry Quantum Consultant", "Quantum Client Delivery Lead", "Quantum Engagement Manager", "Quantum Client Operations Manager"],
        skills: ["Business use cases", "Client communication", "Project management", "Quantum readiness", "Industry knowledge", "Solution design"],
        learning: ["Business foundations of quantum", "Use case discovery", "Industry case studies", "Technical communication", "Consulting-style projects"],
        badges: ["Quantum business foundations", "Use case discovery"],
        projects: ["Industry use-case brief", "Readiness assessment", "Solution design deck"],
        opportunities: ["Consulting roles", "Client delivery", "Engagement management", "Enterprise partnerships"],
        bestFit: ["Industry Professional", "Career Changer", "Employer"],
        curriculum: { y1: ["Business foundations", "Intro quantum concepts", "Communication"], y2: ["Use case discovery", "Project management", "Industry case studies"], y3: ["Solution design", "Consulting project", "Client communication"], y4: ["Capstone engagement", "Internship", "Partnership project"], outcome: "Graduate ready for quantum consulting and client-success roles." }
      },
      {
        id: "business", letter: "E", name: "Business & Ecosystem", color: "#8a3ffc",
        overview: "Grows the ecosystem and the workforce — community, programs, partnerships, and developer advocacy.",
        examples: ["Qiskit Community Manager", "Strategic Partnerships", "Workforce Development", "Technical Project Manager", "Learning Program Manager"],
        skills: ["Community building", "Program management", "Workforce strategy", "Partnerships", "Curriculum alignment", "Developer advocacy", "Content creation"],
        learning: ["IBM Quantum Learning", "Qiskit Advocate Program", "Fall Fest leadership", "Workforce development projects", "Technical storytelling"],
        badges: ["Qiskit Advocate", "Program design"],
        projects: ["Run a Fall Fest event", "Build a workforce program", "Create a learning module"],
        opportunities: ["Community management", "Program management", "Workforce development", "Partnerships"],
        bestFit: ["Community Partner", "Faculty Member", "University Administrator", "Workforce Board"],
        curriculum: { y1: ["Communication", "Intro quantum", "Community basics"], y2: ["Program management", "Developer advocacy", "Content creation"], y3: ["Partnerships", "Workforce strategy", "Run an event"], y4: ["Capstone program", "Internship", "Ecosystem engagement"], outcome: "Graduate ready for ecosystem, program, and workforce roles." }
      },
      {
        id: "security", letter: "F", name: "Quantum Safe & Security", color: "#009d9a",
        overview: "Prepares enterprises for the quantum era — post-quantum cryptography, risk, and security transformation.",
        examples: ["Quantum Safe Consultant", "Applied Cryptography", "Security Strategy"],
        skills: ["Cryptography", "Post-quantum cryptography", "Risk assessment", "Cybersecurity", "Enterprise transformation"],
        learning: ["Quantum safe foundations", "Cybersecurity fundamentals", "Enterprise readiness assessment", "Security consulting projects"],
        badges: ["Quantum safe foundations", "Cybersecurity fundamentals"],
        projects: ["Quantum-safe migration assessment", "Crypto inventory study", "Risk briefing"],
        opportunities: ["Quantum-safe consulting", "Security strategy", "Enterprise transformation", "Applied cryptography"],
        bestFit: ["Industry Professional", "Career Changer", "Employer"],
        curriculum: { y1: ["Cybersecurity basics", "Intro cryptography", "Intro quantum"], y2: ["Post-quantum cryptography", "Risk assessment", "Networks"], y3: ["Enterprise readiness", "Security project", "Compliance"], y4: ["Capstone migration", "Internship", "Enterprise engagement"], outcome: "Graduate ready for quantum-safe and security strategy roles." }
      }
    ],

    learningResources: [
      { id: "learning", name: "IBM Quantum Learning", url: "https://quantum.cloud.ibm.com/learning/en", helps: "Structured courses from foundations to utility-scale", stage: "Foundation", families: ["research", "software", "consulting", "business", "security"], purpose: ["learning"] },
      { id: "composer", name: "IBM Quantum Composer", url: "https://quantum.cloud.ibm.com/", helps: "Build & visualize circuits in the browser", stage: "Practice", families: ["software", "research"], purpose: ["practice", "learning"] },
      { id: "classroom", name: "Classroom Accounts", url: "https://quantum.cloud.ibm.com/learning/en", helps: "Guided labs & assignments for educators", stage: "Foundation", families: ["business", "research"], purpose: ["learning", "community"] },
      { id: "qiskit", name: "Qiskit", url: "https://www.ibm.com/quantum/qiskit", helps: "Open-source SDK for quantum programming", stage: "Practice", families: ["software", "research", "hardware"], purpose: ["practice", "projects"] },
      { id: "advocates", name: "Qiskit Advocates", url: "https://www.ibm.com/quantum/ecosystem", helps: "Mentors, community, and leadership", stage: "Community", families: ["business", "software"], purpose: ["community"] },
      { id: "fallfest", name: "Qiskit Fall Fest", url: "https://www.ibm.com/quantum/ecosystem", helps: "Campus events & community entry points", stage: "Community", families: ["business"], purpose: ["community"] },
      { id: "network", name: "IBM Quantum Network", url: "https://www.ibm.com/quantum/ibm-quantum-network", helps: "300+ universities, companies & startups", stage: "Industry / Research gate", families: ["research", "consulting", "business", "security"], purpose: ["industry", "research"] },
      { id: "qgss", name: "Qiskit Global Summer School", url: "https://www.ibm.com/quantum/blog/qiskit-summer-school-2026", helps: "Free virtual program & workforce workshops", stage: "Foundation / Skill", families: ["software", "research", "business"], purpose: ["learning", "community"] },
      { id: "ecosystem", name: "IBM Quantum Ecosystem Projects", url: "https://www.ibm.com/quantum/ecosystem", helps: "Open-source tools to use, extend, publish", stage: "Project quest", families: ["software", "research"], purpose: ["projects"] },
      { id: "casestudies", name: "IBM Quantum Case Studies", url: "https://www.ibm.com/quantum/case-studies", helps: "Real partner stories & workflows", stage: "Industry gate", families: ["consulting", "business", "security"], purpose: ["industry", "research"] },
      { id: "careers", name: "IBM Quantum Careers", url: "https://www.ibm.com/quantum", helps: "Roles, internships & pathways", stage: "Opportunity", families: ["research", "software", "hardware", "consulting", "business", "security"], purpose: ["careers"] },
      { id: "research", name: "IBM Research", url: "https://research.ibm.com/", helps: "Frontier research, papers & collaborations", stage: "Research gate", families: ["research", "hardware"], purpose: ["research"] },
      { id: "ventures", name: "IBM Ventures / Startups", url: "https://www.ibm.com/quantum/ibm-quantum-network", helps: "Startup ecosystem & entrepreneurship", stage: "Industry gate", families: ["consulting", "business"], purpose: ["industry", "careers"] }
    ],

    workforceForecast: [
      { year: "Year 1", title: "Onboard & engage", summary: "Prepare learners for current internships, entry-level roles, Qiskit community engagement, and project experience.",
        focus: ["Qiskit", "Python", "IBM Quantum Learning", "Composer", "GitHub", "Internships", "Classroom Accounts", "Fall Fest"] },
      { year: "Year 2", title: "Specialize", summary: "Prepare learners for specialized roles in quantum software, hardware, consulting, client delivery, and research support.",
        focus: ["QAOA", "VQE", "Quantum chemistry", "Quantum safe", "Quantum workflows", "Technical communication", "Research papers", "Industry use cases"] },
      { year: "Year 3", title: "Pipeline for the roadmap", summary: "Prepare talent pipelines for future IBM roadmap needs across hardware, supercomputing, and enterprise readiness.",
        focus: ["Error correction", "Quantum-centric supercomputing", "Quantum foundry", "Cryogenics", "Control systems", "Quantum safe transformation", "Industry applications", "Enterprise readiness"] }
    ],

    enterpriseReadiness: {
      categories: [
        { id: "business", label: "Business use case readiness", desc: "Have you identified concrete, high-value problems quantum could address?", sample: "high" },
        { id: "data", label: "Data readiness", desc: "Is the data for those use cases available, clean, and well understood?", sample: "medium" },
        { id: "workforce", label: "Workforce readiness", desc: "Do you have people with the skills — or a plan to build them?", sample: "low" },
        { id: "technology", label: "Technology readiness", desc: "Is your cloud, HPC, and tooling foundation in place?", sample: "medium" },
        { id: "partnership", label: "Partnership readiness", desc: "Are you connected to the IBM Quantum Network, universities, or startups?", sample: "medium" },
        { id: "leadership", label: "Leadership readiness", desc: "Is there executive sponsorship and a funded mandate to explore quantum?", sample: "medium" }
      ],
      recommendation: "Start with use case discovery, assign an internal quantum team, identify skills gaps, complete IBM Quantum Learning, and partner with universities or IBM Quantum Network participants."
    },

    teamScenarios: [
      { id: "pharma", label: "Pharma — drug discovery", context: "A pharmaceutical company wants to explore quantum for drug discovery." },
      { id: "finance", label: "Finance — portfolio risk", context: "A bank wants to explore quantum for portfolio optimization and risk." },
      { id: "logistics", label: "Logistics — routing", context: "A logistics company wants to explore quantum for routing and scheduling." }
    ],

    teamRoles: [
      { role: "Executive Sponsor", does: "Funds the initiative and removes barriers.", skills: "Strategy, budgeting, change leadership", modules: "Quantum business foundations", contributes: "Mandate, funding, alignment" },
      { role: "Business Lead", does: "Owns the use case and business value.", skills: "Domain strategy, ROI, prioritization", modules: "Use case discovery", contributes: "Problem definition & success metrics" },
      { role: "Domain Expert", does: "Brings deep field knowledge to the problem.", skills: "Scientific / industry expertise", modules: "Quantum applications in the domain", contributes: "Realistic problem framing & validation" },
      { role: "Quantum Developer", does: "Builds and runs quantum workflows.", skills: "Qiskit, circuits, algorithms", modules: "IBM Quantum Learning, Qiskit labs", contributes: "Working quantum prototype" },
      { role: "Data Scientist", does: "Prepares data and evaluates results.", skills: "Statistics, modeling, Python", modules: "Quantum machine learning", contributes: "Data pipelines & evaluation" },
      { role: "Classical ML Engineer", does: "Builds hybrid classical/quantum baselines.", skills: "ML, optimization, engineering", modules: "Hybrid algorithms", contributes: "Baselines & integration" },
      { role: "Cloud / HPC Engineer", does: "Runs workloads at scale.", skills: "Cloud, HPC, infrastructure", modules: "Quantum-centric supercomputing", contributes: "Scalable execution environment" },
      { role: "Project Manager", does: "Coordinates delivery and milestones.", skills: "Planning, communication, risk", modules: "Technical project management", contributes: "Delivery & stakeholder alignment" },
      { role: "Responsible Innovation Lead", does: "Guards ethics, trust, and responsible use.", skills: "Ethics, governance, risk", modules: "Responsible innovation", contributes: "Trust, compliance & guardrails" }
    ],

    kpis: [
      { id: "students", label: "Students onboarded", base: 4820 },
      { id: "universities", label: "Universities activated", base: 186 },
      { id: "faculty", label: "Faculty trained", base: 540 },
      { id: "completions", label: "IBM Learning completions", base: 12400 },
      { id: "badges", label: "Badges earned", base: 9100 },
      { id: "certs", label: "Qiskit certifications", base: 2300 },
      { id: "classroom", label: "Classroom accounts created", base: 410 },
      { id: "advocates", label: "Qiskit Advocates engaged", base: 760 },
      { id: "projects", label: "Projects completed", base: 3150 },
      { id: "opensource", label: "Open-source contributions", base: 1980 },
      { id: "research", label: "Research placements", base: 320 },
      { id: "internships", label: "Internships secured", base: 480 },
      { id: "apprenticeships", label: "Apprenticeships secured", base: 145 },
      { id: "gradschool", label: "Graduate school placements", base: 260 },
      { id: "jobs", label: "Jobs secured", base: 390 },
      { id: "employers", label: "Employer partners engaged", base: 95 },
      { id: "readiness", label: "Enterprise readiness assessments", base: 72 },
      { id: "teams", label: "Quantum teams mapped", base: 138 }
    ],

    purposes: [
      { id: "learning", label: "Learning" }, { id: "practice", label: "Practice" },
      { id: "community", label: "Community" }, { id: "research", label: "Research" },
      { id: "projects", label: "Projects" }, { id: "industry", label: "Industry" },
      { id: "careers", label: "Careers" }
    ]
  };

  /* ================================================================ *
   *  HELPERS / STATE
   * ================================================================ */

  const state = { avatar: null, interest: null, goal: null, roleFamily: null, scenario: "pharma", readiness: {} };
  const $ = (s, r) => (r || document).querySelector(s);
  const byId = (list, id) => list.find((x) => x.id === id);
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function chipList(arr) { return arr.map((s) => `<span class="mini-tag">${s}</span>`).join(""); }
  function tagRow(arr) { return `<div class="mini-tags">${chipList(arr)}</div>`; }
  function bulletList(arr) { return "<ul>" + arr.map((s) => `<li>${s}</li>`).join("") + "</ul>"; }

  /* ================================================================ *
   *  SELECTION CONTROLS
   * ================================================================ */

  function renderAvatars() {
    const grid = $("#avatarGrid");
    DATA.avatars.forEach((a) => {
      const card = el("button", "option-card");
      card.type = "button";
      card.setAttribute("role", "radio");
      card.setAttribute("aria-checked", "false");
      card.dataset.id = a.id;
      card.innerHTML = `<span class="option-title">${a.title}</span><span class="option-desc">${a.desc}</span>`;
      card.addEventListener("click", () => select("avatar", a.id));
      grid.appendChild(card);
    });
  }
  function renderInterests() {
    const row = $("#interestRow");
    DATA.interests.forEach((i) => {
      const chip = el("button", "chip");
      chip.type = "button";
      chip.setAttribute("role", "radio");
      chip.setAttribute("aria-checked", "false");
      chip.dataset.id = i.id;
      chip.textContent = i.label;
      chip.addEventListener("click", () => select("interest", i.id));
      row.appendChild(chip);
    });
  }
  function renderGoals() {
    const grid = $("#goalGrid");
    DATA.goals.forEach((g) => {
      const card = el("button", "option-card option-card--goal");
      card.type = "button";
      card.setAttribute("role", "radio");
      card.setAttribute("aria-checked", "false");
      card.dataset.id = g.id;
      card.innerHTML = `<span class="option-title">${g.label}</span>`;
      card.addEventListener("click", () => select("goal", g.id));
      grid.appendChild(card);
    });
  }

  const HINTS = {
    avatar: { sel: "#avatarGrid", hint: "#avatarHint", def: "Pick the profile that fits you best", list: "avatars", key: "title" },
    interest: { sel: "#interestRow", hint: "#interestHint", def: "Where do you want to apply quantum?", list: "interests", key: "label" },
    goal: { sel: "#goalGrid", hint: "#goalHint", def: "What outcome are you navigating toward?", list: "goals", key: "label" }
  };

  function select(kind, id) {
    state[kind] = id;
    const cfg = HINTS[kind];
    document.querySelectorAll(cfg.sel + " [data-id]").forEach((n) => {
      const on = n.dataset.id === id;
      n.classList.toggle("is-selected", on);
      n.setAttribute("aria-checked", on ? "true" : "false");
    });
    $(cfg.hint).textContent = byId(DATA[cfg.list], id)[cfg.key];
    updateSummary();
  }

  function updateSummary() {
    const parts = [];
    if (state.avatar) parts.push(byId(DATA.avatars, state.avatar).title);
    if (state.interest) parts.push(byId(DATA.interests, state.interest).label);
    if (state.goal) parts.push(byId(DATA.goals, state.goal).label);
    $("#selectionSummary").textContent = parts.join("  ·  ");
  }

  /* ================================================================ *
   *  PATHWAY GENERATION
   * ================================================================ */

  function recommendedFamily(avatar, interest, goal) {
    if (goal.gate === "research") return "research";
    if (goal.gate === "enterprise") return "consulting";
    if (goal.gate === "university") return "business";
    if (goal.gate === "community") return "business";
    return interest.family || "software";
  }

  function mission(kind, title, desc) { return { kind, title, desc }; }

  function buildPathway(avatar, interest, goal) {
    const famId = recommendedFamily(avatar, interest, goal);
    const fam = byId(DATA.roleFamilies, famId);
    let nodes;

    if (goal.gate === "enterprise" || avatar.id === "workforceboard" || goal.id === "talentpipeline" || avatar.id === "employer") {
      nodes = employerNodes(avatar, interest, goal);
    } else if (avatar.track === "university" || goal.gate === "university") {
      nodes = universityNodes(avatar, interest, goal);
    } else if (avatar.track === "community") {
      nodes = communityNodes(avatar, interest, goal);
    } else {
      nodes = learnerNodes(avatar, interest, goal);
    }

    const summary = {
      resources: resourceNamesFor(goal, fam),
      skills: fam.skills.slice(0, 6),
      badges: dedupe([goal.badge].concat(fam.badges.slice(0, 2))),
      projects: dedupe([interest.project].concat(fam.projects.slice(0, 2))),
      community: ["Qiskit Advocates", "Qiskit Fall Fest", "Qiskit Global Summer School"],
      opportunity: goal.outcome,
      family: fam
    };
    return { nodes, summary };
  }

  function learnerNodes(avatar, interest, goal) {
    const research = goal.gate === "research";
    const gateMission = research
      ? mission("research", "Read papers & match research", "Study work from IBM Quantum Network universities and identify labs in " + interest.label + ".")
      : mission("industry", "Find industry alignment", "Identify " + interest.partners + " and the roles you're targeting.");
    const connectMission = research
      ? mission("mentor", "Connect with faculty / a lab", "Reach out to researchers and prepare a focused message.")
      : mission("mentor", "Polish GitHub & interview story", "Clean up your portfolio and rehearse technical storytelling.");
    return [
      mission("start", avatar.start, avatar.desc),
      mission("skill", "Learn quantum foundations", "Build core intuition for qubits, gates, and measurement."),
      mission("skill", "Complete IBM Quantum Learning", "Work through structured modules and earn a foundations badge."),
      mission("skill", "Practice with Composer & Qiskit", "Move from theory to running real circuits."),
      mission("mission", "Go deep on " + interest.label, "Focus on " + interest.focus + "."),
      mission("community", "Join Qiskit Advocates / Fall Fest", "Plug into the community and find a mentor."),
      gateMission,
      mission("project", "Build a portfolio project", "Create " + interest.project + "."),
      connectMission,
      mission("apply", goal.apply, "Make your move — curiosity becomes contribution."),
      mission("outcome", goal.outcome, "A concrete, credible next step in the ecosystem.")
    ];
  }

  function universityNodes(avatar, interest, goal) {
    return [
      mission("start", "University readiness assessment", "Map faculty, courses, students, clubs, and research."),
      mission("mission", "Identify faculty champions", "Find the educators who will anchor the program."),
      mission("skill", "Use IBM Quantum Learning", "Adopt structured modules into existing courses."),
      mission("skill", "Set up Classroom Accounts", "Enable guided labs and assignments."),
      mission("community", "Host Qiskit Fall Fest", "Create a campus entry point and community."),
      mission("mentor", "Activate student advocates", "Develop student leaders and mentors."),
      mission("mission", "Build curriculum around role families", "Design tracks aligned to IBM Quantum role families."),
      mission("industry", "Connect students to projects & internships", "Link to " + interest.partners + " and the IBM Quantum Network."),
      mission("outcome", goal.outcome, "A sustainable university quantum workforce pathway.")
    ];
  }

  function employerNodes(avatar, interest, goal) {
    if (goal.gate === "enterprise") {
      return [
        mission("start", "Enterprise readiness check", "Assess business, data, workforce, technology, partnership & leadership readiness."),
        mission("mission", "Discover use cases", "Identify high-value problems in " + interest.label + "."),
        mission("mentor", "Assign an internal quantum team", "Stand up the cross-functional team (see Build the Quantum Team)."),
        mission("skill", "Close skills gaps", "Upskill the team via IBM Quantum Learning."),
        mission("industry", "Partner & pilot", "Engage " + interest.partners + " and the IBM Quantum Network."),
        mission("project", "Run a pilot project", "Prototype " + interest.project + " with the team."),
        mission("outcome", goal.outcome, "A prioritized, resourced enterprise quantum plan.")
      ];
    }
    return [
      mission("start", avatar.start, "Define your quantum workforce need in " + interest.label + "."),
      mission("mission", "Translate roles into skills", "Map target jobs to concrete skills and role families."),
      mission("community", "Partner with universities", "Connect with programs and the IBM Quantum Network."),
      mission("project", "Sponsor projects & capstones", "Fund " + interest.project + " as real-world experience."),
      mission("industry", "Offer internships & apprenticeships", "Create hands-on, project-based pathways."),
      mission("mentor", "Provide mentors & reviewers", "Guide talent with technical reviewers."),
      mission("apply", "Convert talent into roles", "Move proven candidates into jobs."),
      mission("outcome", goal.outcome, "A repeatable quantum-ready hiring pipeline.")
    ];
  }

  function communityNodes(avatar, interest, goal) {
    return [
      mission("start", avatar.start, "Identify your local audience and goals."),
      mission("skill", "Point members to IBM Quantum Learning", "Build shared foundations."),
      mission("community", "Host Qiskit Fall Fest", "Turn curiosity into a community entry point."),
      mission("mentor", "Recruit student advocates", "Activate Qiskit Advocates to lead locally."),
      mission("project", "Run project nights", "Build " + interest.project + " together."),
      mission("industry", "Connect to Network & employers", "Link members to " + interest.partners + "."),
      mission("outcome", goal.outcome, "A thriving local quantum community & pipeline.")
    ];
  }

  function resourceNamesFor(goal, fam) {
    const base = ["IBM Quantum Learning", "IBM Quantum Composer", "Qiskit"];
    if (goal.gate === "research") base.push("IBM Quantum Network", "IBM Research");
    else if (goal.gate === "industry") base.push("IBM Quantum Network", "IBM Quantum Careers");
    else if (goal.gate === "enterprise") base.push("IBM Quantum Case Studies", "IBM Quantum Network");
    else if (goal.gate === "university") base.push("Classroom Accounts", "Qiskit Fall Fest");
    else if (goal.gate === "community") base.push("Qiskit Advocates", "Qiskit Global Summer School");
    else base.push("IBM Quantum Ecosystem Projects");
    return dedupe(base);
  }
  function dedupe(arr) { return arr.filter((v, i) => arr.indexOf(v) === i); }

  function renderBoard(result) {
    const track = $("#boardTrack");
    track.innerHTML = "";
    result.nodes.forEach((n, idx) => {
      const space = el("li", "space space--" + n.kind);
      space.style.setProperty("--i", idx);
      const num = idx === 0 ? "Start" : (idx === result.nodes.length - 1 ? "★" : "M" + idx);
      const tag = labelForKind(n.kind);
      space.innerHTML =
        `<span class="space-num">${num}</span>` +
        (tag ? `<span class="space-phase">${tag}</span>` : "") +
        `<h3 class="space-title">${n.title}</h3>` +
        `<p class="space-desc">${n.desc}</p>`;
      track.appendChild(space);
      if (idx < result.nodes.length - 1) {
        const c = el("li", "space-connector", `<span class="conn-line"></span><span class="conn-chevron" aria-hidden="true">▸</span>`);
        c.style.setProperty("--i", idx);
        c.setAttribute("aria-hidden", "true");
        track.appendChild(c);
      }
    });
    track.classList.add("is-active");
    $("#boardEmpty").hidden = true;
    $("#boardLegend").hidden = false;

    // Summary panel
    const s = result.summary;
    $("#summaryPanel").hidden = false;
    $("#sumResources").innerHTML = chipList(s.resources);
    $("#sumSkills").innerHTML = chipList(s.skills);
    $("#sumBadges").innerHTML = chipList(s.badges);
    $("#sumProjects").innerHTML = chipList(s.projects);
    $("#sumCommunity").innerHTML = chipList(s.community);
    $("#sumOpportunity").textContent = s.opportunity;
    $("#sumFamily").innerHTML = `Recommended role family: <strong>${s.family.name}</strong>`;
  }

  function labelForKind(kind) {
    return {
      start: "Start", skill: "Skill Unlock", mission: "Mission", community: "Community",
      mentor: "Mentor Checkpoint", project: "Project Quest", research: "Research Gate",
      industry: "Industry Gate", apply: "Opportunity", outcome: "Outcome"
    }[kind] || "Mission";
  }

  /* ================================================================ *
   *  ADVISOR / NEXT BEST ACTION
   * ================================================================ */

  function updateAdvisor(avatar, interest, goal, result) {
    $("#advisorContext").innerHTML = `Tailored for <strong>${avatar.title}</strong> · ${interest.label} · ${goal.label}`;
    const list = $("#advisorList");
    list.innerHTML = "";
    [
      "Confirm the goal: <strong>" + goal.label + "</strong>",
      "Recommended role family: <strong>" + result.summary.family.name + "</strong>",
      "Map foundations to " + interest.focus,
      "Recommend " + interest.project,
      "Align with " + interest.partners,
      "Prepare to " + goal.prep,
      "Track toward: " + goal.outcome
    ].forEach((b) => list.appendChild(el("li", null, b)));

    const firstSkill = result.nodes.find((n) => n.kind === "skill");
    $("#nextActionText").textContent =
      (firstSkill ? firstSkill.title : "Start IBM Quantum Learning foundations") +
      ", then build " + interest.project + " before engaging " + interest.partners + ".";
    $("#nextAction").classList.add("is-live");
  }

  /* ================================================================ *
   *  POWER-UPS / KPI HIGHLIGHT
   * ================================================================ */

  function highlightAssets(avatar, interest, goal, fam) {
    const relevant = new Set();
    DATA.learningResources.forEach((r) => {
      if (r.families.includes(fam.id)) relevant.add(r.id);
    });
    relevant.add("learning"); relevant.add("qiskit");
    document.querySelectorAll("#assetGrid .asset-card").forEach((c) =>
      c.classList.toggle("is-unlocked", relevant.has(c.dataset.id)));
  }
  function focusKpis(goal) {
    const ids = new Set(goal.kpis || []);
    document.querySelectorAll("#kpiGrid .kpi-card").forEach((c) =>
      c.classList.toggle("is-focus", ids.has(c.dataset.id)));
  }

  /* ================================================================ *
   *  ROLE FAMILIES + ROLE-TO-SKILLS MAPPER
   * ================================================================ */

  function renderRoleFamilies() {
    const grid = $("#familyGrid");
    DATA.roleFamilies.forEach((f) => {
      const card = el("article", "family-card");
      card.style.setProperty("--fam", f.color);
      card.innerHTML =
        `<div class="family-top"><span class="family-letter">${f.letter}</span><h3>${f.name}</h3></div>` +
        `<p class="family-overview">${f.overview}</p>` +
        `<p class="family-sub">Example roles</p><div class="mini-tags">${chipList(f.examples)}</div>` +
        `<p class="family-sub">Core skills</p><div class="mini-tags">${chipList(f.skills)}</div>` +
        `<p class="family-sub">Learning pathway</p>${bulletList(f.learning)}`;
      grid.appendChild(card);
    });

    // Mapper selector
    const sel = $("#mapperSelect");
    DATA.roleFamilies.forEach((f) => {
      const btn = el("button", "mapper-tab");
      btn.type = "button";
      btn.dataset.id = f.id;
      btn.style.setProperty("--fam", f.color);
      btn.textContent = f.name;
      btn.addEventListener("click", () => showMapper(f.id));
      sel.appendChild(btn);
    });
  }

  function showMapper(id) {
    state.roleFamily = id;
    const f = byId(DATA.roleFamilies, id);
    document.querySelectorAll("#mapperSelect .mapper-tab").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.id === id));
    const panel = $("#mapperPanel");
    panel.style.setProperty("--fam", f.color);
    panel.hidden = false;
    panel.innerHTML =
      `<div class="mapper-head"><span class="family-letter">${f.letter}</span>` +
      `<div><h3>${f.name}</h3><p>${f.overview}</p></div></div>` +
      `<div class="mapper-grid">` +
      mapperBlock("Example jobs", tagRow(f.examples)) +
      mapperBlock("Core skills", tagRow(f.skills)) +
      mapperBlock("IBM learning resources", bulletList(f.learning)) +
      mapperBlock("Suggested badges", tagRow(f.badges)) +
      mapperBlock("Suggested projects", bulletList(f.projects)) +
      mapperBlock("Opportunities", tagRow(f.opportunities)) +
      mapperBlock("Best-fit profiles", tagRow(f.bestFit)) +
      `</div>`;
  }
  function mapperBlock(title, body) {
    return `<div class="mapper-block"><p class="mapper-label">${title}</p>${body}</div>`;
  }

  /* ================================================================ *
   *  WORKFORCE FORECAST
   * ================================================================ */

  function renderForecast() {
    const wrap = $("#forecastGrid");
    DATA.workforceForecast.forEach((y, idx) => {
      const card = el("article", "forecast-card");
      card.style.setProperty("--i", idx);
      card.innerHTML =
        `<span class="forecast-year">${y.year}</span>` +
        `<h3>${y.title}</h3>` +
        `<p>${y.summary}</p>` +
        `<p class="forecast-sub">Focus</p><div class="mini-tags">${chipList(y.focus)}</div>`;
      wrap.appendChild(card);
    });
  }

  /* ================================================================ *
   *  ENTERPRISE READINESS
   * ================================================================ */

  const LEVELS = [
    { id: "low", label: "Low", score: 1 },
    { id: "medium", label: "Medium", score: 2 },
    { id: "high", label: "High", score: 3 }
  ];

  function renderReadiness() {
    const wrap = $("#readinessRows");
    DATA.enterpriseReadiness.categories.forEach((c) => {
      state.readiness[c.id] = c.sample;
      const row = el("div", "readiness-row");
      row.dataset.cat = c.id;
      row.innerHTML =
        `<div class="readiness-info"><p class="readiness-name">${c.label}</p><p class="readiness-desc">${c.desc}</p></div>` +
        `<div class="readiness-levels">` +
        LEVELS.map((l) => `<button type="button" class="level-btn${l.id === c.sample ? " is-on" : ""}" data-level="${l.id}">${l.label}</button>`).join("") +
        `</div>`;
      row.querySelectorAll(".level-btn").forEach((b) => {
        b.addEventListener("click", () => {
          state.readiness[c.id] = b.dataset.level;
          row.querySelectorAll(".level-btn").forEach((x) => x.classList.toggle("is-on", x === b));
          computeReadiness();
        });
      });
      wrap.appendChild(row);
    });
    computeReadiness();
  }

  function computeReadiness() {
    const cats = DATA.enterpriseReadiness.categories;
    let total = 0;
    cats.forEach((c) => { total += (byId(LEVELS, state.readiness[c.id]) || LEVELS[0]).score; });
    const pct = Math.round((total / (cats.length * 3)) * 100);
    $("#readinessMeterFill").style.width = pct + "%";
    $("#readinessScore").textContent = pct + "% ready";
    let verdict;
    if (pct >= 75) verdict = "Quantum exploring — pilot a real use case now.";
    else if (pct >= 50) verdict = "Building readiness — close the gaps below before piloting.";
    else verdict = "Early stage — start with use cases, sponsorship, and skills.";
    $("#readinessVerdict").textContent = verdict;
    $("#readinessRec").textContent = DATA.enterpriseReadiness.recommendation;
  }

  /* ================================================================ *
   *  QUANTUM TEAM BUILDER
   * ================================================================ */

  function renderTeam() {
    const sel = $("#scenarioSelect");
    DATA.teamScenarios.forEach((sc) => {
      const btn = el("button", "scenario-tab" + (sc.id === state.scenario ? " is-active" : ""));
      btn.type = "button";
      btn.dataset.id = sc.id;
      btn.textContent = sc.label;
      btn.addEventListener("click", () => {
        state.scenario = sc.id;
        document.querySelectorAll("#scenarioSelect .scenario-tab").forEach((x) => x.classList.toggle("is-active", x === btn));
        $("#scenarioContext").textContent = sc.context;
      });
      sel.appendChild(btn);
    });
    $("#scenarioContext").textContent = byId(DATA.teamScenarios, state.scenario).context;

    const grid = $("#teamGrid");
    DATA.teamRoles.forEach((r, idx) => {
      const card = el("article", "team-card");
      card.style.setProperty("--i", idx);
      card.innerHTML =
        `<h3>${r.role}</h3>` +
        `<p class="team-does">${r.does}</p>` +
        `<dl class="team-meta">` +
        `<dt>Skills</dt><dd>${r.skills}</dd>` +
        `<dt>Learning</dt><dd>${r.modules}</dd>` +
        `<dt>Contributes</dt><dd>${r.contributes}</dd>` +
        `</dl>`;
      grid.appendChild(card);
    });
  }

  /* ================================================================ *
   *  UNIVERSITY CURRICULUM BUILDER
   * ================================================================ */

  function renderCurriculum() {
    const sel = $("#currSelect");
    DATA.roleFamilies.forEach((f) => {
      const btn = el("button", "curr-tab");
      btn.type = "button";
      btn.dataset.id = f.id;
      btn.style.setProperty("--fam", f.color);
      btn.textContent = f.name;
      btn.addEventListener("click", () => showCurriculum(f.id));
      sel.appendChild(btn);
    });
    showCurriculum("software");
  }

  function showCurriculum(id) {
    const f = byId(DATA.roleFamilies, id);
    document.querySelectorAll("#currSelect .curr-tab").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.id === id));
    const c = f.curriculum;
    const panel = $("#currPanel");
    panel.style.setProperty("--fam", f.color);
    panel.innerHTML =
      `<p class="curr-target">Target role family: <strong>${f.name}</strong></p>` +
      `<div class="curr-years">` +
      currYear("Year 1", c.y1) + currYear("Year 2", c.y2) +
      currYear("Year 3", c.y3) + currYear("Year 4", c.y4) +
      `</div>` +
      `<p class="curr-outcome"><span>Outcome</span> ${c.outcome}</p>`;
  }
  function currYear(label, items) {
    return `<div class="curr-year"><span class="curr-year-label">${label}</span>${bulletList(items)}</div>`;
  }

  /* ================================================================ *
   *  POWER-UPS (ASSET MAP)
   * ================================================================ */

  function renderAssets() {
    const filter = $("#purposeFilter");
    const all = el("button", "purpose-pill is-active");
    all.type = "button"; all.dataset.purpose = "all"; all.textContent = "All";
    all.addEventListener("click", () => filterAssets("all", all));
    filter.appendChild(all);
    DATA.purposes.forEach((p) => {
      const pill = el("button", "purpose-pill");
      pill.type = "button"; pill.dataset.purpose = p.id; pill.textContent = p.label;
      pill.addEventListener("click", () => filterAssets(p.id, pill));
      filter.appendChild(pill);
    });

    const grid = $("#assetGrid");
    DATA.learningResources.forEach((r) => {
      const fams = r.families.map((fid) => byId(DATA.roleFamilies, fid))
        .filter(Boolean).map((f) => `<span class="asset-fam" style="--fam:${f.color}">${f.name}</span>`).join("");
      const card = el("a", "asset-card");
      card.href = r.url; card.target = "_blank"; card.rel = "noopener";
      card.dataset.id = r.id;
      card.dataset.purpose = r.purpose.join(" ");
      card.innerHTML =
        `<span class="asset-spark" aria-hidden="true">+</span>` +
        `<h3>${r.name}</h3>` +
        `<p>${r.helps}</p>` +
        `<p class="asset-stage">Stage · ${r.stage}</p>` +
        `<div class="asset-fams">${fams}</div>`;
      grid.appendChild(card);
    });
  }
  function filterAssets(purpose, pill) {
    document.querySelectorAll("#purposeFilter .purpose-pill").forEach((p) => p.classList.toggle("is-active", p === pill));
    document.querySelectorAll("#assetGrid .asset-card").forEach((c) => {
      const show = purpose === "all" || c.dataset.purpose.split(" ").includes(purpose);
      c.classList.toggle("is-hidden", !show);
    });
  }

  /* ================================================================ *
   *  KPI DASHBOARD
   * ================================================================ */

  function renderKpis() {
    const grid = $("#kpiGrid");
    DATA.kpis.forEach((k) => {
      const card = el("div", "kpi-card");
      card.dataset.id = k.id;
      card.innerHTML = `<span class="kpi-value" data-target="${k.base}">0</span><span class="kpi-label">${k.label}</span>`;
      grid.appendChild(card);
    });
  }
  let kpiAnimated = false;
  function animateKpis() {
    if (kpiAnimated) return;
    kpiAnimated = true;
    document.querySelectorAll(".kpi-value").forEach((node) => {
      const target = parseInt(node.dataset.target, 10) || 0;
      const start = performance.now(), dur = 1400;
      (function tick(now) {
        const t = Math.min(1, (now - start) / dur);
        node.textContent = Math.round(target * (1 - Math.pow(1 - t, 3))).toLocaleString();
        if (t < 1) requestAnimationFrame(tick);
      })(performance.now());
    });
  }

  /* ================================================================ *
   *  GENERATE / RESET / DEMO
   * ================================================================ */

  function generate() {
    const missing = [];
    if (!state.avatar) missing.push("#avatarBlock");
    if (!state.interest) missing.push("#interestBlock");
    if (!state.goal) missing.push("#goalBlock");
    if (missing.length) {
      const first = $(missing[0]);
      first.classList.add("needs-attention");
      setTimeout(() => first.classList.remove("needs-attention"), 1500);
      first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const avatar = byId(DATA.avatars, state.avatar);
    const interest = byId(DATA.interests, state.interest);
    const goal = byId(DATA.goals, state.goal);
    const result = buildPathway(avatar, interest, goal);
    renderBoard(result);
    updateAdvisor(avatar, interest, goal, result);
    highlightAssets(avatar, interest, goal, result.summary.family);
    focusKpis(goal);
    showMapper(result.summary.family.id);
    document.getElementById("board").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function reset() {
    state.avatar = state.interest = state.goal = null;
    document.querySelectorAll(".option-card, .chip").forEach((n) => {
      n.classList.remove("is-selected"); n.setAttribute("aria-checked", "false");
    });
    Object.values(HINTS).forEach((c) => { $(c.hint).textContent = c.def; });
    updateSummary();
    $("#boardTrack").innerHTML = "";
    $("#boardTrack").classList.remove("is-active");
    $("#boardEmpty").hidden = false;
    $("#boardLegend").hidden = true;
    $("#summaryPanel").hidden = true;
    $("#advisorContext").textContent = "Select an avatar and goal to tailor this view.";
    $("#nextActionText").textContent = "Generate a pathway to reveal the single most important next move.";
    $("#nextAction").classList.remove("is-live");
    document.querySelectorAll(".asset-card").forEach((c) => c.classList.remove("is-unlocked"));
    document.querySelectorAll(".kpi-card").forEach((c) => c.classList.remove("is-focus"));
    document.getElementById("navigator").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function loadShorDemo() {
    select("avatar", "physics");
    select("interest", "medicine");
    select("goal", "phd");
    generate();
    showMapper("research");
  }

  /* ================================================================ *
   *  INIT
   * ================================================================ */

  function init() {
    renderAvatars();
    renderInterests();
    renderGoals();
    renderRoleFamilies();
    renderForecast();
    renderReadiness();
    renderTeam();
    renderCurriculum();
    renderAssets();
    renderKpis();
    showMapper("software");

    $("#generateBtn").addEventListener("click", generate);
    $("#resetBtn").addEventListener("click", reset);
    document.querySelectorAll(".js-demo").forEach((b) => b.addEventListener("click", loadShorDemo));

    const kpiSection = document.getElementById("kpis");
    if ("IntersectionObserver" in window && kpiSection) {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { animateKpis(); obs.disconnect(); } });
      }, { threshold: 0.2 });
      obs.observe(kpiSection);
    } else { animateKpis(); }

    try {
      if (window.location.hash) {
        const target = document.querySelector(window.location.hash);
        if (target) setTimeout(() => target.scrollIntoView(), 200);
      }
      if (new URLSearchParams(window.location.search).get("demo") === "1") loadShorDemo();
    } catch (e) { /* no-op */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
