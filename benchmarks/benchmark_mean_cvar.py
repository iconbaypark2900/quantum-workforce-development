"""
Mean-CVaR scale benchmark — wall-clock and feasibility across
(n_assets × n_scenarios) combinations.

Runs the same Mean-CVaR LP on synthetic data with a grid of sizes and
records solve time, status, and the resulting VaR / CVaR. Default grid
follows the gap-closure plan: 25/50/100/250 assets × 1k/10k/50k scenarios.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Sequence

import numpy as np

from benchmarks.base import (
    BenchmarkCase,
    BenchmarkConfig,
    BenchmarkRunner,
    generate_synthetic_dataset,
)


@dataclass
class Config(BenchmarkConfig):
    """Mean-CVaR scale configuration."""

    n_assets_grid: Sequence[int] = field(default_factory=lambda: (25, 50, 100, 250))
    n_scenarios_grid: Sequence[int] = field(default_factory=lambda: (1_000, 10_000, 50_000))
    backend: str = "auto"
    confidence_level: float = 0.95
    risk_aversion: float = 1.0
    weight_max: float = 0.30
    scenario_method: str = "block"
    block_size: int = 20

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Config":
        return cls(
            name=str(d.get("name", "mean_cvar_scale")),
            seed=int(d.get("seed", 42)),
            output_dir=d.get("output_dir"),
            output_format=str(d.get("output_format", "jsonl")),
            fail_fast=bool(d.get("fail_fast", False)),
            n_assets_grid=tuple(d.get("n_assets_grid", (25, 50, 100, 250))),
            n_scenarios_grid=tuple(d.get("n_scenarios_grid", (1_000, 10_000, 50_000))),
            backend=str(d.get("backend", "auto")),
            confidence_level=float(d.get("confidence_level", 0.95)),
            risk_aversion=float(d.get("risk_aversion", 1.0)),
            weight_max=float(d.get("weight_max", 0.30)),
            scenario_method=str(d.get("scenario_method", "block")),
            block_size=int(d.get("block_size", 20)),
        )


class Runner(BenchmarkRunner):
    name = "mean_cvar_scale"

    def __init__(self, config: Config) -> None:
        super().__init__(config)
        self.config: Config = config

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Runner":
        return cls(Config.from_dict(d or {}))

    def cases(self) -> Iterable[Dict[str, Any]]:
        for n_assets in self.config.n_assets_grid:
            for n_scenarios in self.config.n_scenarios_grid:
                yield {
                    "n_assets": int(n_assets),
                    "n_scenarios": int(n_scenarios),
                    "method": "mean_cvar",
                    "backend": self.config.backend,
                }

    def _run_case(self, params: Dict[str, Any]) -> BenchmarkCase:
        from core.optimizers.mean_cvar import mean_cvar_weights
        from services.scenario_generation import ScenarioConfig, generate_scenarios

        n_assets = int(params["n_assets"])
        n_scenarios = int(params["n_scenarios"])
        cfg = self.config

        # Dataset: enough history for block bootstrap
        n_history = max(252, cfg.block_size * 4)
        t_setup = time.perf_counter()
        ds = generate_synthetic_dataset(
            n_assets=n_assets,
            n_history=n_history,
            seed=cfg.seed + n_assets,  # vary seed by size so each case is independent
        )
        sc_cfg = ScenarioConfig(
            method=cfg.scenario_method,
            n_scenarios=n_scenarios,
            block_size=cfg.block_size,
            seed=cfg.seed,
        )
        scenarios = generate_scenarios(ds.daily_returns, sc_cfg)
        setup_ms = (time.perf_counter() - t_setup) * 1000.0

        # Solve
        t_solve = time.perf_counter()
        result = mean_cvar_weights(
            mu=ds.mu,
            Sigma=ds.Sigma,
            scenarios=scenarios,
            confidence_level=cfg.confidence_level,
            risk_aversion=cfg.risk_aversion,
            weight_min=0.0,
            weight_max=cfg.weight_max,
            backend=cfg.backend,
        )
        solve_ms = (time.perf_counter() - t_solve) * 1000.0

        feasible = result.solver_status in ("optimal", "optimal_inaccurate")
        return BenchmarkCase(
            benchmark_name=self.name,
            case_id="",  # filled by runner
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
            diagnostics={
                "scenario_method": cfg.scenario_method,
                "confidence_level": cfg.confidence_level,
            },
        )


def _safe_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # filter NaN
