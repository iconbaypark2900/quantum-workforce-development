"""
Run artifact store — filesystem tree under `runs/<run_id>/`.

Complements (does not replace) `services.lab_run_service`, which keeps a
durable SQLite registry of runs. This module is the *filesystem* side: every
optimisation can write its config, metrics, weights, scenario summary, solver
diagnostics, and logs to a dedicated directory so:

  - the dashboard can stream the artefacts back to the user
  - quant researchers can `git diff` two runs
  - CI smoke tests can verify reproducibility

Layout under `default_runs_root()`:

    runs/
      <run_id>/
        config.yaml              # input objective/constraints/scenario settings
        metrics.json             # weights summary + Sharpe + VaR/CVaR
        weights.csv              # ticker, weight, sector
        scenario_summary.json    # mean/std per asset across scenarios
        solver_diagnostics.json  # backend, solver, time, status
        logs.txt                 # plain-text log (best effort)
        plots/                   # reserved for matplotlib outputs (Sprint 5+)

`run_id` is `YYYY-MM-DDTHH-MM-SS-<6 hex>` so directories sort chronologically
and are unique per process.
"""
from __future__ import annotations

import json
import logging
import os
import secrets
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import numpy as np

try:
    import yaml  # type: ignore
    _YAML_AVAILABLE = True
except ImportError:  # pragma: no cover
    yaml = None  # type: ignore
    _YAML_AVAILABLE = False


logger = logging.getLogger(__name__)


# ── Paths ─────────────────────────────────────────────────────────────────────


def default_runs_root() -> Path:
    """
    Resolve where to write `runs/<run_id>/` directories.

    Resolution order:
      1. $QHP_RUNS_DIR
      2. Project-local `./runs` (relative to current working directory)
    """
    env = os.environ.get("QHP_RUNS_DIR")
    if env:
        return Path(env).expanduser().resolve()
    return (Path.cwd() / "runs").resolve()


