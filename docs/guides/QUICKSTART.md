# Quantum Hybrid Portfolio - Quick Start Guide

## Project Setup Complete! ✓

The quantum-hybrid-portfolio project has been successfully scaffolded with a complete implementation of Quantum Stochastic Walk (QSW) optimization.

## What's Been Created

### Core Implementation
- **Quantum Walk Optimizer** (`core/quantum_inspired/quantum_walk.py`) - Main QSW algorithm
- **Graph Builder** (`core/quantum_inspired/graph_builder.py`) - Financial graph construction
- **Evolution Dynamics** (`core/quantum_inspired/evolution_dynamics.py`) - Quantum evolution engine
- **Stability Enhancer** (`core/quantum_inspired/stability_enhancer.py`) - Turnover reduction
- **Configuration** (`config/qsw_config.py`) - Optimized parameters from Chang et al.

### Validation & Testing
- **Chang Validation** (`validation/chang_validation.py`) - Validates against research results
- **Unit Tests** (`tests/test_quantum_walk.py`) - 7 passing tests ✓
- **Example Script** (`examples/basic_qsw_example.py`) - Ready-to-run example

### Notebooks
- `notebooks/01_qsw_exploration.ipynb` - Algorithm exploration
- `notebooks/02_chang_validation.ipynb` - Validation experiments

## Installation

The virtual environment is already set up with all dependencies installed!

```bash
# Activate the environment
source .venv/bin/activate

# Verify installation
python -c "from core.quantum_inspired.quantum_walk import QuantumStochasticWalkOptimizer; print('Ready!')"
```

## Running Tests

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=core --cov=validation --cov-report=html
```

**Current Status: 7/7 tests passing ✓**

## Quick Example

```python
from core.quantum_inspired.quantum_walk import QuantumStochasticWalkOptimizer
import numpy as np

# Create optimizer
optimizer = QuantumStochasticWalkOptimizer()

# Example data (10 assets)
returns = np.random.randn(10) * 0.1 + 0.05
covariance = np.eye(10) * 0.2

# Optimize portfolio
result = optimizer.optimize(
    returns=returns,
    covariance=covariance,
    market_regime='normal'
)

print(f"Sharpe Ratio: {result.sharpe_ratio:.3f}")
print(f"Expected Return: {result.expected_return*100:.2f}%")
print(f"Volatility: {result.volatility*100:.2f}%")
print(f"Weights: {result.weights}")
```

## Running the Example Script

```bash
# Note: This will download real market data using yfinance
python examples/basic_qsw_example.py
```

## Running Validation Suite

```bash
# This validates the implementation against Chang et al. (2025) results
python -c "from examples.basic_qsw_example import run_validation; run_validation()"
```

Expected results:
- ✓ 15% average Sharpe improvement
- ✓ 27% best-case Sharpe improvement  
- ✓ 90% turnover reduction
- ✓ Optimal omega in [0.2, 0.4] range

## Jupyter Notebooks

```bash
# Start Jupyter Lab
jupyter lab

# Navigate to notebooks/ directory
# Open 01_qsw_exploration.ipynb to get started
```

## Project Structure

```
quantum-hybrid-portfolio/
├── config/              # Configuration and parameters
├── core/               # Core QSW implementation
│   └── quantum_inspired/
│       ├── quantum_walk.py      # Main optimizer
│       ├── graph_builder.py     # Graph construction
│       ├── evolution_dynamics.py # Quantum evolution
│       └── stability_enhancer.py # Turnover control
├── data/               # Data loading utilities
├── validation/         # Chang validation suite
├── tests/             # Unit tests (7/7 passing)
├── notebooks/         # Jupyter notebooks
├── examples/          # Example scripts
├── deps/requirements.txt   # All dependencies
└── setup.py          # Package configuration
```

## Key Features Implemented

1. **Quantum Stochastic Walk Optimizer**
   - Adaptive graph construction based on market regime
   - Quantum-inspired evolution dynamics
   - Stability enhancement for low turnover
   - Portfolio constraints (min/max weights)

2. **Market Regime Adaptation**
   - Bull, Bear, Volatile, Normal regimes
   - Regime-specific parameters
   - Adaptive correlation thresholds

3. **Validation Framework**
   - Sharpe ratio improvement tracking
   - Turnover reduction measurement
   - Parameter sensitivity analysis
   - Comprehensive reporting with visualizations

## Next Steps

1. **Explore the notebooks** - Start with `01_qsw_exploration.ipynb`
2. **Run validation** - Verify against Chang et al. results
3. **Try with real data** - Run `examples/basic_qsw_example.py`
4. **Customize parameters** - Edit `config/qsw_config.py`
5. **Add your own strategies** - Extend the core modules

## Development

The package is installed in editable mode, so changes to the code take effect immediately:

```bash
# Edit any file
# Changes are reflected immediately
pytest tests/  # Run tests
```

## Troubleshooting

If you encounter import errors:
```bash
# Reinstall in editable mode
pip install -e .
```

If tests fail:
```bash
# Check Python version (needs >= 3.9)
python --version

# Reinstall dependencies
pip install -r deps/requirements.txt
```

## Resources

- Chang et al. (2025) - Original research paper
- `README.md` - Full project documentation
- `tests/` - Examples of usage patterns

---

**Status: Project fully scaffolded and tested ✓**

All systems operational. Ready for development!
