# `deploy/docker/` — Docker artifacts

This directory holds the Dockerfiles, the local docker-compose stack, and the
service configs they consume (Nginx, Prometheus, Postgres init). Live deploys
that do not use docker-compose still source their image from one of the
Dockerfiles here — Fly.io reads `Dockerfile.fly` via root `fly.toml`, the
Hugging Face Space reads `Dockerfile.hf` via `scripts/deploy_hf_spaces.sh`.

## Files

| File | Used by | Purpose |
|------|---------|---------|
| `Dockerfile` | local docker-compose (`app` service) | Full-stack image: builds CRA `frontend/` + installs `deps/requirements.txt` + runs Flask via gunicorn on **5000**. |
| `Dockerfile.fly` | Fly.io API app (root `fly.toml`) | Production Flask API image: full `deps/requirements.txt` stack (no Vercel cap), WeasyPrint system libs, gunicorn on **5000**. |
| `Dockerfile.hf` | Hugging Face Space (via `scripts/deploy_hf_spaces.sh`) | CRA build + Flask API for HF; runs `serve_hf.py` on **7860**; sets `REACT_APP_HF_SPACE=1` at build. |
| `docker-compose.yml` | local dev / staging | Multi-service stack: `app` (Flask + frontend), `db` (Postgres), `redis`, `frontend` (CRA dev), `nginx`, `prometheus`. |
| `nginx.conf` | docker-compose `nginx` service | Reverse-proxy config in front of the app + frontend. |
| `prometheus.yml` | docker-compose `prometheus` service | Scrape config for Flask `/metrics` and supporting jobs. |
| `init.sql` | docker-compose `db` service | Postgres initial schema bootstrap. |

## Canonical commands

Run all from the **repository root** so paths resolve consistently:

```bash
# Local dev stack (Flask + Postgres + Redis + CRA + Nginx + Prometheus)
docker compose -f deploy/docker/docker-compose.yml up -d

# Validate the compose file (catches build-context / volume path errors)
docker compose -f deploy/docker/docker-compose.yml config

# Fly.io API deploy — uses Dockerfile.fly automatically per fly.toml
fly deploy --config fly.toml

# Hugging Face Space deploy — uses Dockerfile.hf
bash scripts/deploy_hf_spaces.sh https://huggingface.co/spaces/<user>/<space>
```

For the full Fly two-app runbook see **[../../docs/FLY_DEPLOY.md](../../docs/FLY_DEPLOY.md)**.
For the HF Space steps see **[../../docs/HUGGINGFACE_SPACES.md](../../docs/HUGGINGFACE_SPACES.md)**.

## Compose build context note

`docker-compose.yml` lives in `deploy/docker/`, but its build `context:` is
**`../..`** (the repo root) and its mounts use `../../logs`, `../../frontend`,
etc. This is intentional so the `app` and `frontend` services can `COPY` the
full source tree (e.g., `deps/requirements.txt`, `api/`, `services/`,
`frontend/`) regardless of where the compose file sits. If you edit
`docker-compose.yml`, keep paths relative to **the compose file**, not the
repo root: the build context is two directories up, the source you want to
mount is also two directories up.
