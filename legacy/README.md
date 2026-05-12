# Legacy stack (archived)

This directory holds deprecated alternate implementations preserved for historical reference. Code under `legacy/` is **not maintained**, **not covered by the active CI intent for the live stack**, **not deployed** as part of current production paths, and **not part of the canonical API or UI** described in the repo root `AGENTS.md`.

Treat these files as read-only artifacts unless you are deliberately reviving or comparing against old behavior.

## Replacement map

| Legacy path | Live replacement |
|-------------|------------------|
| `legacy/api/enhanced_api.py` | `api/app.py` (run via `python -m api`) |
| `legacy/api/fixed_enhanced_api.py` | `api/app.py` |
| `legacy/api/production_api.py` | `api/app.py` (container deploy: `Dockerfile`, `Dockerfile.fly`, `Dockerfile.hf`) |
| `legacy/deploy/Dockerfile.production` | `Dockerfile`, `Dockerfile.fly`, `Dockerfile.hf` |
| `legacy/deploy/deploy_production.sh` | `scripts/vercel-deploy-api.sh`, `docs/FLY_DEPLOY.md`, and related hosting docs |
| `legacy/ui/quantum_portfolio_dashboard.jsx` | `frontend/src/CustomizableQuantumDashboard.js` |

## Docker / scripts

The production Dockerfile and shell script here assumed paths and build context from an older layout. They are **not updated** for the current tree; use the live Dockerfiles and documented deploy flows instead.

## Removal policy

These files may be deleted in a future cleanup once maintainers are confident nothing external depends on this historical snapshot. Until then, prefer leaving them in place and pointing new work at the live stack above.

## Canonical stack

See **`AGENTS.md`** at the repository root for Flask API entrypoints, Next.js `web/`, CRA `frontend/`, and environment conventions.
