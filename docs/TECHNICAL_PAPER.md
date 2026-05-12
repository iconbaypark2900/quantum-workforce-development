# Quantum-Inspired Portfolio Optimization via Graph-Based Stochastic Walks

**Technical Report**

Quantum Global Group  
Quantum Hybrid Portfolio Project

---

## Abstract

We describe a quantum-inspired portfolio optimization system that applies continuous- and discrete-time quantum walk dynamics on financial graphs to derive asset allocations. The approach encodes assets as graph nodes, correlations and diversification as weighted edges, and expected returns as node potentials. A Hamiltonian of the form \(H = -L + \omega V\) drives unitary evolution; portfolio weights are obtained from the squared probability amplitudes of the evolved state. We combine this with stability enhancement to cap turnover, Ledoit–Wolf covariance shrinkage for robustness, and optional Hierarchical Risk Parity (HRP) and classical objectives (max Sharpe, min variance, target return, risk parity). The system is implemented as a REST API and React dashboard, with validation targets informed by Chang et al. (2025): improved risk-adjusted returns and large turnover reduction on classical hardware.

**Keywords:** portfolio optimization, quantum-inspired algorithms, quantum stochastic walk, graph Laplacian, hierarchical risk parity, covariance shrinkage, turnover reduction

---

## 1. Introduction

### 1.1 Motivation

Mean–variance portfolio optimization (Markowitz, 1952) is sensitive to estimation error in expected returns and covariance. Classical remedies include regularization, robust optimization, and alternative allocation rules such as equal weight or risk parity. Quantum-inspired methods offer a different angle: treat the universe as a graph, and use evolution dynamics on that graph to produce diversified, return-aware weights without solving a quadratic program at each step.

### 1.2 Contribution

This document specifies the **Quantum Hybrid Portfolio** system: (1) construction of financial graphs from returns and covariance with regime-adaptive density; (2) Hamiltonian-based quantum-style evolution (continuous, discrete, and decoherent variants); (3) stability enhancement to enforce turnover limits; (4) integration with Ledoit–Wolf shrinkage and HRP; (5) a production API and dashboard. The implementation is fully classical; the benefit is from the quantum-inspired formulation and graph structure.

---

## 2. Background

### 2.1 Mean–Variance Optimization

For \(n\) assets with expected return vector \(\boldsymbol{\mu}\) and covariance matrix \(\boldsymbol{\Sigma}\), the efficient frontier is obtained by solving, for example:

- **Max Sharpe:** \(\max_{\boldsymbol{w}} \frac{\boldsymbol{w}^\top \boldsymbol{\mu}}{\sqrt{\boldsymbol{w}^\top \boldsymbol{\Sigma} \boldsymbol{w}}}\) subject to \(\boldsymbol{w}^\top \mathbf{1} = 1\), \(\boldsymbol{w} \geq 0\).
- **Min variance:** \(\min_{\boldsymbol{w}} \boldsymbol{w}^\top \boldsymbol{\Sigma} \boldsymbol{w}\) subject to the same constraints.

These problems are sensitive to \(\boldsymbol{\mu}\) and \(\boldsymbol{\Sigma}\) and can yield extreme or unstable weights when the covariance is ill-conditioned.

### 2.2 Hierarchical Risk Parity (HRP)

López de Prado (2016) builds a hierarchical clustering of assets from the correlation matrix and allocates via recursive bisection and inverse-variance weighting. HRP does not invert the full covariance matrix, which improves out-of-sample stability and handles singular or ill-conditioned matrices. We support HRP as an alternative objective alongside the quantum-inspired optimizer.

### 2.3 Ledoit–Wolf Shrinkage

Ledoit & Wolf (2004) replace the sample covariance \(\boldsymbol{S}\) with a shrinkage estimator \(\widehat{\boldsymbol{\Sigma}} = \alpha \boldsymbol{F} + (1-\alpha)\boldsymbol{S}\), where \(\boldsymbol{F}\) is a structured target (e.g. constant correlation). This improves conditioning and out-of-sample performance. The system applies Ledoit–Wolf when covariance is estimated from time-series (e.g. market data or backtests).

