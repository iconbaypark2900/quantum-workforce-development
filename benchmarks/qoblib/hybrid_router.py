"""Route benchmark instances to the appropriate solver based on qubit count and availability."""

from __future__ import annotations
from typing import Optional
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
) -> tuple[list[float], float, str, Optional[QuboEncodingResult]]:
    """Route instance to best available solver. Returns (weights, obj, actual_backend, qubo)."""
    from .runner import _classical_solve, _heuristic_solve

    n_qubits = _estimate_qubits(instance, bits_per_asset)
    qubo = _qubo_info(instance)

    if instance.n_assets <= _CLASSICAL_ASSET_THRESHOLD:
        weights, obj, backend = _classical_solve(instance)
        return weights, obj, backend, None

    if n_qubits <= _QAOA_MAX_QUBITS:
        # Route to QAOA simulator
        try:
            from .qaoa_sim_solver import solve as qaoa_solve
            weights, obj = qaoa_solve(instance)
            return weights, obj, "qaoa_sim", qubo
        except Exception:
            pass

    if n_qubits <= _IBM_MAX_QUBITS and ibm_token:
        # IBM path not yet integrated — would call ibm_quantum backend
        pass

    # Fallback: classical
    weights, obj, backend = _classical_solve(instance)
    routing_trace = f"hybrid_router→{backend}"
    return weights, obj, routing_trace, None
