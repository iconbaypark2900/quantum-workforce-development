"""
Rebalancing lab — periodic and event-driven portfolio rebalancing with
transaction costs.

Goals:
  - First-class policies (monthly, quarterly, weekly, threshold-drift,
    volatility-triggered) — each is a small class with a `triggers()` method
  - Realistic transaction cost model (linear bps + fixed per trade)
  - Net-of-cost return tracking and full metric bundle:
      Sharpe, Sortino, max drawdown, VaR, CVaR, turnover history
  - Reuses `core.portfolio_optimizer.run_optimization` to pick weights at
    each rebalance — no optimizer logic duplicated here

The module is self-contained: pass it a (date x ticker) returns DataFrame
plus `optimize_kwargs` describing the objective/constraints/scenario settings,
and it returns a `RebalancingResult` dataclass that the API converts to JSON.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

import numpy as np
import pandas as pd


# ── Policies ──────────────────────────────────────────────────────────────────


class RebalancePolicy:
    """Base class. Implementations decide when to rebalance."""

    name: str = "abstract"

    def triggers(
        self,
        today: pd.Timestamp,
        current_weights: np.ndarray,
        target_weights: np.ndarray,
        recent_returns: pd.DataFrame,
        last_rebalance: Optional[pd.Timestamp],
    ) -> bool:
        raise NotImplementedError


class PeriodicPolicy(RebalancePolicy):
    """Rebalance on the first business day of each period."""

    def __init__(self, frequency: str = "monthly") -> None:
        freq = frequency.lower().strip()
        if freq not in ("weekly", "monthly", "quarterly", "yearly"):
            raise ValueError(
                f"Unknown periodic frequency '{frequency}'. "
                "Valid: weekly, monthly, quarterly, yearly"
            )
        self.frequency = freq
        self.name = freq

    def triggers(self, today, current_weights, target_weights, recent_returns, last_rebalance):
        if last_rebalance is None:
            return True
        if self.frequency == "weekly":
            return (today - last_rebalance).days >= 7
        if self.frequency == "monthly":
            return today.month != last_rebalance.month or today.year != last_rebalance.year
        if self.frequency == "quarterly":
            today_q = (today.month - 1) // 3
            last_q = (last_rebalance.month - 1) // 3
            return today_q != last_q or today.year != last_rebalance.year
        if self.frequency == "yearly":
            return today.year != last_rebalance.year
        return False


class ThresholdDriftPolicy(RebalancePolicy):
    """Rebalance when any weight has drifted more than `threshold` from target."""

    name = "threshold_drift"

    def __init__(self, threshold: float = 0.05, min_interval_days: int = 1) -> None:
        if threshold <= 0:
            raise ValueError("threshold must be > 0")
        self.threshold = float(threshold)
        self.min_interval_days = int(min_interval_days)

    def triggers(self, today, current_weights, target_weights, recent_returns, last_rebalance):
        if last_rebalance is None:
            return True
        if (today - last_rebalance).days < self.min_interval_days:
            return False
        drift = np.max(np.abs(np.asarray(current_weights) - np.asarray(target_weights)))
        return bool(drift > self.threshold)


class VolatilityTriggeredPolicy(RebalancePolicy):
    """Rebalance when short-window volatility exceeds long-window vol by a ratio."""

    name = "volatility_triggered"

    def __init__(
        self,
        short_window: int = 21,
        long_window: int = 63,
        ratio: float = 1.25,
        min_interval_days: int = 5,
    ) -> None:
        self.short_window = int(short_window)
        self.long_window = int(long_window)
        self.ratio = float(ratio)
        self.min_interval_days = int(min_interval_days)

    def triggers(self, today, current_weights, target_weights, recent_returns, last_rebalance):
        if last_rebalance is None:
            return True
        if (today - last_rebalance).days < self.min_interval_days:
            return False
        if recent_returns is None or len(recent_returns) < self.long_window:
            return False
        port_ret = recent_returns @ np.asarray(current_weights)
        short = port_ret.iloc[-self.short_window:].std()
        long_ = port_ret.iloc[-self.long_window:].std()
        if long_ < 1e-12:
            return False
        return bool(short / long_ > self.ratio)


def build_policy(policy: str, **kwargs) -> RebalancePolicy:
    """Construct a policy by name. Unknown names → ValueError."""
    p = (policy or "monthly").lower().strip()
    if p in ("weekly", "monthly", "quarterly", "yearly"):
        return PeriodicPolicy(frequency=p)
    if p in ("threshold", "threshold_drift", "drift"):
        return ThresholdDriftPolicy(
            threshold=float(kwargs.get("threshold", 0.05)),
            min_interval_days=int(kwargs.get("min_interval_days", 1)),
        )
    if p in ("volatility", "volatility_triggered"):
        return VolatilityTriggeredPolicy(
            short_window=int(kwargs.get("short_window", 21)),
            long_window=int(kwargs.get("long_window", 63)),
            ratio=float(kwargs.get("ratio", 1.25)),
            min_interval_days=int(kwargs.get("min_interval_days", 5)),
        )
    raise ValueError(
        f"Unknown rebalance policy '{policy}'. "
        "Valid: weekly, monthly, quarterly, yearly, threshold, volatility"
    )


# ── Transaction cost model ────────────────────────────────────────────────────


@dataclass
class TransactionCostModel:
    """
    Linear (bps × notional traded) + fixed (per trade) cost model.

    cost = (linear_bps × 1e-4) × portfolio_value × turnover + fixed_per_trade × n_trades

    Examples
    --------
    >>> TransactionCostModel(linear_bps=10.0).cost(
    ...     turnover=0.20, portfolio_value=100_000, n_trades=4
    ... )
    20.0   # 10 bps × $100k × 20% turnover = $20
    """

    linear_bps: float = 0.0     # cost per dollar traded, in basis points
    fixed_per_trade: float = 0.0  # flat cost per asset traded

    def cost(self, turnover: float, portfolio_value: float, n_trades: int) -> float:
        linear = self.linear_bps * 1e-4 * portfolio_value * float(turnover)
        fixed = self.fixed_per_trade * int(n_trades)
        return float(linear + fixed)


# ── Result + Config ───────────────────────────────────────────────────────────


@dataclass
class RebalancingConfig:
    policy: str = "monthly"
    policy_kwargs: Dict[str, Any] = field(default_factory=dict)
    lookback_days: int = 252
    initial_capital: float = 100_000.0
    trading_days_per_year: int = 252
    cost_linear_bps: float = 0.0
    cost_fixed_per_trade: float = 0.0
    benchmark: Optional[str] = None  # benchmark ticker column in returns panel
    seed: int = 42


@dataclass
class RebalancingResult:
    dates: List[str]
    portfolio_values: List[float]
    portfolio_returns: List[float]
    drawdowns: List[float]
    rebalance_dates: List[str]
    weights_history: List[Dict[str, float]]
    turnover_history: List[float]
    transaction_costs: List[float]
    cumulative_cost: float
    gross_return: float
    net_return: float
    sharpe: float
    sortino: float
    max_drawdown: float
    var_95: float
    cvar_95: float
    n_rebalances: int
    n_observations: int
    policy: str
    benchmark_values: Optional[List[float]] = None

    def summary(self) -> Dict[str, Any]:
        """Compact metric bundle suitable for the API response and dashboard cards."""
        return {
            "policy": self.policy,
            "n_rebalances": self.n_rebalances,
            "n_observations": self.n_observations,
            "gross_return": float(self.gross_return),
            "net_return": float(self.net_return),
            "sharpe": float(self.sharpe),
            "sortino": float(self.sortino),
            "max_drawdown": float(self.max_drawdown),
            "var_95": float(self.var_95),
            "cvar_95": float(self.cvar_95),
            "cumulative_cost": float(self.cumulative_cost),
            "avg_turnover_per_rebalance": (
                float(np.mean(self.turnover_history)) if self.turnover_history else 0.0
            ),
        }


# ── Metric helpers ────────────────────────────────────────────────────────────


def _sharpe(returns: np.ndarray, periods_per_year: int = 252) -> float:
    r = np.asarray(returns, dtype=float)
    if r.size < 2:
        return 0.0
    mu = r.mean() * periods_per_year
    sigma = r.std(ddof=1) * np.sqrt(periods_per_year)
    return float(mu / sigma) if sigma > 1e-12 else 0.0


def _sortino(returns: np.ndarray, periods_per_year: int = 252, target: float = 0.0) -> float:
    r = np.asarray(returns, dtype=float)
    if r.size < 2:
        return 0.0
    downside = r[r < target]
    if downside.size == 0:
        # No downside in sample — return a large but finite proxy.
        return float(r.mean() * periods_per_year / (1e-9))
    dd = np.sqrt((downside ** 2).mean()) * np.sqrt(periods_per_year)
    mu = r.mean() * periods_per_year
    return float(mu / dd) if dd > 1e-12 else 0.0


def _max_drawdown(values: np.ndarray) -> tuple[float, np.ndarray]:
    """Return (max_drawdown, drawdown_series). Drawdown values are <= 0."""
    v = np.asarray(values, dtype=float)
    if v.size == 0:
        return 0.0, np.array([])
    peak = np.maximum.accumulate(v)
    dd = v / peak - 1.0
    return float(dd.min()), dd


def _var_cvar(returns: np.ndarray, alpha: float = 0.05) -> tuple[float, float]:
    """Historical VaR / CVaR at confidence (1 - alpha). Returns positive losses."""
    r = np.asarray(returns, dtype=float)
    if r.size < 2:
        return 0.0, 0.0
    losses = -r
    var = float(np.quantile(losses, 1.0 - alpha))
    tail = losses[losses >= var]
    cvar = float(tail.mean()) if tail.size > 0 else var
    return var, cvar


# ── Core engine ───────────────────────────────────────────────────────────────


class RebalancingEngine:
    """
    Backtest engine that rebalances by policy and accounts for transaction costs.

    Usage
    -----
    >>> engine = RebalancingEngine(config)
    >>> result = engine.run(returns_df, optimize_kwargs)
    """

    def __init__(self, config: RebalancingConfig) -> None:
        self.config = config
        self._policy = build_policy(config.policy, **(config.policy_kwargs or {}))
        self._cost_model = TransactionCostModel(
            linear_bps=config.cost_linear_bps,
            fixed_per_trade=config.cost_fixed_per_trade,
        )

    @property
    def policy(self) -> RebalancePolicy:
        return self._policy

    @property
    def cost_model(self) -> TransactionCostModel:
        return self._cost_model

    # ── Main loop ───────────────────────────────────────────────────────────

    def run(
        self,
        returns_panel: pd.DataFrame,
        optimize_kwargs: Optional[Dict[str, Any]] = None,
    ) -> RebalancingResult:
        """
        Backtest over `returns_panel`.

        Parameters
        ----------
        returns_panel : (date x ticker) DataFrame of period returns (daily).
        optimize_kwargs : forwarded to `run_optimization()` each rebalance.
                          The engine fills in `returns`, `covariance`, and `asset_names`
                          per-window; callers should pass `objective`, `weight_min`,
                          `weight_max`, `constraints`, etc.
        """
        if returns_panel is None or returns_panel.empty:
            raise ValueError("returns_panel is empty")
        if not isinstance(returns_panel.index, pd.DatetimeIndex):
            returns_panel = returns_panel.copy()
            returns_panel.index = pd.to_datetime(returns_panel.index)

        opt_kwargs = dict(optimize_kwargs or {})
        opt_kwargs.setdefault("objective", "hybrid")

        cols = list(returns_panel.columns)
        n_assets = len(cols)
        lookback = max(2, int(self.config.lookback_days))
        if len(returns_panel) <= lookback:
            raise ValueError(
                f"returns_panel has {len(returns_panel)} rows; need > lookback "
                f"({lookback}). Provide more history or shrink lookback."
            )

        # Pre-allocate output containers
        dates_out: List[str] = []
        portfolio_values: List[float] = []
        portfolio_returns: List[float] = []
        rebalance_dates: List[str] = []
        weights_history: List[Dict[str, float]] = []
        turnover_history: List[float] = []
        transaction_costs: List[float] = []

        # Initial weights from first window
        first_window = returns_panel.iloc[:lookback]
        current_weights = self._optimize_window(first_window, cols, opt_kwargs)
        target_weights = current_weights.copy()

        port_value = float(self.config.initial_capital)
        last_rebalance: Optional[pd.Timestamp] = returns_panel.index[lookback - 1]
        rebalance_dates.append(last_rebalance.isoformat()[:10])
        weights_history.append(_weights_dict(cols, current_weights))
        turnover_history.append(0.0)
        transaction_costs.append(0.0)

        # Walk forward starting at lookback. Per-day order of operations:
        #   1. Decide whether to rebalance using the current (drifted) weights.
        #   2. If yes: recompute target, pay transaction cost, snap to target.
        #   3. Apply today's market return using the post-rebalance weights.
        #   4. Drift weights forward to reflect today's asset-level returns.
        for i in range(lookback, len(returns_panel)):
            today = returns_panel.index[i]
            day_returns = returns_panel.iloc[i].values
            window = returns_panel.iloc[i - lookback : i]

            need_rebalance = self._policy.triggers(
                today=today,
                current_weights=current_weights,
                target_weights=target_weights,
                recent_returns=window,
                last_rebalance=last_rebalance,
            )

            cost_today = 0.0
            turnover_today = 0.0
            if need_rebalance:
                target_weights = self._optimize_window(window, cols, opt_kwargs)
                turnover_today = float(np.sum(np.abs(target_weights - current_weights)))
                n_trades = int(np.sum(np.abs(target_weights - current_weights) > 1e-6))
                cost_today = self._cost_model.cost(
                    turnover=turnover_today,
                    portfolio_value=port_value,
                    n_trades=n_trades,
                )
                port_value -= cost_today
                current_weights = target_weights.copy()
                last_rebalance = today
                rebalance_dates.append(today.isoformat()[:10])
                weights_history.append(_weights_dict(cols, current_weights))
                turnover_history.append(turnover_today)
                transaction_costs.append(cost_today)

            # Apply the day's market return using the post-rebalance weights
            gross_daily_ret = float(np.dot(current_weights, day_returns))
            port_value *= (1.0 + gross_daily_ret)

            # Drift weights forward: w_i(t+1) = w_i(t) * (1 + r_i) / (1 + r_p)
            drifted = current_weights * (1.0 + day_returns)
            total = drifted.sum()
            if abs(total) > 1e-12:
                current_weights = drifted / total

            dates_out.append(today.isoformat()[:10])
            portfolio_values.append(port_value)
            portfolio_returns.append(gross_daily_ret)

        # Benchmark
        bench_values: Optional[List[float]] = None
        if self.config.benchmark and self.config.benchmark in returns_panel.columns:
            bench_series = returns_panel[self.config.benchmark].iloc[lookback:]
            bench_eq = float(self.config.initial_capital) * (1.0 + bench_series).cumprod()
            bench_values = [float(v) for v in bench_eq.values]

        return self._build_result(
            cols=cols,
            dates_out=dates_out,
            portfolio_values=portfolio_values,
            portfolio_returns=portfolio_returns,
            rebalance_dates=rebalance_dates,
            weights_history=weights_history,
            turnover_history=turnover_history,
            transaction_costs=transaction_costs,
            bench_values=bench_values,
        )

    # ── Helpers ─────────────────────────────────────────────────────────────

    def _optimize_window(
        self,
        window: pd.DataFrame,
        asset_names: Sequence[str],
        opt_kwargs: Dict[str, Any],
    ) -> np.ndarray:
        """Compute annualised mu/Sigma over `window` and call run_optimization."""
        # Late import — keeps the engine importable in test environments where
        # the optimizer isn't yet wired up.
        from core.portfolio_optimizer import run_optimization

        mu = window.mean(axis=0).values * self.config.trading_days_per_year
        Sigma = window.cov().values * self.config.trading_days_per_year

        # Pass asset_names through for the optimizer's constraint validation
        local_kwargs = dict(opt_kwargs)
        local_kwargs["asset_names"] = list(asset_names)
        local_kwargs.setdefault("seed", self.config.seed)

        result = run_optimization(
            returns=mu,
            covariance=Sigma,
            **local_kwargs,
        )
        w = np.asarray(result.weights, dtype=float)
        # Fallback safety: any NaN → equal weights
        if not np.all(np.isfinite(w)) or abs(w.sum()) < 1e-8:
            w = np.full(len(asset_names), 1.0 / max(1, len(asset_names)))
        return w / w.sum() if w.sum() != 0 else w

    def _build_result(
        self,
        cols: List[str],
        dates_out: List[str],
        portfolio_values: List[float],
        portfolio_returns: List[float],
        rebalance_dates: List[str],
        weights_history: List[Dict[str, float]],
        turnover_history: List[float],
        transaction_costs: List[float],
        bench_values: Optional[List[float]],
    ) -> RebalancingResult:
        pv = np.asarray(portfolio_values, dtype=float)
        pr = np.asarray(portfolio_returns, dtype=float)
        max_dd, dd_series = _max_drawdown(pv)
        sharpe = _sharpe(pr, self.config.trading_days_per_year)
        sortino = _sortino(pr, self.config.trading_days_per_year)
        var, cvar = _var_cvar(pr, alpha=0.05)
        gross = float(pv[-1] / self.config.initial_capital - 1.0) if pv.size > 0 else 0.0
        cum_cost = float(np.sum(transaction_costs))
        net = float((pv[-1] - cum_cost) / self.config.initial_capital - 1.0) if pv.size > 0 else 0.0

        return RebalancingResult(
            dates=dates_out,
            portfolio_values=list(pv),
            portfolio_returns=list(pr),
            drawdowns=list(dd_series),
            rebalance_dates=rebalance_dates,
            weights_history=weights_history,
            turnover_history=list(turnover_history),
            transaction_costs=list(transaction_costs),
            cumulative_cost=cum_cost,
            gross_return=gross,
            net_return=net,
            sharpe=sharpe,
            sortino=sortino,
            max_drawdown=max_dd,
            var_95=var,
            cvar_95=cvar,
            n_rebalances=max(0, len(rebalance_dates) - 0),
            n_observations=int(pv.size),
            policy=self._policy.name,
            benchmark_values=bench_values,
        )


def _weights_dict(cols: Sequence[str], weights: np.ndarray) -> Dict[str, float]:
    return {str(c): float(w) for c, w in zip(cols, weights)}


# ── High-level entry point ───────────────────────────────────────────────────


def run_rebalance_backtest(
    returns_panel: pd.DataFrame,
    config: Optional[RebalancingConfig] = None,
    optimize_kwargs: Optional[Dict[str, Any]] = None,
) -> RebalancingResult:
    """Convenience: build an engine and run it in one call."""
    return RebalancingEngine(config or RebalancingConfig()).run(
        returns_panel=returns_panel,
        optimize_kwargs=optimize_kwargs,
    )


def list_policies() -> List[Dict[str, Any]]:
    """Catalogue for `/api/config/rebalance-policies`."""
    return [
        {"id": "weekly", "label": "Weekly", "category": "periodic"},
        {"id": "monthly", "label": "Monthly", "category": "periodic"},
        {"id": "quarterly", "label": "Quarterly", "category": "periodic"},
        {"id": "yearly", "label": "Yearly", "category": "periodic"},
        {
            "id": "threshold",
            "label": "Threshold drift",
            "category": "event_driven",
            "parameters": {"threshold": 0.05, "min_interval_days": 1},
        },
        {
            "id": "volatility",
            "label": "Volatility-triggered",
            "category": "event_driven",
            "parameters": {
                "short_window": 21, "long_window": 63,
                "ratio": 1.25, "min_interval_days": 5,
            },
        },
    ]
