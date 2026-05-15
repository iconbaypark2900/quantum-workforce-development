"""
Benchmark suite primitives.

Every benchmark in this directory follows the same contract:

  1. Build cases (an iterable of `BenchmarkCase` placeholders or raw dicts)
  2. Execute each case → time + record `BenchmarkCase` with full diagnostics
  3. Aggregate into a `BenchmarkReport` and write JSONL to disk

`BenchmarkRunner` is the abstract base. Subclasses implement `_run_case(case)`
and the runner takes care of timing, ordering, JSONL output, and summary stats.

Output paths default to `benchmarks/results/<benchmark_name>-<run_id>.jsonl`.
The `run_id` matches the `services.run_store.generate_run_id` format so
benchmark output and experiment-tracking output sort together chronologically.
"""
from __future__ import annotations

import json
import os
import time
import traceback
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

import numpy as np


# ── Paths ─────────────────────────────────────────────────────────────────────


def results_root() -> Path:
    """
    Default results directory.

    Resolution order:
      1. $QHP_BENCHMARK_DIR
      2. <repo>/benchmarks/results/
    """
    env = os.environ.get("QHP_BENCHMARK_DIR")
    if env:
        return Path(env).expanduser().resolve()
    here = Path(__file__).resolve().parent
    return (here / "results").resolve()


DEFAULT_RESULTS_DIR = results_root()


# ── Dataclasses ───────────────────────────────────────────────────────────────


@dataclass
class BenchmarkConfig:
    """Generic config block — each benchmark subclass extends as needed."""

    name: str
    seed: int = 42
    output_dir: Optional[str] = None
    output_format: str = "jsonl"   # jsonl | json (jsonl recommended)
    fail_fast: bool = False        # if True, raise on first case error


@dataclass
class BenchmarkCase:
    """One executed benchmark case — written as one JSONL line."""

    # Identification
    benchmark_name: str
    case_id: str
    run_id: str

    # Problem dimensions
    n_assets: int
    n_scenarios: int

    # What was run
    method: str = ""           # e.g. mean_cvar | markowitz | gaussian_scenario
    backend: str = ""          # e.g. cpu_cvxpy | cpu_scipy
    solver: str = ""           # e.g. CLARABEL | HiGHS

    # Outcome
    status: str = "pending"    # optimal | failed | skipped | error
    feasible: bool = False
    solve_time_ms: float = 0.0
    setup_time_ms: float = 0.0

    # Portfolio metrics (filled in when available)
    objective_value: Optional[float] = None
    expected_return: Optional[float] = None
    volatility: Optional[float] = None
    sharpe: Optional[float] = None
    var_95: Optional[float] = None
    cvar_95: Optional[float] = None

    # Free-form diagnostics
    diagnostics: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


@dataclass
class BenchmarkReport:
    """Aggregate of cases for a single benchmark invocation."""

    benchmark_name: str
    run_id: str
    started_at: str
    finished_at: str
    config: Dict[str, Any]
    cases: List[BenchmarkCase]

    @property
    def n_cases(self) -> int:
        return len(self.cases)

    @property
    def n_optimal(self) -> int:
        return sum(1 for c in self.cases if c.status == "optimal")

    @property
    def n_failed(self) -> int:
        return sum(1 for c in self.cases if c.status in ("failed", "error"))

    def summary(self) -> Dict[str, Any]:
        if not self.cases:
            return {"n_cases": 0}
        times = [c.solve_time_ms for c in self.cases if c.solve_time_ms > 0]
        return {
            "n_cases": self.n_cases,
            "n_optimal": self.n_optimal,
            "n_failed": self.n_failed,
            "median_solve_ms": float(np.median(times)) if times else 0.0,
            "min_solve_ms": float(min(times)) if times else 0.0,
            "max_solve_ms": float(max(times)) if times else 0.0,
            "total_solve_ms": float(sum(times)) if times else 0.0,
        }

    def to_dict(self) -> Dict[str, Any]:
        return {
            "benchmark_name": self.benchmark_name,
            "run_id": self.run_id,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "config": self.config,
            "summary": self.summary(),
            "cases": [asdict(c) for c in self.cases],
        }


# ── Synthetic dataset ─────────────────────────────────────────────────────────


