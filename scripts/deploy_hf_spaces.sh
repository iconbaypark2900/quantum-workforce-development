#!/bin/bash
# Deploy Quantum Portfolio Lab to Hugging Face Spaces
# Usage: ./deploy_hf_spaces.sh <hf_space_repo_url>
# Example: ./deploy_hf_spaces.sh https://huggingface.co/spaces/username/quantum-portfolio
#
# Prerequisites: Create a new Space at https://huggingface.co/new-space (choose Docker SDK)
# You'll need HF CLI (pip install huggingface_hub) or git credentials for push.

set -e
SPACE_REPO="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -z "$SPACE_REPO" ]; then
  echo "Usage: $0 <hf_space_repo_url>"
  echo "Example: $0 https://huggingface.co/spaces/username/quantum-portfolio"
  echo ""
  echo "First create a new Space at https://huggingface.co/new-space (choose Docker SDK)"
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

echo "Cloning Space repo..."
git clone "$SPACE_REPO" "$TMP_DIR/space"
cd "$TMP_DIR/space"

echo "Copying project files..."
rsync -a --exclude='.git' --exclude='node_modules' --exclude='frontend/node_modules' \
  --exclude='frontend/build' --exclude='.venv' --exclude='__pycache__' \
  --exclude='data/api.sqlite3' --exclude='*.sqlite3' \
  --exclude='*.docx' --exclude='*.pdf' --exclude='*.pyc' \
  "$REPO_ROOT/" ./
cp "$REPO_ROOT/Dockerfile.hf" ./Dockerfile
cp "$REPO_ROOT/huggingface/README.md" ./README.md

echo "Committing and pushing..."
git add -A
git status
if [ "${HF_DEPLOY_AUTO:-}" = "1" ] || [[ "${2:-}" == "-y" ]]; then
  git commit -m "Deploy Quantum Portfolio Lab" || true
  git push
  echo "Done! Your Space will build at $SPACE_REPO"
else
  echo ""
  echo "Review changes above. To push: cd $TMP_DIR/space && git commit -m 'Deploy' && git push"
  echo "Or run: HF_DEPLOY_AUTO=1 $0 $SPACE_REPO"
fi
