"""
Tests for the unified PortfolioConstraints engine.

Covers:
  - from_dict / to_dict round-trip
  - validate() returns feasible=True for compliant weights
  - validate() flags every constraint type:
      weight bounds, leverage, turnover, sector caps,
      cardinality, blacklist/whitelist, long-only
  - utilisation diagnostics are populated
  - core.constraints re-export points at the same class
"""
from __future__ import annotations

import numpy as np
import pytest

from services.constraints import (
    PortfolioConstraints,
    ConstraintReport,
    compute_sector_masks,
)


# ── Construction / serialisation ──────────────────────────────────────────────


class TestConstruction:
    def test_default_is_empty(self):
        c = PortfolioConstraints()
        assert not c.has_constraints()

    def test_weight_bounds_register(self):
        assert PortfolioConstraints(max_weight=0.30).has_constraints()
        assert PortfolioConstraints(min_weight=0.01).has_constraints()
        assert PortfolioConstraints(max_leverage=1.5).has_constraints()
        assert PortfolioConstraints(allow_short=True).has_constraints()

    def test_turnover_alias_reconciled(self):
        c1 = PortfolioConstraints(turnover_budget=0.25)
        assert c1.max_turnover == 0.25
        c2 = PortfolioConstraints(max_turnover=0.30)
        assert c2.turnover_budget == 0.30

    def test_from_dict_full(self):
        d = {
            "min_weight": 0.005,
            "max_weight": 0.25,
            "max_leverage": 1.0,
            "max_turnover": 0.20,
            "sector_limits": {"Tech": 0.40, "Finance": 0.30},
            "blacklist": ["tsla"],
            "whitelist": ["aapl", "msft"],
            "cardinality": 5,
            "allow_short": False,
        }
        c = PortfolioConstraints.from_dict(d)
        assert c.min_weight == 0.005
        assert c.max_weight == 0.25
        assert c.max_leverage == 1.0
        assert c.max_turnover == 0.20
        assert c.sector_limits == {"Tech": 0.40, "Finance": 0.30}
        assert c.blacklist == ["TSLA"]
        assert c.whitelist == ["AAPL", "MSFT"]
        assert c.cardinality == 5
        assert c.allow_short is False

    def test_from_dict_empty(self):
        assert not PortfolioConstraints.from_dict(None).has_constraints()
        assert not PortfolioConstraints.from_dict({}).has_constraints()

    def test_to_dict_drops_falsy(self):
        c = PortfolioConstraints(max_weight=0.25)
        d = c.to_dict()
        assert d == {"max_weight": 0.25}


# ── Validation: feasible cases ────────────────────────────────────────────────


class TestValidateFeasible:
    def test_no_constraints_always_feasible(self):
        c = PortfolioConstraints()
        w = np.array([0.4, 0.3, 0.2, 0.1])
        report = c.validate(w)
        assert report.feasible
        assert report.violations == []

    def test_within_max_weight(self):
        c = PortfolioConstraints(max_weight=0.50)
        w = np.array([0.4, 0.3, 0.2, 0.1])
        report = c.validate(w)
        assert report.feasible
        assert "max_weight_observed" in report.utilisation

    def test_within_leverage_long_only(self):
        c = PortfolioConstraints(max_leverage=1.0)
        w = np.array([0.4, 0.3, 0.2, 0.1])
        report = c.validate(w)
        assert report.feasible
        assert report.utilisation["leverage"] == pytest.approx(1.0)

    def test_turnover_within_budget(self):
        c = PortfolioConstraints(max_turnover=0.30)
        w = np.array([0.30, 0.30, 0.20, 0.20])
        prev = np.array([0.25, 0.25, 0.25, 0.25])
        report = c.validate(w, previous_weights=prev)
        assert report.feasible
        assert report.utilisation["turnover"] == pytest.approx(0.20)


# ── Validation: violation cases ───────────────────────────────────────────────


