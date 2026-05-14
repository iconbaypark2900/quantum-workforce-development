"""
IBM Quantum service — per-tenant in-memory service cache + SQLite persistence.

qiskit-ibm-runtime is an optional dependency. All public functions degrade
gracefully if it is not installed, returning {"ok": False, "error": "..."}.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

_DEBUG_LOG_PATH = (
    "/home/roc/quantumGlobalGroup/quantum-hybrid-portfolio/.cursor/debug-c1bc30.log"
)


def _debug_ndjson(
    hypothesis_id: str,
    location: str,
    message: str,
    data: Optional[dict[str, Any]] = None,
) -> None:
    # #region agent log
    try:
        payload = {
            "sessionId": "c1bc30",
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data or {},
            "timestamp": int(time.time() * 1000),
        }
        with open(_DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")
    except Exception:
        pass
    # #endregion


def resolve_tenant(explicit: Optional[str] = None) -> str:
    """Resolve tenant for IBM: explicit > static API_KEY + X-Tenant-Id > g.tenant_id > default."""
    if explicit:
        return explicit
    try:
        import os

        from flask import g, has_request_context, request

        if has_request_context():
            api_key = os.getenv("API_KEY", "")
            client_key = request.headers.get("X-API-Key", "")
            if api_key and client_key == api_key:
                h = (request.headers.get("X-Tenant-Id") or "").strip()
                if h:
                    return h
            tid = getattr(g, "tenant_id", None)
            if tid and tid not in ("anonymous", None, ""):
                return str(tid)
    except Exception:
        pass
    return "default"

_lock = threading.Lock()
# tenant_id -> (QiskitRuntimeService | None, token str, optional instance CRN)
_services: dict[str, tuple[Optional[object], Optional[str], Optional[str]]] = {}

_db_conn_factory: Optional[Callable[[], object]] = None


def set_db_conn_factory(fn: Callable[[], object]) -> None:
    """Called from api/app.py to enable persistence."""
    global _db_conn_factory
    _db_conn_factory = fn


def _persist_credentials(
    tenant_id: str, token: str, instance_crn: Optional[str] = None
) -> None:
    if not _db_conn_factory:
        return
    try:
        from services import tenant_integrations as ti

        meta: Optional[dict[str, Any]] = None
        if instance_crn and (instance_crn := instance_crn.strip()):
            meta = {"instance": instance_crn}
        ti.save_secret(_db_conn_factory, tenant_id, "ibm", token, metadata=meta)
    except Exception as exc:
        logger.warning("IBM token persist failed: %s", exc)


def _load_credentials(tenant_id: str) -> Optional[tuple[str, Optional[str]]]:
    """Return (token, instance_crn) from DB, or None."""
    if not _db_conn_factory:
        return None
    try:
        from services import tenant_integrations as ti

        row = ti.load_secret(_db_conn_factory, tenant_id, "ibm")
        if not row:
            return None
        token, meta = row[0], row[1] or {}
        inst = meta.get("instance") if isinstance(meta, dict) else None
        if isinstance(inst, str):
            inst = inst.strip() or None
        else:
            inst = None
        return (token, inst)
    except Exception as exc:
        logger.warning("IBM token load failed: %s", exc)
        return None


def _crn_suffix(crn: Optional[str]) -> Optional[str]:
    """Non-secret display hint for a CRN (truncated)."""
    if not crn:
        return None
    s = str(crn).strip()
    if not s:
        return None
    if len(s) <= 20:
        return s
    return f"...{s[-20:]}"


def _build_runtime_service(token: str, instance_crn: Optional[str] = None) -> Any:
    from qiskit_ibm_runtime import QiskitRuntimeService

    kwargs: dict[str, Any] = dict(
        channel="ibm_quantum_platform",
        token=(token or "").strip(),
    )
    if instance_crn and (instance_crn := instance_crn.strip()):
        kwargs["instance"] = instance_crn
    return QiskitRuntimeService(**kwargs)


def _saved_instance_suffix_for_tenant(tenant_id: str) -> Optional[str]:
    """Truncated saved instance CRN for API responses (never the API token)."""
    with _lock:
        t = _services.get(tenant_id)
        if t and len(t) > 2 and t[2]:
            return _crn_suffix(t[2])
    creds = _load_credentials(tenant_id)
    if creds and creds[1]:
        return _crn_suffix(creds[1])
    return None


def _clear_persisted(tenant_id: str) -> None:
    if not _db_conn_factory:
        return
    try:
        from services import tenant_integrations as ti

        ti.delete_secret(_db_conn_factory, tenant_id, "ibm")
    except Exception as exc:
        logger.warning("IBM token delete failed: %s", exc)


def secrets_persistence_enabled() -> bool:
    """Whether integration secrets (IBM token) are persisted to SQLite."""
    return _db_conn_factory is not None


def _instance_probe(svc: Any) -> dict[str, Any]:
    """
    Safe, JSON-serializable IBM account/instance summary (qiskit-ibm-runtime 0.46+).

    Does not include raw tokens. CRN is truncated for display only.
    """
    out: dict[str, Any] = {
        "instances": [],
        "active_instance": None,
        "instances_error": None,
    }
    try:
        raw = svc.instances()
        for inst in raw:
            if isinstance(inst, dict):
                crn = inst.get("crn")
                crn_suffix = str(crn)[-24:] if crn else None
                out["instances"].append(
                    {
                        "name": inst.get("name"),
                        "plan": inst.get("plan"),
                        "crn_suffix": crn_suffix,
                    }
                )
    except Exception as exc:
        out["instances_error"] = str(exc)[:400]

    try:
        ai = svc.active_instance()
        out["active_instance"] = str(ai) if ai is not None else None
    except Exception:
        pass

    return out


_IBM_CONNECT_TIMEOUT_S = 120  # seconds before we give up on IBM's API


def _connect_with_timeout(
    token: str, instance_crn: Optional[str]
) -> tuple[Any, list[str], dict]:
    """
    Build a QiskitRuntimeService, list backends, and probe instances —
    all inside a thread so we can enforce a hard timeout.

    Returns (svc, backends, probe) or raises TimeoutError / the original exception.
    """
    import concurrent.futures

    result: dict[str, Any] = {}

    def _work() -> None:
        svc = _build_runtime_service(token, instance_crn)
        backends = [b.name for b in svc.backends()]
        probe = _instance_probe(svc)
        result["svc"] = svc
        result["backends"] = backends
        result["probe"] = probe

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(_work)
        try:
            fut.result(timeout=_IBM_CONNECT_TIMEOUT_S)
        except concurrent.futures.TimeoutError:
            raise TimeoutError(
                f"IBM Quantum API did not respond within {_IBM_CONNECT_TIMEOUT_S}s. "
                "Check your token and network connectivity, then try again."
            )

    return result["svc"], result["backends"], result["probe"]


def verify_token(
    tenant_id: str, token: str, instance_crn: Optional[str] = None
) -> dict:
    """
    Validate an IBM Quantum API token without persisting or updating the cached service.

    Optional ``instance_crn`` is the IBM Cloud instance CRN (same as ``instance=`` in
    ``QiskitRuntimeService`` / ``save_account``).

    Returns {"ok": True, "backends": [...], "tenant_id", "ibm_instances", ...} or
            {"ok": False, "error": "..."}.
    """
    token = (token or "").strip()
    if not token:
        return {"ok": False, "error": "Token is empty"}

    try:
        _, backends, probe = _connect_with_timeout(token, instance_crn)
    except ImportError:
        return {
            "ok": False,
            "error": "qiskit-ibm-runtime is not installed. "
            "Run: pip install qiskit qiskit-ibm-runtime",
        }
    except Exception as exc:
        logger.warning("IBM Quantum verify failed: %s", exc)
        return {"ok": False, "error": str(exc)}

    return {
        "ok": True,
        "backends": backends,
        "tenant_id": tenant_id,
        "ibm_instances": probe["instances"],
        "ibm_active_instance": probe["active_instance"],
        "ibm_instances_error": probe["instances_error"],
        "ibm_saved_instance_crn_suffix": _crn_suffix(instance_crn),
    }


def set_token(
    tenant_id: str, token: str, instance_crn: Optional[str] = None
) -> dict:
    """
    Store an IBM Quantum API token for tenant_id and verify connectivity.

    Optional ``instance_crn`` is persisted in the tenant integration metadata (not the
    encrypted secret blob) and passed to ``QiskitRuntimeService(..., instance=...)``.

    Returns {"ok": True, "backends": [...]} on success or
            {"ok": False, "error": "..."} on failure.
    """
    token = (token or "").strip()
    if not token:
        return {"ok": False, "error": "Token is empty"}

    try:
        svc, backends, probe = _connect_with_timeout(token, instance_crn)
    except ImportError:
        return {
            "ok": False,
            "error": "qiskit-ibm-runtime is not installed. "
            "Run: pip install qiskit qiskit-ibm-runtime",
        }
    except Exception as exc:
        logger.warning("IBM Quantum token rejected: %s", exc)
        return {"ok": False, "error": str(exc)}

    inst = instance_crn.strip() if instance_crn and instance_crn.strip() else None
    with _lock:
        _services[tenant_id] = (svc, token, inst)

    _persist_credentials(tenant_id, token, inst)

    logger.info(
        "IBM Quantum token accepted tenant=%s — %d backends: %s",
        tenant_id,
        len(backends),
        backends,
    )
    return {
        "ok": True,
        "backends": backends,
        "ibm_instances": probe["instances"],
        "ibm_active_instance": probe["active_instance"],
        "ibm_instances_error": probe["instances_error"],
        "ibm_saved_instance_crn_suffix": _crn_suffix(inst),
    }


def ensure_loaded(tenant_id: str) -> None:
    """Lazy-load token (+ optional instance CRN) from DB if missing (no duplicate persist)."""
    with _lock:
        if tenant_id in _services and _services[tenant_id][0] is not None:
            return
    creds = _load_credentials(tenant_id)
    if not creds:
        return
    tok, inst = creds[0], creds[1]
    try:
        svc = _build_runtime_service(tok, inst)
        with _lock:
            _services[tenant_id] = (svc, tok, inst)
        _debug_ndjson(
            "H2",
            "ibm_quantum.py:ensure_loaded",
            "lazy_load_ok",
            {"tenant_id": tenant_id, "token_len": len(tok), "has_instance": bool(inst)},
        )
    except ImportError:
        return
    except Exception as exc:
        logger.warning("IBM lazy load failed tenant=%s: %s", tenant_id, exc)
        _debug_ndjson(
            "H2",
            "ibm_quantum.py:ensure_loaded",
            "lazy_load_failed",
            {
                "tenant_id": tenant_id,
                "exc_type": type(exc).__name__,
                "exc_prefix": (str(exc) or "")[:200],
            },
        )


def get_service(tenant_id: Optional[str] = None):
    """Return cached QiskitRuntimeService for tenant (Flask g if omitted), or None."""
    tid = resolve_tenant(tenant_id)
    ensure_loaded(tid)
    with _lock:
        t = _services.get(tid)
        return t[0] if t else None


def is_configured(tenant_id: Optional[str] = None) -> bool:
    tid = resolve_tenant(tenant_id)
    ensure_loaded(tid)
    with _lock:
        t = _services.get(tid)
        return t is not None and t[0] is not None


def get_status(tenant_id: str) -> dict:
    """
    Return connection status for tenant_id.

    {"configured": bool, "backends": [...], "tenant_id": str, "error": str?,
     "ibm_saved_instance_crn_suffix": str?}
    """
    ensure_loaded(tenant_id)
    suffix = _saved_instance_suffix_for_tenant(tenant_id)
    with _lock:
        t = _services.get(tenant_id)
        svc = t[0] if t else None

    if svc is None:
        _debug_ndjson(
            "H2",
            "ibm_quantum.py:get_status",
            "no_service_for_tenant",
            {"tenant_id": tenant_id},
        )
        return {
            "configured": False,
            "backends": [],
            "tenant_id": tenant_id,
            "ibm_saved_instance_crn_suffix": suffix,
        }

    try:
        backends = [b.name for b in svc.backends()]
        probe = _instance_probe(svc)
        _debug_ndjson(
            "H1",
            "ibm_quantum.py:get_status",
            "backends_ok",
            {"tenant_id": tenant_id, "n_backends": len(backends)},
        )
        return {
            "configured": True,
            "backends": backends,
            "tenant_id": tenant_id,
            "ibm_instances": probe["instances"],
            "ibm_active_instance": probe["active_instance"],
            "ibm_instances_error": probe["instances_error"],
            "ibm_saved_instance_crn_suffix": suffix,
        }
    except Exception as exc:
        logger.warning("IBM Quantum status check failed: %s", exc)
        _debug_ndjson(
            "H1",
            "ibm_quantum.py:get_status",
            "backends_failed",
            {
                "tenant_id": tenant_id,
                "exc_type": type(exc).__name__,
                "exc_prefix": (str(exc) or "")[:220],
            },
        )
        return {
            "configured": False,
            "backends": [],
            "tenant_id": tenant_id,
            "error": str(exc),
            "ibm_saved_instance_crn_suffix": suffix,
        }


def clear_token(tenant_id: str) -> None:
    """Remove token for tenant from memory and DB."""
    with _lock:
        if tenant_id in _services:
            del _services[tenant_id]
    _clear_persisted(tenant_id)
    logger.info("IBM Quantum token cleared tenant=%s", tenant_id)


def _runtime_job_to_dict(job: Any) -> dict[str, Any]:
    """Extract JSON-friendly fields from a qiskit-ibm-runtime RuntimeJob (V2)."""
    row: dict[str, Any] = {}
    try:
        jid = job.job_id()
        row["job_id"] = str(jid)
    except Exception:
        row["job_id"] = None

    try:
        st = job.status()
        row["status"] = st if isinstance(st, str) else str(st)
    except Exception as exc:
        row["status"] = None
        row["status_error"] = str(exc)

    try:
        b = job.backend()
        if b is not None:
            row["backend"] = getattr(b, "name", None) or str(b)
        else:
            row["backend"] = None
    except Exception:
        row["backend"] = None

    try:
        cd = job.creation_date
        if isinstance(cd, datetime):
            row["created"] = cd.isoformat()
        elif cd is not None:
            row["created"] = str(cd)
        else:
            row["created"] = None
    except Exception:
        row["created"] = None

    try:
        u = job.usage()
        row["usage_seconds"] = float(u) if u is not None else None
    except Exception:
        row["usage_seconds"] = None

    try:
        inst = job.instance
        row["instance"] = inst if isinstance(inst, str) else None
    except Exception:
        row["instance"] = None

    try:
        pid = getattr(job, "primitive_id", None)
        if pid is not None:
            row["program_id"] = str(pid)
    except Exception:
        pass

    return row


# IBM VQE-shaped smoke: small n keeps Runtime jobs cheap; must match EfficientSU2 width.
_SMOKE_MIN_ASSETS = 2
_SMOKE_MAX_ASSETS = 8
_SMOKE_SHOTS = 128
_SMOKE_N_LAYERS = 1
_WEIGHT_MIN = 0.001
_WEIGHT_MAX = 0.30
# Mag 7 + financial tilt (JPM). Length 8 matches _SMOKE_MAX_ASSETS (one EfficientSU2 width).
_SMOKE_DEFAULT_TICKERS: tuple[str, ...] = (
    "AAPL",
    "MSFT",
    "GOOGL",
    "AMZN",
    "META",
    "NVDA",
    "TSLA",
    "JPM",
)


def _marginal_weights_from_counts(
    counts: dict, n: int, weight_min: float, weight_max: float
) -> Any:
    """Map Z-basis counts to marginal |1⟩ probabilities → normalized weights (VQE IBM path)."""
    import numpy as np

    probs = np.zeros(n)
    total = sum(counts.values())
    if total <= 0:
        return np.ones(n) / n
    for bitstring, count in counts.items():
        s = str(bitstring)
        for q_idx, bit in enumerate(reversed(s[-n:])):
            if bit == "1":
                probs[q_idx] += count / total
    w = np.clip(probs, weight_min, weight_max)
    s = w.sum()
    if s <= 0:
        return np.ones(n) / n
    w = w / s
    return w


def _pick_smoke_backend(service: Any, *, mode: str, min_qubits: int) -> Any:
    """Choose least-busy operational backend with at least ``min_qubits`` qubits."""
    n = max(1, int(min_qubits))
    bm = (mode or "hardware").lower()
    if bm not in ("hardware", "simulator"):
        raise ValueError("mode must be 'hardware' or 'simulator'")
    try:
        pool = list(service.backends(operational=True, min_num_qubits=n))
    except Exception:
        pool = [b for b in service.backends() if b.configuration().n_qubits >= n]
    if bm == "simulator":
        candidates = [b for b in pool if b.configuration().simulator]
        label = "simulator"
    else:
        candidates = [b for b in pool if not b.configuration().simulator]
        label = "hardware"
    if not candidates:
        raise RuntimeError(f"No operational IBM {label} backend with ≥{n} qubit(s)")
    return min(candidates, key=lambda b: b.status().pending_jobs)


def hardware_smoke_test(
    tenant_id: str,
    *,
    mode: str = "hardware",
    market_payload: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    VQE-shaped IBM Runtime smoke: load market data (or matrices), run one fixed-parameter
    EfficientSU2 sample (same ansatz family as ``methods.vqe`` IBM path), map counts to
    weights, and report a single-eval Sharpe-style metric vs loaded ``mu`` / ``Sigma``.

    ``market_payload`` (optional) may include:
      - ``tickers``: list of symbols (default Mag 7 + JPM — see ``_SMOKE_DEFAULT_TICKERS`` — if omitted)
      - ``start_date`` / ``end_date`` (optional, market data provider path — Tiingo / yfinance fallback)
      - or ``returns`` + ``covariance`` (+ optional ``asset_names``) for matrix input

    Uses the same stored IBM token and instance CRN as the rest of the integration.
    ``mode`` is ``hardware`` (default) or ``simulator``.

    Returns a stable dict including: smoke_profile, market_source, tickers, n_assets,
    ann_returns, weights, portfolio_return, portfolio_volatility, sharpe_ratio, counts, …
    """
    bm = (mode or "hardware").lower()
    if bm not in ("hardware", "simulator"):
        return {
            "ok": False,
            "configured": False,
            "error": "mode must be 'hardware' or 'simulator'",
            "tenant_id": tenant_id,
        }

    try:
        from qiskit.circuit.library import EfficientSU2
        from qiskit_ibm_runtime import SamplerV2 as Sampler
        from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager

        import numpy as np
    except ImportError:
        return {
            "ok": False,
            "configured": False,
            "error": "qiskit-ibm-runtime is not installed. "
            "Run: pip install qiskit qiskit-ibm-runtime",
            "tenant_id": tenant_id,
        }

    from services.data_provider import load_market_payload

    ensure_loaded(tenant_id)
    with _lock:
        t = _services.get(tenant_id)
        svc = t[0] if t else None

    if svc is None:
        return {
            "ok": False,
            "configured": False,
            "error": "IBM Quantum not configured for this tenant",
            "tenant_id": tenant_id,
        }

    mp = dict(market_payload) if market_payload else {}
    try:
        if mp.get("returns") is not None and mp.get("covariance") is not None:
            payload: dict[str, Any] = {
                "returns": mp["returns"],
                "covariance": mp["covariance"],
                "asset_names": mp.get("asset_names"),
            }
        else:
            tickers = mp.get("tickers")
            if tickers is None:
                tickers = list(_SMOKE_DEFAULT_TICKERS)
            elif isinstance(tickers, str):
                tickers = [x.strip() for x in tickers.split(",") if x.strip()]
            payload = {
                "tickers": list(tickers),
                "start_date": mp.get("start_date") or mp.get("startDate"),
                "end_date": mp.get("end_date") or mp.get("endDate"),
            }
        market = load_market_payload(payload)
    except Exception as exc:
        logger.warning("IBM smoke test market load failed tenant=%s: %s", tenant_id, exc)
        return {
            "ok": False,
            "configured": False,
            "error": f"Market data: {exc}",
            "tenant_id": tenant_id,
        }

    mu = market.returns
    sigma = market.covariance
    n = int(len(mu))
    if n < _SMOKE_MIN_ASSETS:
        return {
            "ok": False,
            "configured": False,
            "error": f"Need at least {_SMOKE_MIN_ASSETS} assets; got {n}",
            "tenant_id": tenant_id,
        }
    if n > _SMOKE_MAX_ASSETS:
        return {
            "ok": False,
            "configured": False,
            "error": f"Smoke test supports at most {_SMOKE_MAX_ASSETS} assets; got {n}",
            "tenant_id": tenant_id,
        }

    shots = _SMOKE_SHOTS
    t0 = time.perf_counter()
    try:
        backend = _pick_smoke_backend(svc, mode=bm, min_qubits=n)
        ansatz = EfficientSU2(n, reps=_SMOKE_N_LAYERS, entanglement="linear")
        ansatz.measure_all()
        pm = generate_preset_pass_manager(backend=backend, optimization_level=1)
        isa_circuit = pm.run(ansatz)
        theta0 = np.zeros(len(isa_circuit.parameters))
        bound = isa_circuit.assign_parameters(theta0)
        sampler = Sampler(mode=backend)
        result = sampler.run([bound], shots=shots).result()
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        counts: dict[str, int] = {}
        try:
            raw = result[0].data.meas.get_counts()
            if isinstance(raw, dict):
                counts = {str(k): int(v) for k, v in raw.items()}
        except Exception:
            counts = {}

        w = _marginal_weights_from_counts(counts, n, _WEIGHT_MIN, _WEIGHT_MAX)
        port_ret = float(np.dot(w, mu))
        var = float(w @ sigma @ w)
        port_vol = float(np.sqrt(max(var, 0.0)))
        sharpe = (port_ret / port_vol) if port_vol > 1e-10 else None

        job_id: Optional[str] = None
        try:
            pub_result = result[0]
            if hasattr(pub_result, "job_id"):
                jid = pub_result.job_id
                job_id = str(jid) if jid is not None else None
        except Exception:
            pass

        cfg = backend.configuration()
        ann_ret_list = [float(x) for x in np.asarray(mu).ravel()]
        w_list = [float(x) for x in np.asarray(w).ravel()]
        return {
            "ok": True,
            "configured": True,
            "tenant_id": tenant_id,
            "smoke_profile": "efficient_su2_fixed_params_vqe_shaped",
            "vqe_ansatz": "EfficientSU2",
            "n_layers": _SMOKE_N_LAYERS,
            "fixed_parameters": "zeros",
            "market_source": market.source,
            "tickers": list(market.tickers),
            "n_assets": n,
            "ann_returns": ann_ret_list,
            "weights": w_list,
            "portfolio_return": port_ret,
            "portfolio_volatility": port_vol,
            "sharpe_ratio": sharpe,
            "backend": backend.name,
            "simulator": bool(cfg.simulator),
            "mode": bm,
            "shots": shots,
            "elapsed_ms": elapsed_ms,
            "counts": counts,
            "job_id": job_id,
            "ibm_saved_instance_crn_suffix": _saved_instance_suffix_for_tenant(tenant_id),
        }
    except Exception as exc:
        logger.warning("IBM hardware smoke test failed tenant=%s: %s", tenant_id, exc)
        return {
            "ok": False,
            "configured": True,
            "error": str(exc),
            "tenant_id": tenant_id,
            "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
        }


