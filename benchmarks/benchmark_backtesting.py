"""
Rebalancing engine throughput benchmark.

Times one full rebalancing-backtest run per (policy, n_assets) case.
Useful for catching regressions in `services.rebalancing` and for capacity
planning ("how long does a 3-year monthly Mean-CVaR backtest take?").
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, Sequence

import pandas as pd

from benchmarks.base import (
    BenchmarkCase,
    BenchmarkConfig,
    BenchmarkRunner,
    generate_synthetic_dataset,
)


@dataclass
class Config(BenchmarkConfig):
    n_assets_grid: Sequence[int] = field(default_factory=lambda: (10, 50))
    policies: Sequence[str] = field(default_factory=lambda: ("monthly", "quarterly", "threshold"))
    objective: str = "equal_weight"
    lookback_days: int = 63
    n_history: int = 504
    weight_max: float = 0.30
    cost_linear_bps: float = 5.0

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Config":
        return cls(
            name=str(d.get("name", "rebalancing")),
            seed=int(d.get("seed", 42)),
            output_dir=d.get("output_dir"),
            output_format=str(d.get("output_format", "jsonl")),
            fail_fast=bool(d.get("fail_fast", False)),
            n_assets_grid=tuple(d.get("n_assets_grid", (10, 50))),
            policies=tuple(d.get("policies", ("monthly", "quarterly", "threshold"))),
            objective=str(d.get("objective", "equal_weight")),
            lookback_days=int(d.get("lookback_days", 63)),
            n_history=int(d.get("n_history", 504)),
            weight_max=float(d.get("weight_max", 0.30)),
            cost_linear_bps=float(d.get("cost_linear_bps", 5.0)),
        )


class Runner(BenchmarkRunner):
    name = "rebalancing"

    def __init__(self, config: Config) -> None:
        super().__init__(config)
        self.config: Config = config

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Runner":
        return cls(Config.from_dict(d or {}))

    def cases(self) -> Iterable[Dict[str, Any]]:
        for n_assets in self.config.n_assets_grid:
            for policy in self.config.policies:
                yield {
                    "n_assets": int(n_assets),
                    "policy": policy,
                    "method": "rebalance",
                }

    def _run_case(self, params: Dict[str, Any]) -> BenchmarkCase:
        from services.rebalancing import RebalancingConfig, run_rebalance_backtest

        n_assets = int(params["n_assets"])
        policy = str(params["policy"])
        cfg = self.config

        t_setup = time.perf_counter()
        ds = generate_synthetic_dataset(
            n_assets=n_assets, n_history=cfg.n_history, seed=cfg.seed + n_assets,
        )
        cols = [f"A{i:03d}" for i in range(n_assets)]
        idx = pd.date_range("2023-01-02", periods=cfg.n_history, freq="B")
        returns_panel = pd.DataFrame(ds.daily_returns, index=idx, columns=cols)
        setup_ms = (time.perf_counter() - t_setup) * 1000.0

        rb_cfg = RebalancingConfig(
            policy=policy,
            lookback_days=cfg.lookback_days,
            cost_linear_bps=cfg.cost_linear_bps,
        )
        opt_kwargs = {
            "objective": cfg.objective,
            "weight_max": cfg.weight_max,
        }

        t_solve = time.perf_counter()
        result = run_rebalance_backtest(returns_panel, rb_cfg, opt_kwargs)
        solve_ms = (time.perf_counter() - t_solve) * 1000.0

        return BenchmarkCase(
            benchmark_name=self.name,
            case_id="",
            run_id="",
            n_assets=n_assets,
            n_scenarios=0,
            method=f"rebalance:{policy}",
            backend="rebalancing_engine",
            solver=cfg.objective,
            status="optimal",
            feasible=True,
            solve_time_ms=round(solve_ms, 3),
            setup_time_ms=round(setup_ms, 3),
            sharpe=float(result.sharpe),
            volatility=None,
            var_95=float(result.var_95),
            cvar_95=float(result.cvar_95),
            diagnostics={
                "policy": result.policy,
                "n_rebalances": result.n_rebalances,
                "n_observations": result.n_observations,
                "net_return": float(result.net_return),
                "cumulative_cost": float(result.cumulative_cost),
                "max_drawdown": float(result.max_drawdown),
            },
        )
