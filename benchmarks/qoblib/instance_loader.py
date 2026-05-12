"""Load and list QOBLIB fixture instances from data/qoblib/raw/."""

from __future__ import annotations
import json
import os
from pathlib import Path
from .schemas import PortfolioBenchmarkInstance

_DATA_DIR = Path(__file__).parent.parent.parent / "data" / "qoblib" / "raw"


def list_instances() -> list[dict]:
    """Return metadata for all available fixture instances."""
    instances = []
    if not _DATA_DIR.exists():
        return instances
    for path in sorted(_DATA_DIR.glob("*.json")):
        try:
            with open(path) as f:
                raw = json.load(f)
            instances.append({
                "instance_id": raw["instance_id"],
                "description": raw.get("description", ""),
                "n_assets": raw["n_assets"],
                "n_periods": raw["n_periods"],
                "path": str(path),
            })
        except (KeyError, json.JSONDecodeError):
            pass
    return instances


def load_instance(instance_id: str) -> PortfolioBenchmarkInstance:
    """Load a fixture instance by ID. Raises FileNotFoundError if not found."""
    path = _DATA_DIR / f"{instance_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Instance '{instance_id}' not found at {path}")
    with open(path) as f:
        raw = json.load(f)
    return PortfolioBenchmarkInstance(
        instance_id=raw["instance_id"],
        description=raw.get("description", ""),
        n_assets=raw["n_assets"],
        n_periods=raw["n_periods"],
        asset_names=raw["asset_names"],
        expected_returns=raw["expected_returns"],
        covariance_matrix=raw["covariance_matrix"],
        constraints=raw.get("constraints", {}),
        sectors=raw.get("sectors", []),
        benchmark_optimal=raw.get("benchmark_optimal"),
    )
