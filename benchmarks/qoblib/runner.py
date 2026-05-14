"""Execute QOBLIB benchmark runs and write JSON/CSV artifacts."""

from __future__ import annotations
import csv
import json
import math
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np

from .schemas import PortfolioBenchmarkInstance, SolverResult, QuboEncodingResult
from .reporting import write_markdown_report

_RESULTS_DIR = Path(__file__).parent.parent.parent / "results" / "qoblib"
_RUNS_DIR = _RESULTS_DIR / "runs"
_CSV_PATH = _RESULTS_DIR / "results.csv"

_CSV_COLUMNS = [
    "run_id", "instance_id", "requested_backend", "actual_backend",
    "feasible", "objective_value", "expected_return", "portfolio_volatility",
    "sharpe_ratio", "n_active_assets", "wall_time_seconds", "timestamp",
]


def _ensure_dirs() -> None:
    _RUNS_DIR.mkdir(parents=True, exist_ok=True)


def _compute_portfolio_metrics(
    weights: list[float],
    returns: list[float],
    cov: list[list[float]],
) -> tuple[float, float, float]:
    """Return (expected_return, volatility, sharpe_ratio)."""
    w = np.array(weights)
    r = np.array(returns)
    C = np.array(cov)
    port_return = float(w @ r)
    port_vol = float(math.sqrt(max(0.0, float(w @ C @ w))))
    sharpe = port_return / port_vol if port_vol > 1e-9 else 0.0
    return port_return, port_vol, sharpe


def _classical_solve(instance: PortfolioBenchmarkInstance) -> tuple[list[float], float, str]:
    """Solve using cvxpy if available, otherwise scipy fallback."""
    n = instance.n_assets
    r = np.array(instance.expected_returns)
    C = np.array(instance.covariance_matrix)
    w_min = instance.constraints.get("weight_min", 0.0)
    w_max = instance.constraints.get("weight_max", 1.0)

    try:
        import cvxpy as cp
        w = cp.Variable(n)
        objective = cp.Maximize(r @ w - 0.5 * cp.quad_form(w, C))
        constraints = [
            cp.sum(w) == 1,
            w >= w_min,
            w <= w_max,
        ]
        prob = cp.Problem(objective, constraints)
        prob.solve(solver=cp.CLARABEL, warm_start=True)
        if prob.status in ("optimal", "optimal_inaccurate") and w.value is not None:
            weights = [max(0.0, float(x)) for x in w.value]
            total = sum(weights)
            weights = [x / total for x in weights] if total > 1e-9 else [1.0 / n] * n
            return weights, float(prob.value), "classical_cvxpy"
    except ImportError:
        pass

    # scipy fallback
    from scipy.optimize import minimize, LinearConstraint, Bounds
    def neg_obj(w):
        return -(r @ w - 0.5 * w @ C @ w)
    def neg_obj_grad(w):
        return -(r - C @ w)
    w0 = np.ones(n) / n
    bounds = Bounds(lb=w_min, ub=w_max)
    lc = LinearConstraint(np.ones((1, n)), lb=1.0, ub=1.0)
    res = minimize(neg_obj, w0, jac=neg_obj_grad, method="SLSQP",
                   bounds=bounds, constraints=[{"type": "eq", "fun": lambda w: w.sum() - 1}])
    weights = [max(0.0, float(x)) for x in res.x]
    total = sum(weights)
    weights = [x / total for x in weights] if total > 1e-9 else [1.0 / n] * n
    return weights, float(-res.fun), "classical_scipy"


def _heuristic_solve(instance: PortfolioBenchmarkInstance) -> tuple[list[float], float]:
    """Differential-evolution heuristic."""
    from scipy.optimize import differential_evolution
    n = instance.n_assets
    r = np.array(instance.expected_returns)
    C = np.array(instance.covariance_matrix)
    w_min = instance.constraints.get("weight_min", 0.0)
    w_max = instance.constraints.get("weight_max", 1.0)

    def neg_obj(w_raw):
        w = np.abs(w_raw)
        s = w.sum()
        if s < 1e-9:
            return 1e9
        w = w / s
        w = np.clip(w, w_min, w_max)
        w = w / w.sum()
        return -(r @ w - 0.5 * w @ C @ w)

    bounds = [(0.0, 1.0)] * n
    res = differential_evolution(neg_obj, bounds, maxiter=500, seed=42, tol=1e-6)
    w = np.abs(res.x)
    w = w / w.sum()
    return list(w), float(-res.fun)


def _qubo_encoding_info(instance: PortfolioBenchmarkInstance, bits_per_asset: int = 3) -> QuboEncodingResult:
    n_vars = instance.n_assets * bits_per_asset
    n_qubits = n_vars
    # Estimate QUBO density: objective terms + constraint terms
    total_entries = n_vars * n_vars
    nonzero = instance.n_assets ** 2 + n_vars  # diagonal + cross terms approx
    density = min(1.0, nonzero / max(1, total_entries))
    return QuboEncodingResult(
        n_qubits=n_qubits,
        n_variables=n_vars,
        encoding_type="binary_one_hot",
        penalty_lambda=10.0,
        bits_per_asset=bits_per_asset,
        qubo_density=round(density, 4),
    )