# QOBLIB IBM: wider asset cap than generic smoke; still bounded for Runtime cost control.
_QOBLIB_IBM_MAX_ASSETS = 15
_QOBLIB_IBM_DEFAULT_SHOTS = 256


def run_qoblib_benchmark_sampler(
    tenant_id: str,
    *,
    expected_returns: list[float],
    covariance: list[list[float]],
    weight_min: float,
    weight_max: float,
    mode: str = "simulator",
    shots: Optional[int] = None,
) -> dict[str, Any]:
    """
    IBM Runtime single-shot sampler for small QOBLIB instances.

    Mirrors the EfficientSU2 + ``SamplerV2`` pipeline used by ``hardware_smoke_test`` but
    takes explicit benchmark ``μ`` and ``Σ`` (no Tiingo fetch). Maps measurement counts to
    weights via ``_marginal_weights_from_counts`` and evaluates the classical mean–variance
    objective r'w − ½ w'Σ w.

    **Encoding:** this is a marginal bitstring→weights heuristic aligned with the Lab IBM
    smoke path — not a full QAOA minimization of the constrained Markowitz QUBO; see
    ``docs/QOBLIB_IBM_RUNTIME.md`` for assumptions and metadata fields.
    """
    import numpy as np

    bm = (mode or "simulator").lower()
    if bm not in ("hardware", "simulator"):
        return {
            "ok": False,
            "error": "mode must be 'hardware' or 'simulator'",
            "tenant_id": tenant_id,
        }

    mu = np.asarray(expected_returns, dtype=float).ravel()
    sigma = np.asarray(covariance, dtype=float)
    n = int(mu.shape[0])
    if n < 2:
        return {"ok": False, "error": "Need at least 2 assets", "tenant_id": tenant_id}
    if n > _QOBLIB_IBM_MAX_ASSETS:
        return {
            "ok": False,
            "error": (
                f"IBM QOBLIB path supports at most {_QOBLIB_IBM_MAX_ASSETS} assets; got {n}"
            ),
            "tenant_id": tenant_id,
        }
    if sigma.shape != (n, n):
        return {
            "ok": False,
            "error": "covariance must be square and match returns length",
            "tenant_id": tenant_id,
        }

    sh = int(shots) if shots is not None else _QOBLIB_IBM_DEFAULT_SHOTS
    sh = max(32, min(sh, 2048))

    try:
        from qiskit.circuit.library import EfficientSU2
        from qiskit_ibm_runtime import SamplerV2 as Sampler
        from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager
    except ImportError:
        return {
            "ok": False,
            "error": "qiskit-ibm-runtime is not installed",
            "tenant_id": tenant_id,
        }

    ensure_loaded(tenant_id)
    with _lock:
        t = _services.get(tenant_id)
        svc = t[0] if t else None

    if svc is None:
        return {
            "ok": False,
            "error": "IBM Quantum not configured for this tenant",
            "tenant_id": tenant_id,
        }

    w_lo = float(weight_min)
    w_hi = float(weight_max)
    t0 = time.perf_counter()
    try:
        backend = _pick_smoke_backend(svc, mode=bm, min_qubits=n)
        ansatz = EfficientSU2(n, reps=_SMOKE_N_LAYERS, entanglement="linear")
        ansatz.measure_all()
        pm = generate_preset_pass_manager(backend=backend, optimization_level=1)
        isa_circuit = pm.run(ansatz)
        theta0 = np.zeros(len(isa_circuit.parameters))
        bound = isa_circuit.assign_parameters(theta0)
        sampler = Sampler(mode=backend)
        result = sampler.run([bound], shots=sh).result()
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        counts: dict[str, int] = {}
        try:
            raw = result[0].data.meas.get_counts()
            if isinstance(raw, dict):
                counts = {str(k): int(v) for k, v in raw.items()}
        except Exception:
            counts = {}

        w = _marginal_weights_from_counts(counts, n, w_lo, w_hi)
        w = np.asarray(w, dtype=float)
        port_ret = float(np.dot(w, mu))
        var = float(w @ sigma @ w)
        port_vol = float(np.sqrt(max(var, 0.0)))
        mv_obj = float(mu @ w - 0.5 * w @ sigma @ w)
        sharpe = (port_ret / port_vol) if port_vol > 1e-10 else None

        job_id: Optional[str] = None
        try:
            pub_result = result[0]
            if hasattr(pub_result, "job_id"):
                jid = pub_result.job_id
                job_id = str(jid) if jid is not None else None
        except Exception:
            pass

        cfg = backend.configuration()
        return {
            "ok": True,
            "tenant_id": tenant_id,
            "weights": [float(x) for x in w.ravel()],
            "mean_variance_objective": mv_obj,
            "expected_return": port_ret,
            "portfolio_volatility": port_vol,
            "sharpe_ratio": sharpe,
            "counts": counts,
            "job_id": job_id,
            "backend": backend.name,
            "simulator": bool(cfg.simulator),
            "mode": bm,
            "shots": sh,
            "elapsed_ms": elapsed_ms,
            "qoblib_ibm_profile": "efficient_su2_zero_params_marginal_weights",
            "ibm_saved_instance_crn_suffix": _saved_instance_suffix_for_tenant(tenant_id),
        }
    except Exception as exc:
        logger.warning("IBM QOBLIB sampler failed tenant=%s: %s", tenant_id, exc)
        return {
            "ok": False,
            "configured": True,
            "error": str(exc),
            "tenant_id": tenant_id,
            "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
        }


