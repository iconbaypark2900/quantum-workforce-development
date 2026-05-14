"""Route benchmark instances to the appropriate solver based on qubit count and availability."""

from __future__ import annotations

import os
from typing import Any, Optional

from .schemas import PortfolioBenchmarkInstance, QuboEncodingResult

_QAOA_MAX_QUBITS = 20
_IBM_MAX_QUBITS = 127
_CLASSICAL_ASSET_THRESHOLD = 15


def _estimate_qubits(instance: PortfolioBenchmarkInstance, bits_per_asset: int = 3) -> int:
    return instance.n_assets * bits_per_asset


def _qubo_info(instance: PortfolioBenchmarkInstance) -> QuboEncodingResult:
    from .runner import _qubo_encoding_info

    return _qubo_encoding_info(instance)


def route_and_solve(
    instance: PortfolioBenchmarkInstance,
    ibm_token: Optional[str] = None,
    bits_per_asset: int = 3,
    tenant_id: Optional[str] = None,
) -> tuple[list[float], float, str, Optional[QuboEncodingResult], Optional[dict[str, Any]]]:
    """Route instance to best available solver.

    Returns ``(weights, objective, actual_backend, qubo_info, extra_metadata)``.
    ``extra_metadata`` is set when IBM Runtime supplies job/backend/shots fields.
    """
    from .runner import _classical_solve, _heuristic_solve

    n_qubits = _estimate_qubits(instance, bits_per_asset)
    qubo = _qubo_info(instance)

    if instance.n_assets <= _CLASSICAL_ASSET_THRESHOLD:
        weights, obj, backend = _classical_solve(instance)
        return weights, obj, backend, None, None

    if n_qubits <= _QAOA_MAX_QUBITS:
        # Route to QAOA simulator
        try:
            from .qaoa_sim_solver import solve as qaoa_solve

            weights, obj = qaoa_solve(instance)
            return weights, obj, "qaoa_sim", qubo, None
        except Exception:
            pass

    if n_qubits <= _IBM_MAX_QUBITS and ibm_token:
        try:
            from services import ibm_quantum as _ibm

            tid = ((tenant_id or _ibm.resolve_tenant()) or "").strip() or "default"
            mode = os.environ.get("QOBLIB_IBM_MODE", "simulator").lower()
            if mode not in ("hardware", "simulator"):
                mode = "simulator"
            out = _ibm.run_qoblib_benchmark_sampler(
                tid,
                expected_returns=instance.expected_returns,
                covariance=instance.covariance_matrix,
                weight_min=float(instance.constraints.get("weight_min", 0.0)),
                weight_max=float(instance.constraints.get("weight_max", 1.0)),
                mode=mode,
            )
            if out.get("ok"):
                weights = list(out["weights"])
                obj_val = float(out["mean_variance_objective"])
                extra = {
                    "ibm_runtime": {
                        k: out[k]
                        for k in (
                            "job_id",
                            "backend",
                            "shots",
                            "mode",
                            "elapsed_ms",
                            "simulator",
                            "qoblib_ibm_profile",
                            "ibm_saved_instance_crn_suffix",
                        )
                        if k in out
                    }
                }
                return weights, obj_val, "ibm_quantum", qubo, extra
        except Exception:
            pass

    # Fallback: classical
    weights, obj, backend = _classical_solve(instance)
    routing_trace = f"hybrid_router→{backend}"
    return weights, obj, routing_trace, None, None
