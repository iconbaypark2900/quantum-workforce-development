# Hosting architecture: Next.js UI + Flask API

This document explains how the **operator dashboard** (`web/`, Next.js) and the **Flask REST API** fit together, which files matter for deployment, and which dependencies each tier needs. Step-by-step deploy runbooks live elsewhere—see [DEPLOYMENT.md](DEPLOYMENT.md), [FLY_DEPLOY.md](FLY_DEPLOY.md), and [VERCEL_TWO_PROJECTS.md](VERCEL_TWO_PROJECTS.md).

---

## 1. Mental model: two processes

| Tier | Role | Entry | Typical port |
|------|------|--------|----------------|
| **Flask API** | REST API: optimization, market data, backtests, integrations (IBM Quantum, etc.) | `python -m api` → `api.app:app` | **5000** |
| **Next.js (`web/`)** | App Router UI; server-side `/api/*` proxy to Flask (or browser calls Flask directly) | `next dev` / `next start` / standalone `node server.js` | **3000** (or **3042** via `scripts/run-next-web.sh` to avoid clashing with CRA on 3000) |

The legacy **Create React App** dashboard in `frontend/` is optional and separate from `web/`. For new hosting, treat **Flask + `web/`** as the primary stack.

---

## 2. Request paths (how the browser reaches Flask)

There are **two** supported integration patterns:

### A. Same-origin via Next (recommended when UI and API share a public origin)

1. Browser calls **`https://<next-host>/api/...`** (relative URLs; `NEXT_PUBLIC_API_URL` empty).
2. Next.js **Route Handler** [`web/src/app/api/[[...path]]/route.ts`](../web/src/app/api/[[...path]]/route.ts) forwards the request to the Flask base URL from **`API_PROXY_TARGET`** (or defaults: local `http://127.0.0.1:5000`, or on Fly `http://<api-app>.internal:5000`).
3. **CORS** between browser and Flask is not required for those calls, because the browser only talks to Next.

**Important:** Do **not** rely on `next.config` rewrites for Flask—the comment in [`web/next.config.ts`](../web/next.config.ts) states rewrites are baked at build time; the proxy route reads env at **request time**.

### B. Direct browser → Flask (split origins)

1. Set **`NEXT_PUBLIC_API_URL`** to the Flask public base (e.g. `https://api.example.com`).
2. The Axios client in [`web/src/lib/api.ts`](../web/src/lib/api.ts) calls Flask directly.
3. Flask must allow the Next origin via **`CORS_ORIGINS`** (and clients still send **`X-API-Key`** if the API is key-protected).

---

## 3. Repository layout (hosting-relevant)

### Flask API and Python package

| Area | Purpose |
|------|---------|
| [`api/app.py`](../api/app.py) | Flask application factory / routes |
| [`api/__main__.py`](../api/__main__.py) | `python -m api` dev server |
| [`services/`](../services/) | Business logic: market data, optimizer, IBM Quantum, auth, etc. |
| [`core/`](../core/), [`methods/`](../methods/) | Optimization engines, QUBO/VQE/QAOA paths |
| [`pyproject.toml`](../pyproject.toml) | Package metadata; dynamic deps from **`deps/requirements-vercel.txt`** (for slim installs) |
| [`deps/requirements.txt`](../deps/requirements.txt) | **Full** local/CI/Fly/Docker API image: scientific stack, tests, optional Braket, plotting, etc. |
| [`deps/requirements-vercel.txt`](../deps/requirements-vercel.txt) | **Trimmed** API deps for Vercel serverless bundle limits; IBM Quantum pins included |
| [`Dockerfile.fly`](../Dockerfile.fly) | Production API image: `gunicorn`, port **5000** |
| [`fly.toml`](../fly.toml) (repo root) | Fly.io app for **API** only |

### Next.js app

| Area | Purpose |
|------|---------|
| [`web/package.json`](../web/package.json) | Node **20.x**; scripts: `dev`, `build`, `start` |
| [`web/next.config.ts`](../web/next.config.ts) | **`output: "standalone"`** for Docker/Fly |
| [`web/src/app/`](../web/src/app/) | App Router pages and layouts |
| [`web/src/app/api/[[...path]]/route.ts`](../web/src/app/api/[[...path]]/route.ts) | Server-side Flask proxy |
| [`web/src/lib/api.ts`](../web/src/lib/api.ts) | Typed HTTP client, `X-API-Key`, `X-Tenant-Id` |
| [`web/Dockerfile`](../web/Dockerfile) | Multi-stage build → standalone `node server.js` on **3000** |
| [`web/fly.toml`](../web/fly.toml) | Fly.io app for **web** only |

---

## 4. Dependencies

### Python (backend)

| File | When to use |
|------|-------------|
| **`deps/requirements.txt`** | Local dev, CI, **Fly API** (`Dockerfile.fly`), full features |
| **`deps/requirements-vercel.txt`** | **Vercel Python** project at repo root (`vercel.json` installCommand + `pip install .`) |
| **`deps/requirements-ibm-quantum.txt`** | Reference pins for IBM stack; overlaps with vercel pins |

