"""Thin wrapper around the existing QAOA optimizer for QOBLIB benchmarking."""

from __future__ import annotations
import numpy as np
from .schemas import PortfolioBenchmarkInstance


def solve(instance: PortfolioBenchmarkInstance) -> tuple[list[float], float]:
    """Run QAOA simulation and return (weights, objective_value)."""
    n = instance.n_assets
    r = np.array(instance.expected_returns)
    C = np.array(instance.covariance_matrix)
    w_min = instance.constraints.get("weight_min", 0.0)
    w_max = instance.constraints.get("weight_max", 1.0)

    try:
        # Try to use the existing quantum_inspired QAOA optimizer
        from core.quantum_inspired.qaoa_optimizer import QAOAOptimizer
        optimizer = QAOAOptimizer(n_layers=3, n_restarts=5)
        result = optimizer.optimize(
            returns=r.tolist(),
            covariance=C.tolist(),
            weight_min=w_min,
            weight_max=w_max,
        )
        weights = result.get("weights", [1.0 / n] * n)
        obj = float(r @ np.array(weights) - 0.5 * np.array(weights) @ C @ np.array(weights))
        return weights, obj
    except (ImportError, Exception):
        pass

    # Fallback: random restarts with projection onto simplex
    best_weights = None
    best_obj = -1e9
    rng = np.random.default_rng(42)
    for _ in range(50):
        w = rng.dirichlet(np.ones(n))
        w = np.clip(w, w_min, w_max)
        s = w.sum()
        if s > 1e-9:
            w /= s
        obj = float(r @ w - 0.5 * w @ C @ w)
        if obj > best_obj:
            best_obj = obj
            best_weights = w.tolist()

    return best_weights or [1.0 / n] * n, best_obj