### 2.4 Quantum Walks on Graphs

A continuous-time quantum walk on a graph with Hamiltonian \(\boldsymbol{H}\) evolves the state \(|\psi(t)\rangle = e^{-i\boldsymbol{H}t}|\psi_0\rangle\). For a graph Laplacian \(\boldsymbol{L}\), \(\boldsymbol{H} = -\boldsymbol{L}\) yields diffusion over the graph. Adding a diagonal potential \(\boldsymbol{V}\) gives \(\boldsymbol{H} = -\boldsymbol{L} + \omega \boldsymbol{V}\), so evolution balances graph connectivity (diversification) and potential (return). Weights are taken from \(|\psi(t)|^2\) after normalization.

---

## 3. Method

### 3.1 Financial Graph Construction

**Nodes.** Each of the \(n\) assets is a node \(i\) with attributes:

- `return_potential`: \(\mu_i\) (expected return).
- `risk`: \(\sigma_i = \sqrt{\Sigma_{ii}}\).
- `sharpe`: \(\mu_i / \sigma_i\) when \(\sigma_i > 0\).

**Edges.** From the covariance \(\boldsymbol{\Sigma}\) we form the correlation matrix \(\boldsymbol{C}\). For a threshold \(\tau\) (regime-dependent), an edge \((i,j)\) is added if \(|\rho_{ij}| > \tau\). The edge weight combines correlation and diversification; the implementation uses a simplified weight so that strong correlation and favorable return/risk contribute to the link. Graph density is adapted by regime: e.g. bull (sparser), bear (denser), volatile (denser), normal (default \(\tau\)).

**Output.** An undirected weighted graph \(G\) and metrics (number of edges, density, clustering, connectivity). This graph is the input to the evolution step.

### 3.2 Hamiltonian and Quantum Evolution

**Hamiltonian.**

\[
\boldsymbol{H} = -\boldsymbol{L} + \omega \boldsymbol{V}
\]

- \(\boldsymbol{L}\): graph Laplacian of \(G\) with edge weights (e.g. NetworkX `laplacian_matrix(G, weight='weight')`).
- \(\boldsymbol{V}\): diagonal matrix with \(V_{ii}\) from node `return_potential`, optionally adjusted by node `risk` so that higher risk lowers the potential (e.g. \(V_{ii} \leftarrow V_{ii}/(1 + \sigma_i)\)).
- \(\omega\): mixing parameter (e.g. in \([0.2, 0.4]\); regime-specific in the code).

**Continuous-time evolution.**

1. Initial state: \(|\psi_0\rangle = \frac{1}{\sqrt{n}}\mathbf{1}\) (equal superposition).
2. Evolution operator: \(\boldsymbol{U}(t) = \exp(-i \boldsymbol{H} t)\) with \(t\) = `evolution_time` (e.g. 10).
3. Evolved state: \(|\psi_{\mathrm{final}}\rangle = \boldsymbol{U}(t) \, |\psi_0\rangle\).
4. Weights: \(w_i \propto |\psi_{\mathrm{final},i}|^2\), then normalize so \(\sum_i w_i = 1\).

For large \(n\) (e.g. \(> 100\)), sparse matrix exponentiation is used.

**Discrete-time and decoherent variants.** The implementation also supports discrete-time quantum walk (with a Hamiltonian-derived step) and a decoherent evolution option; weights are again derived from the final state probabilities.

### 3.3 Stability Enhancement and Turnover Control

Let \(\boldsymbol{w}^{\mathrm{new}}\) be the weights from the quantum evolution and \(\boldsymbol{w}^{\mathrm{old}}\) the previous portfolio. Define turnover as \(\frac{1}{2}\sum_i |w^{\mathrm{new}}_i - w^{\mathrm{old}}_i|\).

- If turnover \(\leq\) `max_turnover` (e.g. 0.2), set \(\boldsymbol{w} = \boldsymbol{w}^{\mathrm{new}}\).
- Otherwise, blend: \(\boldsymbol{w} = \beta \boldsymbol{w}^{\mathrm{new}} + (1-\beta) \boldsymbol{w}^{\mathrm{old}}\) with \(\beta \in [0,1]\) chosen so that the resulting turnover meets the cap (or is reduced), then renormalize.

