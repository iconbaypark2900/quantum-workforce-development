# 14 — Real Quantum Hardware Integration

**Priority:** Low–Medium (varies by item)  
**Status:** Multiple tracks — D-Wave mock works but real QPU never run; GPU simulation documented but no code; Google Quantum AI not integrated  
**Area:** `services/braket_backend.py`, `services/ibm_quantum.py`, `scripts/`, `tests/`

---

## Problem

Three quantum hardware tracks are incomplete or missing:

### Track A — D-Wave Real QPU (Priority: Medium)
The D-Wave mock path is validated and the `_execute_braket` SDK call was fixed in April 2026. However:
- A real D-Wave QPU run has **never been executed** (`BRAKET_REAL_DEVICE_TEST=1` test is skipped)
- Minor-embedding for portfolios with **n > 20 assets** is not implemented (requires `dwave-networkx`)
- Without a real hardware run, the D-Wave integration cannot be considered production-ready

### Track B — NVIDIA GPU Simulation (Priority: Low)
The GPU simulation track is documented in `docs/GPU_SIM_SETUP.md` but:
- There is **no GPU-specific code** in the repo
- Gate-based VQE/QAOA run on CPU only
- `pytest -m gpu` tests are skipped unless `GPU_TEST=1` and a GPU is present
- PennyLane Lightning (CUDA) and `qiskit-aer-gpu` are not in `deps/requirements.txt`

### Track C — Google Quantum AI (Priority: Low)
Listed in `QUANTUM_HARDWARE.md` as "Not integrated / Future." No code, no plan, no dependency. This is a roadmap placeholder only.

---

## Scope

**Track A — D-Wave Real QPU:**
- Implement minor-embedding for n > 20 assets using `dwave-networkx`
- Execute and document a real D-Wave QPU run (requires AWS account + D-Wave access)
- Un-skip `tests/test_braket_real_device.py` real-device test once credentials exist
- Update `ENGINEERING_BACKLOG.md` when done

**Track B — GPU Simulation:**
- Add `PennyLane Lightning (GPU)` as an optional dependency in `deps/requirements.txt`
- Add a `gpu_simulator` backend selector in `services/ibm_quantum.py` / `methods/vqe.py`
- Implement `pytest -m gpu` tests (currently they exist but test nothing meaningful)
- Benchmark GPU vs CPU simulation speed and document in `docs/GPU_SIM_SETUP.md`

**Track C — Google Quantum AI:**
- This is a roadmap-only item. No implementation planned until Google Quantum Cloud access is available.
- Update `QUANTUM_HARDWARE.md` to clarify this explicitly.

**Out of scope:**
- IonQ integration
- Rigetti integration
- Photonic quantum computing

---

## Affected Files

### Track A

| File | Change |
|------|--------|
| `services/braket_backend.py` | Add `embed_qubo_minor_embedding(Q, n_assets)` for n > 20 |
| `deps/requirements.txt` | Add `dwave-networkx` as optional comment (already noted) |
| `tests/test_braket_real_device.py` | Un-skip real-device test; record artifact path |
| `docs/next-phase/ENGINEERING_BACKLOG.md` | Mark D-Wave QPU item complete after first real run |
| `scripts/braket_validate.py` | Verify it handles minor-embedding path for large QUBO |

### Track B

| File | Change |
|------|--------|
| `deps/requirements.txt` | Add `pennylane-lightning[gpu]` as optional (commented) |
| `methods/vqe.py` | Add `backend='gpu'` parameter that selects `lightning.gpu` device |
| `methods/qaoa.py` | Same |
| `tests/test_gpu_simulation.py` | Add meaningful test that verifies GPU device initialization |
| `docs/GPU_SIM_SETUP.md` | Add benchmark results section once GPU test runs |

---

## Track A — Minor-Embedding Implementation

For QUBO matrices larger than the native D-Wave graph (> 20 assets):

```python
# services/braket_backend.py

def embed_qubo_minor_embedding(Q: np.ndarray, sampler_graph) -> tuple[dict, dict]:
    """
    Embed a large QUBO onto the hardware graph using dwave-networkx minor embedding.
    Returns: (embedded_Q, embedding)
    """
    try:
        import dwave_networkx as dnx
        import networkx as nx
        from minorminer import find_embedding
    except ImportError:
        raise ImportError(
            "dwave-networkx and minorminer are required for portfolios with > 20 assets. "
            "Install with: pip install dwave-networkx minorminer"
        )

    n = Q.shape[0]
    source_graph = nx.complete_graph(n)
    embedding = find_embedding(source_graph, sampler_graph)
    embedded_Q = dnx.embedding.embed_qubo(Q, embedding, sampler_graph)
    return embedded_Q, embedding


def _execute_braket(self, Q: np.ndarray) -> np.ndarray:
    """Execute QUBO on D-Wave via Braket, with minor-embedding for large problems."""
    if Q.shape[0] > 20:
        device_graph = self._get_device_graph()  # fetch from Braket device properties
        Q_embedded, embedding = embed_qubo_minor_embedding(Q, device_graph)
    else:
        Q_embedded = Q
        embedding = None
    # ... rest of existing execution code
```