@dataclass
class SyntheticDataset:
    """Reproducible synthetic data shared across benchmark cases."""

    n_assets: int
    n_history: int
    seed: int
    mu: np.ndarray              # annualised expected returns, shape (n,)
    Sigma: np.ndarray           # annualised covariance, shape (n, n)
    daily_returns: np.ndarray   # shape (n_history, n_assets)


def generate_synthetic_dataset(
    n_assets: int,
    n_history: int = 504,
    seed: int = 42,
    base_return: float = 0.0004,
    base_vol: float = 0.012,
    correlation: float = 0.20,
) -> SyntheticDataset:
    """
    Produce a deterministic synthetic universe.

    The covariance is a constant-correlation matrix with per-asset variances
    drawn from a lognormal centred at `base_vol`. Means are jittered around
    `base_return`. Daily returns are sampled multivariate normal.
    """
    rng = np.random.default_rng(seed)

    # Per-asset daily mean / vol (lognormally jittered)
    daily_means = base_return * np.exp(rng.normal(0.0, 0.20, size=n_assets))
    daily_vols = base_vol * np.exp(rng.normal(0.0, 0.20, size=n_assets))

    # Constant-correlation covariance
    corr = np.full((n_assets, n_assets), correlation)
    np.fill_diagonal(corr, 1.0)
    cov_daily = (daily_vols[:, None] * daily_vols[None, :]) * corr

    daily = rng.multivariate_normal(daily_means, cov_daily, size=n_history)

    mu = daily_means * 252.0
    Sigma = cov_daily * 252.0

    return SyntheticDataset(
        n_assets=n_assets,
        n_history=n_history,
        seed=seed,
        mu=mu,
        Sigma=Sigma,
        daily_returns=daily,
    )


# ── Runner ABC ────────────────────────────────────────────────────────────────


class BenchmarkRunner(ABC):
    """
    Subclasses define `cases()` and `_run_case()`.

    The runner handles timing, JSONL output, error capture, and report
    assembly. Subclasses never call `time.perf_counter` directly — they
    just return a populated `BenchmarkCase` (or raise to mark error).
    """

    name: str = "abstract"

    def __init__(self, config: BenchmarkConfig) -> None:
        self.config = config
        self.run_id = _generate_run_id()

    # ── Public API ──────────────────────────────────────────────────────────

    def run(self) -> BenchmarkReport:
        cases_out: List[BenchmarkCase] = []
        started = _now_iso()
        for raw_case in self.cases():
            populated = self._execute_case(raw_case)
            cases_out.append(populated)
        finished = _now_iso()

        report = BenchmarkReport(
            benchmark_name=self.name,
            run_id=self.run_id,
            started_at=started,
            finished_at=finished,
            config=asdict(self.config),
            cases=cases_out,
        )
        self._write_report(report)
        return report

    # ── Subclass hooks ──────────────────────────────────────────────────────

    @abstractmethod
    def cases(self) -> Iterable[Dict[str, Any]]:
        """Yield case parameter dicts (subclass-specific shape)."""

    @abstractmethod
    def _run_case(self, params: Dict[str, Any]) -> BenchmarkCase:
        """Execute one case and return a populated `BenchmarkCase`."""

    # ── Internals ───────────────────────────────────────────────────────────

    def _execute_case(self, params: Dict[str, Any]) -> BenchmarkCase:
        case_id = params.get("case_id") or _case_id_from_params(params)
        try:
            t0 = time.perf_counter()
            case = self._run_case(params)
            wall_ms = (time.perf_counter() - t0) * 1000.0
            # If the subclass didn't populate solve_time_ms we use wall-clock
            if case.solve_time_ms <= 0:
                case.solve_time_ms = round(wall_ms, 3)
            case.case_id = case.case_id or case_id
            case.run_id = self.run_id
            case.benchmark_name = self.name
            return case
        except Exception as exc:
            if self.config.fail_fast:
                raise
            tb = traceback.format_exc(limit=4)
            return BenchmarkCase(
                benchmark_name=self.name,
                case_id=case_id,
                run_id=self.run_id,
                n_assets=int(params.get("n_assets", 0)),
                n_scenarios=int(params.get("n_scenarios", 0)),
                method=str(params.get("method", "")),
                backend=str(params.get("backend", "")),
                status="error",
                error=f"{type(exc).__name__}: {exc}",
                diagnostics={"traceback": tb},
            )

    def _output_path(self) -> Path:
        # Re-evaluate `results_root()` each call so QHP_BENCHMARK_DIR can be
        # set after the module has been imported (e.g. in CI fixtures).
        out_dir = (
            Path(self.config.output_dir).expanduser().resolve()
            if self.config.output_dir
            else results_root()
        )
        out_dir.mkdir(parents=True, exist_ok=True)
        suffix = "jsonl" if self.config.output_format == "jsonl" else "json"
        return out_dir / f"{self.name}-{self.run_id}.{suffix}"

    def _write_report(self, report: BenchmarkReport) -> None:
        path = self._output_path()
        try:
            if self.config.output_format == "jsonl":
                # One JSON object per case; header line carries the meta
                with path.open("w", encoding="utf-8") as f:
                    header = {
                        "_meta": True,
                        "benchmark_name": report.benchmark_name,
                        "run_id": report.run_id,
                        "started_at": report.started_at,
                        "finished_at": report.finished_at,
                        "config": report.config,
                        "summary": report.summary(),
                    }
                    f.write(json.dumps(header, default=_json_default) + "\n")
                    for c in report.cases:
                        f.write(json.dumps(asdict(c), default=_json_default) + "\n")
            else:
                path.write_text(
                    json.dumps(report.to_dict(), indent=2, default=_json_default),
                    encoding="utf-8",
                )
        except OSError:
            # Best-effort write — never crash a benchmark over disk errors
            pass


