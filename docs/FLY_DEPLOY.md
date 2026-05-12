# Fly.io two-app deploy (Flask API + Next `web/`)

This project deploys as **two separate Fly apps** that communicate over Fly's private network:

- **App A** — Flask API (`api.app`), port 5000, built from `deploy/docker/Dockerfile.fly` (build context: repo root).
- **App B** — Next.js web UI (`web/`), port 3000, built from `web/Dockerfile`.

The browser only talks to the **Next** hostname. `web/next.config.ts` rewrites `/api/*` to the Flask API via `API_PROXY_TARGET`, so no browser-level CORS to Flask is needed.

```
Browser  ──HTTPS──►  App B (Next, fly.dev)  ──private .internal──►  App A (Flask, .internal:5000)
```

---

## 0. Prerequisites

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Authenticate
fly auth login
```

---

## 1. Create the two Fly apps

```bash
fly apps create <your-api-app-name>    # e.g. quantum-api
fly apps create <your-web-app-name>    # e.g. quantum-web
```

Note both names — they must match `app = '...'` in `fly.toml` and `web/fly.toml`.

---

## 2. App A — Flask API

### 2a. Update `fly.toml`

Edit `fly.toml` at repo root and set:

```toml
app = '<your-api-app-name>'
primary_region = 'ord'   # change to region closest to your users
```

### 2b. Set secrets

```bash
fly secrets set \
  API_KEY=<strong-random-secret> \
  TIINGO_API_KEY=<your-tiingo-key> \
  --app <your-api-app-name>
```

Optional IBM Quantum credentials (needed for VQE/QAOA hardware paths):

```bash
fly secrets set \
  IBM_QUANTUM_TOKEN=<your-ibm-token> \
  --app <your-api-app-name>
```

Optional SQLite persistence (uncomment `[[mounts]]` in `fly.toml` first, then create the volume):

```bash
fly volumes create quantum_data --region ord --size 1 --app <your-api-app-name>
fly secrets set API_DB_PATH=/data/api.sqlite3 --app <your-api-app-name>
```

### 2c. Deploy

```bash
# From repo root
fly deploy --config fly.toml
```

### 2d. Smoke test

```bash
curl -sS https://<your-api-app-name>.fly.dev/api/health
# Expected: {"status": "healthy", ...}
```

---

## 3. App B — Next.js web

### 3a. Update `web/fly.toml`

Edit `web/fly.toml` and set:

```toml
app = '<your-web-app-name>'
primary_region = 'ord'   # match App A's region so .internal traffic is fast
```

### 3b. Web app environment

**`API_PROXY_TARGET`** — Must point to the Flask API using Fly's **private network DNS**: `http://<api-app-name>.internal:5000` (no trailing slash). The checked-in **`web/fly.toml`** sets a default under **`[env]`** matching **`app`** in the repo root **`fly.toml`**. Override with **`fly secrets set`** if your API app name differs (secrets override `[env]`):

```bash
fly secrets set API_PROXY_TARGET=http://<your-api-app-name>.internal:5000 --app <your-web-app-name>
```

**`NEXT_PUBLIC_API_KEY`** — Must match **`API_KEY`** on the API app and is **inlined when the client bundle is built**. Fly **secrets** are not available to `npm run build`; pass a **build arg** on deploy:

```bash
fly deploy ./web --config fly.toml --app <your-web-app-name> \
  --build-arg NEXT_PUBLIC_API_KEY=<same-value-as-API_KEY-on-api-app>
```

`NEXT_PUBLIC_API_URL` should be **left unset** (or empty) for same-origin `/api/*` through Next. The browser never calls Flask directly unless you use Option 1 (direct URL + CORS).

### 3c. Deploy

Fly’s **build context** is the working directory you pass to `fly deploy` (default: current directory). From repo root, `fly deploy --config web/fly.toml` still uses the **repo root** as context, so `web/Dockerfile`’s `COPY package.json` fails. Always pass **`./web`** first:

```bash
# From repo root (recommended)
fly deploy ./web --config fly.toml --app <your-web-app-name>
```

Or from inside `web/`:

```bash
cd web
fly deploy
```

### 3d. Verify end-to-end

1. Open `https://<your-web-app-name>.fly.dev` in a browser.
2. Open DevTools → Network → reload.
3. `/api/health` should return **200** JSON.
4. The Settings page should show API **Online**.

---

## Environment variable reference

### App A (Flask API)

