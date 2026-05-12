# 📂 Directory Guide - Complete File Reference

> Comprehensive guide to every file in the quantum-hybrid-portfolio project

**Layout note:** Most markdown files that used to sit in the repo root now live under **`docs/`** (`dashboard/`, `guides/`, `frontend/`, `project/`, `planning/`, `misc/`). See **`docs/DOCUMENTATION_INDEX.md`** for paths. The **Root Files** section below still describes key root entries (`README.md`, `api.py`, etc.) and may mention old locations.

---

## 📑 Table of Contents

- [Root Files](#root-files)
- [Configuration (`config/`)](#configuration-config)
- [Core Implementation (`core/`)](#core-implementation-core)
- [Data Handling (`data/`)](#data-handling-data)
- [Validation (`validation/`)](#validation-validation)
- [Tests (`tests/`)](#tests-tests)
- [Examples (`examples/`)](#examples-examples)
- [Notebooks (`notebooks/`)](#notebooks-notebooks)
- [Generated Files](#generated-files)

---

## 📄 Root Files

### `README.md`
**Purpose:** Main project documentation  
**What it contains:**
- Project overview and features
- Installation instructions
- Quick start guide
- Usage examples
- Performance metrics
- Contributing guidelines

**When to update:** When adding major features or changing setup process

---

### `deps/requirements.txt`
**Purpose:** Python package dependencies  
**What it contains:**
```
numpy>=1.26.0
pandas>=2.1.0
scipy>=1.11.0
networkx>=3.1
matplotlib>=3.8.0
seaborn>=0.13.0
yfinance>=0.2.28
scikit-learn>=1.3.0
pytest>=7.4.0
pytest-cov>=4.1.0
jupyter>=1.0.0
plotly>=5.17.0
tqdm>=4.66.0
pyyaml>=6.0.1
python-dotenv>=1.0.0
```

**Usage:** `pip install -r deps/requirements.txt`  
**When to update:** When adding new package dependencies

---

### `setup.py`
**Purpose:** Package installation configuration  
**What it contains:**
- Package metadata (name, version, author)
- Dependencies from deps/requirements.txt
- Entry points and classifiers

**Usage:** `pip install -e .` (installs in development mode)  
**When to update:** When changing package structure or metadata

---

### `HOW_TO_RUN.md`
**Purpose:** Detailed running instructions  
**What it contains:**
- Step-by-step commands to run everything
- Troubleshooting guide
- Output explanations
- Common error solutions

**For:** Users who want to run the project  
**Generated:** Created during project setup

---

### `QUICKSTART.md`
**Purpose:** Quick reference guide  
**What it contains:**
- Installation steps
- Running tests
- Example usage
- Key features overview

**For:** Users who want to get started fast  
**Generated:** Created during project setup

---

### `DIRECTORY_GUIDE.md` *(This File)*
**Purpose:** Complete file-by-file reference  
**What it contains:** Detailed description of every file and directory  
**For:** Developers navigating the codebase

---

### `tests/quick_test.py`
**Purpose:** 5-second verification script  
**What it does:**
- Creates test data
- Runs optimizer
- Displays results
- Confirms everything works

**Usage:** `python tests/quick_test.py`  
**When to use:** After making changes, before committing

---

### `.gitignore`
**Purpose:** Tells git which files to ignore  
**What it ignores:**
- `.venv/` (virtual environment)
- `__pycache__/` (Python bytecode)
- `.pytest_cache/` (test cache)
- `*.pyc` (compiled Python)
- `.ipynb_checkpoints/` (Jupyter)
- Data files and reports

**When to update:** When adding new generated files

---

## ⚙️ Configuration (`config/`)

### `config/__init__.py`
**Purpose:** Makes config a Python package  
**What it contains:** Module docstring  
**Size:** ~1 line

---

### `config/qsw_config.py`
**Purpose:** Central configuration for QSW optimizer  
**Lines:** ~65  
**What it contains:**

```python
@dataclass
class QSWConfig:
    # Core QSW parameters
    omega_range: Tuple[float, float] = (0.2, 0.4)
    default_omega: float = 0.3
    evolution_time: int = 100
    
    # Graph construction
    correlation_threshold: float = 0.3
    adaptive_threshold: bool = True
    min_edge_weight: float = 0.01
    
    # Stability enhancement
    max_turnover: float = 0.2
    stability_blend_factor: float = 0.7
    
    # Portfolio constraints
    min_weight: float = 0.001
    max_weight: float = 0.10
    min_assets: int = 10
    max_assets: int = 100
    
    # Market regime parameters
    regime_thresholds: Dict[str, float] = None
```

**Key Methods:**
- `from_yaml()` - Load config from YAML file
- `get_omega_for_regime()` - Get regime-specific omega

**When to modify:** To tune algorithm parameters

---

## 🧠 Core Implementation (`core/`)

### `core/__init__.py`
**Purpose:** Makes core a Python package  
**What it contains:** Module docstring  
**Size:** ~1 line

---

### `core/quantum_inspired/__init__.py`
**Purpose:** Makes quantum_inspired a Python package  
**What it contains:** Module docstring  
**Size:** ~1 line

---

### `core/quantum_inspired/quantum_walk.py`
**Purpose:** **MAIN OPTIMIZER** - Orchestrates entire QSW algorithm  
**Lines:** ~220  
**Complexity:** HIGH

**Key Classes:**
- `QSWResult` - Data container for optimization results
- `QuantumStochasticWalkOptimizer` - Main optimizer class

**Key Methods:**
```python
def optimize(returns, covariance, market_regime='normal', initial_weights=None):
    """
    Main entry point for optimization.
    
    Steps:
    1. Build financial graph
    2. Get regime-specific omega
    3. Run quantum evolution
    4. Apply stability enhancement
    5. Enforce constraints
    6. Calculate metrics
    """
```

**Dependencies:**
- Uses `graph_builder.py` for graph construction
- Uses `evolution_dynamics.py` for quantum walk
- Uses `stability_enhancer.py` for turnover reduction
- Uses `qsw_config.py` for parameters

**When to modify:** When changing overall optimization flow

---

### `core/quantum_inspired/graph_builder.py`
**Purpose:** Constructs financial graphs from market data  
**Lines:** ~170  
**Complexity:** MEDIUM

**Key Class:**
- `FinancialGraphBuilder` - Graph construction engine

**Key Methods:**
```python
def build_graph(returns, covariance, market_regime):
    """
    Creates networkx Graph where:
    - Nodes = Assets with return/risk attributes
    - Edges = Correlations above threshold
    - Weights = Combination of factors
    """
```

**Algorithm:**
1. Calculate correlation matrix from covariance
2. Get adaptive threshold based on regime
3. Add nodes with attributes (return, risk, sharpe)
4. Add edges where |correlation| > threshold
5. Calculate edge weights (correlation + similarity + diversification)
6. Return graph + metrics

**When to modify:** To change graph structure or edge weighting

---

### `core/quantum_inspired/evolution_dynamics.py`
**Purpose:** Quantum walk evolution on financial graphs  
**Lines:** ~125  
**Complexity:** HIGH (quantum mechanics)

**Key Class:**
- `QuantumEvolution` - Quantum walk engine

**Key Methods:**
```python
def evolve(graph, omega, evolution_time):
    """
    Runs quantum walk:
    1. Construct Hamiltonian H = -L + ω·V
    2. Initial state |ψ₀⟩ (equal superposition)
    3. Time evolution U = exp(-iHt)
    4. Final state |ψ_final⟩ = U|ψ₀⟩
    5. Extract weights from |ψ|²
    """
```

**Physics:**
- **Hamiltonian**: Energy operator (`-L + ω·V`)
  - `L` = Graph Laplacian (connectivity)
  - `V` = Potential matrix (returns)
  - `ω` = Mixing parameter
- **Evolution**: Unitary time evolution
- **Measurement**: Probability amplitudes → portfolio weights

**When to modify:** To change quantum mechanics or evolution dynamics

---

### `core/quantum_inspired/stability_enhancer.py`
**Purpose:** Reduces portfolio turnover (trading costs)  
**Lines:** ~115  
**Complexity:** LOW

**Key Class:**
- `StabilityEnhancer` - Turnover reduction engine

**Key Methods:**
```python
def stabilize(new_weights, old_weights, market_volatility=None):
    """
    Blends old and new weights to reduce turnover:
    1. Calculate proposed turnover
    2. If turnover > max_turnover:
       - Calculate adaptive blend factor
       - Mix old_weights and new_weights
    3. Return stabilized weights
    """
```

**Algorithm:**
- **Turnover**: `Σ|w_new - w_old| / 2`
- **Blend Factor**: Adaptive based on turnover and volatility
- **Final Weights**: `α·w_new + (1-α)·w_old`

**When to modify:** To adjust turnover reduction strategy

---

### `core/quantum_inspired/graph_clusterer.py`
**Purpose:** Graph clustering (future feature)  
**Lines:** 1 (empty placeholder)  
**Status:** NOT IMPLEMENTED

**Intended Use:** Cluster assets into groups for hierarchical optimization

---

## 💾 Data Handling (`data/`)

### `data/__init__.py`
**Purpose:** Makes data a Python package  
**Size:** ~1 line

---

### `data/sample_loader.py`
**Purpose:** Data loading utilities (placeholder)  
**Lines:** ~3  
**Status:** MINIMAL

**Intended Use:** Load sample datasets, historical data, etc.  
**Current State:** Just comments

---

## ✅ Validation (`validation/`)

### `validation/__init__.py`
**Purpose:** Makes validation a Python package  
**Size:** ~1 line

---

### `validation/chang_validation.py`
**Purpose:** Validates implementation against Chang et al. (2025) research  
**Lines:** ~365  
**Complexity:** HIGH

**Key Class:**
- `ChangValidation` - Validation suite runner

**Key Methods:**
```python
def run_full_validation(market_data, n_iterations=100):
    """Runs complete validation:
    1. Sharpe ratio improvement
    2. Turnover reduction
    3. Parameter sensitivity
    4. Regime adaptation
    """

def validate_sharpe_improvement(market_data, n_iterations):
    """Tests Sharpe improvement over classical methods"""

def validate_turnover_reduction(market_data):
    """Tests turnover reduction over time"""

def validate_parameter_ranges(market_data):
    """Tests omega parameter sensitivity"""

def validate_regime_adaptation(market_data):
    """Tests regime-specific performance"""
```

**Generates:**
- Performance metrics
- Comparison charts (`chang_validation_report.png`)
- Pass/fail for each benchmark

**When to run:** Before claiming performance improvements

---

## 🧪 Tests (`tests/`)

### `tests/__init__.py`
**Purpose:** Makes tests a Python package  
**Size:** ~1 line

---

### `tests/test_quantum_walk.py`
**Purpose:** Unit tests for main optimizer  
**Lines:** ~120  
**Tests:** 7 passing ✅

**Test Coverage:**
1. `test_initialization` - Optimizer creation
2. `test_optimization_basic` - Basic functionality
3. `test_market_regimes` - Regime adaptation
4. `test_turnover_reduction` - Turnover tracking
5. `test_constraint_application` - Portfolio constraints
6. `test_invalid_inputs` - Error handling
7. `test_history_tracking` - History logging

**Usage:** `pytest tests/test_quantum_walk.py -v`

---

### `tests/test_graph_builder.py`
**Purpose:** Unit tests for graph construction  
**Lines:** ~3 (empty placeholder)  
**Status:** NOT IMPLEMENTED

**Needed Tests:**
- Disconnected graphs
- Single-edge graphs
- Correlation threshold sensitivity
- Edge weight calculations

---

### `tests/phase1.py`
**Purpose:** Integration tests for Phase 1 fixes  
**Lines:** ~250  
**Complexity:** MEDIUM

**What it tests:**
1. Return annualization fix
2. Classical benchmark implementation
3. Graph construction correctness
4. Evolution differentiation
5. Full optimization pipeline
6. Real-world performance comparison

**Usage:** `python tests/phase1.py`  
**Output:** Pass/fail for each fix + diagnostic info

---

## 📝 Examples (`examples/`)

### `examples/basic_qsw_example.py`
**Purpose:** Complete working example with real data  
**Lines:** ~120  
**Complexity:** MEDIUM

**What it does:**
1. Downloads S&P 500 data (30 stocks, 3 years) via yfinance
2. Runs QSW optimization
3. Displays portfolio allocation and metrics
4. Optionally runs full validation suite

**Functions:**
- `download_sample_data()` - Downloads market data
- `run_basic_optimization()` - Runs and displays optimization
- `run_validation()` - Runs Chang validation

**Usage:**
```bash
python examples/basic_qsw_example.py
# Press Enter for validation or Ctrl+C to skip
```

**When to modify:** To change example stocks or time period

---

## 📓 Notebooks (`notebooks/`)

### `notebooks/01_qsw_exploration.ipynb`
**Purpose:** Interactive exploration of QSW algorithm  
**Format:** Jupyter Notebook  
**Status:** SKELETON (minimal content)

**Intended Sections:**
- Algorithm overview
- Step-by-step walkthrough
- Visualization of quantum evolution
- Parameter tuning examples

---

### `notebooks/02_chang_validation.ipynb`
**Purpose:** Interactive validation against benchmarks  
**Format:** Jupyter Notebook  
**Status:** SKELETON (minimal content)

**Intended Sections:**
- Run validation suite
- Analyze results
- Compare to baselines
- Generate reports

---

## 🗂️ Generated Files

### `.venv/`
**Purpose:** Python virtual environment  
**Generated by:** `python3 -m venv .venv`  
**Size:** ~100MB  
**Git:** Ignored  
**Contains:** All installed packages

---

### `__pycache__/`
**Purpose:** Python bytecode cache  
**Generated by:** Python interpreter  
**Git:** Ignored  
**Can delete:** Yes (regenerates automatically)

---

### `.pytest_cache/`
**Purpose:** Pytest execution cache  
**Generated by:** pytest  
**Git:** Ignored  
**Can delete:** Yes (just speeds up future tests)

---

### `quantum_hybrid_portfolio.egg-info/`
**Purpose:** Package metadata  
**Generated by:** `pip install -e .`  
**Git:** Ignored  
**Contains:** Package info for development mode

---

### `chang_validation_report.png`
**Purpose:** Validation results chart  
**Generated by:** `validation/chang_validation.py`  
**Size:** ~100KB  
**Shows:** 4-panel comparison of validation metrics

---

## 📊 File Statistics

### By Directory:
```
config/                2 files,  ~65 lines
core/quantum_inspired/ 6 files, ~700 lines
data/                  2 files,   ~5 lines
validation/            2 files, ~365 lines
tests/                 4 files, ~375 lines
examples/              1 file,  ~120 lines
notebooks/             2 files,   ~5 lines
Root                   7 files, ~370 lines
-------------------------------------------
TOTAL:                26 files, ~2000 lines
```

### By File Type:
```
Python (.py):         17 files, ~1950 lines
Markdown (.md):        5 files,  ~800 lines
Notebooks (.ipynb):    2 files,   ~10 lines
Config (setup.py):     1 file,   ~35 lines
Data (requirements):   1 file,   ~16 lines
```

### Code Complexity:
```
HIGH:    quantum_walk.py, evolution_dynamics.py, chang_validation.py
MEDIUM:  graph_builder.py, stability_enhancer.py, basic_qsw_example.py
LOW:     qsw_config.py, test files, setup.py
```

---

## 🎯 Key Files by Task

### **Running the Project:**
1. `tests/quick_test.py` - Quick verification
2. `examples/basic_qsw_example.py` - Full example
3. `tests/phase1.py` - Diagnostic tests

### **Understanding the Algorithm:**
1. `core/quantum_inspired/quantum_walk.py` - Main flow
2. `core/quantum_inspired/evolution_dynamics.py` - Quantum mechanics
3. `core/quantum_inspired/graph_builder.py` - Graph structure

### **Configuration:**
1. `config/qsw_config.py` - All parameters
2. `deps/requirements.txt` - Dependencies

### **Development:**
1. `tests/test_quantum_walk.py` - Unit tests
2. `validation/chang_validation.py` - Validation
3. `setup.py` - Package config

### **Documentation:**
1. `README.md` - Main docs
2. `HOW_TO_RUN.md` - Running instructions
3. `DIRECTORY_GUIDE.md` - This file

---

## 🔄 File Dependencies

```
quantum_walk.py
├── graph_builder.py
├── evolution_dynamics.py
├── stability_enhancer.py
└── qsw_config.py

basic_qsw_example.py
├── quantum_walk.py
└── chang_validation.py

chang_validation.py
└── quantum_walk.py

test_quantum_walk.py
└── quantum_walk.py
```

---

## 📝 File Modification Guide

### **Before Modifying:**
1. Read the file's docstring
2. Understand dependencies
3. Check if tests exist
4. Run current tests: `pytest tests/ -v`

### **After Modifying:**
1. Update docstrings if needed
2. Run tests: `pytest tests/ -v`
3. Run quick_test: `python tests/quick_test.py`
4. Update this guide if structure changed

### **Commit Checklist:**
- [ ] Tests pass
- [ ] Code formatted (black)
- [ ] Docstrings updated
- [ ] DIRECTORY_GUIDE.md updated (if structure changed)
- [ ] README.md updated (if features changed)

---

## 🆘 Quick Reference

### **Find a file:**
```bash
find . -name "quantum_walk.py"
```

### **Count lines:**
```bash
find . -name "*.py" -exec wc -l {} +
```

### **Search for code:**
```bash
grep -r "def optimize" core/
```

### **File tree:**
```bash
tree -L 3 -I '.venv|__pycache__|*.pyc'
```

---

**Last Updated:** 2025-10-17  
**Version:** 0.1.0  
**Maintainer:** Quantum Global Group