# ── Helpers ───────────────────────────────────────────────────────────────────


def _generate_run_id() -> str:
    import secrets
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    return f"{stamp}-{secrets.token_hex(3)}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _case_id_from_params(params: Dict[str, Any]) -> str:
    """Stable case id from the most descriptive params we have."""
    parts: List[str] = []
    for key in ("method", "backend", "solver", "n_assets", "n_scenarios"):
        if key in params and params[key] is not None:
            parts.append(f"{key}={params[key]}")
    return "_".join(parts) or "case"


def _json_default(o: Any) -> Any:
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, Path):
        return str(o)
    raise TypeError(f"Unsupported type for JSON: {type(o)!r}")


# ── Catalogue / registry ──────────────────────────────────────────────────────


def list_benchmarks() -> List[Dict[str, Any]]:
    """Catalogue consumed by /api/config/benchmarks and the CLI."""
    return [
        {
            "id": "mean_cvar_scale",
            "label": "Mean-CVaR scale",
            "module": "benchmarks.benchmark_mean_cvar",
            "description": "Solve Mean-CVaR across (n_assets x n_scenarios) grid.",
        },
        {
            "id": "solver_comparison",
            "label": "Solver backend comparison",
            "module": "benchmarks.benchmark_solvers",
            "description": "Compare cpu_cvxpy and cpu_scipy on the same problem.",
        },
        {
            "id": "scenario_generation",
            "label": "Scenario generation timing",
            "module": "benchmarks.benchmark_scenarios",
            "description": "Wall-clock timing for each scenario generation method.",
        },
        {
            "id": "rebalancing",
            "label": "Rebalancing throughput",
            "module": "benchmarks.benchmark_backtesting",
            "description": "Rebalancing engine wall-clock per policy.",
        },
    ]


def load_benchmark_runner(name: str, config_dict: Optional[Dict[str, Any]] = None) -> BenchmarkRunner:
    """
    Instantiate a benchmark runner by id.

    Used by the CLI and the `/api/portfolio/benchmark` endpoint.
    """
    import importlib

    entry = next((b for b in list_benchmarks() if b["id"] == name), None)
    if entry is None:
        raise ValueError(
            f"Unknown benchmark '{name}'. "
            f"Valid: {[b['id'] for b in list_benchmarks()]}"
        )
    mod = importlib.import_module(entry["module"])
    runner_cls = getattr(mod, "Runner", None)
    if runner_cls is None:
        raise RuntimeError(f"Module {entry['module']} does not expose `Runner`.")
    return runner_cls.from_dict(config_dict or {})
