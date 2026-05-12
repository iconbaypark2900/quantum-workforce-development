# IBM Quantum QA and Interview Talking Points

This document covers setup, QA steps, and talking points for running portfolio optimization on IBM Quantum hardware, and for referencing the project in interviews.

## Setup

### 1. Get IBM Quantum Access

1. Sign up at [quantum.ibm.com](https://quantum.ibm.com)
2. Copy your API token from the dashboard
3. IBM provides ~10 free execution minutes per month on real quantum hardware

### 2. Environment Variables

```bash
# Required for IBM Quantum backend
export IBM_QUANTUM_TOKEN="your-token-here"

# Optional: specific backend (default: least busy real QPU)
# Use simulator for fast demos:
export IBM_QUANTUM_BACKEND="simulator_stabilizer"
# Or real hardware:
export IBM_QUANTUM_BACKEND="ibm_brisbane"
# export IBM_QUANTUM_BACKEND="ibm_kyoto"
```

### 3. Install Dependencies

```bash
pip install -r deps/requirements.txt
# Or explicitly:
pip install qiskit qiskit-algorithms qiskit-ibm-runtime
```

## QA Workflow

### Local QA

1. **Run the QA script:**
   ```bash
   python scripts/run_ibm_qa.py
   ```

2. **Run via API:**
   ```bash
   curl -X POST http://localhost:5000/api/portfolio/optimize \
     -H "Content-Type: application/json" \
     -d '{
       "tickers": ["AAPL", "GOOG", "MSFT", "AMZN"],
       "start_date": "2023-01-01",
       "end_date": "2024-01-01",
       "objective": "qaoa_ibm"
     }'
   ```

3. **Verify results:**
   - `backend_type` should contain `ibm_` (e.g. `ibm_brisbane`, `simulator_stabilizer`) when IBM is used
   - Without token, `backend_type` will be `qaoa_ibm` or `classical` (fallback)

### Hugging Face Space

1. **Configure Space secrets:** Settings → Variables and secrets
2. **Add:** `IBM_QUANTUM_TOKEN` (and optionally `IBM_QUANTUM_BACKEND`)
3. **Try it:** [Quantum Portfolio Lab](https://huggingface.co/spaces/rocRevyAreGoals15/quantum-hybrid-portfolio)

**Note:** Real QPU jobs can take 2–10+ minutes due to queue time. Use `simulator_stabilizer` for faster demos on HF.

## Talking Points

### Demo Script

> "I built a quantum-hybrid portfolio optimizer that runs QAOA on IBM Quantum hardware. We formulate portfolio selection as a QUBO, solve it with the Quantum Approximate Optimization Algorithm, and support fallback to classical simulation when the IBM token isn't configured."

### Technical Details

- **Algorithm:** QAOA (Quantum Approximate Optimization Algorithm)
- **Formulation:** QUBO with binary asset selection, budget constraint (sum of weights = 1), risk–return trade-off
- **Backends:** IBM QPU (e.g. Brisbane, Kyoto), IBM simulators, or classical simulation
- **Flow:** Qiskit → `QiskitRuntimeService` → `Sampler` on selected backend → QAOA

### Results You Can Reference

After running `scripts/run_ibm_qa.py` or the API:

- **Backend used:** e.g. `ibm_brisbane`, `simulator_stabilizer`
- **Job ID:** (if captured from IBM runtime)
- **Sharpe ratio, volatility:** Compare with classical methods (max_sharpe, min_variance)
- **Runtime:** Real QPU vs simulator vs classical

### Hugging Face Space Link

**Live demo:** [Quantum Portfolio Lab](https://huggingface.co/spaces/rocRevyAreGoals15/quantum-hybrid-portfolio)

- Interactive dashboard with live market data and simulation
- Supports QAOA on IBM Quantum when token is configured
- Compare objectives: QSW, HRP, Braket annealing, QAOA IBM

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "IBM Quantum backend unavailable" | Install `qiskit-ibm-runtime`, set `IBM_QUANTUM_TOKEN` |
| "Using classical fallback" | Token missing or invalid; check token at quantum.ibm.com |
| Timeout on HF Space | Use `IBM_QUANTUM_BACKEND=simulator_stabilizer` for faster runs |
| Queue too long | Real QPUs have queues; try off-peak or use simulator |

## Related Docs

- [D-Wave Interview Prep](DWAVE_INTERVIEW_PREP.md) — Models, use cases, portfolio optimization
- [API Reference](API_REFERENCE.md) — Full API documentation
- [Architecture](ARCHITECTURE.md) — System overview
