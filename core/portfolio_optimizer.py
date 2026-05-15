"""
Unified portfolio optimisation service.

Routes by `objective` parameter to one of the supported methods:

  equal_weight   : 1/N baseline
  markowitz      : Markowitz Max-Sharpe via SLSQP
  min_variance   : Global Minimum Variance
  hrp            : Hierarchical Risk Parity (López de Prado 2016)
  mean_cvar      : Mean-CVaR scenario-based tail-risk optimization (Rockafellar & Uryasev 2000)
  qubo_sa        : QUBO + Simulated Annealing (Orús et al. 2019)
  vqe            : VQE PauliTwoDesign (Scientific Reports 2023)
  hybrid         : 3-Stage Hybrid Pipeline (Buonaiuto/Herman 2025)
  target_return  : Efficient frontier point at a specific return target

All methods accept (mu, Sigma) in annualised units and return an
OptimizationResult with a uniform fields contract.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import numpy as np

from core.optimizers.equal_weight import equal_weight
from core.optimizers.markowitz import markowitz_max_sharpe, min_variance, target_return_frontier
from core.optimizers.hrp import hrp_weights
from core.optimizers.mean_cvar import mean_cvar_weights
from core.optimizers.qubo_sa import qubo_sa_weights
from core.optimizers.qaoa import qaoa_weights
from core.optimizers.vqe import vqe_weights
from core.optimizers.hybrid_pipeline import hybrid_pipeline_weights
from core.optimizers.hybrid_qaoa import hybrid_qaoa_weights
from services import factor_models


# ── Valid objectives ────────────────────────────────────────────────────────

OBJECTIVES = {
    "equal_weight":    "Equal Weight (1/N) — baseline",
    "markowitz":       "Markowitz Max-Sharpe (Markowitz 1952)",
    "min_variance":    "Global Minimum Variance",
    "hrp":             "Hierarchical Risk Parity (López de Prado 2016)",
    "mean_cvar":       "Mean-CVaR scenario-based tail-risk optimization (Rockafellar & Uryasev 2000)",
    "qubo_sa":         "QUBO + Simulated Annealing (Orús et al. 2019)",
    "braket_annealing":"QUBO + D-Wave Quantum Annealing via AWS Braket (classical SA fallback when unavailable)",
    "qaoa":            "QAOA — Quantum Approx. Optimization (IBM Runtime / classical)",
    "vqe":             "VQE PauliTwoDesign (Scientific Reports 2023)",
    "hybrid":          "3-Stage Hybrid Pipeline — IC Screen → QUBO-SA → Markowitz",
    "hybrid_qaoa":     "3-Stage Hybrid Pipeline — IC Screen → QAOA → Markowitz (IBM Runtime / classical)",
    "target_return":   "Minimum-variance at target return",
}


# ── Result dataclass ────────────────────────────────────────────────────────

@dataclass
class OptimizationResult:
    """Uniform result contract for all optimisation methods."""
    weights: np.ndarray
    objective: str
    sharpe_ratio: float
    expected_return: float
    volatility: float
    n_active: int
    # Optional richer diagnostics
    asset_names: Optional[List[str]] = None
    stage_info: Optional[Dict] = None   # populated by hybrid pipeline
    quantum_metadata: Optional[Dict[str, Any]] = None  # diagnostics for lab / IBM paths
    constraint_report: Optional[Dict[str, Any]] = None
    factor_exposures: Optional[Dict[str, Any]] = None  # cross-sectional 4-factor exposure
    # Mean-CVaR / tail-risk fields (populated when objective="mean_cvar")
    var_95: Optional[float] = None
    cvar_95: Optional[float] = None
    solver_status: Optional[str] = None
    solve_time_ms: Optional[float] = None
    n_scenarios: Optional[int] = None
    # Sprint 3 — solver backend transparency
    backend: Optional[str] = None
    solver: Optional[str] = None
    objective_value: Optional[float] = None


# ── Portfolio metric helpers ────────────────────────────────────────────────

def _portfolio_metrics(w: np.ndarray, mu: np.ndarray, Sigma: np.ndarray, rf: float = 0.0) -> Dict:
    r = float(w @ mu)
    v = float(np.sqrt(w @ Sigma @ w))
    sr = (r - rf) / v if v > 1e-10 else 0.0
    n_active = int(np.sum(w > 1e-4))
    return {"return": r, "volatility": v, "sharpe": sr, "n_active": n_active}


# ── Main entry point ────────────────────────────────────────────────────────

def run_optimization(
    returns: np.ndarray,
    covariance: np.ndarray,
    objective: str = "hybrid",
    target_return: Optional[float] = None,
    asset_names: Optional[List[str]] = None,
    # Mean-CVaR parameters
    scenarios: Optional[np.ndarray] = None,
    confidence_level: float = 0.95,
    risk_aversion: float = 1.0,
    # Unified portfolio constraints (Sprint 2)
    constraints: Optional[Any] = None,
    previous_weights: Optional[np.ndarray] = None,
    sectors: Optional[List[str]] = None,
    # Solver backend router (Sprint 3)
    backend: str = "auto",
    # QUBO / Hybrid parameters
    K: Optional[int] = None,
    K_screen: Optional[int] = None,
    K_select: Optional[int] = None,
    lambda_risk: float = 1.0,
    gamma: float = 8.0,
    # VQE parameters
    n_layers: int = 3,
    n_restarts: int = 8,
    # Weight bounds
    weight_min: float = 0.005,
    weight_max: float = 0.30,
    # Reproducibility
    seed: int = 42,
) -> OptimizationResult:
    """
    Run portfolio optimisation with the specified objective.

    Parameters
    ----------
    returns     : Expected annualised returns, shape (n,).
    covariance  : Annualised covariance matrix, shape (n, n).
    objective   : One of the keys in OBJECTIVES dict.
    target_return : Required for 'target_return' objective.
    asset_names : Optional ticker list, stored in result.
    scenarios   : Return scenario matrix (S, n) for 'mean_cvar'. Auto-generated
                  via Gaussian Monte Carlo when None and objective='mean_cvar'.
    confidence_level : CVaR confidence level for 'mean_cvar' (default 0.95).
    risk_aversion : Mean-CVaR objective tradeoff: E[r] - risk_aversion * CVaR.
    K           : Cardinality for qubo_sa (assets to select).
    K_screen    : Stage 1 screening size for hybrid.
    K_select    : Stage 2 selection size for hybrid.
    lambda_risk : QUBO risk-aversion coefficient.
    gamma       : QUBO cardinality penalty.
    n_layers    : VQE circuit depth.
    n_restarts  : VQE random restarts.
    weight_min  : Minimum weight per asset (for Markowitz and Hybrid Stage 3).
    weight_max  : Maximum weight per asset.
    seed        : Random seed.

    Returns
    -------
    OptimizationResult
    """
    mu = np.asarray(returns, dtype=float)
    Sigma = np.asarray(covariance, dtype=float)
    bounds = (weight_min, weight_max)

    if objective not in OBJECTIVES:
        raise ValueError(
            f"Unknown objective '{objective}'. "
            f"Valid options: {list(OBJECTIVES.keys())}"
        )

    stage_info = None
    quantum_metadata: Optional[Dict[str, Any]] = None
    _cvar_meta: Optional[Dict[str, Any]] = None

    # ── Dispatch ────────────────────────────────────────────────────────────
    if objective == "equal_weight":
        w = equal_weight(mu, Sigma, k_select=K_select or K)

    elif objective == "markowitz":
        w = markowitz_max_sharpe(mu, Sigma, weight_bounds=bounds, n_restarts=n_restarts)

    elif objective == "min_variance":
        w = min_variance(mu, Sigma, weight_bounds=bounds)

    elif objective == "hrp":
        w = hrp_weights(mu, Sigma, weight_min=weight_min, weight_max=weight_max)

    elif objective == "mean_cvar":
        # Auto-generate Gaussian scenarios when none are provided
        if scenarios is None:
            from services.scenario_generation import ScenarioConfig, generate_scenarios
            # Approximate daily returns from annualised mu/Sigma for scenario generation
            daily_mu = mu / 252.0
            daily_cov = Sigma / 252.0
            # Synthesize a short history from the covariance structure
            rng_sc = np.random.default_rng(seed)
            _hist = rng_sc.multivariate_normal(daily_mu, daily_cov, size=252)
            _cfg = ScenarioConfig(method="gaussian", n_scenarios=5000, seed=seed)
            scenarios = generate_scenarios(_hist, _cfg)

        cvar_result = mean_cvar_weights(
            mu=mu,
            Sigma=Sigma,
            scenarios=np.asarray(scenarios, dtype=float),
            confidence_level=confidence_level,
            risk_aversion=risk_aversion,
            weight_min=weight_min,
            weight_max=weight_max,
            constraints=constraints,
            previous_weights=previous_weights,
            sectors=sectors,
            asset_names=asset_names,
            backend=backend,
        )
        w = cvar_result.weights
        # Carry CVaR diagnostics forward into the result
        _cvar_meta = {
            "var_95": cvar_result.var_95,
            "cvar_95": cvar_result.cvar_95,
            "solver_status": cvar_result.solver_status,
            "solve_time_ms": cvar_result.solve_time_ms,
            "n_scenarios": cvar_result.n_scenarios,
            "confidence_level": confidence_level,
            "risk_aversion": risk_aversion,
            "backend": cvar_result.backend,
            "solver": cvar_result.solver,
            "objective_value": cvar_result.objective_value,
        }
        if cvar_result.constraint_report is not None:
            _cvar_constraint_report = cvar_result.constraint_report
        else:
            _cvar_constraint_report = None

    elif objective == "qubo_sa":
        w = qubo_sa_weights(
            mu, Sigma,
            K=K,
            lambda_risk=lambda_risk,
            gamma=gamma,
            seed=seed,
            weight_min=weight_min,
            weight_max=weight_max,
        )
        quantum_metadata = {
            "execution_kind": "qubo_sa",
            "objective": "qubo_sa",
            "n_assets": len(mu),
            "K": int(K) if K is not None else None,
            "lambda_risk": lambda_risk,
            "gamma": gamma,
            "seed": seed,
            "circuit": {"family": "QUBO", "solver": "simulated_annealing"},
        }

    elif objective == "qaoa":
        w = qaoa_weights(
            mu, Sigma,
            K=K,
            lambda_risk=lambda_risk,
            gamma=gamma,
            n_restarts=n_restarts,
            weight_min=weight_min,
            weight_max=weight_max,
            seed=seed,
        )
        _K = K if K is not None else max(2, len(mu) // 3)
        _K = min(int(_K), len(mu))
        quantum_metadata = {
            "execution_kind": "classical_statevector",
            "objective": "qaoa",
            "n_assets": len(mu),
            "K": _K,
            "p": 2,
            "lambda_risk": lambda_risk,
            "gamma": gamma,
            "n_restarts": n_restarts,
            "seed": seed,
            "circuit": {"ansatz": "QAOA", "p": 2, "n_qubits": len(mu)},
        }

    elif objective == "vqe":
        w, vqe_meta = vqe_weights(
            mu, Sigma,
            n_layers=n_layers,
            n_restarts=n_restarts,
            weight_min=weight_min,
            weight_max=weight_max,
            seed=seed,
        )
        quantum_metadata = dict(vqe_meta)

    elif objective == "hybrid":
        w, info = hybrid_pipeline_weights(
            mu, Sigma,
            K_screen=K_screen,
            K_select=K_select,
            lambda_risk=lambda_risk,
            gamma=gamma,
            weight_bounds=bounds,
            seed=seed,
        )
        stage_info = {
            "stage1_screened_count": len(info.stage1_screened_idx),
            "stage2_selected_idx": info.stage2_selected_idx,
            "stage2_selected_names": (
                [asset_names[i] for i in info.stage2_selected_idx]
                if asset_names else info.stage2_selected_idx
            ),
            "stage2_qubo_obj": info.stage2_qubo_obj,
            "stage3_sharpe": info.stage3_sharpe,
            "stage1_ic": info.stage1_ic.tolist(),
        }
        quantum_metadata = {
            "execution_kind": "hybrid_pipeline",
            "objective": "hybrid",
            **stage_info,
            "circuit": {
                "stage2": "QUBO + simulated annealing",
                "n_qubits_stage2": len(info.stage2_selected_idx),
            },
        }

    elif objective == "hybrid_qaoa":
        w, info = hybrid_qaoa_weights(
            mu, Sigma,
            K_screen=K_screen,
            K_select=K_select,
            lambda_risk=lambda_risk,
            gamma=gamma,
            n_qaoa_restarts=n_restarts,
            weight_bounds=bounds,
            seed=seed,
        )
        stage_info = {
            "stage1_screened_count": len(info.stage1_screened_idx),
            "stage2_selected_idx": info.stage2_selected_idx,
            "stage2_selected_names": (
                [asset_names[i] for i in info.stage2_selected_idx]
                if asset_names else info.stage2_selected_idx
            ),
            "stage2_qubo_obj": info.stage2_qubo_obj,
            "stage3_sharpe": info.stage3_sharpe,
            "stage1_ic": info.stage1_ic.tolist(),
            "stage2_solver": "qaoa",
        }
        quantum_metadata = {
            "execution_kind": "hybrid_pipeline",
            "objective": "hybrid_qaoa",
            **stage_info,
            "circuit": {
                "stage2": "QAOA",
                "p": 2,
                "n_qubits_stage2": len(info.stage2_selected_idx),
            },
        }

    elif objective == "target_return":
        if target_return is None:
            raise ValueError("'target_return' objective requires a target_return value.")
        # Find the frontier point closest to the requested return
        frontier = target_return_frontier(mu, Sigma, n_points=50, weight_bounds=(0.0, 1.0))
        if not frontier:
            w = np.ones(len(mu)) / len(mu)
        else:
            closest = min(frontier, key=lambda pt: abs(pt["target_return"] - target_return))
            w = np.asarray(closest["weights"])

    elif objective == "braket_annealing":
        # braket_annealing is intercepted by services.portfolio_optimizer before
        # reaching this function and dispatched to BraketAnnealingOptimizer.
        # If this branch is hit, caller bypassed the service layer — fall back to qubo_sa.
        w = qubo_sa_weights(mu, Sigma, K=K, lambda_risk=lambda_risk, gamma=gamma, seed=seed,
                            weight_min=weight_min, weight_max=weight_max)
        quantum_metadata = {
            "execution_kind": "braket_annealing_fallback_to_qubo_sa",
            "note": "braket_annealing reached core optimizer — should be handled by services layer",
        }

    else:
        w = equal_weight(mu, Sigma)  # unreachable, but safe fallback

    # ── Compute metrics ─────────────────────────────────────────────────────
    metrics = _portfolio_metrics(w, mu, Sigma)

    # ── Constraint report ────────────────────────────────────────────────
    effective_k = K_select or K
    constraint_report: Dict[str, Any] = {
        "weight_min_applied": weight_min,
        "weight_max_applied": weight_max,
        "n_clipped_min": int((w[w > 0] < weight_min + 1e-6).sum()) if weight_min > 0 else 0,
        "n_clipped_max": int((w > weight_max - 1e-6).sum()),
        "k_select": int(effective_k) if effective_k is not None else None,
    }
    # Merge unified PortfolioConstraints validation report if available
    if constraints is not None:
        try:
            _validate = constraints.validate(
                weights=w,
                previous_weights=previous_weights,
                sectors=sectors,
                asset_names=asset_names,
            )
            constraint_report["unified"] = _validate.to_dict()
        except Exception:
            # Validation failure must not break the response
            pass

    # ── Factor exposures ─────────────────────────────────────────────────
    _factor_exposures: Optional[Dict[str, Any]] = None
    try:
        _factor_scores = factor_models.compute_factor_scores(mu, np.diag(Sigma), asset_names=asset_names)
        _factor_exposures = factor_models.compute_portfolio_factor_exposure(w, _factor_scores)
    except Exception:
        pass

    return OptimizationResult(
        weights=w,
        objective=objective,
        sharpe_ratio=metrics["sharpe"],
        expected_return=metrics["return"],
        volatility=metrics["volatility"],
        n_active=metrics["n_active"],
        asset_names=asset_names,
        stage_info=stage_info,
        quantum_metadata=quantum_metadata,
        constraint_report=constraint_report,
        factor_exposures=_factor_exposures,
        var_95=_cvar_meta["var_95"] if _cvar_meta else None,
        cvar_95=_cvar_meta["cvar_95"] if _cvar_meta else None,
        solver_status=_cvar_meta["solver_status"] if _cvar_meta else None,
        solve_time_ms=_cvar_meta["solve_time_ms"] if _cvar_meta else None,
        n_scenarios=_cvar_meta["n_scenarios"] if _cvar_meta else None,
        backend=_cvar_meta["backend"] if _cvar_meta else None,
        solver=_cvar_meta["solver"] if _cvar_meta else None,
        objective_value=_cvar_meta["objective_value"] if _cvar_meta else None,
    )


# ── Efficient frontier helper (unchanged contract) ──────────────────────────

def compute_efficient_frontier(
    returns: np.ndarray,
    covariance: np.ndarray,
    n_points: int = 30,
) -> List[Dict]:
    """
    Compute efficient frontier using Markowitz minimum-variance at target returns.

    Returns a list of dicts compatible with the existing API response shape:
    [{"target_return", "volatility", "sharpe", "weights"}, ...]
    """
    mu = np.asarray(returns, dtype=float)
    Sigma = np.asarray(covariance, dtype=float)
    return target_return_frontier(mu, Sigma, n_points=n_points)
