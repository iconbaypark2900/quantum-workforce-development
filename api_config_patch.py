"""
api_config_patch.py — objectives and presets catalog for /api/config/* endpoints.

Paper schema per entry in papers[]:
  role          : "foundational" | "modern"  (optional; frontend defaults to "foundational")
  title         : display title
  citation      : author/year/venue string
  url           : canonical page (publisher, arXiv abstract, SSRN)
  download_path : arXiv PDF URL or local /downloads/... path  (optional; OA only)
  note          : explanatory note shown beneath citation  (optional)

Notebook schema per entry in notebooks[]:
  path          : repo-relative path to the .ipynb source
  title         : short label
  download_path : URL path served by Next.js static (/downloads/notebooks/...)

IBM Quantum scope (gate-model Runtime):
  VQE is the only objective with an IBM Quantum path (execution_kind: ibm_runtime).
  All other objectives run on CPU.  QAOA over the same QUBO is a planned follow-up.
"""

OBJECTIVES_CONFIG = {
    "equal_weight": {
        "label": "Equal Weight",
        "description": (
            "1/N — equal allocation across all assets. "
            "Benchmark baseline; surprisingly hard to beat out-of-sample "
            "on a risk-adjusted basis."
        ),
        "family": "classical",
        "fast": True,
        "papers": [
            {
                "role": "foundational",
                "title": "Optimal Versus Naive Diversification: How Inefficient is the 1/N Portfolio Strategy?",
                "citation": "DeMiguel, Garlappi & Uppal (2009) — Review of Financial Studies",
                "url": "https://doi.org/10.1093/rfs/hhm075",
            },
            {
                "role": "modern",
                "title": "60 Years of Portfolio Optimization: Practical Challenges and Current Trends",
                "citation": "Kolm, Tütüncü & Fabozzi (2014) — European Journal of Operational Research",
                "url": "https://doi.org/10.1016/j.ejor.2013.08.011",
            },
        ],
        "notebooks": [
            {
                "path": "notebooks/objectives/01-equal-weight.ipynb",
                "title": "Equal Weight — benchmark and comparison",
                "download_path": "/downloads/notebooks/01-equal-weight.ipynb",
            },
        ],
        "code_refs": [
            {"path": "methods/equal_weight.py", "label": "equal_weight"},
            {"path": "core/optimizers/equal_weight.py", "label": "optimizer wrapper"},
        ],
    },

    "markowitz": {
        "label": "Markowitz Max-Sharpe",
        "description": (
            "Maximum Sharpe Ratio via SLSQP with multi-start restarts. "
            "Solves the mean–variance efficient frontier as a quadratic program."
        ),
        "family": "classical",
        "fast": True,
        "papers": [
            {
                "role": "foundational",
                "title": "Portfolio Selection",
                "citation": "Markowitz (1952) — Journal of Finance",
                "url": "https://doi.org/10.1111/j.1540-6261.1952.tb01525.x",
            },
            {
                "role": "modern",
                "title": "Convex Optimization — Ch. 4: Convex Optimization Problems (§4.4 Efficient Frontier as QP)",
                "citation": "Boyd & Vandenberghe (2004) — Cambridge University Press (free online)",
                "url": "https://web.stanford.edu/~boyd/cvxbook/",
                "download_path": "https://web.stanford.edu/~boyd/cvxbook/bv_cvxbook.pdf",
            },
        ],
        "notebooks": [
            {
                "path": "notebooks/objectives/02-markowitz.ipynb",
                "title": "Markowitz Max-Sharpe — mean–variance optimization",
                "download_path": "/downloads/notebooks/02-markowitz.ipynb",
            },
        ],
        "code_refs": [
            {"path": "methods/markowitz.py", "label": "markowitz_max_sharpe"},
            {"path": "core/optimizers/markowitz.py", "label": "optimizer wrapper"},
        ],
    },

    "min_variance": {
        "label": "Minimum Variance",
        "description": (
            "Global minimum-variance portfolio — minimizes portfolio risk "
            "without specifying a return target."
        ),
        "family": "classical",
        "fast": True,
        "papers": [
            {
                "role": "foundational",
                "title": "Portfolio Selection",
                "citation": "Markowitz (1952) — Journal of Finance",
                "url": "https://doi.org/10.1111/j.1540-6261.1952.tb01525.x",
            },
            {
                "role": "modern",
                "title": "Analytical Nonlinear Shrinkage of Large-Dimensional Covariance Matrices",
                "citation": "Ledoit & Wolf (2020) — Annals of Statistics",
                "url": "https://arxiv.org/abs/1910.13597",
                "download_path": "https://arxiv.org/pdf/1910.13597",
            },
        ],
        "notebooks": [
            {
                "path": "notebooks/objectives/03-min-variance.ipynb",
                "title": "Minimum Variance — global min-var portfolio",
                "download_path": "/downloads/notebooks/03-min-variance.ipynb",
            },
        ],
        "code_refs": [
            {"path": "methods/markowitz.py", "label": "min_variance"},
            {"path": "core/optimizers/markowitz.py", "label": "optimizer wrapper"},
        ],
    },

    "target_return": {
        "label": "Target Return",
        "description": (
            "Minimum-variance portfolio constrained to achieve a specified return target — "
            "one point on the efficient frontier."
        ),
        "family": "classical",
        "fast": True,
        "papers": [
            {
                "role": "foundational",
                "title": "Portfolio Selection",
                "citation": "Markowitz (1952) — Journal of Finance",
                "url": "https://doi.org/10.1111/j.1540-6261.1952.tb01525.x",
            },
            {
                "role": "modern",
                "title": "Convex Optimization — §4.4 Efficient Frontier as a Parametric QP",
                "citation": "Boyd & Vandenberghe (2004) — Cambridge University Press (free online)",
                "url": "https://web.stanford.edu/~boyd/cvxbook/",
                "download_path": "https://web.stanford.edu/~boyd/cvxbook/bv_cvxbook.pdf",
            },
        ],
        "notebooks": [
            {
                "path": "notebooks/objectives/04-target-return.ipynb",
                "title": "Target Return — efficient frontier point",
                "download_path": "/downloads/notebooks/04-target-return.ipynb",
            },
        ],
        "code_refs": [
            {"path": "methods/markowitz.py", "label": "target_return_frontier"},
            {"path": "core/optimizers/markowitz.py", "label": "optimizer wrapper"},
        ],
    },

    "hrp": {
        "label": "HRP",
        "description": (
            "Hierarchical Risk Parity — clusters assets by correlation, then allocates "
            "risk via recursive bisection. Robust when the covariance matrix is noisy "
            "or nearly singular."
        ),
        "family": "classical",
        "fast": True,
        "papers": [
            {
                "role": "foundational",
                "title": "Building Diversified Portfolios that Outperform Out-of-Sample",
                "citation": "López de Prado (2016) — Journal of Portfolio Management",
                "url": "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2708678",
            },
            {
                "role": "modern",
                "title": "Advances in Financial Machine Learning — Ch. 16: Machine Learning Asset Allocation",
                "citation": "López de Prado (2018) — Wiley",
                "url": "https://www.wiley.com/en-us/Advances+in+Financial+Machine+Learning-p-9781119482086",
            },
        ],
        "notebooks": [
            {
                "path": "notebooks/objectives/05-hrp.ipynb",
                "title": "HRP — hierarchical risk parity",
                "download_path": "/downloads/notebooks/05-hrp.ipynb",
            },
        ],
        "code_refs": [
            {"path": "methods/hrp.py", "label": "hrp_weights"},
            {"path": "core/optimizers/hrp.py", "label": "optimizer wrapper"},
        ],
    },

    "qubo_sa": {
        "label": "QUBO + Simulated Annealing",
        "description": (
            "Binary asset selection encoded as a QUBO / Ising problem, solved with "
            "simulated annealing on CPU. The QUBO structure is identical to the "
            "formulation used in quantum annealers; SA is the classical solver used here."
        ),
        "family": "quantum",
        "fast": False,
        "papers": [
            {
                "role": "foundational",
                "title": "Quantum Computing for Finance: Overview and Prospects",
                "citation": "Orús, Mugel & Lizaso (2019) — Reviews in Physics",
                "url": "https://arxiv.org/abs/1811.03975",
                "download_path": "https://arxiv.org/pdf/1811.03975",
            },
            {
                "role": "modern",
                "title": "Ising Formulations of Many NP Problems",
                "citation": "Lucas (2014) — Frontiers in Physics",
                "url": "https://arxiv.org/abs/1302.5843",
                "download_path": "https://arxiv.org/pdf/1302.5843",
            },
        ],
        "notebooks": [
            {
                "path": "notebooks/objectives/06-qubo-sa.ipynb",
                "title": "QUBO + SA — binary asset selection via Ising/QUBO",
                "download_path": "/downloads/notebooks/06-qubo-sa.ipynb",
            },
        ],
        "code_refs": [
            {"path": "methods/qubo_sa.py", "label": "qubo_sa_weights"},
            {"path": "core/optimizers/qubo_sa.py", "label": "optimizer wrapper"},
        ],
    },

    "qaoa": {
        "label": "QAOA — Quantum Approximate Optimization",
        "description": (
            "Binary asset selection via QAOA: the same QUBO as qubo_sa is mapped to an "
            "Ising Hamiltonian and minimised with a parameterised gate-model circuit. "
            "Classical path: numpy statevector simulation (≤12 assets). "
            "IBM Quantum path: p-layer QAOA circuit on Qiskit Runtime — EstimatorV2 "
            "optimises circuit angles (COBYLA), SamplerV2 extracts the final bitstring "
            "(requires configured IBM token + execution_kind: ibm_runtime)."
        ),
        "family": "quantum",
        "fast": False,
        "papers": [
            {
                "role": "foundational",
                "title": "A Quantum Approximate Optimization Algorithm",
                "citation": "Farhi, Goldstone & Gutmann (2014) — arXiv:1411.4028",
                "url": "https://arxiv.org/abs/1411.4028",
                "download_path": "https://arxiv.org/pdf/1411.4028",
            },
            {
                "role": "modern",
                "title": "QAOA: Performance, Mechanism, and Implementation on NISQ Devices",
                "citation": "Zhou et al. (2020) — Physical Review X",
                "url": "https://arxiv.org/abs/1812.01041",
                "download_path": "https://arxiv.org/pdf/1812.01041",
            },
        ],
        "notebooks": [
            {
                "path": "notebooks/objectives/09-qaoa.ipynb",
                "title": "QAOA — binary selection via gate-model circuit",
                "download_path": "/downloads/notebooks/09-qaoa.ipynb",
            },
        ],
        "code_refs": [
            {"path": "methods/qaoa.py", "label": "qaoa_weights / qaoa_weights_ibm_strict"},
            {"path": "core/optimizers/qaoa.py", "label": "optimizer wrapper"},
        ],
    },

    "vqe": {
        "label": "VQE — Variational Quantum Eigensolver",
        "description": (
            "Parameterised quantum circuit optimised with COBYLA (gradient-free). "
            "Classical path: PauliTwoDesign ansatz simulated in numpy. "
            "IBM Quantum path: EfficientSU2 circuit on Qiskit Runtime SamplerV2 "
            "(requires configured IBM token and execution_kind: ibm_runtime in the run payload)."
        ),
        "family": "quantum",
        "fast": False,
        "papers": [
            {
                "role": "foundational",
                "title": "A Variational Eigenvalue Solver on a Photonic Chip",
                "citation": "Peruzzo et al. (2014) — Nature Communications",
                "url": "https://arxiv.org/abs/1304.3061",
                "download_path": "https://arxiv.org/pdf/1304.3061",
            },
            {
                "role": "modern",
                "title": "The Variational Quantum Eigensolver: A Review of Methods and Best Practices",
                "citation": "Tilly et al. (2022) — Physics Reports",
                "url": "https://arxiv.org/abs/2111.05176",
                "download_path": "https://arxiv.org/pdf/2111.05176",
            },
        ],
        "notebooks": [
            {
                "path": "notebooks/objectives/07-vqe.ipynb",
                "title": "VQE — variational quantum portfolio optimization",
                "download_path": "/downloads/notebooks/07-vqe.ipynb",
            },
        ],
        "code_refs": [
            {"path": "methods/vqe.py", "label": "vqe_weights / vqe_weights_ibm_strict"},
            {"path": "core/optimizers/vqe.py", "label": "optimizer wrapper"},
        ],
    },

    "hybrid_qaoa": {
        "label": "Hybrid Pipeline — QAOA Stage (IBM Runtime / classical)",
        "description": (
            "Updated 3-stage Quantum Ledger pipeline where the combinatorial selection stage "
            "uses QAOA instead of simulated annealing: "
            "(1) IC Screening — rank assets by μ/σ, keep top K_screen; "
            "(2) QAOA Selection — gate-model QAOA circuit minimises the same QUBO, "
            "extracting the highest-probability K_select-hot bitstring; "
            "(3) Markowitz Allocation — convex Max-Sharpe on chosen assets. "
            "Classical path: numpy statevector (K_screen ≤ 12). "
            "IBM Quantum path: EstimatorV2 + SamplerV2 on Qiskit Runtime (K_screen ≤ 20)."
        ),
        "family": "hybrid",
        "fast": False,
        "papers": [
            {
                "role": "foundational",
                "title": "Portfolio Selection — Markowitz allocation (stage 3)",
                "citation": "Markowitz (1952) — Journal of Finance",
                "url": "https://doi.org/10.1111/j.1540-6261.1952.tb01525.x",
            },
            {
                "role": "foundational",
                "title": "A Quantum Approximate Optimization Algorithm — QAOA selection (stage 2)",
                "citation": "Farhi, Goldstone & Gutmann (2014) — arXiv:1411.4028",
                "url": "https://arxiv.org/abs/1411.4028",
                "download_path": "https://arxiv.org/pdf/1411.4028",
            },
            {
                "role": "modern",
                "title": "QAOA: Performance, Mechanism, and Implementation on NISQ Devices",
                "citation": "Zhou et al. (2020) — Physical Review X",
                "url": "https://arxiv.org/abs/1812.01041",
                "download_path": "https://arxiv.org/pdf/1812.01041",
                "note": (
                    "Related reading for the QAOA stage. "
                    "The 3-stage hybrid design is an original Quantum Ledger synthesis."
                ),
            },
        ],
        "notebooks": [
            {
                "path": "notebooks/objectives/10-hybrid-qaoa.ipynb",
                "title": "Hybrid-QAOA — IC screen → QAOA select → Markowitz allocate",
                "download_path": "/downloads/notebooks/10-hybrid-qaoa.ipynb",
            },
        ],
        "code_refs": [
            {"path": "methods/hybrid_pipeline.py", "label": "hybrid_qaoa_weights"},
            {"path": "core/optimizers/hybrid_qaoa.py", "label": "optimizer wrapper"},
        ],
    },

    "hybrid": {
        "label": "Hybrid Pipeline — Quantum Ledger",
        "description": (
            "Original Quantum Ledger 3-stage pipeline (runs entirely on CPU): "
            "(1) IC Screening — rank all N assets by Information Coefficient (μ/σ), keep top K_screen; "
            "(2) QUBO Selection — binary asset selection via simulated annealing on screened sub-universe; "
            "(3) Markowitz Allocation — convex Max-Sharpe on the K_select chosen assets. "
            "Created for this project; combines classical and quantum-inspired stages."
        ),
        "family": "hybrid",
        "fast": False,
        "papers": [
            {
                "role": "foundational",
                "title": "Portfolio Selection — Markowitz allocation (stage 3)",
                "citation": "Markowitz (1952) — Journal of Finance",
                "url": "https://doi.org/10.1111/j.1540-6261.1952.tb01525.x",
            },
            {
                "role": "foundational",
                "title": "Quantum Computing for Finance — QUBO selection basis (stage 2)",
                "citation": "Orús, Mugel & Lizaso (2019) — Reviews in Physics",
                "url": "https://arxiv.org/abs/1811.03975",
                "download_path": "https://arxiv.org/pdf/1811.03975",
            },
            {
                "role": "modern",
                "title": "Variational Quantum Algorithms — hybrid QC landscape (related reading)",
                "citation": "Cerezo et al. (2021) — Nature Reviews Physics",
                "url": "https://arxiv.org/abs/2012.09265",
                "download_path": "https://arxiv.org/pdf/2012.09265",
                "note": (
                    "Related reading only. "
                    "This repo's 3-stage pipeline is an implementation synthesis; "
                    "it does not reproduce any single published system."
                ),
            },
        ],
        "notebooks": [
            {
                "path": "notebooks/objectives/08-hybrid-pipeline.ipynb",
                "title": "Hybrid Pipeline — IC screen → QUBO select → Markowitz allocate",
                "download_path": "/downloads/notebooks/08-hybrid-pipeline.ipynb",
            },
        ],
        "code_refs": [
            {"path": "methods/hybrid_pipeline.py", "label": "hybrid_pipeline_weights"},
            {"path": "core/optimizers/hybrid_pipeline.py", "label": "optimizer wrapper"},
        ],
    },
}


