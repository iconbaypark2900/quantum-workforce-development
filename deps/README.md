# `deps/` — Python dependency manifests

This directory holds Python dependency manifests for the various deploy targets and
dev workflows. The package itself is declared in repo-root **`pyproject.toml`** (which
reads `deps/requirements-vercel.txt` for its dynamic `dependencies` field, so the
slim manifest doubles as the install-time baseline).

## Files

| File | Purpose |
|------|---------|
| `requirements.txt` | Full local dev + CI install (Python ≥3.11). Includes scientific stack, plotting, tests, optional Braket/boto3, and other extras the slim builds omit. |
| `requirements-vercel.txt` | Slim runtime install for the Vercel API project. Size-budgeted to fit Vercel's ~245 MB serverless cap; used by `vercel.json`'s `installCommand` (`pip install -r deps/requirements-vercel.txt && pip install .`). Also referenced by `pyproject.toml` for dynamic dependencies. |
| `requirements-ibm-quantum.txt` | Reference IBM Quantum / Qiskit pins. `requirements-vercel.txt` aligns with these so the Vercel API ships matching `qiskit` / `qiskit-ibm-runtime` versions. |
| `requirements-gradio.txt` | Optional Gradio Lite UI runtime (see `scripts/gradio_portfolio_demo.py` and `scripts/gradio_lite/`). Default Gradio port: 7861. |

## Quickstart (local dev)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r deps/requirements.txt
pip install -e .
```

## Other entry points

- **CI:** `.github/workflows/ci.yml` installs `deps/requirements.txt` for the test job.
- **Fly API image:** `deploy/docker/Dockerfile.fly` installs `deps/requirements.txt`.
- **Vercel API:** `vercel.json` installs `deps/requirements-vercel.txt` (then `pip install .`).
- **HF Space:** `deploy/docker/Dockerfile.hf` installs `deps/requirements.txt`.

For the full setup walk-through, see **[../docs/GETTING_STARTED.md](../docs/GETTING_STARTED.md)**.
For the deploy/dependency overview, see **[../docs/HOSTING_NEXT_AND_FLASK_ARCHITECTURE.md](../docs/HOSTING_NEXT_AND_FLASK_ARCHITECTURE.md)**.
