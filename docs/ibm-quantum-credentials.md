# IBM Quantum credentials (API token and optional instance CRN)

This project uses **`qiskit-ibm-runtime`** with channel **`ibm_quantum_platform`**. You need a valid **IBM Quantum Platform API token**. If your account requires routing to a **specific service instance** (for example Open Plan), also provide the **instance CRN**—the same value Qiskit accepts as `instance=` in `QiskitRuntimeService` or in `QiskitRuntimeService.save_account()`.

## Safer setup (matches IBM’s flow, without hardcoding secrets)

1. Get a fresh **API key** from the [IBM Quantum Platform](https://quantum.ibm.com/) dashboard (typically a 44-character token).

2. **Optional:** Copy your **instance CRN** from **Instances** in the IBM console (hover → copy) if you need a specific instance.

3. **Local Python / scripts** — set environment variables (never commit literal tokens):

   ```bash
   export QISKIT_IBM_TOKEN="your-token"
   export IBM_CRN="crn:v1:..."   # only if you use a specific instance
   ```

   ```python
   import os
   from qiskit_ibm_runtime import QiskitRuntimeService

   QiskitRuntimeService.save_account(
       token=os.environ["QISKIT_IBM_TOKEN"],
       instance=os.environ.get("IBM_CRN"),  # optional
   )
   ```

   After saving, `QiskitRuntimeService()` can load the account from disk on that machine. **Do not** sync saved account files to public repositories.

4. **This repository (Flask API + Quantum Ledger UI)**  
   - Paste the **API token** and, if required, the **instance CRN** on **Quantum Engine** (`/quantum`).  
   - Use **Verify token** to validate without persisting; then **Connect** to store credentials for the selected **enterprise (tenant)**.  
   - The API stores the token encrypted (when `INTEGRATION_ENCRYPTION_KEY` is set) and stores the optional CRN in **integration metadata** (`tenant_integration_secrets.metadata_json`), not inside the encrypted secret blob.

## API shape

- `POST /api/config/ibm-quantum` — body: `{ "token": "...", "instance": "..." }` (optional field; alias: `"crn"`).
- `POST /api/config/ibm-quantum/verify` — same body; dry-run, does not persist.

## Proxy note

IBM’s documentation: if you use an HTTP proxy, use **Qiskit Runtime v0.44.0+** (this repo pins versions in `deps/requirements-ibm-quantum.txt`; install with `pip install -r deps/requirements.txt -r deps/requirements-ibm-quantum.txt`).

## Vercel (API serverless)

The API deploy uses **`deps/requirements-vercel.txt`**, which includes **`qiskit`** / **`qiskit-ibm-runtime`** with the same pins as **`deps/requirements-ibm-quantum.txt`**. **`vercel.json`** sets **`installCommand`** so Vercel runs **`pip install -r deps/requirements-vercel.txt`** (the root **`deps/requirements.txt`** alone does not install IBM packages). Redeploy the API project after dependency changes. If the install exceeds Vercel size/time limits, use a full Docker/VM deployment for IBM-heavy paths or relax pins only after testing compatibility.

## Troubleshooting

- **“Unable to retrieve instances…”** — Usually IBM cannot resolve instances for this login: invalid/expired token, account/plan restrictions, or a missing/wrong **instance CRN** when your account requires one. Regenerate the token, confirm Open Plan / instance access in the IBM portal, and retry **Verify** with an explicit CRN if needed.
- **`qiskit-ibm-runtime` is not installed** on Vercel — ensure the latest **`deps/requirements-vercel.txt`** is deployed and the build succeeded; older slim images omitted IBM packages.
