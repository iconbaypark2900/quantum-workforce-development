"""Data models for QOBLIB benchmark instances and solver results."""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Optional
import time


@dataclass
class PortfolioBenchmarkInstance:
    instance_id: str
    description: str
    n_assets: int
    n_periods: int
    asset_names: list[str]
    expected_returns: list[float]
    covariance_matrix: list[list[float]]
    constraints: dict
    sectors: list[str]
    benchmark_optimal: Optional[dict] = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class QuboEncodingResult:
    n_qubits: int
    n_variables: int
    encoding_type: str
    penalty_lambda: float
    bits_per_asset: int
    qubo_density: float  # fraction of non-zero entries

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class SolverResult:
    run_id: str
    instance_id: str
    requested_backend: str
    actual_backend: str
    solver_version: str
    feasible: bool
    weights: list[float]
    objective_value: float
    expected_return: float
    portfolio_volatility: float
    sharpe_ratio: float
    n_active_assets: int
    wall_time_seconds: float
    timestamp: str
    metadata: dict = field(default_factory=dict)
    qubo_encoding: Optional[QuboEncodingResult] = None
    error: Optional[str] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        return d
