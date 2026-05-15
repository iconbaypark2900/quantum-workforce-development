"""
Canonical import path for portfolio constraints.

Re-exports from `services.constraints` so callers can use either
`from core.constraints import PortfolioConstraints` or
`from services.constraints import PortfolioConstraints` interchangeably.
"""
from services.constraints import (
    PortfolioConstraints,
    ConstraintReport,
    compute_sector_masks,
)

__all__ = ["PortfolioConstraints", "ConstraintReport", "compute_sector_masks"]
