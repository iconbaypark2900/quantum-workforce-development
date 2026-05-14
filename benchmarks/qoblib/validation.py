"""Run all non-IBM QOBLIB backends against an instance and report gap-to-optimal."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .instance_loader import load_instance
from .schemas import PortfolioBenchmarkInstance
from .runner import run_benchmark

_VALIDATE_BACKENDS = ("classical", "heuristic", "qaoa_sim", "hybrid_router", "auto")


def _gap_metrics(
    instance: PortfolioBenchmarkInstance,
    achieved_obj: float,
    feasible: bool,
) -> tuple[float | None, float | None]:
    """Return (gap_abs, gap_rel) vs benchmark_optimal.objective_value (maximization)."""
    bench = instance.benchmark_optimal
    if not bench or not feasible:
        return None, None
    opt_val = bench.get("objective_value")
    if opt_val is None:
        return None, None
    try:
        opt_f = float(opt_val)
    except (TypeError, ValueError):
        return None, None
    gap_abs = opt_f - float(achieved_obj)
    denom = max(abs(opt_f), 1e-9)
    gap_rel = gap_abs / denom
    return gap_abs, gap_rel


def validate_instance(
    instance: PortfolioBenchmarkInstance,
    *,
    persist: bool = False,
) -> dict[str, Any]:
    """Run classical/heuristic/qaoa_sim/hybrid_router/auto; exclude ibm_quantum."""
    rows: list[dict[str, Any]] = []
    solver_version: str | None = None
    warning: str | None = None

    bench = instance.benchmark_optimal
    if not bench:
        warning = "benchmark_optimal missing from fixture; gap_abs/gap_rel will be null."

    for backend in _VALIDATE_BACKENDS:
        result = run_benchmark(
            instance,
            requested_backend=backend,
            ibm_token=None,
            persist=persist,
        )
        if solver_version is None:
            solver_version = result.solver_version
        gap_abs, gap_rel = _gap_metrics(instance, result.objective_value, result.feasible)
        rows.append({
            "requested_backend": backend,
            "actual_backend": result.actual_backend,
            "feasible": result.feasible,
            "objective_value": result.objective_value,
            "error": result.error,
            "gap_abs": gap_abs,
            "gap_rel": gap_rel,
            "wall_time_seconds": result.wall_time_seconds,
        })

    bench_opt = bench.get("objective_value") if bench else None
    bench_solver = bench.get("solver") if bench else None

    return {
        "instance_id": instance.instance_id,
        "benchmark_optimal_objective": bench_opt,
        "benchmark_optimal_solver": bench_solver,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "solver_version": solver_version,
        "warning": warning,
        "results": rows,
        "count": len(rows),
    }


def validate_instance_id(instance_id: str, *, persist: bool = False) -> dict[str, Any]:
    """Load fixture by id and run :func:`validate_instance`."""
    instance = load_instance(instance_id)
    return validate_instance(instance, persist=persist)