---

## Track B — GPU Backend Selector

```python
# methods/vqe.py (addition)

def get_pennylane_device(n_qubits: int, backend: str = 'cpu') -> any:
    import pennylane as qml
    if backend == 'gpu':
        try:
            return qml.device('lightning.gpu', wires=n_qubits)
        except Exception:
            import warnings
            warnings.warn("lightning.gpu not available, falling back to lightning.qubit (CPU)")
            return qml.device('lightning.qubit', wires=n_qubits)
    elif backend == 'simulator':
        return qml.device('lightning.qubit', wires=n_qubits)
    else:
        return qml.device('default.qubit', wires=n_qubits)
```

---

## Real D-Wave Run Procedure

Once AWS credentials and D-Wave access are available:

```bash
# Set environment
export BRAKET_ENABLED=true
export BRAKET_USE_MOCK=false
export BRAKET_DEVICE_ARN=arn:aws:braket:us-east-1::device/qpu/d-wave/Advantage_system6
export BRAKET_S3_BUCKET=your-results-bucket
export BRAKET_REAL_DEVICE_TEST=1

# Run validation script (n=10 assets, small enough for native embedding)
python3 scripts/braket_validate.py --n 10 --seed 42 \
  --output artifacts/braket_real_run_$(date +%Y%m%d).json

# Verify output
cat artifacts/braket_real_run_*.json | python3 -m json.tool | head -30
```

After a successful run:
1. Save the artifact to `artifacts/` (add to `.gitignore`)
2. Update `docs/next-phase/ENGINEERING_BACKLOG.md` — mark D-Wave QPU item ✅ Completed
3. Record artifact path in the backlog notes column
4. Update `docs/next-phase/QUANTUM_HARDWARE.md` current state section

---

## Track C — Google Quantum AI Note

No implementation planned. The `QUANTUM_HARDWARE.md` provider matrix entry should be updated to:

```
| Google Quantum AI | Gate-based | TBD | Not integrated | Roadmap only — requires Google Cloud Quantum access; no timeline |
```

---

## Implementation Plan

### Track A (ordered)

1. Add `embed_qubo_minor_embedding()` to `services/braket_backend.py`
2. Add conditional call in `_execute_braket()` when `n > 20`
3. Add `dwave-networkx` and `minorminer` as commented optional deps in `deps/requirements.txt`
4. Add test `test_minor_embedding_shape` — verify embedded QUBO dimension matches device graph
5. Execute real D-Wave run when credentials available; record artifact
6. Un-skip `test_braket_real_device` in `tests/test_braket_real_device.py`

### Track B (ordered)

1. Add `lightning.gpu` optional device path to `methods/vqe.py` and `methods/qaoa.py`
2. Add `GPU_BACKEND` env var (`cpu` | `gpu`, default `cpu`)
3. Add `pennylane-lightning[gpu]` as commented optional dep in `deps/requirements.txt`
4. Update `tests/test_gpu_simulation.py` to test device initialization (not a full circuit run)
5. Run GPU benchmark and document in `docs/GPU_SIM_SETUP.md`

---

## Acceptance Criteria

**Track A:**
- [ ] `embed_qubo_minor_embedding()` exists in `services/braket_backend.py`
- [ ] `_execute_braket()` calls minor-embedding path when `n > 20`
- [ ] `test_minor_embedding_shape` passes (mock graph)
- [ ] At least one real D-Wave QPU run artifact recorded in `artifacts/`
- [ ] `ENGINEERING_BACKLOG.md` D-Wave item marked ✅ Completed

**Track B:**
- [ ] `methods/vqe.py` accepts `backend='gpu'` parameter with graceful fallback
- [ ] `test_gpu_simulation.py` tests pass with `GPU_TEST=1` on a CUDA-capable machine
- [ ] `docs/GPU_SIM_SETUP.md` includes a benchmark result table

**Track C:**
- [ ] `QUANTUM_HARDWARE.md` Google AI entry updated to "Roadmap only — no timeline"

---

## Parking Lot

- IonQ via Braket (gate-based annealing alternative)
- Rigetti via Braket
- Photonic (Xanadu) — Gaussian boson sampling for portfolio covariance
- Neutral atom (QuEra) — Rydberg atom arrays for graph problems