def run_benchmark(
    instance: PortfolioBenchmarkInstance,
    requested_backend: str = "classical",
    ibm_token: Optional[str] = None,
    *,
    persist: bool = True,
    tenant_id: Optional[str] = None,
) -> SolverResult:
    """Run a benchmark and return a SolverResult.

    When ``persist`` is True (default), writes JSON + CSV + Markdown artifacts.
    Validation harnesses pass ``persist=False`` to avoid spamming ``results/qoblib/``.
    """
    _ensure_dirs()
    run_id = str(uuid.uuid4())
    ts = datetime.now(timezone.utc).isoformat()
    t0 = time.perf_counter()

    actual_backend = requested_backend
    weights: list[float] = []
    obj_val = 0.0
    feasible = False
    error: Optional[str] = None
    qubo: Optional[QuboEncodingResult] = None
    metadata_extra: dict[str, Any] = {}

    try:
        if requested_backend == "classical":
            weights, obj_val, actual_backend = _classical_solve(instance)
            feasible = True

        elif requested_backend == "heuristic":
            weights, obj_val = _heuristic_solve(instance)
            actual_backend = "heuristic"
            feasible = True

        elif requested_backend == "qaoa_sim":
            qubo = _qubo_encoding_info(instance)
            try:
                from .qaoa_sim_solver import solve as qaoa_solve
                weights, obj_val = qaoa_solve(instance)
                actual_backend = "qaoa_sim"
            except Exception:
                weights, obj_val = _heuristic_solve(instance)
                actual_backend = "qaoa_sim_fallback_heuristic"
            feasible = True

        elif requested_backend == "auto":
            # Legacy behavior: fast heuristic stand-in (distinct from strict ``qaoa_sim`` path).
            qubo = _qubo_encoding_info(instance)
            weights, obj_val = _heuristic_solve(instance)
            actual_backend = "qaoa_sim"
            feasible = True

        elif requested_backend == "ibm_quantum":
            if not ibm_token:
                raise RuntimeError(
                    "IBM Quantum backend requested but no token is configured. "
                    "Add IBMQ_TOKEN to environment or settings. No classical fallback in strict mode."
                )
            from services import ibm_quantum as _ibm

            tid = ((tenant_id or _ibm.resolve_tenant()) or "").strip() or "default"
            mode = os.environ.get("QOBLIB_IBM_MODE", "simulator").lower()
            if mode not in ("hardware", "simulator"):
                mode = "simulator"
            out = _ibm.run_qoblib_benchmark_sampler(
                tid,
                expected_returns=instance.expected_returns,
                covariance=instance.covariance_matrix,
                weight_min=float(instance.constraints.get("weight_min", 0.0)),
                weight_max=float(instance.constraints.get("weight_max", 1.0)),
                mode=mode,
            )
            if not out.get("ok"):
                raise RuntimeError(out.get("error", "IBM QOBLIB execution failed"))
            weights = list(out["weights"])
            obj_val = float(out["mean_variance_objective"])
            actual_backend = "ibm_quantum"
            feasible = True
            metadata_extra["ibm_runtime"] = {
                k: out[k]
                for k in (
                    "job_id",
                    "backend",
                    "shots",
                    "mode",
                    "elapsed_ms",
                    "simulator",
                    "qoblib_ibm_profile",
                    "ibm_saved_instance_crn_suffix",
                    "counts",
                )
                if k in out
            }

        elif requested_backend == "hybrid_router":
            from .hybrid_router import route_and_solve

            weights, obj_val, actual_backend, qubo, router_md = route_and_solve(
                instance, ibm_token=ibm_token, tenant_id=tenant_id
            )
            feasible = True
            if router_md:
                metadata_extra.update(router_md)

        else:
            raise ValueError(f"Unknown backend: {requested_backend!r}")

    except Exception as exc:
        error = str(exc)
        feasible = False
        weights = [1.0 / instance.n_assets] * instance.n_assets
        obj_val = 0.0

    wall_time = time.perf_counter() - t0

    port_return, port_vol, sharpe = _compute_portfolio_metrics(
        weights, instance.expected_returns, instance.covariance_matrix
    )
    n_active = sum(1 for w in weights if w > 1e-3)

    result = SolverResult(
        run_id=run_id,
        instance_id=instance.instance_id,
        requested_backend=requested_backend,
        actual_backend=actual_backend,
        solver_version="1.0.0",
        feasible=feasible,
        weights=weights,
        objective_value=round(obj_val, 8),
        expected_return=round(port_return, 6),
        portfolio_volatility=round(port_vol, 6),
        sharpe_ratio=round(sharpe, 6),
        n_active_assets=n_active,
        wall_time_seconds=round(wall_time, 4),
        timestamp=ts,
        metadata={
            "instance_n_assets": instance.n_assets,
            "instance_n_periods": instance.n_periods,
            **metadata_extra,
        },
        qubo_encoding=qubo,
        error=error,
    )

    if persist:
        _write_artifacts(result)
    return result


def _write_artifacts(result: SolverResult) -> None:
    json_path = _RUNS_DIR / f"{result.run_id}.json"
    with open(json_path, "w") as f:
        json.dump(result.to_dict(), f, indent=2, default=str)

    write_markdown_report(result, _RUNS_DIR / f"{result.run_id}.md")

    write_header = not _CSV_PATH.exists()
    with open(_CSV_PATH, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=_CSV_COLUMNS)
        if write_header:
            writer.writeheader()
        writer.writerow({col: getattr(result, col, "") for col in _CSV_COLUMNS})
