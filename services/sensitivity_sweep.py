"""Server-side sensitivity grid: parallel optimizations matching /api/portfolio/optimize."""

from __future__ import annotations

import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import numpy as np

from config.api_config import REGIME_OPTIMIZER_PARAMS
from core.portfolio_optimizer import OBJECTIVES, run_optimization
from services.data_provider import load_market_payload

DEFAULT_WEIGHT_MAX_STEPS = [0.10, 0.15, 0.20, 0.25, 0.30]

_OBJECTIVE_ALIASES = {
    "max_sharpe": "markowitz",
    "risk_parity": "hrp",
}


class SensitivitySweepError(ValueError):
    """Invalid sweep request."""


def _normalize_objective(raw: str) -> str:
    o = str(raw).strip()
    return _OBJECTIVE_ALIASES.get(o, o)


def run_sensitivity_sweep(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Run a 4×5 Sharpe grid (objectives × weight caps) using the same optimizer path as optimize_portfolio.

    Raises:
        SensitivitySweepError: validation failures (mirrors optimize route expectations).
        ValueError: from load_market_payload / optimizer when inputs are inconsistent.
    """
    if not payload:
        raise SensitivitySweepError("Request body is required")

    objectives_in = payload.get("objectives")
    if not isinstance(objectives_in, list) or len(objectives_in) != 4:
        raise SensitivitySweepError("'objectives' must be an array of exactly 4 objective ids")

    w_steps_in = payload.get("weight_max_steps", DEFAULT_WEIGHT_MAX_STEPS)
    if not isinstance(w_steps_in, list) or len(w_steps_in) != 5:
        raise SensitivitySweepError("'weight_max_steps' must be a list of 5 numbers")

    normalized_objectives: list[str] = []
    for raw in objectives_in:
        o = _normalize_objective(str(raw))
        if o not in OBJECTIVES:
            raise SensitivitySweepError(
                f"Unknown objective '{raw}'. Valid keys include: {sorted(OBJECTIVES.keys())}"
            )
        normalized_objectives.append(o)

    market_payload = load_market_payload(payload)
    returns = market_payload.returns
    covariance = market_payload.covariance
    asset_names = [a["name"] for a in market_payload.assets]

    regime = str(payload.get("regime", "normal")).lower()
    regime_params = REGIME_OPTIMIZER_PARAMS.get(regime, REGIME_OPTIMIZER_PARAMS["normal"])

    lambda_risk = float(payload.get("lambda_risk", 1.0)) * float(regime_params["lambda_risk_factor"])
    weight_min = float(payload.get("weight_min", payload.get("minWeight", 0.005)))

    weight_cols: list[float] = []
    requested_steps: list[float] = []
    for w in w_steps_in:
        w_raw = float(w)
        requested_steps.append(w_raw)
        w_adj = max(0.05, min(1.0, w_raw + float(regime_params["weight_max_delta"])))
        weight_cols.append(w_adj)

    if any(w_max <= weight_min + 1e-9 for w_max in weight_cols):
        raise SensitivitySweepError(
            "Regime-adjusted weight_max must exceed weight_min for all sweep columns"
        )

    K = payload.get("K")
    K_screen = payload.get("K_screen")
    K_select = payload.get("K_select")
    gamma = float(payload.get("gamma", 8.0))
    n_layers = int(payload.get("n_layers", 3))
    n_restarts = int(payload.get("n_restarts", 8))
    seed = int(payload.get("seed", 42))
    target_return = payload.get("targetReturn") or payload.get("target_return")

    request_id = str(uuid.uuid4())
    t0 = time.time()

    def run_cell(obj: str, w_max: float) -> float:
        tr_opt = target_return
        if obj == "target_return" and tr_opt is None:
            tr_opt = float(np.mean(returns))
        result = run_optimization(
            returns=returns,
            covariance=covariance,
            objective=obj,
            target_return=float(tr_opt) if tr_opt is not None else None,
            asset_names=asset_names,
            K=int(K) if K is not None else None,
            K_screen=int(K_screen) if K_screen is not None else None,
            K_select=int(K_select) if K_select is not None else None,
            lambda_risk=lambda_risk,
            gamma=gamma,
            n_layers=n_layers,
            n_restarts=n_restarts,
            weight_min=weight_min,
            weight_max=w_max,
            seed=seed,
        )
        return float(result.sharpe_ratio)

    tasks: list[tuple[int, int, str, float]] = []
    for i, obj in enumerate(normalized_objectives):
        for j, w_max in enumerate(weight_cols):
            tasks.append((i, j, obj, w_max))

    max_workers = min(8, len(tasks))
    sharpe_grid = [[0.0] * len(weight_cols) for _ in range(len(normalized_objectives))]

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {
            pool.submit(run_cell, obj, w_max): (i, j)
            for i, j, obj, w_max in tasks
        }
        for fut, (i, j) in futures.items():
            sharpe_grid[i][j] = fut.result()

    duration_ms = round((time.time() - t0) * 1000, 2)

    return {
        "w_steps": weight_cols,
        "weight_max_steps_requested": requested_steps,
        "objectives": [{"id": oid} for oid in normalized_objectives],
        "sharpe": sharpe_grid,
        "meta": {
            "duration_ms": duration_ms,
            "request_id": request_id,
            "regime": regime,
            "n_assets": len(asset_names),
        },
    }
