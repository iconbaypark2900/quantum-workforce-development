"""
Unified portfolio optimization service (thin wrapper around core.portfolio_optimizer).

Re-exports run_optimization, OptimizationResult, OBJECTIVES, compute_efficient_frontier.
Maps legacy objective names for backtest and benchmark compatibility:
  max_sharpe -> markowitz
  risk_parity -> hrp
  braket_annealing -> uses Braket backend (or qubo_sa fallback)
"""
from types import SimpleNamespace
from typing import Dict, List, Optional
import numpy as np

from core.portfolio_optimizer import (
    run_optimization as _core_run_optimization,
    OptimizationResult as _CoreOptimizationResult,
    OBJECTIVES as _CORE_OBJECTIVES,
    compute_efficient_frontier as _core_compute_efficient_frontier,
)

# Import Braket backend for quantum annealing
try:
    from services.braket_backend import BraketAnnealingOptimizer, BraketConfig
    BRAKET_AVAILABLE = True
except ImportError:
    BRAKET_AVAILABLE = False


# Re-export OBJECTIVES
OBJECTIVES = _CORE_OBJECTIVES

# Legacy objective mapping for backtest/benchmark compatibility
_OBJECTIVE_MAP = {
    "max_sharpe": "markowitz",
    "risk_parity": "hrp",
    # braket_annealing handled separately below
    "hierarchical_risk_parity": "hrp",
}


def get_config_for_preset(preset: str) -> SimpleNamespace:
    """
    Return config for strategy preset (legacy compatibility).
    Presets map to weight bounds; other QSW params no longer apply.
    """
    presets = {
        "growth": SimpleNamespace(min_weight=0.005, max_weight=0.12),
        "income": SimpleNamespace(min_weight=0.005, max_weight=0.08),
        "balanced": SimpleNamespace(min_weight=0.005, max_weight=0.30),
        "aggressive": SimpleNamespace(min_weight=0.005, max_weight=0.15),
        "defensive": SimpleNamespace(min_weight=0.005, max_weight=0.07),
    }
    return presets.get(preset.lower(), SimpleNamespace(min_weight=0.005, max_weight=0.30))


class _ResultAdapter:
    """Adapter adding turnover and preserving requested objective for legacy callers."""

    def __init__(self, core_result: _CoreOptimizationResult, requested_objective: str):
        self._core = core_result
        self._requested = requested_objective

    @property
    def weights(self):
        return self._core.weights

    @property
    def sharpe_ratio(self):
        return self._core.sharpe_ratio

    @property
    def expected_return(self):
        return self._core.expected_return

    @property
    def volatility(self):
        return self._core.volatility

    @property
    def n_active(self):
        return self._core.n_active

    @property
    def objective(self):
        return self._requested  # Preserve legacy objective name for backcompat

    @property
    def turnover(self):
        return 0.0  # Core does not compute turnover

    @property
    def stage_info(self):
        return self._core.stage_info

    @property
    def quantum_metadata(self):
        return getattr(self._core, "quantum_metadata", None)

    @property
    def asset_names(self):
        return self._core.asset_names

    @property
    def constraint_report(self):
        return getattr(self._core, "constraint_report", None)

    @property
    def var_95(self):
        return getattr(self._core, "var_95", None)

    @property
    def cvar_95(self):
        return getattr(self._core, "cvar_95", None)

    @property
    def solver_status(self):
        return getattr(self._core, "solver_status", None)

    @property
    def solve_time_ms(self):
        return getattr(self._core, "solve_time_ms", None)

    @property
    def n_scenarios(self):
        return getattr(self._core, "n_scenarios", None)

    @property
    def backend(self):
        return getattr(self._core, "backend", None)

    @property
    def solver(self):
        return getattr(self._core, "solver", None)

    @property
    def objective_value(self):
        return getattr(self._core, "objective_value", None)


def run_optimization(
    returns: np.ndarray,
    covariance: np.ndarray,
    objective: str = "max_sharpe",
    target_return: Optional[float] = None,
    market_regime: Optional[str] = None,
    strategy_preset: Optional[str] = None,
    initial_weights: Optional[np.ndarray] = None,
    config=None,
    constraints=None,
    asset_names: Optional[List[str]] = None,
    sectors: Optional[List[str]] = None,
    scenarios=None,
    confidence_level: float = 0.95,
    risk_aversion: float = 1.0,
    backend: str = "auto",
    **kwargs,
):
    """
    Run portfolio optimization. Delegates to core.portfolio_optimizer.

    Legacy params (market_regime, strategy_preset, initial_weights, config, constraints)
    are accepted for compatibility but ignored. Use core.portfolio_optimizer directly
    for full control.
    
    Special handling for 'braket_annealing': uses Braket backend when available,
    falls back to classical qubo_sa.
    """
    requested = objective
    
    # Handle braket_annealing specially
    if objective == "braket_annealing":
        if BRAKET_AVAILABLE:
            return _run_braket_optimization(returns, covariance, **kwargs)
        else:
            # Fall back to qubo_sa
            objective = "qubo_sa"
    
    objective = _OBJECTIVE_MAP.get(objective, objective)
    core_result = _core_run_optimization(
        returns=np.asarray(returns),
        covariance=np.asarray(covariance),
        objective=objective,
        target_return=target_return,
        asset_names=asset_names,
        scenarios=scenarios,
        confidence_level=confidence_level,
        risk_aversion=risk_aversion,
        constraints=constraints,
        previous_weights=initial_weights,
        sectors=sectors,
        backend=backend,
        K=kwargs.get("K"),
        K_screen=kwargs.get("K_screen"),
        K_select=kwargs.get("K_select"),
        lambda_risk=float(kwargs.get("lambda_risk", 1.0)),
        gamma=float(kwargs.get("gamma", 8.0)),
        n_layers=int(kwargs.get("n_layers", 3)),
        n_restarts=int(kwargs.get("n_restarts", 8)),
        weight_min=float(kwargs.get("weight_min", 0.005)),
        weight_max=float(kwargs.get("weight_max", 0.30)),
        seed=int(kwargs.get("seed", 42)),
    )
    return _ResultAdapter(core_result, requested)


def _run_braket_optimization(
    returns: np.ndarray,
    covariance: np.ndarray,
    **kwargs
):
    """
    Run optimization using Braket quantum annealing backend.
    
    Returns a SimpleNamespace with the same interface as OptimizationResult.
    """
    optimizer = BraketAnnealingOptimizer()
    result = optimizer.optimize(
        returns=returns,
        covariance=covariance,
        K=kwargs.get("K"),
        lambda_risk=float(kwargs.get("lambda_risk", 1.0)),
        gamma=float(kwargs.get("gamma", 8.0)),
    )
    
    # Wrap in SimpleNamespace for compatibility
    return SimpleNamespace(
        weights=result['weights'],
        sharpe_ratio=result['sharpe_ratio'],
        expected_return=result['expected_return'],
        volatility=result['volatility'],
        n_active=result['n_active'],
        objective='braket_annealing',
        stage_info={'backend': result.get('backend', 'unknown')},
        asset_names=None,
    )


# Re-export for callers
OptimizationResult = _CoreOptimizationResult


def compute_efficient_frontier(
    returns: np.ndarray,
    covariance: np.ndarray,
    n_points: int = 15,
) -> List[Dict]:
    """Compute efficient frontier. Delegates to core.portfolio_optimizer."""
    return _core_compute_efficient_frontier(
        returns=np.asarray(returns),
        covariance=np.asarray(covariance),
        n_points=n_points,
    )
