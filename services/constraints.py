"""
Portfolio constraints — unified configuration and validation.

Supports:
  - weight bounds (min_weight, max_weight)
  - leverage and short-selling
  - sector caps and minima
  - cardinality (exact, min, max)
  - blacklist / whitelist
  - turnover budget

Also provides a `ConstraintReport` dataclass and `validate()` method that
returns feasibility, violations, and utilisation diagnostics for any
weight vector. This flows through the optimiser, API, and dashboard.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np


# ── Constraint configuration ──────────────────────────────────────────────────


@dataclass
class PortfolioConstraints:
    """
    Unified portfolio constraints used by optimisers, backtests, and the API.

    Weight bounds
    -------------
    min_weight : Minimum weight per active asset (None = no constraint).
    max_weight : Maximum weight per asset (None = no constraint).
    allow_short : When True, weights may be negative. Default False (long-only).

    Risk / exposure
    ---------------
    max_leverage : Cap on sum of absolute weights, sum(|w_i|) <= max_leverage.
                   For long-only this is equivalent to sum(w_i) <= max_leverage.
    max_turnover : Maximum turnover at rebalance, sum(|w - w_prev|) <= max_turnover.
                   Alias for turnover_budget (kept for legacy compatibility).
    turnover_budget : Legacy name for max_turnover.

    Sector / asset-group caps
    -------------------------
    sector_limits : Max weight per sector, e.g. {'Technology': 0.30}.
    sector_min : Min weight per sector, e.g. {'Healthcare': 0.05}.
    max_sector_weight : Global cap for any sector not listed in sector_limits.

    Cardinality / inclusion
    -----------------------
    cardinality : Exact number of positions (heuristic; top-k).
    min_cardinality, max_cardinality : Soft bounds on number of active positions.
    blacklist : Tickers to exclude (case-insensitive).
    whitelist : If non-empty, only these tickers are allowed.
    """

    # Weight bounds (Sprint 2 additions)
    min_weight: Optional[float] = None
    max_weight: Optional[float] = None
    allow_short: bool = False

    # Risk / exposure (Sprint 2 additions)
    max_leverage: Optional[float] = None
    max_turnover: Optional[float] = None

    # Sector / asset-group caps
    sector_limits: Dict[str, float] = field(default_factory=dict)
    sector_min: Dict[str, float] = field(default_factory=dict)
    max_sector_weight: Optional[float] = None

    # Cardinality / inclusion
    cardinality: Optional[int] = None
    min_cardinality: Optional[int] = None
    max_cardinality: Optional[int] = None
    blacklist: List[str] = field(default_factory=list)
    whitelist: List[str] = field(default_factory=list)

    # Legacy alias (kept for backward compatibility with backtest call sites)
    turnover_budget: Optional[float] = None

    def __post_init__(self) -> None:
        # Reconcile turnover_budget and max_turnover so callers can use either name
        if self.max_turnover is None and self.turnover_budget is not None:
            self.max_turnover = self.turnover_budget
        if self.turnover_budget is None and self.max_turnover is not None:
            self.turnover_budget = self.max_turnover

    # ── Diagnostics ──────────────────────────────────────────────────────────

    def has_constraints(self) -> bool:
        """Return True if any constraint is set."""
        return bool(
            self.min_weight is not None
            or self.max_weight is not None
            or self.allow_short
            or self.max_leverage is not None
            or self.max_turnover is not None
            or self.sector_limits
            or self.sector_min
            or self.max_sector_weight is not None
            or self.cardinality is not None
            or self.min_cardinality is not None
            or self.max_cardinality is not None
            or self.blacklist
            or self.whitelist
        )

    # ── Serialisation ────────────────────────────────────────────────────────

    @classmethod
    def from_dict(cls, d: Optional[dict]) -> "PortfolioConstraints":
        """Build from API-style dict. Accepts legacy and new field names."""
        if not d:
            return cls()
        return cls(
            min_weight=d.get("min_weight"),
            max_weight=d.get("max_weight"),
            allow_short=bool(d.get("allow_short", False)),
            max_leverage=d.get("max_leverage"),
            max_turnover=d.get("max_turnover"),
            sector_limits=d.get("sector_limits") or {},
            sector_min=d.get("sector_min") or {},
            max_sector_weight=d.get("max_sector_weight"),
            cardinality=d.get("cardinality"),
            min_cardinality=d.get("min_cardinality"),
            max_cardinality=d.get("max_cardinality"),
            blacklist=[str(x).strip().upper() for x in (d.get("blacklist") or [])],
            whitelist=[str(x).strip().upper() for x in (d.get("whitelist") or [])],
            turnover_budget=d.get("turnover_budget"),
        )

    def to_dict(self) -> dict:
        """Serialise to plain dict (drops None values for cleaner JSON)."""
        out: Dict[str, Any] = {
            "min_weight": self.min_weight,
            "max_weight": self.max_weight,
            "allow_short": self.allow_short,
            "max_leverage": self.max_leverage,
            "max_turnover": self.max_turnover,
            "sector_limits": dict(self.sector_limits),
            "sector_min": dict(self.sector_min),
            "max_sector_weight": self.max_sector_weight,
            "cardinality": self.cardinality,
            "min_cardinality": self.min_cardinality,
            "max_cardinality": self.max_cardinality,
            "blacklist": list(self.blacklist),
            "whitelist": list(self.whitelist),
        }
        return {k: v for k, v in out.items() if v not in (None, [], {}, False)}

    # ── Validation ───────────────────────────────────────────────────────────

    def validate(
        self,
        weights: np.ndarray,
        previous_weights: Optional[np.ndarray] = None,
        sectors: Optional[List[str]] = None,
        asset_names: Optional[List[str]] = None,
        tol: float = 1e-6,
    ) -> "ConstraintReport":
        """
        Check a weight vector against this constraint set.

        Parameters
        ----------
        weights : Final portfolio weights, shape (n,).
        previous_weights : Previous weights for turnover check (optional).
        sectors : Sector label per asset for sector cap checks (optional).
        asset_names : Ticker per asset for blacklist/whitelist checks (optional).
        tol : Tolerance for numerical comparison.

        Returns
        -------
        ConstraintReport
        """
        w = np.asarray(weights, dtype=float)
        violations: List[str] = []
        active: List[str] = []
        utilisation: Dict[str, float] = {}

        # Weight bounds
        active_mask = np.abs(w) > tol
        if self.min_weight is not None and active_mask.any():
            min_active = float(np.min(w[active_mask])) if active_mask.any() else 0.0
            utilisation["min_weight_observed"] = min_active
            if min_active < self.min_weight - tol:
                violations.append(
                    f"min_weight violated: smallest active weight {min_active:.4f} "
                    f"< {self.min_weight:.4f}"
                )
            elif abs(min_active - self.min_weight) <= tol:
                active.append("min_weight")
        if self.max_weight is not None:
            max_w = float(np.max(w))
            utilisation["max_weight_observed"] = max_w
            utilisation["max_weight_used"] = max_w / self.max_weight if self.max_weight > 0 else 0.0
            if max_w > self.max_weight + tol:
                violations.append(
                    f"max_weight violated: {max_w:.4f} > {self.max_weight:.4f}"
                )
            elif abs(max_w - self.max_weight) <= tol:
                active.append("max_weight")

        # Long-only / short selling
        if not self.allow_short:
            min_w = float(np.min(w))
            if min_w < -tol:
                violations.append(
                    f"allow_short=False but min weight {min_w:.4f} is negative"
                )

        # Leverage
        if self.max_leverage is not None:
            leverage = float(np.sum(np.abs(w)))
            utilisation["leverage"] = leverage
            utilisation["leverage_used"] = (
                leverage / self.max_leverage if self.max_leverage > 0 else 0.0
            )
            if leverage > self.max_leverage + tol:
                violations.append(
                    f"max_leverage violated: {leverage:.4f} > {self.max_leverage:.4f}"
                )
            elif abs(leverage - self.max_leverage) <= tol:
                active.append("max_leverage")

        # Turnover
        if self.max_turnover is not None and previous_weights is not None:
            prev = np.asarray(previous_weights, dtype=float)
            if prev.shape == w.shape:
                turnover = float(np.sum(np.abs(w - prev)))
                utilisation["turnover"] = turnover
                utilisation["turnover_used"] = (
                    turnover / self.max_turnover if self.max_turnover > 0 else 0.0
                )
                if turnover > self.max_turnover + tol:
                    violations.append(
                        f"max_turnover violated: {turnover:.4f} > {self.max_turnover:.4f}"
                    )
                elif abs(turnover - self.max_turnover) <= tol:
                    active.append("max_turnover")

        # Sector caps
        if sectors is not None and (self.sector_limits or self.max_sector_weight is not None):
            masks = compute_sector_masks(sectors)
            sector_weights = {s: float(w[idx].sum()) for s, idx in masks.items()}
            utilisation["sector_weights"] = sector_weights
            for sector, cap in self.sector_limits.items():
                sw = sector_weights.get(sector, 0.0)
                if sw > cap + tol:
                    violations.append(
                        f"sector_limits[{sector}] violated: {sw:.4f} > {cap:.4f}"
                    )
                elif abs(sw - cap) <= tol:
                    active.append(f"sector_limits[{sector}]")
            if self.max_sector_weight is not None:
                for sector, sw in sector_weights.items():
                    if sector in self.sector_limits:
                        continue
                    if sw > self.max_sector_weight + tol:
                        violations.append(
                            f"max_sector_weight violated for {sector}: "
                            f"{sw:.4f} > {self.max_sector_weight:.4f}"
                        )

        # Sector minimums
        if sectors is not None and self.sector_min:
            masks = compute_sector_masks(sectors)
            for sector, floor in self.sector_min.items():
                sw = float(w[masks.get(sector, [])].sum()) if sector in masks else 0.0
                if sw < floor - tol:
                    violations.append(
                        f"sector_min[{sector}] violated: {sw:.4f} < {floor:.4f}"
                    )

        # Cardinality
        n_active = int(np.sum(active_mask))
        utilisation["n_active"] = n_active
        if self.cardinality is not None and n_active != self.cardinality:
            violations.append(
                f"cardinality violated: {n_active} active positions, "
                f"expected {self.cardinality}"
            )
        if self.min_cardinality is not None and n_active < self.min_cardinality:
            violations.append(
                f"min_cardinality violated: {n_active} < {self.min_cardinality}"
            )
        if self.max_cardinality is not None and n_active > self.max_cardinality:
            violations.append(
                f"max_cardinality violated: {n_active} > {self.max_cardinality}"
            )

        # Blacklist / whitelist
        if asset_names is not None and (self.blacklist or self.whitelist):
            upper_names = [str(a).strip().upper() for a in asset_names]
            for i, name in enumerate(upper_names):
                if name in self.blacklist and active_mask[i]:
                    violations.append(
                        f"blacklist violated: {name} has weight {w[i]:.4f}"
                    )
                if self.whitelist and name not in self.whitelist and active_mask[i]:
                    violations.append(
                        f"whitelist violated: {name} not in whitelist but weight {w[i]:.4f}"
                    )

        return ConstraintReport(
            feasible=len(violations) == 0,
            violations=violations,
            active_constraints=active,
            utilisation=utilisation,
            n_active=n_active,
        )


# ── Report dataclass ─────────────────────────────────────────────────────────


@dataclass
class ConstraintReport:
    """Result of validating weights against a PortfolioConstraints object."""

    feasible: bool
    violations: List[str] = field(default_factory=list)
    active_constraints: List[str] = field(default_factory=list)
    utilisation: Dict[str, Any] = field(default_factory=dict)
    n_active: int = 0

    def to_dict(self) -> dict:
        return {
            "feasible": bool(self.feasible),
            "violations": list(self.violations),
            "active_constraints": list(self.active_constraints),
            "utilisation": dict(self.utilisation),
            "n_active": int(self.n_active),
        }


# ── Helpers ──────────────────────────────────────────────────────────────────


def compute_sector_masks(sectors: List[str]) -> Dict[str, List[int]]:
    """
    Map sector name -> list of asset indices in that sector.

    Parameters
    ----------
    sectors : Sector for each asset (same length as returns/covariance).

    Returns
    -------
    Dict mapping sector name -> list of indices.
    """
    masks: Dict[str, List[int]] = {}
    for i, s in enumerate(sectors):
        key = (s or "Unknown").strip()
        if key not in masks:
            masks[key] = []
        masks[key].append(i)
    return masks