class TestValidateViolations:
    def test_max_weight_violated(self):
        c = PortfolioConstraints(max_weight=0.25)
        w = np.array([0.40, 0.30, 0.20, 0.10])
        report = c.validate(w)
        assert not report.feasible
        assert any("max_weight" in v for v in report.violations)

    def test_short_selling_blocked(self):
        c = PortfolioConstraints(allow_short=False)
        w = np.array([0.60, -0.20, 0.30, 0.30])
        report = c.validate(w)
        assert not report.feasible
        assert any("allow_short" in v for v in report.violations)

    def test_short_selling_allowed(self):
        c = PortfolioConstraints(allow_short=True)
        w = np.array([0.60, -0.20, 0.30, 0.30])
        report = c.validate(w)
        assert report.feasible

    def test_leverage_violated(self):
        c = PortfolioConstraints(max_leverage=1.0, allow_short=True)
        w = np.array([0.80, -0.50, 0.50, 0.20])  # sum|w| = 2.0
        report = c.validate(w)
        assert not report.feasible
        assert any("max_leverage" in v for v in report.violations)
        assert report.utilisation["leverage"] == pytest.approx(2.0)

    def test_turnover_violated(self):
        c = PortfolioConstraints(max_turnover=0.20)
        w = np.array([0.50, 0.30, 0.10, 0.10])
        prev = np.array([0.25, 0.25, 0.25, 0.25])
        report = c.validate(w, previous_weights=prev)
        assert not report.feasible
        assert any("max_turnover" in v for v in report.violations)

    def test_sector_cap_violated(self):
        c = PortfolioConstraints(sector_limits={"Tech": 0.30})
        w = np.array([0.20, 0.25, 0.30, 0.25])
        sectors = ["Tech", "Tech", "Energy", "Finance"]
        report = c.validate(w, sectors=sectors)
        assert not report.feasible
        assert any("Tech" in v for v in report.violations)

    def test_max_sector_weight_global_cap(self):
        c = PortfolioConstraints(max_sector_weight=0.25)
        w = np.array([0.20, 0.20, 0.30, 0.30])
        sectors = ["A", "A", "B", "B"]
        report = c.validate(w, sectors=sectors)
        assert not report.feasible
        # Both sectors exceed 0.25 (one has 0.40, the other 0.60)
        assert len(report.violations) >= 1

    def test_sector_min_violated(self):
        c = PortfolioConstraints(sector_min={"Healthcare": 0.10})
        w = np.array([0.50, 0.40, 0.05, 0.05])
        sectors = ["Tech", "Tech", "Healthcare", "Finance"]
        report = c.validate(w, sectors=sectors)
        assert not report.feasible
        assert any("Healthcare" in v for v in report.violations)

    def test_cardinality_violated(self):
        c = PortfolioConstraints(cardinality=3)
        w = np.array([0.30, 0.25, 0.25, 0.20])  # 4 active
        report = c.validate(w)
        assert not report.feasible
        assert any("cardinality" in v for v in report.violations)

    def test_min_cardinality_violated(self):
        c = PortfolioConstraints(min_cardinality=5)
        w = np.array([0.50, 0.30, 0.20, 0.0])  # 3 active
        report = c.validate(w)
        assert not report.feasible
        assert any("min_cardinality" in v for v in report.violations)

    def test_blacklist_violated(self):
        c = PortfolioConstraints(blacklist=["TSLA"])
        w = np.array([0.4, 0.4, 0.2])
        names = ["AAPL", "TSLA", "MSFT"]
        report = c.validate(w, asset_names=names)
        assert not report.feasible
        assert any("blacklist" in v.lower() for v in report.violations)

    def test_whitelist_violated(self):
        c = PortfolioConstraints(whitelist=["AAPL", "MSFT"])
        w = np.array([0.4, 0.4, 0.2])
        names = ["AAPL", "GOOG", "MSFT"]
        report = c.validate(w, asset_names=names)
        assert not report.feasible
        assert any("whitelist" in v.lower() for v in report.violations)


# ── Utilisation diagnostics ───────────────────────────────────────────────────


class TestUtilisation:
    def test_max_weight_utilisation(self):
        c = PortfolioConstraints(max_weight=0.40)
        w = np.array([0.30, 0.30, 0.20, 0.20])
        r = c.validate(w)
        assert r.utilisation["max_weight_observed"] == pytest.approx(0.30)
        assert r.utilisation["max_weight_used"] == pytest.approx(0.75)

    def test_leverage_utilisation(self):
        c = PortfolioConstraints(max_leverage=2.0, allow_short=True)
        w = np.array([0.50, -0.30, 0.50, 0.30])  # sum|w| = 1.6
        r = c.validate(w)
        assert r.utilisation["leverage"] == pytest.approx(1.6)
        assert r.utilisation["leverage_used"] == pytest.approx(0.8)

    def test_turnover_utilisation(self):
        c = PortfolioConstraints(max_turnover=0.50)
        # |0.40-0.25| + |0.30-0.25| + |0.20-0.25| + |0.10-0.25| = 0.15+0.05+0.05+0.15 = 0.40
        w = np.array([0.40, 0.30, 0.20, 0.10])
        prev = np.array([0.25, 0.25, 0.25, 0.25])
        r = c.validate(w, previous_weights=prev)
        assert r.utilisation["turnover"] == pytest.approx(0.40)
        assert r.utilisation["turnover_used"] == pytest.approx(0.80)


# ── Active constraints ────────────────────────────────────────────────────────


class TestActiveConstraints:
    def test_max_weight_active_at_boundary(self):
        c = PortfolioConstraints(max_weight=0.40)
        w = np.array([0.40, 0.30, 0.20, 0.10])
        r = c.validate(w)
        assert r.feasible
        assert "max_weight" in r.active_constraints


# ── ConstraintReport round-trip ───────────────────────────────────────────────


class TestConstraintReport:
    def test_to_dict_shape(self):
        c = PortfolioConstraints(max_weight=0.30)
        r = c.validate(np.array([0.30, 0.30, 0.40]))
        d = r.to_dict()
        assert isinstance(d["feasible"], bool)
        assert isinstance(d["violations"], list)
        assert isinstance(d["active_constraints"], list)
        assert isinstance(d["utilisation"], dict)
        assert isinstance(d["n_active"], int)


# ── core.constraints re-export ────────────────────────────────────────────────


class TestCoreReExport:
    def test_core_re_exports_same_class(self):
        from core.constraints import PortfolioConstraints as CorePC
        from core.constraints import ConstraintReport as CoreCR
        assert CorePC is PortfolioConstraints
        assert CoreCR is ConstraintReport


# ── Sector mask helper ────────────────────────────────────────────────────────


class TestComputeSectorMasks:
    def test_simple_partition(self):
        masks = compute_sector_masks(["Tech", "Tech", "Energy", "Finance", "Tech"])
        assert masks["Tech"] == [0, 1, 4]
        assert masks["Energy"] == [2]
        assert masks["Finance"] == [3]

    def test_handles_none_or_empty(self):
        masks = compute_sector_masks([None, "", "Tech"])  # type: ignore
        assert "Unknown" in masks
        assert masks["Tech"] == [2]