PRESETS_CONFIG = {
    "default": {
        "label": "Balanced · Hybrid",
        "description": "3-stage hybrid (screen → QUBO select → allocate). Good default for exploration.",
        "objective": "hybrid",
        "weight_min": 0.005,
        "weight_max": 0.30,
        "K_screen": None,
        "K_select": None,
    },
    "classical": {
        "label": "Classical · Max Sharpe",
        "description": "Markowitz max-Sharpe (SLSQP). Stable when covariance is well behaved.",
        "objective": "markowitz",
        "weight_min": 0.005,
        "weight_max": 0.30,
    },
    "conservative": {
        "label": "Defensive · Min variance",
        "description": "Global minimum-variance; prioritize capital preservation over return.",
        "objective": "min_variance",
        "weight_min": 0.005,
        "weight_max": 0.20,
    },
    "diversified": {
        "label": "Diversified · HRP",
        "description": "Hierarchical risk parity — balances clusters without full-matrix inversion.",
        "objective": "hrp",
        "weight_min": 0.005,
        "weight_max": 0.25,
    },
    "quantum_select": {
        "label": "Quantum · QUBO select",
        "description": "Binary asset selection via QUBO + simulated annealing; wide cap on chosen names.",
        "objective": "qubo_sa",
        "weight_min": 0.0,
        "weight_max": 1.0,
        "K": None,  # auto
    },
    "sim_crash_day": {
        "label": "Stress · Crash day",
        "description": "For single-day crash narrative (cf. Simulations: Black Monday 1987): min-var, tight 10% cap.",
        "objective": "min_variance",
        "weight_min": 0.02,
        "weight_max": 0.10,
    },
    "sim_gfc_drawdown": {
        "label": "Stress · Credit drawdown",
        "description": "For prolonged credit crisis narrative (cf. Simulations: 2008 GFC, COVID): HRP, 18% cap.",
        "objective": "hrp",
        "weight_min": 0.005,
        "weight_max": 0.18,
    },
    "sim_relief_rally": {
        "label": "Stress · Relief rally",
        "description": "For relief / momentum day narrative (cf. Simulations: Vaccine Monday, stimulus): max-Sharpe, 35% cap.",
        "objective": "markowitz",
        "weight_min": 0.005,
        "weight_max": 0.35,
    },
}


