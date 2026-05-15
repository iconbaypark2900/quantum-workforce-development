"""
Scenario generation engine for Mean-CVaR and tail-risk modeling.

Supported methods:
  historical : i.i.d. bootstrap from historical return rows
  block      : block bootstrap preserving short-term autocorrelation
  gaussian   : parametric Gaussian Monte Carlo (mean + covariance)
  student_t  : fat-tailed Student-t Monte Carlo

Interface:
  cfg = ScenarioConfig(method="block", n_scenarios=10_000, seed=42)
  scenarios = generate_scenarios(returns_matrix, cfg)
  # returns np.ndarray of shape (n_scenarios, n_assets)
"""

from dataclasses import dataclass, field
from typing import Literal

import numpy as np

ScenarioMethod = Literal["historical", "block", "gaussian", "student_t"]


@dataclass
class ScenarioConfig:
    method: ScenarioMethod = "block"
    n_scenarios: int = 10_000
    block_size: int = 20    # for block bootstrap
    df: float = 5.0          # degrees of freedom for Student-t
    seed: int = 42


def generate_scenarios(
    returns_matrix: np.ndarray,
    config: ScenarioConfig,
) -> np.ndarray:
    """
    Generate a scenario matrix from historical returns.

    Parameters
    ----------
    returns_matrix : np.ndarray, shape (T, n)
        Historical return observations (rows=time, cols=assets).
    config : ScenarioConfig
        Scenario generation settings.

    Returns
    -------
    np.ndarray, shape (n_scenarios, n_assets)
        Simulated return scenarios.
    """
    returns_matrix = np.asarray(returns_matrix, dtype=float)
    if returns_matrix.ndim == 1:
        returns_matrix = returns_matrix.reshape(-1, 1)

    rng = np.random.default_rng(config.seed)
    S = config.n_scenarios

    if config.method == "historical":
        return _historical_bootstrap(returns_matrix, S, rng)
    elif config.method == "block":
        return _block_bootstrap(returns_matrix, S, config.block_size, rng)
    elif config.method == "gaussian":
        return _gaussian_monte_carlo(returns_matrix, S, rng)
    elif config.method == "student_t":
        return _student_t_monte_carlo(returns_matrix, S, config.df, rng)
    else:
        raise ValueError(
            f"Unknown scenario method '{config.method}'. "
            "Valid: historical, block, gaussian, student_t"
        )


def _historical_bootstrap(
    returns: np.ndarray,
    n_scenarios: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """Non-parametric i.i.d. resampling of historical return rows."""
    T = returns.shape[0]
    idx = rng.integers(0, T, size=n_scenarios)
    return returns[idx]


def _block_bootstrap(
    returns: np.ndarray,
    n_scenarios: int,
    block_size: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """
    Block bootstrap preserving short-term autocorrelation.

    Samples contiguous blocks of length block_size with random start points,
    concatenates until reaching n_scenarios rows.
    """
    T = returns.shape[0]
    block_size = max(1, min(block_size, T))
    max_start = T - block_size
    if max_start < 0:
        # Fall back to historical if series is shorter than block
        return _historical_bootstrap(returns, n_scenarios, rng)

    n_blocks = int(np.ceil(n_scenarios / block_size))
    starts = rng.integers(0, max_start + 1, size=n_blocks)
    blocks = [returns[s : s + block_size] for s in starts]
    stacked = np.concatenate(blocks, axis=0)
    return stacked[:n_scenarios]


def _gaussian_monte_carlo(
    returns: np.ndarray,
    n_scenarios: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """Parametric Gaussian simulation from estimated mean and covariance."""
    mu = returns.mean(axis=0)
    cov = np.cov(returns.T)
    if cov.ndim == 0:
        cov = cov.reshape(1, 1)
    # Small ridge for numerical stability
    cov = cov + np.eye(cov.shape[0]) * 1e-10
    return rng.multivariate_normal(mu, cov, size=n_scenarios)


def _student_t_monte_carlo(
    returns: np.ndarray,
    n_scenarios: int,
    df: float,
    rng: np.random.Generator,
) -> np.ndarray:
    """
    Multivariate Student-t simulation for fat-tailed return modeling.

    Constructs samples as:  X = mu + Z / sqrt(V/df)
    where Z ~ N(0, Sigma) and V ~ chi-squared(df).
    This gives each marginal a t(df) distribution with the same
    covariance structure as the historical data.
    """
    mu = returns.mean(axis=0)
    cov = np.cov(returns.T)
    if cov.ndim == 0:
        cov = cov.reshape(1, 1)
    cov = cov + np.eye(cov.shape[0]) * 1e-10
    n = len(mu)

    Z = rng.multivariate_normal(np.zeros(n), cov, size=n_scenarios)
    chi2 = rng.chisquare(df, size=(n_scenarios, 1))
    t_samples = mu + Z / np.sqrt(chi2 / df)
    return t_samples
