"""
Scenario generation timing — wall-clock per method × scenario count.

Pure timing benchmark, no solver. Useful for picking the cheapest scenario
method for a given accuracy target, and for catching performance regressions
in `services.scenario_generation`.
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
    n_scenarios_grid: Sequence[int] = field(default_factory=lambda: (1_000, 10_000, 50_000))
    methods: Sequence[str] = field(
        default_factory=lambda: ("historical", "block", "gaussian", "student_t")
    )
    block_size: int = 20
    df: float = 5.0

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Config":
        return cls(
            name=str(d.get("name", "scenario_generation")),
            seed=int(d.get("seed", 42)),
            output_dir=d.get("output_dir"),
            output_format=str(d.get("output_format", "jsonl")),
            fail_fast=bool(d.get("fail_fast", False)),
            n_assets_grid=tuple(d.get("n_assets_grid", (25, 100))),
            n_scenarios_grid=tuple(d.get("n_scenarios_grid", (1_000, 10_000, 50_000))),
            methods=tuple(d.get("methods", ("historical", "block", "gaussian", "student_t"))),
            block_size=int(d.get("block_size", 20)),
            df=float(d.get("df", 5.0)),
        )


class Runner(BenchmarkRunner):
    name = "scenario_generation"

    def __init__(self, config: Config) -> None:
        super().__init__(config)
        self.config: Config = config

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Runner":
        return cls(Config.from_dict(d or {}))

    def cases(self) -> Iterable[Dict[str, Any]]:
        for n_assets in self.config.n_assets_grid:
            for n_scenarios in self.config.n_scenarios_grid:
                for method in self.config.methods:
                    yield {
                        "n_assets": int(n_assets),
                        "n_scenarios": int(n_scenarios),
                        "method": method,
                    }

    def _run_case(self, params: Dict[str, Any]) -> BenchmarkCase:
        from services.scenario_generation import ScenarioConfig, generate_scenarios

        n_assets = int(params["n_assets"])
        n_scenarios = int(params["n_scenarios"])
        method = str(params["method"])
        cfg = self.config

        t_setup = time.perf_counter()
        ds = generate_synthetic_dataset(
            n_assets=n_assets,
            n_history=max(504, cfg.block_size * 4),
            seed=cfg.seed + n_assets,
        )
        setup_ms = (time.perf_counter() - t_setup) * 1000.0

        sc_cfg = ScenarioConfig(
            method=method,
            n_scenarios=n_scenarios,
            block_size=cfg.block_size,
            df=cfg.df,
            seed=cfg.seed,
        )
        t_solve = time.perf_counter()
        scenarios = generate_scenarios(ds.daily_returns, sc_cfg)
        solve_ms = (time.perf_counter() - t_solve) * 1000.0

        return BenchmarkCase(
            benchmark_name=self.name,
            case_id="",
            run_id="",
            n_assets=n_assets,
            n_scenarios=n_scenarios,
            method=method,
            backend="numpy",
            solver="numpy.random",
            status="optimal",
            feasible=True,
            solve_time_ms=round(solve_ms, 3),
            setup_time_ms=round(setup_ms, 3),
            diagnostics={
                "shape": list(scenarios.shape),
                "scenarios_per_second": int(n_scenarios / max(solve_ms / 1000.0, 1e-9)),
                "block_size": cfg.block_size if method == "block" else None,
                "df": cfg.df if method == "student_t" else None,
            },
        )
