# Vercel: terminal + IDE workflow

Do **one-time** linking and env setup from the shell; then use the helper scripts or **`npx vercel`** for deploys. The Vercel dashboard is optional for routine work.

**Requirements:** Node/npm (for `npx vercel`), and a Vercel account (`vercel login`).

---

## 1. Install / run the CLI

No global install required:

```bash
npx vercel@latest --version
```

Optional global install: `npm i -g vercel`.

---

## 2. Log in (once per machine)

```bash
npx vercel@latest login
```

---

## 3. Link two projects (once per clone / machine)

Each directory gets its **own** Vercel project (`.vercel/` is gitignored).

**Project A — API (repo root)**

```bash
cd /path/to/quantum-hybrid-portfolio
npx vercel@latest link
```

- Scope: your team
- Link to existing project **or** create a new one (e.g. `quantum-hybrid-portfolio-api`)

**Project B — Next (`web/`)**

```bash
cd web
npx vercel@latest link
```

- Create/link a **different** project (e.g. `quantum-hybrid-portfolio-web`)

Deploying from `web/` means Vercel uses **`web/`** as the app root—no dashboard “Root Directory” setting required.

---

## 4. Environment variables (CLI)

Set variables **from the same directory** you linked: **repo root** (Flask/API Vercel project) vs **`web/`** (Next Vercel project). The Python package lives under `api/` in the repo, but **`vercel link` and `vercel env`** for the API use the **repository root**, not `api/`.

**API (repo root)**

```bash
cd /path/to/quantum-hybrid-portfolio
npx vercel@latest env add API_KEY production
npx vercel@latest env add CORS_ORIGINS production
npx vercel@latest env add CORS_ORIGINS preview
```

**Web (`web/`)** — pick **one** pattern (see [VERCEL_TWO_PROJECTS.md](VERCEL_TWO_PROJECTS.md)):

*Option 1 — direct API (needs `CORS_ORIGINS` on the API project):*

```bash
cd web
npx vercel@latest env add NEXT_PUBLIC_API_URL production
npx vercel@latest env add NEXT_PUBLIC_API_KEY production
```

*Option 2 — proxy via Next (`NEXT_PUBLIC_API_URL` empty, set `API_PROXY_TARGET` to the API base URL):*

```bash
cd web
npx vercel@latest env add API_PROXY_TARGET production
npx vercel@latest env add NEXT_PUBLIC_API_KEY production
```

**List / pull**

```bash
npx vercel@latest env ls
npx vercel@latest env pull .env.local
```

**Caution:** `env pull` **overwrites** `.env.local`. Keys that exist only locally but not in Vercel (e.g. `NEXT_PUBLIC_*`) can be **removed**. Restore them from [web/.env.example](../web/.env.example) or re-add with `vercel env add`.

For Option 1, `CORS_ORIGINS` on the API must list the dashboard origin(s). After changing API env, redeploy the API.

---

## 4b. Local .env.local vs Vercel (production parity)

*If your viewer hides section numbers, search this file for **production parity**.*

| | Local dev | Vercel Production / Preview |
|--|-----------|-----------------------------|
| **Source of truth** | `web/.env.local` (gitignored) | **Environment Variables** in the Vercel project (or `vercel env add`) |
| **After `git push`** | N/A | Runtime and **`NEXT_PUBLIC_*` at build time** come from **Vercel**, not your laptop |

- A successful **`npm run build`** on your machine does **not** prove Production env is set on Vercel.
- Before relying on a deploy, from **`web/`** run **`npx vercel@latest env ls`** and confirm **Production** (and **Preview** if you use it) has **`NEXT_PUBLIC_API_KEY`** and either **Option 1** (`NEXT_PUBLIC_API_URL`) or **Option 2** (`API_PROXY_TARGET`, no `NEXT_PUBLIC_API_URL`).
- From **repo root**, confirm the API project has **`API_KEY`**, **`CORS_ORIGINS`** (if Option 1), etc.

**Node version:** `web/package.json` declares **`engines.node`** (`20.x`). In the **web** Vercel project, open **Settings → General → Node.js Version** and choose **20.x** so the dashboard matches `engines` and `web/.nvmrc`. For local parity, run **`nvm use`** in **`web/`** (reads **`.nvmrc`**) before `npm run build`.

---

## 5. Deploy (production)

From repo root:

```bash
chmod +x scripts/vercel-deploy-api.sh scripts/vercel-deploy-web.sh
./scripts/vercel-deploy-api.sh
./scripts/vercel-deploy-web.sh
```

Or manually:

```bash
cd /path/to/quantum-hybrid-portfolio && npx vercel@latest deploy --prod
cd web && npx vercel@latest deploy --prod
```

**Override CLI binary** (e.g. global `vercel`):

```bash
VERCEL_BIN=vercel ./scripts/vercel-deploy-api.sh
```

---

## 6. Git → automatic builds

Connect the GitHub repo to **each** Vercel project (Settings → Git in the dashboard, or Vercel API). Pushes to `main` trigger builds without the CLI.

---

## 7. IDE (VS Code / Cursor)

Use **Terminal → Run Task** → *Vercel: Deploy API (prod)*, *Vercel: Deploy Web (prod)*, or *Vercel: Login* (see `.vscode/tasks.json`).

---

## Related

- [VERCEL_TWO_PROJECTS.md](VERCEL_TWO_PROJECTS.md) — architecture and env meanings
- [VERCEL_WIRE_NEXT_API.md](VERCEL_WIRE_NEXT_API.md) — **order-of-operations** env for Project A + B (fixes `/api/*` 404 on the dashboard); recovery: **`scripts/vercel-option2-env.sh`**
- [DEPLOYMENT.md](DEPLOYMENT.md) — general deployment notes

**Local Python tests / CI:** Full **`pytest`** needs a virtualenv and `pip install -r deps/requirements.txt` (PEP 668 systems should not install into the system Python). Disposable dirs like **`.venv-ci/`** are gitignored alongside **`.venv/`**. On push to **`main`**, **`.github/workflows/ci.yml`** runs backend tests, **`web/`** lint/build, and the legacy CRA job—use that as the reference for green CI.
