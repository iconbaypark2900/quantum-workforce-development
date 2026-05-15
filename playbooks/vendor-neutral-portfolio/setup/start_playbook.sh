#!/usr/bin/env bash
#
# start_playbook.sh — launch Jupyter Lab against the playbook venv.

set -euo pipefail

PLAYBOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PLAYBOOK_DIR/../.." && pwd)"
VENV_DIR="$PLAYBOOK_DIR/.venv"

if [[ ! -d "$VENV_DIR" ]]; then
    echo "✗ Playbook venv not found at $VENV_DIR" >&2
    echo "  Run setup/setup_playbook.sh first." >&2
    exit 1
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# Ensure the playbook can import the project's modules
export PYTHONPATH="$REPO_ROOT:${PYTHONPATH:-}"

cd "$PLAYBOOK_DIR/notebooks"
exec jupyter lab --notebook-dir="$PLAYBOOK_DIR/notebooks"
