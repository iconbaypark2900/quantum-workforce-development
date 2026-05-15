"""
Vendor-neutral benchmark suite.

Modules:
  base                   : BenchmarkRunner ABC, BenchmarkCase / BenchmarkReport,
                           synthetic-data generator, JSONL writer
  benchmark_mean_cvar    : Scale matrix (n_assets x n_scenarios) for Mean-CVaR
  benchmark_solvers      : Backend comparison (cpu_cvxpy vs cpu_scipy)
  benchmark_scenarios    : Scenario-generation timing per method
  benchmark_backtesting  : Rebalancing engine throughput

Results land under `benchmarks/results/<run_id>.jsonl` by default — one
JSON object per case, suitable for `jq` or pandas analysis.
"""
from benchmarks.base import (
    BenchmarkCase,
    BenchmarkConfig,
    BenchmarkReport,
    BenchmarkRunner,
    DEFAULT_RESULTS_DIR,
    SyntheticDataset,
    generate_synthetic_dataset,
    results_root,
)

__all__ = [
    "BenchmarkCase",
    "BenchmarkConfig",
    "BenchmarkReport",
    "BenchmarkRunner",
    "DEFAULT_RESULTS_DIR",
    "SyntheticDataset",
    "generate_synthetic_dataset",
    "results_root",
]