def generate_run_id() -> str:
    """`YYYY-MM-DDTHH-MM-SS-<6 hex>`  — sortable, unique."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    suffix = secrets.token_hex(3)
    return f"{now}-{suffix}"


# ── Dataclasses ───────────────────────────────────────────────────────────────


@dataclass
class RunMetrics:
    """Numerical summary recorded per run."""

    sharpe_ratio: float
    expected_return: float
    volatility: float
    n_active: int
    var_95: Optional[float] = None
    cvar_95: Optional[float] = None
    solver_status: Optional[str] = None
    solve_time_ms: Optional[float] = None


@dataclass
class SolverDiagnostics:
    backend: Optional[str] = None
    solver: Optional[str] = None
    status: Optional[str] = None
    solve_time_ms: Optional[float] = None
    objective_value: Optional[float] = None
    n_scenarios: Optional[int] = None
    diagnostics: Dict[str, Any] = field(default_factory=dict)


# ── Run writer ────────────────────────────────────────────────────────────────


class RunArtifactStore:
    """Writes (and re-reads) the filesystem artifact tree for a run."""

    CONFIG_FILE = "config.yaml"
    METRICS_FILE = "metrics.json"
    WEIGHTS_FILE = "weights.csv"
    SCENARIO_FILE = "scenario_summary.json"
    SOLVER_FILE = "solver_diagnostics.json"
    LOGS_FILE = "logs.txt"
    PLOTS_DIR = "plots"

    def __init__(self, root: Optional[Path] = None) -> None:
        self.root = Path(root).expanduser().resolve() if root else default_runs_root()

    # ── Path resolution ─────────────────────────────────────────────────────

    def run_dir(self, run_id: str) -> Path:
        return self.root / run_id

    def exists(self, run_id: str) -> bool:
        return self.run_dir(run_id).is_dir()

    # ── Writer ──────────────────────────────────────────────────────────────

    def write_run(
        self,
        run_id: Optional[str],
        config: Dict[str, Any],
        metrics: RunMetrics,
        weights: Iterable[float],
        asset_names: Iterable[str],
        sectors: Optional[Iterable[str]] = None,
        solver_diagnostics: Optional[SolverDiagnostics] = None,
        scenario_summary: Optional[Dict[str, Any]] = None,
        logs: Optional[str] = None,
    ) -> str:
        """
        Write the full artefact tree. Returns the run_id used.

        Any IO failure for a single file is logged but does not abort the
        rest of the write — partial artefacts are better than none for
        post-mortem debugging.
        """
        rid = run_id or generate_run_id()
        rdir = self.run_dir(rid)
        rdir.mkdir(parents=True, exist_ok=True)
        (rdir / self.PLOTS_DIR).mkdir(exist_ok=True)

        # config.yaml
        self._write_yaml(rdir / self.CONFIG_FILE, _sanitise_for_yaml(config))

        # metrics.json
        self._write_json(rdir / self.METRICS_FILE, asdict(metrics))

        # weights.csv
        self._write_weights_csv(
            rdir / self.WEIGHTS_FILE,
            list(asset_names),
            list(weights),
            list(sectors) if sectors is not None else None,
        )

        # solver_diagnostics.json
        if solver_diagnostics is not None:
            self._write_json(
                rdir / self.SOLVER_FILE,
                _strip_nones(asdict(solver_diagnostics)),
            )

        # scenario_summary.json
        if scenario_summary is not None:
            self._write_json(rdir / self.SCENARIO_FILE, scenario_summary)

        # logs.txt
        if logs is not None:
            try:
                (rdir / self.LOGS_FILE).write_text(str(logs), encoding="utf-8")
            except OSError as exc:  # pragma: no cover
                logger.warning("run_store: failed to write logs: %s", exc)

        return rid

    # ── Reader ──────────────────────────────────────────────────────────────

    def read_run(self, run_id: str) -> Dict[str, Any]:
        """Load the artefact tree as a single dict, useful for the API."""
        rdir = self.run_dir(run_id)
        if not rdir.is_dir():
            raise FileNotFoundError(f"Run directory not found: {rdir}")

        out: Dict[str, Any] = {"run_id": run_id, "path": str(rdir)}
        out["config"] = self._read_yaml(rdir / self.CONFIG_FILE)
        out["metrics"] = self._read_json(rdir / self.METRICS_FILE)
        out["solver_diagnostics"] = self._read_json(rdir / self.SOLVER_FILE)
        out["scenario_summary"] = self._read_json(rdir / self.SCENARIO_FILE)
        out["weights"] = self._read_weights_csv(rdir / self.WEIGHTS_FILE)
        logs_path = rdir / self.LOGS_FILE
        out["logs_path"] = str(logs_path) if logs_path.is_file() else None
        return out

    def list_runs(self, limit: int = 50) -> List[str]:
        """Return run_ids most-recent first (lexicographic order matches time)."""
        if not self.root.is_dir():
            return []
        ids = sorted(
            (p.name for p in self.root.iterdir() if p.is_dir()),
            reverse=True,
        )
        return ids[:limit]

    # ── Internals ───────────────────────────────────────────────────────────

    def _write_yaml(self, path: Path, payload: Dict[str, Any]) -> None:
        try:
            if _YAML_AVAILABLE:
                path.write_text(
                    yaml.safe_dump(payload, default_flow_style=False, sort_keys=False),
                    encoding="utf-8",
                )
            else:
                # Fallback: write JSON with a .yaml extension. Better than nothing.
                path.write_text(json.dumps(payload, indent=2, default=_json_default),
                                encoding="utf-8")
        except OSError as exc:  # pragma: no cover
            logger.warning("run_store: failed to write %s: %s", path, exc)

    def _write_json(self, path: Path, payload: Dict[str, Any]) -> None:
        try:
            path.write_text(
                json.dumps(payload, indent=2, default=_json_default),
                encoding="utf-8",
            )
        except OSError as exc:  # pragma: no cover
            logger.warning("run_store: failed to write %s: %s", path, exc)

    def _write_weights_csv(
        self,
        path: Path,
        names: List[str],
        weights: List[float],
        sectors: Optional[List[str]],
    ) -> None:
        try:
            header = "ticker,weight"
            rows = []
            if sectors is not None and len(sectors) == len(names):
                header += ",sector"
                for n, w, s in zip(names, weights, sectors):
                    rows.append(f"{n},{float(w):.10g},{s}")
            else:
                for n, w in zip(names, weights):
                    rows.append(f"{n},{float(w):.10g}")
            path.write_text("\n".join([header] + rows) + "\n", encoding="utf-8")
        except OSError as exc:  # pragma: no cover
            logger.warning("run_store: failed to write %s: %s", path, exc)

    def _read_yaml(self, path: Path) -> Optional[Dict[str, Any]]:
        if not path.is_file():
            return None
        try:
            text = path.read_text(encoding="utf-8")
            if _YAML_AVAILABLE:
                return yaml.safe_load(text)
            return json.loads(text)
        except (OSError, ValueError) as exc:  # pragma: no cover
            logger.warning("run_store: failed to read %s: %s", path, exc)
            return None

    def _read_json(self, path: Path) -> Optional[Dict[str, Any]]:
        if not path.is_file():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:  # pragma: no cover
            logger.warning("run_store: failed to read %s: %s", path, exc)
            return None

    def _read_weights_csv(self, path: Path) -> Optional[List[Dict[str, Any]]]:
        if not path.is_file():
            return None
        try:
            text = path.read_text(encoding="utf-8").strip()
            lines = text.splitlines()
            if len(lines) < 2:
                return []
            header = [h.strip() for h in lines[0].split(",")]
            out: List[Dict[str, Any]] = []
            for line in lines[1:]:
                parts = [p.strip() for p in line.split(",")]
                if len(parts) < 2:
                    continue
                row: Dict[str, Any] = {header[0]: parts[0]}
                row[header[1]] = float(parts[1])
                if len(header) > 2 and len(parts) > 2:
                    row[header[2]] = ",".join(parts[2:])
                out.append(row)
            return out
        except (OSError, ValueError) as exc:  # pragma: no cover
            logger.warning("run_store: failed to read %s: %s", path, exc)
            return None


# ── Helpers ───────────────────────────────────────────────────────────────────


def _json_default(o: Any) -> Any:
    """JSON encoder fallback for numpy / pandas / datetime types."""
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, datetime):
        return o.isoformat()
    raise TypeError(f"Unsupported type for JSON: {type(o)!r}")


def _strip_nones(d: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}


def _sanitise_for_yaml(d: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively convert numpy / non-yaml-safe values to plain Python types."""
    def _conv(v):
        if isinstance(v, np.ndarray):
            return v.tolist()
        if isinstance(v, (np.floating,)):
            return float(v)
        if isinstance(v, (np.integer,)):
            return int(v)
        if isinstance(v, dict):
            return {k: _conv(x) for k, x in v.items()}
        if isinstance(v, (list, tuple)):
            return [_conv(x) for x in v]
        return v
    return {k: _conv(v) for k, v in d.items()}