Install pattern for local development (from repo root):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r deps/requirements.txt
pip install -e .
```

Runtime entry: **`python -m api`** (binds per `PORT`, default 5000).

### Node.js (Next.js `web/`)

Declared in [`web/package.json`](../web/package.json):

- **Engine:** `node`: **20.x**
- **Core:** `next` ^16, `react` ^19, `react-dom` ^19
- **UI / data:** `axios`, `recharts`, `react-icons`, `sonner`
- **Tooling:** TypeScript, ESLint, Tailwind, Vitest (dev)

Install:

```bash
cd web && npm ci   # or npm install
```

Production build:

```bash
cd web && npm run build && npm start
```

Docker/Fly uses **`npm ci`** and copies **standalone** output per [`web/Dockerfile`](../web/Dockerfile).

---

## 5. Environment variables (hosting checklist)

| Variable | Where | Purpose |
|----------|--------|---------|
| **`API_KEY`** | Flask | Shared secret; required if API enforces key auth |
| **`NEXT_PUBLIC_API_KEY`** | Next **build** | Same value as `API_KEY`; embedded in browser bundle for `X-API-Key` |
| **`API_PROXY_TARGET`** | Next **runtime** | Flask base URL for server-side proxy (e.g. `http://<api-app>.internal:5000` on Fly) |
| **`NEXT_PUBLIC_API_URL`** | Next **build** | If set, browser talks to Flask directly; leave empty for same-origin `/api` proxy |
| **`CORS_ORIGINS`** | Flask | Required for direct browser→Flask when origins differ |
| **`TIINGO_API_KEY`**, **`DATA_PROVIDER`** | Flask | Market data (see `.env.example`) |
| IBM / tenant secrets | Flask + DB | Documented in IBM and integration guides |

Fly note: **`NEXT_PUBLIC_*`** changes require a **rebuild** of the Next image; **`API_PROXY_TARGET`** is runtime (Fly secrets).

---

## 6. Common hosting topologies

### Fly.io (two apps)

- **API:** deploy from repo root with root [`fly.toml`](../fly.toml) and [`Dockerfile.fly`](../Dockerfile.fly); internal port **5000**.
- **Web:** deploy with context **`web/`** (see comments in [`web/fly.toml`](../web/fly.toml)); set **`API_PROXY_TARGET`** to the API’s **private** URL (`http://<api-app-name>.internal:5000`).
- Pass **`NEXT_PUBLIC_API_KEY`** as a **Docker build-arg** so it matches **`API_KEY`** on the API app.

### Vercel (two projects)

- **API project:** repo root; `vercel.json` installs **`deps/requirements-vercel.txt`** and the package—watch serverless bundle size (~245 MB uncompressed limit).
- **Web project:** Root Directory **`web`**. Either proxy (empty `NEXT_PUBLIC_API_URL`, set **`API_PROXY_TARGET`** to the **public HTTPS** API base) or direct URL + CORS—see [VERCEL_TWO_PROJECTS.md](VERCEL_TWO_PROJECTS.md) and [VERCEL_WIRE_NEXT_API.md](VERCEL_WIRE_NEXT_API.md).

### Same machine (VM, Docker Compose, single host)

- Run gunicorn/Flask on **5000** and Next (standalone or `next start`) on **3000**.
- Point **`API_PROXY_TARGET=http://127.0.0.1:5000`** at the Next process; leave **`NEXT_PUBLIC_API_URL`** empty for same-origin API calls.

---

## 7. Operational surfaces

- **API health:** `GET /api/health` (used by Fly checks and operators).
- **OpenAPI:** `GET /api/docs/openapi` when the API is running.
- **Next health:** Fly config in [`web/fly.toml`](../web/fly.toml) uses **`GET /health`** for the web app (root `/` may redirect).

---

## 8. Related docs

| Document | Topic |
|----------|--------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Env vars, same-host vs split-host, production build commands |
| [FLY_DEPLOY.md](FLY_DEPLOY.md) | Fly two-app wiring, secrets, volumes |
| [VERCEL_TWO_PROJECTS.md](VERCEL_TWO_PROJECTS.md) | Vercel API + Next wiring |
| [GETTING_STARTED.md](GETTING_STARTED.md) | Local install and run |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Broader system architecture (includes legacy CRA) |

---

## 9. Summary

- **Host two things:** a **Flask** service (`api` + `services` + `core`/`methods`) and a **Next.js 16** app in **`web/`** with **standalone** output for containers.
- **Wire them** either with Next’s **server proxy** (`API_PROXY_TARGET`, empty `NEXT_PUBLIC_API_URL`) or **direct** HTTPS calls (`NEXT_PUBLIC_API_URL` + `CORS_ORIGINS`).
- **Dependencies:** Python **≥3.11** + `deps/requirements.txt` (full) or `deps/requirements-vercel.txt` (Vercel API); Node **20** + `web/package.json` for the UI.
