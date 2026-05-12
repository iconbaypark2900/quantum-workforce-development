#!/usr/bin/env python3
"""
Test script to verify the portfolio optimizer works correctly with notebook-based methods.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def test_optimizer():
    print("Testing portfolio optimizer (Hybrid, QUBO-SA, VQE)...")

    try:
        from services.portfolio_optimizer import run_optimization
        import numpy as np

        print("✓ Successfully imported run_optimization")

        n_assets = 5
        returns = np.array([0.12, 0.10, 0.08, 0.15, 0.07])
        covariance = np.array([
            [0.0400, 0.0180, 0.0120, 0.0200, 0.0150],
            [0.0180, 0.0900, 0.0210, 0.0180, 0.0120],
            [0.0120, 0.0210, 0.0484, 0.0150, 0.0100],
            [0.0200, 0.0180, 0.0150, 0.0625, 0.0180],
            [0.0150, 0.0120, 0.0100, 0.0180, 0.0225]
        ])

        for objective in ['hybrid', 'qubo_sa', 'vqe', 'markowitz', 'hrp']:
            result = run_optimization(returns, covariance, objective=objective)
            assert result.weights is not None
            assert len(result.weights) == n_assets
            assert np.abs(np.sum(result.weights) - 1.0) < 1e-5
            assert np.all(result.weights >= -1e-6)
            assert np.isfinite(result.sharpe_ratio)
            print(f"✓ {objective}: Sharpe={result.sharpe_ratio:.3f}")

        print("\n✓ All tests passed! The optimizer is working correctly.")
        return True

    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_optimizer()
    sys.exit(0 if success else 1)
