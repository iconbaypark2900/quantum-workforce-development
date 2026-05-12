#!/usr/bin/env bash
# Prepare this repo for deployment to Hugging Face Spaces.
# Run from project root: ./scripts/prepare_hf_deploy.sh
#
# What it does:
# - Copies deploy/docker/Dockerfile.hf to Dockerfile (HF Spaces uses Dockerfile at root)
# - Preserves the original Dockerfile as Dockerfile.production (backup)
#
# After running, push to your HF Space:
#   git add Dockerfile Dockerfile.production
#   git commit -m "Use HF Dockerfile for Spaces deployment"
#   git push space main
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f Dockerfile ] && ! grep -q "serve_hf.py" Dockerfile 2>/dev/null; then
  echo "Backing up production Dockerfile to Dockerfile.production"
  cp Dockerfile Dockerfile.production
fi

echo "Copying deploy/docker/Dockerfile.hf -> Dockerfile for HF Spaces"
cp deploy/docker/Dockerfile.hf Dockerfile

echo "Done. Dockerfile is now configured for Hugging Face Spaces."
echo ""
echo "Next steps:"
echo "  1. Add HF Space remote (if not already): git remote add space https://huggingface.co/spaces/YOUR_USERNAME/YOUR_SPACE"
echo "  2. Commit and push: git add Dockerfile && git commit -m 'HF Spaces config' && git push space main"
echo "  3. In Space Settings → Variables and secrets, add IBM_QUANTUM_TOKEN (secret) for QAOA on IBM Quantum"