# Regime-to-optimizer parameter mappings.
# Each regime adjusts lambda_risk (risk aversion in QUBO/Hybrid objectives),
# tightens/loosens weight_max, and optionally adjusts the return assumption.
# These are applied additively on top of the user-supplied parameters so that
# an explicit lambda_risk in the request body is multiplied by the regime factor.
REGIME_OPTIMIZER_PARAMS = {
    "normal": {
        "lambda_risk_factor": 1.0,
        "weight_max_delta": 0.0,
        "description": "Baseline — no adjustments. Standard risk aversion and weight cap.",
    },
    "bull": {
        "lambda_risk_factor": 0.5,
        "weight_max_delta": 0.03,
        "description": (
            "Bull market: halves risk aversion (λ × 0.5) to allow more aggressive positioning; "
            "loosens max-weight cap by +3pp to permit higher concentration in leaders."
        ),
    },
    "bear": {
        "lambda_risk_factor": 2.0,
        "weight_max_delta": -0.05,
        "description": (
            "Bear market: doubles risk aversion (λ × 2.0) for defensive posture; "
            "tightens max-weight cap by −5pp to enforce broader diversification."
        ),
    },
    "volatile": {
        "lambda_risk_factor": 1.5,
        "weight_max_delta": -0.03,
        "description": (
            "High-volatility regime: raises risk aversion 1.5× to penalize variance-heavy "
            "allocations; tightens max-weight cap by −3pp. QUBO/Hybrid objectives will "
            "prefer lower-concentration, lower-covariance solutions."
        ),
    },
    "crisis": {
        "lambda_risk_factor": 3.0,
        "weight_max_delta": -0.08,
        "description": (
            "Crisis mode: triples risk aversion (λ × 3.0) and tightens cap by −8pp. "
            "Strongly penalizes correlated, high-variance positions. Pairs well with "
            "min_variance or HRP objectives."
        ),
    },
}
