# Vercel: API + Next.js (two projects)

Use **two Vercel projects** from the same GitHub repo: one for the **Flask API** (Python) and one for the **Next.js dashboard** (`web/`). Wire the dashboard to the API with **either** **`NEXT_PUBLIC_API_URL`** (direct calls + **`CORS_ORIGINS`** on Flask) **or** an empty public URL + **`API_PROXY_TARGET`** (same-origin `/api/*` proxied by Next; no CORS for browser→API).

**Step-by-step wiring (dashboard 404 / API Unknown):** **[VERCEL_WIRE_NEXT_API.md](VERCEL_WIRE_NEXT_API.md)** — set env on Project A and B, redeploy, verify `/api/health` from the Next origin.

---

## Project A — Python API only

| Setting | Value |
|--------|--------|
| **Root Directory** | Repository root (`.`) |
| **Framework** | Vercel Python / auto-detect from `pyproject.toml` |
| **Install** | `vercel.json` → `pip install -r deps/requirements-vercel.txt && pip install .` (IBM/Qiskit included); root `deps/requirements.txt` is for CI/local, not Vercel’s default pip step |
| **Upload size** | Root **`.vercelignore`** excludes **`web/`**, **`frontend/`**, tests, notebooks, etc., so the API deployment does not upload Next/CRA build output (~GB). **`vercel.json` → `functions.*.excludeFiles`** adds a second layer for the Python bundle. |

**Environment variables (Production / Preview as needed)**

| Variable | Purpose |
|----------|---------|
| `API_KEY` | Shared secret; clients send `X-API-Key` |
| `TIINGO_API_KEY` | Live market data (optional; can use `DATA_PROVIDER=yfinance` for smoke) |
| `API_DB_PATH` | Optional; serverless defaults to `/tmp/api.sqlite3` when `VERCEL` / `VERCEL_ENV` apply (see `api/app.py`) |
| `CORS_ORIGINS` | **Required** if the dashboard is on a **different origin** than this API. Comma-separated list of allowed UI origins, e.g. `https://your-dashboard.vercel.app` |
| `DASHBOARD_PUBLIC_URL` | Optional. If set (e.g. `https://<project-b>.vercel.app`), included in **`GET /`** JSON so humans opening the **API** URL see where the Next UI lives. |

**Humans vs API URL:** Share the **Next** project URL (Project B) for the dashboard. Project A is the REST API; **`GET https://<project-a>.vercel.app/`** returns a small JSON discovery document (not the React UI).

**Smoke test**

```bash
curl -sS "https://<project-a>.vercel.app/api/health"
```

Use `-H "X-API-Key: $API_KEY"` if your deployment requires it.

---

## Project B — Next.js (`web/`)

| Setting | Value |
|--------|--------|
| **Root Directory** | `web` |
| **Framework** | Next.js (auto) |
| **Node.js Version** (Settings → General) | **20.x** — matches `web/package.json` **`engines`** and **`web/.nvmrc`** |

Use **one** of the two patterns below (both are valid on Vercel).

### Option 1 — Browser calls API directly (cross-origin)

The dashboard and API are different origins; the browser talks to Project A’s URL. **Flask must allow the dashboard origin** via `CORS_ORIGINS`.

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_API_URL` | Project A base URL, **no trailing slash**, e.g. `https://<project-a>.vercel.app` |
| `NEXT_PUBLIC_API_KEY` | Same secret as Project A’s `API_KEY` |

Do **not** set `NEXT_PUBLIC_API_URL` to Project B’s URL.

### Option 2 — Same-origin via Next rewrites (no CORS for browser→API)

Leave `NEXT_PUBLIC_API_URL` **empty** so Axios uses relative `/api/*` against Project B. **`next.config.ts`** rewrites those to `API_PROXY_TARGET`. On Vercel, set **`API_PROXY_TARGET`** to Project A’s base URL (same as Option 1’s URL, no trailing slash)—**not** `http://127.0.0.1:5000`.

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_API_URL` | *(empty)* |
| `NEXT_PUBLIC_API_KEY` | Same as Project A’s `API_KEY` (still sent from the browser to `/api/*` on Project B; Next proxies to A) |
| `API_PROXY_TARGET` | `https://<project-a>.vercel.app` |

The browser only sees Project B’s origin; **Flask `CORS_ORIGINS` does not need** the dashboard origin for this path (server-side proxy to A). You still need `API_KEY` / `NEXT_PUBLIC_API_KEY` aligned.

---

## Two Vercel projects — do not reuse one project for both

Link **`vercel link`** from **repo root** to **Project A** (API) and from **`web/`** to a **different** Vercel project name (e.g. `…-api` vs `…-web`). If `web/` is linked to the same project as the API, builds and env are wrong.

---

## CORS checklist (Option 1 only)

1. Deploy Project A; copy its production URL.
2. Deploy Project B with `NEXT_PUBLIC_API_URL` = that URL (Option 1).
3. On **Project A**, set `CORS_ORIGINS` to Project B’s origin(s), comma-separated, e.g.  
   `https://quantum-dashboard.vercel.app`  
   Include preview URLs if needed.

**Option 2:** skip CORS for dashboard→API (use `API_PROXY_TARGET` on B instead). Flask’s `CORS_ORIGINS` is read at startup (`api/app.py`). After changing env, redeploy the affected project.

---

## Production env vs local `web/.env.local`

Vercel does **not** deploy `.env.local`. Set **[Option 1 or 2](#option-1--browser-calls-api-directly-cross-origin)** variables in the **web** project on Vercel (and API vars in the **API** project). For a checklist and Node parity notes, open **[VERCEL_CLI.md](VERCEL_CLI.md)** and find **§ 4b — Local .env.local vs Vercel (production parity)**. If your viewer hides section numbers or strips heading anchors, search that file for **4b** or **production parity** (no URL fragment required).

---

## Terminal / CLI (no dashboard)

See **[docs/VERCEL_CLI.md](VERCEL_CLI.md)** — `vercel link`, `vercel env`, deploy scripts (`scripts/vercel-deploy-*.sh`), and VS Code tasks.

---

## Related

- [DEPLOYMENT.md](DEPLOYMENT.md) — general env and split-host notes
- [VERCEL_CLI.md](VERCEL_CLI.md) — CLI + IDE workflow
- [AGENTS.md](../AGENTS.md) — local ports and proxy behavior
