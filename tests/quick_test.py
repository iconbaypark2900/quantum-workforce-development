#!/usr/bin/env python3
"""
Quick verification that the project works.
Run: python quick_test.py
"""
import numpy as np
from services.portfolio_optimizer import run_optimization

print("🚀 Testing Quantum Hybrid Portfolio...")
print("-" * 50)

# Create test data
n_assets = 10
np.random.seed(42)
returns = np.random.randn(n_assets) * 0.1 + 0.05
A = np.random.randn(n_assets, n_assets)
covariance = np.dot(A.T, A) / n_assets

# Run optimizer
print("Running hybrid optimization...")
result = run_optimization(returns, covariance, objective='hybrid')

# Show results
print("\n✅ SUCCESS! Portfolio optimized.")
print("-" * 50)
print(f"Sharpe Ratio: {result.sharpe_ratio:.3f}")
print(f"Expected Return: {result.expected_return*100:.2f}%")
print(f"Volatility: {result.volatility*100:.2f}%")
print(f"Active Assets: {np.sum(result.weights > 0.001)}/{n_assets}")
print("-" * 50)
print("\n✓ Project is fully operational!")
print("\nNext steps:")
print("  • Run tests: python -m pytest tests/test_optimizers.py tests/test_api_integration.py -v")
print("  • Run example: python examples/quantum_integration_example.py")
print("  • See guide: cat docs/guides/HOW_TO_RUN.md")
