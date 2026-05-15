#!/usr/bin/env bash
#
# setup_playbook.sh — one-shot setup for the vendor-neutral portfolio playbook.
#
# Creates an isolated `.venv` under playbooks/vendor-neutral-portfolio/.venv,
# installs the project (editable) plus the playbook-specific dependencies,
# and registers a Jupyter kernel called `qhp-playbook`.
#
# Usage:
#     cd playbooks/vendor-neutral-portfolio
#     bash setup/setup_playbook.sh

set -euo pipefail

# ── Paths ────────────────────────────────────────────────────────────────────
PLAYBOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PLAYBOOK_DIR/../.." && pwd)"
VENV_DIR="$PLAYBOOK_DIR/.venv"
KERNEL_NAME="qhp-playbook"
KERNEL_DISPLAY="QHP Playbook (Python 3.11+)"

echo "→ Playbook dir: $PLAYBOOK_DIR"
echo "→ Repo root:    $REPO_ROOT"
echo "→ Venv:         $VENV_DIR"

# ── Python ───────────────────────────────────────────────────────────────────
PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
    echo "✗ '$PYTHON' not found on PATH. Set PYTHON=/path/to/python and retry." >&2
    exit 1
fi
PY_VERSION="$("$PYTHON" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
echo "→ Python:       $PYTHON ($PY_VERSION)"

# ── Venv ─────────────────────────────────────────────────────────────────────
if [[ ! -d "$VENV_DIR" ]]; then
    echo "→ Creating venv …"
    "$PYTHON" -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip setuptools wheel

# ── Install the main project + playbook deps ─────────────────────────────────
echo "→ Installing main project requirements …"
python -m pip install -r "$REPO_ROOT/requirements.txt"

echo "→ Installing playbook dependencies …"
python -m pip install jupyter ipykernel matplotlib seaborn

# ── Register Jupyter kernel ──────────────────────────────────────────────────
echo "→ Registering Jupyter kernel '$KERNEL_NAME' …"
python -m ipykernel install --user \
    --name "$KERNEL_NAME" \
    --display-name "$KERNEL_DISPLAY"

# ── Sanity check ─────────────────────────────────────────────────────────────
echo "→ Quick sanity check …"
PYTHONPATH="$REPO_ROOT" python - <<'PY'
import importlib
for mod in (
    "numpy", "pandas", "scipy", "cvxpy", "pyarrow", "duckdb", "polars",
    "matplotlib", "click",
    "core.portfolio_optimizer", "services.rebalancing",
    "services.scenario_generation", "data_layer.parquet_store",
    "benchmarks.base",
):
    importlib.import_module(mod)
    print(f"  ✓ {mod}")
PY

cat <<EOF

────────────────────────────────────────────────────────────────────
Setup complete.

Start Jupyter Lab with the playbook kernel:

    bash $PLAYBOOK_DIR/setup/start_playbook.sh

Or open a specific notebook directly:

    jupyter lab $PLAYBOOK_DIR/notebooks/01_mean_cvar_basic.ipynb

To regenerate notebooks from the source builder:

    python $PLAYBOOK_DIR/setup/build_notebooks.py
────────────────────────────────────────────────────────────────────
EOF