This achieves large turnover reduction versus naive rebalancing (e.g. up to ~90% in reported targets) and is critical for transaction costs.

### 3.4 Objectives and Constraints

The system supports multiple objectives in a unified pipeline:

- **max_sharpe:** Default QSW evolution; weights from \(|\psi|^2\) already tend toward risk-adjusted allocation; optional refinement with a classical optimizer.
- **min_variance:** QSW can be used for exploration; final weights can be projected or re-optimized toward minimum variance.
- **target_return:** Minimize variance subject to a return target; combination of QSW and constrained optimization.
- **risk_parity:** Equal risk contribution; can be combined with QSW or used as a benchmark.
- **hrp:** Full HRP allocation (López de Prado); no QSW step.

Constraints include: long-only, min/max weight per asset, max turnover, optional sector limits, cardinality, and blacklist/whitelist. Strategy presets (e.g. growth, income, balanced, aggressive, defensive) map to different \(\omega\), evolution time, and turnover limits.

---

## 4. Implementation

### 4.1 Architecture

- **Core:** `core/quantum_inspired/` — graph builder, evolution (continuous, discrete, decoherent), stability enhancer, performance-optimized variants.
- **Config:** `config/qsw_config.py` — \(\omega\), evolution time, thresholds, turnover, constraints.
- **Services:** `services/` — market data (e.g. yfinance), backtest, HRP, portfolio optimizer (unified objectives), constraints, data provider.
- **API:** `api.py` — Flask REST API for optimize, backtest, market data, efficient frontier, ticker search, health.
- **Frontend:** React app in `frontend/` — dashboard (holdings, benchmarks, backtest, scenarios, efficient frontier, correlation heatmap, in-app help).
- **Deployment:** `serve_hf.py` for Hugging Face Spaces; `Dockerfile.hf` and `scripts/deploy_hf_spaces.sh` for containerized deploy.

### 4.2 Key Parameters (Representative)

| Parameter | Typical value | Role |
|-----------|----------------|------|
| \(\omega\) | 0.3 (0.2–0.4) | Mixing between graph structure and return potential |
| evolution_time | 10 | Evolution duration (lower reduces over-smoothing) |
| correlation_threshold | 0.3 (regime-adaptive) | Minimum \|correlation\| for an edge |
| max_turnover | 0.2 | Maximum allowed turnover after stability step |
| min_weight / max_weight | 0.001 / 0.10 | Per-asset bounds |

### 4.3 Validation Targets

Based on Chang et al. (2025) and internal tuning:

- **Sharpe improvement:** Target on the order of ~15% average vs benchmarks (e.g. equal weight, min variance, max Sharpe, HRP); best-case gains higher.
- **Turnover reduction:** Target up to ~90% vs full rebalancing; stability enhancement is the main lever.
- **Regime adaptation:** Different \(\omega\) and graph density for bull, bear, volatile, and normal regimes.

---

## 5. Conclusion

We have specified and implemented a quantum-inspired portfolio optimization pipeline that represents the asset universe as a graph, runs Hamiltonian-based quantum-style evolution to obtain weights, and applies stability enhancement for turnover control. The same stack supports classical objectives (max Sharpe, min variance, target return, risk parity) and HRP, with Ledoit–Wolf shrinkage when covariance is estimated from data. The system is deployed as a REST API and React dashboard and is suitable for research and production use on classical hardware.

---

## References

1. Chang, E. et al. (2025). "Quantum Stochastic Walks for Portfolio Optimization." (Foundational QSW reference.)
2. López de Prado, M. (2016). "Building Diversified Portfolios that Outperform Out-of-Sample." *Journal of Portfolio Management*, SSRN 2708678.
3. Ledoit, O., & Wolf, M. (2004). "A Well-Conditioned Estimator for Large-Dimensional Covariance Matrices." *Journal of Multivariate Analysis*.
4. Markowitz, H. (1952). "Portfolio Selection." *Journal of Finance* 7(1), 77–91.

---

*Document version: 1.0. Last updated: 2026.*
