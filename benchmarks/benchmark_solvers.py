"""
Solver backend comparison — run the same Mean-CVaR problem through every
available backend so the same instance is timed side-by-side.

Each (n_assets, n_scenarios) combination produces one case per backend.
This is the apples-to-apples benchmark for "is CLARABEL really faster than
HiGHS at our scale?" — typical answer: small problems → CVXPY+CLARABEL,
large scenario counts → scipy.linprog (HiGHS).
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, Sequence

from benchmarks.base import (
    BenchmarkCase,
    BenchmarkConfig,
    BenchmarkRunner,
    generate_synthetic_dataset,
)


@dataclass
class Config(BenchmarkConfig):
    n_assets_grid: Sequence[int] = field(default_factory=lambda: (25, 100))
    n_scenarios_grid: Sequence[int] = field(default_factory=lambda: (1_000, 10_000))
    backends: Sequence[str] = field(default_factory=lambda: ("cpu_cvxpy", "cpu_scipy"))
    confidence_level: float = 0.95
    risk_aversion: float = 1.0
    weight_max: float = 0.30
    block_size: int = 20

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Config":
        return cls(
            name=str(d.get("name", "solver_comparison")),
            seed=int(d.get("seed", 42)),
            output_dir=d.get("output_dir"),
            output_format=str(d.get("output_format", "jsonl")),
            fail_fast=bool(d.get("fail_fast", False)),
            n_assets_grid=tuple(d.get("n_assets_grid", (25, 100))),
            n_scenarios_grid=tuple(d.get("n_scenarios_grid", (1_000, 10_000))),
            backends=tuple(d.get("backends", ("cpu_cvxpy", "cpu_scipy"))),
            confidence_level=float(d.get("confidence_level", 0.95)),
            risk_aversion=float(d.get("risk_aversion", 1.0)),
            weight_max=float(d.get("weight_max", 0.30)),
            block_size=int(d.get("block_size", 20)),
        )


class Runner(BenchmarkRunner):
    name = "solver_comparison"

    def __init__(self, config: Config) -> None:
        super().__init__(config)
        self.config: Config = config

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Runner":
        return cls(Config.from_dict(d or {}))

    def cases(self) -> Iterable[Dict[str, Any]]:
        for n_assets in self.config.n_assets_grid:
            for n_scenarios in self.config.n_scenarios_grid:
                for backend in self.config.backends:
                    yield {
                        "n_assets": int(n_assets),
                        "n_scenarios": int(n_scenarios),
                        "backend": backend,
                        "method": "mean_cvar",
                    }

    def _run_case(self, params: Dict[str, Any]) -> BenchmarkCase:
        from core.optimizers.mean_cvar import mean_cvar_weights
        from services.scenario_generation import ScenarioConfig, generate_scenarios
        from services.solver_router import get_router

        n_assets = int(params["n_assets"])
        n_scenarios = int(params["n_scenarios"])
        backend_name = str(params["backend"])
        cfg = self.config

        # Skip cleanly when the requested backend isn't installed
        router = get_router()
        backend_obj = router.registry.get(backend_name)
        if backend_obj is None or not backend_obj.is_available():
            return BenchmarkCase(
                benchmark_name=self.name,
                case_id="",
                run_id="",
                n_assets=n_assets,
                n_scenarios=n_scenarios,
                method="mean_cvar",
                backend=backend_name,
                status="skipped",
                feasible=False,
                solve_time_ms=0.0,
                diagnostics={"reason": "backend not available"},
            )

        t_setup = time.perf_counter()
        ds = generate_synthetic_dataset(
            n_assets=n_assets,
            n_history=max(252, cfg.block_size * 4),
            seed=cfg.seed + n_assets,
        )
        scenarios = generate_scenarios(
            ds.daily_returns,
            ScenarioConfig(method="block", n_scenarios=n_scenarios,
                           block_size=cfg.block_size, seed=cfg.seed),
        )
        setup_ms = (time.perf_counter() - t_setup) * 1000.0

        t_solve = time.perf_counter()
        try:
            result = mean_cvar_weights(
                mu=ds.mu,
                Sigma=ds.Sigma,
                scenarios=scenarios,
                confidence_level=cfg.confidence_level,
                risk_aversion=cfg.risk_aversion,
                weight_min=0.0,
                weight_max=cfg.weight_max,
                backend=backend_name,
            )
        except Exception as exc:
            solve_ms = (time.perf_counter() - t_solve) * 1000.0
            return BenchmarkCase(
                benchmark_name=self.name,
                case_id="",
                run_id="",
                n_assets=n_assets,
                n_scenarios=n_scenarios,
                method="mean_cvar",
                backend=backend_name,
                status=f"error:{type(exc).__name__}",
                feasible=False,
                solve_time_ms=round(solve_ms, 3),
                setup_time_ms=round(setup_ms, 3),
                error=str(exc),
            )
        solve_ms = (time.perf_counter() - t_solve) * 1000.0

        feasible = result.solver_status in ("optimal", "optimal_inaccurate")
        return BenchmarkCase(
            benchmark_name=self.name,
            case_id="",
            run_id="",
            n_assets=n_assets,
            n_scenarios=n_scenarios,
            method="mean_cvar",
            backend=result.backend,
            solver=result.solver,
            status=result.solver_status if feasible else f"failed:{result.solver_status}",
            feasible=feasible,
            solve_time_ms=round(solve_ms, 3),
            setup_time_ms=round(setup_ms, 3),
            objective_value=_safe_float(result.objective_value),
            expected_return=_safe_float(result.expected_return),
            volatility=_safe_float(result.volatility),
            sharpe=_safe_float(result.sharpe_ratio),
            var_95=_safe_float(result.var_95),
            cvar_95=_safe_float(result.cvar_95),
            diagnostics={"backend_requested": backend_name},
        )


def _safe_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f else None