| Variable | Required | Notes |
|----------|----------|-------|
| `API_KEY` | Yes | Shared secret; must match `NEXT_PUBLIC_API_KEY` on App B |
| `TIINGO_API_KEY` | Recommended | Set `DATA_PROVIDER=tiingo` when present |
| `IBM_QUANTUM_TOKEN` | Optional | Enables VQE/QAOA hardware paths |
| `API_DB_PATH` | Optional | Default `/tmp/api.sqlite3`; set to `/data/api.sqlite3` with a volume for persistence |
| `CORS_ORIGINS` | Optional | Only needed if browser calls API directly (not via Next proxy) |

### App B (Next.js web)

| Variable | Required | Notes |
|----------|----------|-------|
| `API_PROXY_TARGET` | Yes | **Runtime** (`fly secrets` on web app). Pattern: `http://<api-app>.internal:5000` |
| `NEXT_PUBLIC_API_KEY` | Yes | **Build-time** (`--build-arg`); same value as `API_KEY` on App A |
| `NEXT_PUBLIC_API_URL` | No | Leave unset when using the `/api` proxy (Option 2) |

---

## Local Docker smoke test (before deploying)

```bash
# Build and run API locally
docker build -f deploy/docker/Dockerfile.fly -t quantum-api-fly .
docker run --rm -p 5000:5000 -e API_KEY=dev quantum-api-fly
curl http://localhost:5000/api/health

# Build and run Next locally (assumes API is running on 5000)
docker build -f web/Dockerfile -t quantum-web-fly web/ \
  --build-arg NEXT_PUBLIC_API_KEY=dev
docker run --rm -p 3000:3000 \
  -e API_PROXY_TARGET=http://host.docker.internal:5000 \
  quantum-web-fly
# Then open http://localhost:3000 and check /api/health in DevTools
```

---

## Updating after code changes

```bash
# API (from repo root)
fly deploy --config fly.toml

# Web — use ./web as build context (see §3c)
fly deploy ./web --config fly.toml
```

Both apps can be deployed independently. The private `.internal` DNS is stable as long as the app name does not change.

---

## Troubleshooting

**Health checks never pass / deploy times out**

The app’s root **`/`** redirects to **`/dashboard`** (HTTP **307**). Fly’s HTTP checks require **2xx** responses, so **`path = '/'`** fails. This repo uses **`path = '/health'`** in `web/fly.toml`, served by `web/src/app/health/route.ts`.

**Docker build fails on `COPY package.json package-lock.json` (or `useradd: UID 1000 is not unique`)**

You are building with the **wrong context** (usually repo root) or an **old cached Dockerfile**. From repo root:

```bash
fly deploy ./web --config fly.toml --app <your-web-app-name>
```

Not `fly deploy --config web/fly.toml` alone. See [Monorepo and multi-environment deployments](https://fly.io/docs/reference/monorepo/).

**Fly Doctor: “App is not listening on internal_port 7860” or 502 Bad Gateway**

The **API** app (`deploy/docker/Dockerfile.fly`) binds gunicorn to **`0.0.0.0:5000`**. `fly.toml` must use **`internal_port = 5000`** (do not use a shell `$$PORT` bind — it breaks as `638PORT` etc.).

- **7860** is only for **Hugging Face** / `deploy/docker/Dockerfile` + `serve_hf.py`, not for Fly’s API deploy.
- If the dashboard or an old `fly launch` set **internal_port = 7860**, change it to **5000** (or edit `fly.toml` and run `fly deploy`).
- After changing port, redeploy so Fly’s proxy matches the container listen port.

**`/api/health` returns 404 or HTML from the Next app, or logs show `ECONNREFUSED 127.0.0.1:5000`**
→ **`API_PROXY_TARGET`** is missing or still points at localhost. On the **web** app run **`fly secrets set API_PROXY_TARGET=http://<api-app-name>.internal:5000`** and redeploy (no rebuild required unless you change `NEXT_PUBLIC_*`).

**`/api/*` returns 401 from the browser**
→ Rebuild with **`--build-arg NEXT_PUBLIC_API_KEY=...`** matching the API app’s **`API_KEY`** (client bundle is build-time).

**API returns 500 on IBM paths**
→ `IBM_QUANTUM_TOKEN` is not set or token has expired. Re-set the secret and redeploy.

**OOM on API machine**
→ Raise memory in `fly.toml`:

```toml
[[vm]]
  memory = '2gb'
```

Then redeploy. The heavy numpy/qiskit cold start needs at least 1 GB; 2 GB if you use `--preload` with multiple workers.
