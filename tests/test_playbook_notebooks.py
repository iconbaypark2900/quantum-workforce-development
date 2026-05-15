"""
Playbook smoke + structural tests.

Three jobs per notebook:

  1. Parse: file is valid JSON and looks like nbformat v4.
  2. Structure: every required envelope key is present (cells, kernelspec, ...).
  3. Execute: every code cell runs without raising against the live engine.

The execute step is what catches API-drift regressions — if a service
signature changes, the playbook smoke test will fail in CI.

We use plain `exec` rather than `nbclient` so the test runs without a
Jupyter kernel installed.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List

import pytest


# ── Paths ─────────────────────────────────────────────────────────────────────


PLAYBOOK_ROOT = (
    Path(__file__).resolve().parents[1]
    / "playbooks" / "vendor-neutral-portfolio"
)
NB_DIR = PLAYBOOK_ROOT / "notebooks"

EXPECTED_NOTEBOOKS = [
    "01_mean_cvar_basic.ipynb",
    "02_scenario_generation.ipynb",
    "03_rebalancing_strategies.ipynb",
    "04_solver_benchmarks.ipynb",
    "05_quantum_hybrid_comparison.ipynb",
]


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture(scope="module", autouse=True)
def _headless_matplotlib():
    """Force non-interactive matplotlib for the whole module."""
    os.environ.setdefault("MPLBACKEND", "Agg")
    yield


def _load(name: str) -> Dict[str, Any]:
    path = NB_DIR / name
    return json.loads(path.read_text(encoding="utf-8"))


# ── Existence + parse ────────────────────────────────────────────────────────


class TestNotebookExistence:
    def test_directory_exists(self):
        assert NB_DIR.is_dir(), f"Playbook notebook dir missing: {NB_DIR}"

    @pytest.mark.parametrize("name", EXPECTED_NOTEBOOKS)
    def test_notebook_exists(self, name):
        assert (NB_DIR / name).is_file(), f"Notebook missing: {name}"

    @pytest.mark.parametrize("name", EXPECTED_NOTEBOOKS)
    def test_parses_as_json(self, name):
        # Will raise if the file is malformed
        _load(name)


# ── Envelope structure ────────────────────────────────────────────────────────


class TestNotebookStructure:
    @pytest.mark.parametrize("name", EXPECTED_NOTEBOOKS)
    def test_nbformat_v4(self, name):
        nb = _load(name)
        assert nb.get("nbformat") == 4
        assert nb.get("nbformat_minor", 0) >= 4

    @pytest.mark.parametrize("name", EXPECTED_NOTEBOOKS)
    def test_has_kernelspec(self, name):
        nb = _load(name)
        ks = nb.get("metadata", {}).get("kernelspec", {})
        assert ks.get("language") == "python"
        assert ks.get("name") == "python3"

    @pytest.mark.parametrize("name", EXPECTED_NOTEBOOKS)
    def test_cells_present(self, name):
        nb = _load(name)
        assert isinstance(nb.get("cells"), list)
        assert len(nb["cells"]) >= 1

    @pytest.mark.parametrize("name", EXPECTED_NOTEBOOKS)
    def test_first_cell_is_markdown_title(self, name):
        nb = _load(name)
        first = nb["cells"][0]
        assert first["cell_type"] == "markdown"
        source = "".join(first["source"]) if isinstance(first["source"], list) else first["source"]
        assert source.lstrip().startswith("# "), (
            f"{name} should begin with a level-1 markdown header"
        )

    @pytest.mark.parametrize("name", EXPECTED_NOTEBOOKS)
    def test_has_code_cells(self, name):
        nb = _load(name)
        n_code = sum(1 for c in nb["cells"] if c["cell_type"] == "code")
        assert n_code >= 1, f"{name} has no code cells"


# ── Static dependency check ──────────────────────────────────────────────────


class TestNotebookDependencies:
    """Verify notebooks reference real modules / functions (catches typos)."""

    @pytest.mark.parametrize("name", EXPECTED_NOTEBOOKS)
    def test_imports_resolve(self, name):
        """Every `from X import Y` in the notebook resolves at import time."""
        nb = _load(name)
        import importlib
        for cell in nb["cells"]:
            if cell["cell_type"] != "code":
                continue
            src = "".join(cell["source"]) if isinstance(cell["source"], list) else cell["source"]
            for line in src.splitlines():
                line = line.strip()
                if not line.startswith("from ") and not line.startswith("import "):
                    continue
                if line.startswith("from "):
                    # from MODULE import NAMES
                    mod = line.split()[1]
                else:
                    # import MODULE [as ALIAS]
                    mod = line.split()[1].split(".")[0]
                try:
                    importlib.import_module(mod)
                except ImportError as exc:
                    pytest.fail(
                        f"{name}: import '{line}' fails: {exc}"
                    )


# ── Execute ──────────────────────────────────────────────────────────────────


class TestNotebookExecution:
    """Execute every code cell against the live engine."""

    @pytest.mark.parametrize("name", EXPECTED_NOTEBOOKS)
    def test_executes_clean(self, name):
        nb = _load(name)
        namespace: Dict[str, Any] = {"__name__": "__notebook__"}
        for i, cell in enumerate(nb["cells"]):
            if cell["cell_type"] != "code":
                continue
            src = "".join(cell["source"]) if isinstance(cell["source"], list) else cell["source"]
            try:
                exec(compile(src, f"{name}#cell{i}", "exec"), namespace)
            except Exception as exc:
                pytest.fail(f"{name} cell {i} raised {type(exc).__name__}: {exc}")


# ── Builder regeneration check ────────────────────────────────────────────────


class TestBuilderConsistency:
    """The .ipynb files must be reproducible from build_notebooks.py."""

    def test_builder_module_imports(self):
        """The notebook builder itself imports cleanly."""
        import importlib.util
        builder_path = PLAYBOOK_ROOT / "setup" / "build_notebooks.py"
        assert builder_path.is_file()
        spec = importlib.util.spec_from_file_location("build_notebooks", builder_path)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        # Public API
        assert hasattr(module, "build_all")
        assert hasattr(module, "NOTEBOOKS")
        assert len(module.NOTEBOOKS) == len(EXPECTED_NOTEBOOKS)

    def test_builder_produces_matching_filenames(self):
        import importlib.util
        builder_path = PLAYBOOK_ROOT / "setup" / "build_notebooks.py"
        spec = importlib.util.spec_from_file_location("build_notebooks", builder_path)
        module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        spec.loader.exec_module(module)  # type: ignore[union-attr]
        emitted = [name for name, _ in module.NOTEBOOKS]
        assert sorted(emitted) == sorted(EXPECTED_NOTEBOOKS)
