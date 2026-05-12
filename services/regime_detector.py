"""Market regime detection — threshold-based and optional HMM classifiers."""
from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

REGIME_OBJECTIVES: dict[str, str] = {
    "bull_low_vol": "hybrid",
    "bull_high_vol": "markowitz",
    "bear_low_vol": "hrp",
    "bear_high_vol": "hrp",
    "crisis": "equal_weight",
}

REGIME_DESCRIPTIONS: dict[str, str] = {
    "bull_low_vol": "Low volatility bull market — momentum strategies and hybrid quantum objectives tend to outperform in this regime.",
    "bull_high_vol": "High volatility bull market — classical mean-variance optimization controls risk effectively.",
    "bear_low_vol": "Low volatility bear market — hierarchical risk parity provides balanced diversification.",
    "bear_high_vol": "High volatility bear market — defensive allocation with equal risk contribution.",
    "crisis": "Crisis regime — maximum diversification via equal weighting minimizes model risk.",
}

# Map detector output to the Portfolio Lab regime keys used by REGIME_OPTIMIZER_PARAMS.
# The lab regime drives lambda_risk and weight_max adjustments in the optimize endpoint.
LAB_REGIME_FROM_DETECTOR: dict[str, str] = {
    "bull_low_vol": "bull",
    "bull_high_vol": "volatile",
    "bear_low_vol": "bear",
    "bear_high_vol": "volatile",
    "crisis": "crisis",
}


def classify_regime_threshold(
    returns: pd.Series,
    vol_window: int = 21,
    ret_window: int = 63,
) -> str:
    """Classify current market regime from a recent return series.

    Returns one of: bull_low_vol, bull_high_vol, bear_low_vol, bear_high_vol, crisis.
    """
    if len(returns) < max(vol_window, ret_window):
        return "bear_low_vol"

    recent_vol = float(returns.iloc[-vol_window:].std() * np.sqrt(252))
    recent_ret = float(returns.iloc[-ret_window:].mean() * 252)

    if recent_vol > 0.35:
        return "crisis"
    elif recent_ret > 0.10 and recent_vol <= 0.18:
        return "bull_low_vol"
    elif recent_ret > 0.10 and recent_vol > 0.18:
        return "bull_high_vol"
    elif recent_ret <= 0.10 and recent_vol <= 0.18:
        return "bear_low_vol"
    else:
        return "bear_high_vol"


def fit_hmm_regime(
    returns: pd.Series,
    n_states: int = 2,
) -> tuple[int, np.ndarray, float]:
    """Fit a Gaussian HMM and return (current_state, state_sequence, confidence).

    Requires ``hmmlearn`` — raises RuntimeError if not installed.
    """
    try:
        from hmmlearn import hmm  # type: ignore[import-untyped]
    except ImportError as exc:
        raise RuntimeError(
            "hmmlearn is not installed. Install with: pip install hmmlearn>=0.3.3"
        ) from exc

    X = returns.values.reshape(-1, 1)
    model = hmm.GaussianHMM(
        n_components=n_states,
        covariance_type="diag",
        n_iter=100,
        random_state=42,
    )
    model.fit(X)
    states = model.predict(X)
    posteriors = model.predict_proba(X)

    current_state = int(states[-1])
    confidence = float(posteriors[-1, current_state])
    return current_state, states, confidence


def detect_regime(
    returns: pd.Series,
    method: str = "threshold",
    n_states: int = 2,
) -> dict[str, Any]:
    """Unified regime detection returning the full API response dict."""
    if len(returns) < 10:
        raise ValueError("Need at least 10 return observations for regime detection")

    vol_window = min(21, len(returns))
    ret_window = min(63, len(returns))
    realized_vol = float(returns.iloc[-vol_window:].std() * np.sqrt(252))
    recent_return = float(returns.iloc[-ret_window:].mean() * 252)

    if method == "hmm":
        current_state, _states, confidence = fit_hmm_regime(returns, n_states=n_states)
        state_means = [float(returns[_states == i].mean()) for i in range(n_states)]
        bull_state = int(np.argmax(state_means))
        is_bull = current_state == bull_state

        if realized_vol > 0.35:
            regime = "crisis"
        elif is_bull and realized_vol <= 0.18:
            regime = "bull_low_vol"
        elif is_bull:
            regime = "bull_high_vol"
        elif not is_bull and realized_vol <= 0.18:
            regime = "bear_low_vol"
        else:
            regime = "bear_high_vol"
    else:
        regime = classify_regime_threshold(
            returns, vol_window=vol_window, ret_window=ret_window
        )
        confidence = 1.0

    return {
        "regime": regime,
        "lab_regime": LAB_REGIME_FROM_DETECTOR.get(regime, "normal"),
        "recommended_objective": REGIME_OBJECTIVES.get(regime, "hybrid"),
        "confidence": round(confidence, 4),
        "metrics": {
            "realized_vol_annualized": round(realized_vol, 4),
            "recent_return_annualized": round(recent_return, 4),
            "classification_method": method,
        },
        "description": REGIME_DESCRIPTIONS.get(regime, ""),
    }