def list_runtime_workloads(
    tenant_id: str,
    *,
    limit: int = 20,
    known_job_ids: set | None = None,
) -> dict:
    """
    List IBM Quantum Runtime jobs for the tenant's stored API token.

    When *known_job_ids* is supplied (a set of job-ID strings previously
    recorded for this tenant), the result is filtered to only those jobs.
    This prevents one tenant from seeing another tenant's job history even
    though ``svc.jobs()`` returns every job on the IBM account.

    Requires qiskit-ibm-runtime. Uses QiskitRuntimeService.jobs(limit=...).

    Returns a stable dict for the API layer:
        ok, configured, workloads (list of dicts), tenant_id, error (optional).
    """
    lim = max(1, min(int(limit), 100))

    try:
        from qiskit_ibm_runtime import QiskitRuntimeService  # noqa: F401
    except ImportError:
        return {
            "ok": False,
            "configured": False,
            "workloads": [],
            "tenant_id": tenant_id,
            "error": "qiskit-ibm-runtime is not installed. "
            "Run: pip install qiskit qiskit-ibm-runtime",
        }

    ensure_loaded(tenant_id)
    with _lock:
        t = _services.get(tenant_id)
        svc = t[0] if t else None

    if svc is None:
        return {
            "ok": False,
            "configured": False,
            "workloads": [],
            "tenant_id": tenant_id,
            "error": "IBM Quantum not configured for this tenant",
        }

    try:
        # Fetch a broader window so filtering doesn't starve the result set.
        fetch_limit = lim if not known_job_ids else max(lim * 5, 200)
        jobs = svc.jobs(limit=fetch_limit, descending=True)
        if known_job_ids is not None:
            jobs = [j for j in jobs if j.job_id() in known_job_ids]
        workloads = [_runtime_job_to_dict(j) for j in jobs[:lim]]
        return {
            "ok": True,
            "configured": True,
            "workloads": workloads,
            "tenant_id": tenant_id,
        }
    except Exception as exc:
        logger.warning("IBM Quantum workloads list failed tenant=%s: %s", tenant_id, exc)
        return {
            "ok": False,
            "configured": True,
            "workloads": [],
            "tenant_id": tenant_id,
            "error": str(exc),
        }


# ─── Job status helpers (interface for future background poller) ─────────────

def get_ibm_job_status(job_id: str, tenant_id: Optional[str] = None) -> str:
    """Return IBM Runtime job status string ('QUEUED','RUNNING','DONE','ERROR','CANCELLED').

    Raises RuntimeError if qiskit-ibm-runtime is unavailable or the tenant is
    not configured.
    """
    svc = get_service(tenant_id)
    if svc is None:
        raise RuntimeError("IBM Quantum not configured for this tenant")
    job = svc.job(job_id)
    return str(job.status())


def retrieve_ibm_job_result(job_id: str, tenant_id: Optional[str] = None) -> dict:
    """Retrieve the result of a completed IBM Runtime job as a dict.

    Raises RuntimeError if qiskit-ibm-runtime is unavailable or the tenant is
    not configured.
    """
    svc = get_service(tenant_id)
    if svc is None:
        raise RuntimeError("IBM Quantum not configured for this tenant")
    job = svc.job(job_id)
    return _runtime_job_to_dict(job)
