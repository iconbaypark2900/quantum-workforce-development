# QOBLIB × IBM Quantum Runtime (Gap #1)

**Scope:** How the Portfolio Lab wires **`benchmarks/qoblib`** instances to **IBM Quantum Runtime** for the **`ibm_quantum`** backend and the IBM branch of **`hybrid_router`**.

## Objective sign

Classical Markowitz utility maximized elsewhere in the stack:

\[
f(w) = r^\top w - \tfrac{1}{2} w^\top \Sigma w
\]

`SolverResult.objective_value` uses the same numeric objective as `_classical_solve` / `_heuristic_solve`.

## Encoding (what we run today)

The integration **does not** exhaustively solve a constrained QUBO on hardware in this slice. It uses the same **EfficientSU2 + `SamplerV2`** pattern as `hardware_smoke_test` in `services/ibm_quantum.py`:

1. **Circuit width** = `n_assets` (one qubit per asset in the benchmark instance).
2. **Ansatz:** `EfficientSU2(n, reps=1, entanglement="linear")`, **fixed parameters = zeros** (deterministic single shot batch).
3. **Measurement:** Z-basis counts → **marginal “|1⟩” probabilities** clipped to `[weight_min, weight_max]` and renormalized (`_marginal_weights_from_counts`).
4. **Portfolio metrics:** weights fed back through \(r\), \(\Sigma\) for return, volatility, Sharpe, and **mean–variance objective** above.

### Limits

| Control | Default | Notes |
|--------|---------|------|
| Max assets | 15 | `run_qoblib_benchmark_sampler` — larger instances return a structured error |
| Shots | 256 (clamp 32–2048) | Passed to Runtime sampler |
| Backend mode | `simulator` | Env **`QOBLIB_IBM_MODE`**: `simulator` or `hardware` |
| Tenant | `resolve_tenant()` / Flask `g.tenant_id` | Same SQLite-backed token model as the rest of the Lab |

## Persisted metadata (`SolverResult.metadata`)

Under **`ibm_runtime`** (strict backend or hybrid IBM success):

- `job_id`, `backend`, `shots`, `mode`, `elapsed_ms`, `simulator`
- `qoblib_ibm_profile` — implementation tag (`efficient_su2_zero_params_marginal_weights`)
- `counts` — measurement histogram (may be large; CSV rows still capture summary fields)
- `ibm_saved_instance_crn_suffix` — non-secret suffix hint for support

Artifacts written when **`persist=True`** follow the same JSON/CSV/Markdown paths as other QOBLIB backends.

## Failure modes

| Symptom | Typical cause |
|--------|----------------|
| `IBM_NOT_CONFIGURED` (HTTP 400 from `/run`) | No token stored for tenant |
| `qiskit-ibm-runtime is not installed` | CI/local env without IBM stack |
| `IBM QOBLIB path supports at most 15 assets` | Instance too large for this adapter |
| Runtime / transpile / queue errors | Surfaced as `SolverResult.error` with `feasible=False` |

## Manual smoke

1. Configure IBM token (Settings → IBM Quantum) for your tenant.
2. Ensure instance ≤ 15 assets (fixture **`po_a010_t10_s01`** qualifies).
3. `POST /api/simulations/qoblib/run` with `backend: "ibm_quantum"` and `instance_id` set.
4. Prefer **`QOBLIB_IBM_MODE=simulator`** first; switch to `hardware` only with queue/credit awareness.

```bash
curl -sS -X POST -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" \
  -d '{"instance_id":"po_a010_t10_s01","backend":"ibm_quantum"}' \
  http://127.0.0.1:5000/api/simulations/qoblib/run | jq .
```

## Future work (explicitly out of this slice)

- Full **QAOA / QUBO** encoding of cardinality and budget constraints with depth-controlled circuits.
- Automated gap comparison vs **`GET /api/simulations/qoblib/validate`** on hardware (noise separation).