# ── Module-level singleton ────────────────────────────────────────────────────


_DEFAULT_STORE: Optional[RunArtifactStore] = None


def get_run_store() -> RunArtifactStore:
    """Process-wide default RunArtifactStore (lazy)."""
    global _DEFAULT_STORE
    if _DEFAULT_STORE is None:
        _DEFAULT_STORE = RunArtifactStore()
    return _DEFAULT_STORE


def reset_run_store() -> None:
    """Drop the cached store — for tests."""
    global _DEFAULT_STORE
    _DEFAULT_STORE = None


# ── High-level convenience ────────────────────────────────────────────────────


def save_optimization_run(
    config: Dict[str, Any],
    result: Any,
    asset_names: Iterable[str],
    sectors: Optional[Iterable[str]] = None,
    scenarios: Optional[np.ndarray] = None,
    run_id: Optional[str] = None,
) -> str:
    """
    Convenience that takes an `OptimizationResult` (or duck-typed object with
    the same attributes) and writes the full artefact tree.

    Used by the API's /api/portfolio/optimize handler after every solve.
    Returns the run_id written.
    """
    metrics = RunMetrics(
        sharpe_ratio=float(getattr(result, "sharpe_ratio", 0.0) or 0.0),
        expected_return=float(getattr(result, "expected_return", 0.0) or 0.0),
        volatility=float(getattr(result, "volatility", 0.0) or 0.0),
        n_active=int(getattr(result, "n_active", 0) or 0),
        var_95=_safe_float(getattr(result, "var_95", None)),
        cvar_95=_safe_float(getattr(result, "cvar_95", None)),
        solver_status=getattr(result, "solver_status", None),
        solve_time_ms=_safe_float(getattr(result, "solve_time_ms", None)),
    )
    solver = SolverDiagnostics(
        backend=getattr(result, "backend", None),
        solver=getattr(result, "solver", None),
        status=getattr(result, "solver_status", None),
        solve_time_ms=_safe_float(getattr(result, "solve_time_ms", None)),
        objective_value=_safe_float(getattr(result, "objective_value", None)),
        n_scenarios=getattr(result, "n_scenarios", None),
        diagnostics={},
    )

    scenario_summary: Optional[Dict[str, Any]] = None
    if scenarios is not None and len(scenarios) > 0:
        scenario_summary = _summarise_scenarios(scenarios, list(asset_names))

    return get_run_store().write_run(
        run_id=run_id,
        config=config,
        metrics=metrics,
        weights=list(getattr(result, "weights", [])),
        asset_names=list(asset_names),
        sectors=list(sectors) if sectors is not None else None,
        solver_diagnostics=solver,
        scenario_summary=scenario_summary,
    )


def _safe_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return f


def _summarise_scenarios(scenarios: np.ndarray, asset_names: List[str]) -> Dict[str, Any]:
    """Per-asset mean / std / min / max across scenarios."""
    arr = np.asarray(scenarios)
    if arr.ndim != 2:
        return {"shape": list(arr.shape)}
    means = arr.mean(axis=0).tolist()
    stds = arr.std(axis=0).tolist()
    mins = arr.min(axis=0).tolist()
    maxs = arr.max(axis=0).tolist()
    names = asset_names if len(asset_names) == arr.shape[1] else [str(i) for i in range(arr.shape[1])]
    return {
        "n_scenarios": int(arr.shape[0]),
        "n_assets": int(arr.shape[1]),
        "per_asset": [
            {"ticker": names[i], "mean": means[i], "std": stds[i],
             "min": mins[i], "max": maxs[i]}
            for i in range(arr.shape[1])
        ],
    }
