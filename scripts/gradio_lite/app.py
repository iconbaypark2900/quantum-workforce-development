"""
Gradio lite — Portfolio Lab + Quantum Engine surfaces (parity with Next.js `web/`).

  pip install -r deps/requirements-gradio.txt
  python scripts/gradio_portfolio_demo.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import traceback
import uuid
from typing import Any

_scripts_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

try:
    import gradio as gr
except ImportError:
    print("Install Gradio: pip install -r deps/requirements-gradio.txt", file=sys.stderr)
    sys.exit(1)

from gradio_lite.api_client import (
    IBM_TIMEOUT,
    OPT_TIMEOUT,
    api_request,
    fetch_objective_ids,
    fetch_tenants,
    ibm_workloads,
)
from gradio_lite.optimize_display import (
    PRESET_DEFAULT_10,
    PRESET_MAG7_JPM,
    format_optimize_result,
    format_session_strip,
)
from gradio_lite.synthetic_market import build_matrix_optimize_payload


def _tenant_choices(default_base: str, default_key: str) -> list[tuple[str, str]]:
    pairs = fetch_tenants(default_base, default_key, "")
    return [(a, b) for a, b in pairs] or [("default", "Default")]


def _refresh_tenant_dropdown(api_b: str, api_key: str) -> Any:
    pairs = fetch_tenants(api_b, api_key, "")
    ch = [(a, b) for a, b in pairs] or [("default", "Default")]
    return gr.update(choices=ch, value=ch[0][0])


def _optimize_run(
    mode: str,
    api_b: str,
    api_key: str,
    tenant_id: str,
    n_assets: float,
    regime: str,
    seed: float,
    objective: str,
    weight_min: float,
    max_weight: float,
    k: str,
    k_screen: str,
    k_select: str,
    tickers_csv: str,
    start_d: str,
    end_d: str,
) -> tuple[Any, ...]:
    tid = (tenant_id or "").strip()
    try:
        if mode == "Simulated":
            n = max(4, min(int(n_assets), 40))
            sd = int(seed) if seed else 42
            payload = build_matrix_optimize_payload(
                n, regime, sd, objective, float(weight_min), float(max_weight), k, k_screen, k_select
            )
            ok, body = api_request(
                "POST",
                api_b,
                "/api/portfolio/optimize",
                api_key,
                tid,
                json_body=payload,
                timeout=OPT_TIMEOUT,
            )
            n_uni = n
            mode_lbl = "simulated"
        else:  # Live tickers
            parts = [t.strip().upper() for t in tickers_csv.replace(";", ",").split(",") if t.strip()]
            if len(parts) < 2:
                disp = format_optimize_result({"error": {"message": "Enter at least two tickers."}})
                strip = format_session_strip(objective, "live", 0, float(weight_min), float(max_weight))
                return (
                    disp["kpi_html"],
                    disp["holdings_rows"],
                    disp["sector_rows"],
                    disp["perf_md"],
                    disp["risk_md"],
                    disp["sensitivity_md"],
                    disp["raw_json"],
                    "`LIVE`",
                    strip,
                )
            payload = {
                "tickers": parts,
                "start_date": start_d.strip() or None,
                "end_date": end_d.strip() or None,
                "objective": objective,
                "weight_min": float(weight_min),
                "maxWeight": float(max_weight),
                "seed": int(seed) if seed else 42,
            }
            if k.strip():
                try:
                    payload["K"] = int(k)
                except ValueError:
                    pass
            if k_screen.strip():
                try:
                    payload["K_screen"] = int(k_screen)
                except ValueError:
                    pass
            if k_select.strip():
                try:
                    payload["K_select"] = int(k_select)
                except ValueError:
                    pass
            ok, body = api_request(
                "POST",
                api_b,
                "/api/portfolio/optimize",
                api_key,
                tid,
                json_body=payload,
                timeout=OPT_TIMEOUT,
            )
            n_uni = len(parts)
            mode_lbl = "live"

        disp = format_optimize_result(body)

        strip = format_session_strip(objective, mode_lbl, n_uni, float(weight_min), float(max_weight))
        badge = "`SIM`" if mode == "Simulated" else "`LIVE`"
        return (
            disp["kpi_html"],
            disp["holdings_rows"],
            disp["sector_rows"],
            disp["perf_md"],
            disp["risk_md"],
            disp["sensitivity_md"],
            disp["raw_json"],
            badge,
            strip,
        )
    except Exception:
        err = traceback.format_exc()
        disp = format_optimize_result({"error": {"message": err}})
        strip = format_session_strip(objective, "—", 0, float(weight_min), float(max_weight))
        return (
            disp["kpi_html"],
            [],
            [],
            disp.get("perf_md", ""),
            disp.get("risk_md", ""),
            disp.get("sensitivity_md", ""),
            err[:8000],
            "`ERR`",
            strip,
        )


def _ibm_status_block(api_b: str, api_key: str, tenant_id: str) -> tuple[str, str]:
    ok, body = api_request(
        "GET",
        api_b,
        "/api/config/ibm-quantum/status",
        api_key,
        (tenant_id or "").strip(),
        timeout=60.0,
    )
    if not ok:
        return json.dumps(body, indent=2), ""
    ctx = body.get("integration_context") or {}
    line = (
        f"**Server context** — tenant `{ctx.get('tenant_id', '—')}` · "
        f"DB `{ctx.get('api_db_basename', '—')}` · "
        f"secrets persist: **{'yes' if ctx.get('secrets_persistence') else 'no'}** · "
        f"IBM **{'connected' if body.get('configured') else 'not connected'}**"
    )
    return json.dumps(body, indent=2), line


def _workloads_table(api_b: str, api_key: str, tenant_id: str) -> str:
    ok, data = ibm_workloads(api_b, api_key, (tenant_id or "").strip(), 20)
    if not ok:
        return f"**Workloads error**\n\n```\n{json.dumps(data, indent=2)}\n```"
    workloads = (data or {}).get("workloads") or []
    if not workloads:
        return "*No recent IBM Runtime workloads (or not connected).*"
    lines = ["| Job | Backend | Status | Created |", "|---|---|---|---|"]
    for w in workloads[:25]:
        if not isinstance(w, dict):
            continue
        lines.append(
            f"| `{w.get('job_id', '')[:12]}…` | {w.get('backend', '—')} | {w.get('status', '—')} | {w.get('created', '—')} |"
        )
    return "\n".join(lines)


def build_app(default_base: str, default_key: str) -> gr.Blocks:
    t_choices = _tenant_choices(default_base, default_key)
    t_val = t_choices[0][0]

    with gr.Blocks(title="Quantum Ledger — Lite (Gradio)") as demo:
        gr.Markdown(
            "## Quantum Ledger — **Lite** (Gradio)\n"
            "Same **Flask API** as the Next.js `web/` app. "
            "Configure the API once, pick **tenant**, then use **Portfolio Lab** or **Quantum Engine**."
        )

        with gr.Row():
            api_base = gr.Textbox(label="API base URL", value=default_base, scale=2)
            api_key_in = gr.Textbox(label="X-API-Key (optional)", value=default_key, type="password", scale=1)

        with gr.Row():
            tenant_dd = gr.Dropdown(
                label="Enterprise (tenant)",
                choices=t_choices,
                value=t_val,
                scale=2,
                allow_custom_value=True,
            )
            refresh_tenants_btn = gr.Button("Refresh tenants", size="sm")
            gen_tid = gr.Button("New random tenant id", size="sm")

        def _gen_random_tenant() -> Any:
            nu = str(uuid.uuid4())
            return gr.update(value=nu)

        gen_tid.click(fn=_gen_random_tenant, outputs=tenant_dd)

        refresh_tenants_btn.click(
            fn=_refresh_tenant_dropdown,
            inputs=[api_base, api_key_in],
            outputs=tenant_dd,
        )

        main = gr.Tabs()
        with main:
            # ─── Portfolio Lab ─────────────────────────────────────────────
            with gr.Tab("Portfolio Lab"):
                gr.Markdown(
                    "### Quantum Portfolio Lab\n"
                    "*Hybrid optimization dashboard (lite)* — **Simulated** = matrix path (SIM); "
                    "**Live tickers** = server fetch (LIVE)."
                )
                session_strip_pl = gr.Markdown("*Session strip updates after each run.*")

                with gr.Row():
                    with gr.Column(scale=5, min_width=320):
                        gr.Markdown("#### Data universe")
                        data_mode = gr.Radio(
                            choices=["Simulated", "Live tickers"],
                            value="Simulated",
                            label="Mode",
                        )
                        with gr.Group():
                            gr.Markdown("*Universe presets*")
                            with gr.Row():
                                preset_m7 = gr.Button("Mag 7 + JPM", size="sm")
                                preset_10 = gr.Button("Default 10", size="sm")
                        with gr.Group(visible=True) as sim_panel:
                            n_assets = gr.Slider(4, 30, value=10, step=1, label="Universe size (simulated)")
                            regime = gr.Dropdown(
                                choices=["normal", "bull", "bear", "volatile"],
                                value="normal",
                                label="Market regime",
                            )
                            seed = gr.Number(value=42, label="Seed", precision=0)
                        with gr.Group(visible=False) as live_panel:
                            tickers = gr.Textbox(
                                label="Tickers (comma-separated)",
                                value=PRESET_DEFAULT_10.replace(",", ", "),
                            )
                            start_d = gr.Textbox(label="Start date (YYYY-MM-DD)", value="")
                            end_d = gr.Textbox(label="End date (YYYY-MM-DD)", value="")

                        gr.Markdown("#### Optimizer")
                        objective = gr.Dropdown(
                            label="Objective",
                            choices=fetch_objective_ids(default_base, default_key, ""),
                            value="hybrid",
                        )
                        ref_obj = gr.Button("Refresh objectives", size="sm")
                        with gr.Row():
                            wmin = gr.Number(value=0.005, label="weight_min", precision=4)
                            wmax = gr.Number(value=0.20, label="maxWeight", precision=2)
                        gr.Markdown("*Optional cardinality (QUBO / hybrid)*")
                        with gr.Row():
                            k = gr.Textbox(label="K", value="")
                            k_screen = gr.Textbox(label="K_screen", value="")
                            k_select = gr.Textbox(label="K_select", value="")

                        run_btn = gr.Button("Run optimization", variant="primary")

                    with gr.Column(scale=8):
                        mode_badge = gr.Markdown("`SIM`")
                        pl_tabs = gr.Tabs()
                        with pl_tabs:
                            with gr.Tab("Portfolio"):
                                kpi_html = gr.HTML()
                                holdings_df = gr.Dataframe(
                                    headers=["Name", "Sector", "Weight %"],
                                    label="Holdings",
                                    interactive=False,
                                )
                                sector_df = gr.Dataframe(
                                    headers=["Sector", "Weight %"],
                                    label="Sector breakdown",
                                    interactive=False,
                                )
                            with gr.Tab("Performance"):
                                perf_md = gr.Markdown()
                            with gr.Tab("Risk"):
                                risk_md = gr.Markdown()
                            with gr.Tab("Sensitivity"):
                                sens_md = gr.Markdown()

                        raw_out = gr.Accordion("Raw JSON", open=False)
                        with raw_out:
                            raw_json = gr.Code(language="json", label="Response")

                def _toggle_mode(m: str):
                    return gr.Group(visible=m == "Simulated"), gr.Group(visible=m == "Live tickers")

                data_mode.change(fn=_toggle_mode, inputs=data_mode, outputs=[sim_panel, live_panel])

                preset_m7.click(lambda: PRESET_MAG7_JPM.replace(",", ", "), outputs=tickers)
                preset_10.click(lambda: PRESET_DEFAULT_10.replace(",", ", "), outputs=tickers)

                def _ref_objectives(b: str, k: str, t: str) -> Any:
                    ids = fetch_objective_ids(b, k, t or "")
                    v = ids[0] if ids else "hybrid"
                    return gr.update(choices=ids, value=v)

                ref_obj.click(
                    fn=_ref_objectives,
                    inputs=[api_base, api_key_in, tenant_dd],
                    outputs=objective,
                )

                run_btn.click(
                    fn=_optimize_run,
                    inputs=[
                        data_mode,
                        api_base,
                        api_key_in,
                        tenant_dd,
                        n_assets,
                        regime,
                        seed,
                        objective,
                        wmin,
                        wmax,
                        k,
                        k_screen,
                        k_select,
                        tickers,
                        start_d,
                        end_d,
                    ],
                    outputs=[
                        kpi_html,
                        holdings_df,
                        sector_df,
                        perf_md,
                        risk_md,
                        sens_md,
                        raw_json,
                        mode_badge,
                        session_strip_pl,
                    ],
                )

            # ─── Quantum Engine ────────────────────────────────────────────
            with gr.Tab("Quantum Engine"):
                gr.Markdown(
                    "### Quantum Engine\n"
                    "*IBM Runtime workloads, portfolio jobs, integrations* — lite shell matching Next `/quantum`."
                )
                session_strip_q = gr.Markdown("")
                gr.Markdown(
                    "IBM tokens are stored **per tenant** in the API SQLite DB "
                    "(encrypted when `INTEGRATION_ENCRYPTION_KEY` is set). "
                    "Use the same **Enterprise (tenant)** as Portfolio Lab."
                )

                ibm_tok = gr.Textbox(label="IBM Quantum API token", type="password")
                ibm_crn = gr.Textbox(label="Instance CRN (optional)", placeholder="crn:v1:...")
                server_ctx_md = gr.Markdown("")

                with gr.Row():
                    v_btn = gr.Button("Verify token (no save)")
                    c_btn = gr.Button("Connect (save for tenant)")
                    d_btn = gr.Button("Disconnect")
                    st_btn = gr.Button("Refresh status")

                q_status = gr.Code(language="json", label="IBM status JSON")

                gr.Markdown("#### Smoke test")
                smoke_mode = gr.Radio(choices=["simulator", "hardware"], value="simulator", label="Mode")
                smoke_btn = gr.Button("Run smoke test")

                gr.Markdown("#### IBM Runtime workloads")
                wl_btn = gr.Button("Refresh workloads list")
                wl_md = gr.Markdown()

                q_action_out = gr.Code(language="json", label="Last action result")

                def _verify(api_b: str, key: str, tid: str, tok: str, crn: str) -> tuple[str, str, str]:
                    if not tok.strip():
                        return "{}", "", json.dumps({"ok": False, "error": "Token required"}, indent=2)
                    body = {"token": tok.strip()}
                    if crn.strip():
                        body["instance"] = crn.strip()
                    ok, out = api_request(
                        "POST",
                        api_b,
                        "/api/config/ibm-quantum/verify",
                        key,
                        (tid or "").strip(),
                        json_body=body,
                        timeout=IBM_TIMEOUT,
                    )
                    pretty = json.dumps(out, indent=2) if ok else json.dumps({"ok": False, "error": out}, indent=2)
                    st_json, ctx = _ibm_status_block(api_b, key, tid)
                    return st_json, ctx, pretty

                def _connect(api_b: str, key: str, tid: str, tok: str, crn: str) -> tuple[str, str, str]:
                    if not tok.strip():
                        return "{}", "", json.dumps({"ok": False, "error": "Token required"}, indent=2)
                    body = {"token": tok.strip()}
                    if crn.strip():
                        body["instance"] = crn.strip()
                    ok, out = api_request(
                        "POST",
                        api_b,
                        "/api/config/ibm-quantum",
                        key,
                        (tid or "").strip(),
                        json_body=body,
                        timeout=IBM_TIMEOUT,
                    )
                    pretty = json.dumps(out, indent=2) if ok else json.dumps({"ok": False, "error": out}, indent=2)
                    st_json, ctx = _ibm_status_block(api_b, key, tid)
                    return st_json, ctx, pretty

                def _disconnect(api_b: str, key: str, tid: str) -> tuple[str, str, str]:
                    ok, out = api_request("DELETE", api_b, "/api/config/ibm-quantum", key, (tid or "").strip())
                    pretty = json.dumps(out, indent=2) if ok else json.dumps({"ok": False, "error": out}, indent=2)
                    st_json, ctx = _ibm_status_block(api_b, key, tid)
                    return st_json, ctx, pretty

                def _status_only(api_b: str, key: str, tid: str) -> tuple[str, str, str]:
                    st_json, ctx = _ibm_status_block(api_b, key, tid)
                    return st_json, ctx, st_json

                def _smoke(api_b: str, key: str, tid: str, mode: str) -> str:
                    ok, out = api_request(
                        "POST",
                        api_b,
                        "/api/config/ibm-quantum/smoke-test",
                        key,
                        (tid or "").strip(),
                        json_body={"mode": mode or "simulator"},
                        timeout=IBM_TIMEOUT,
                    )
                    return json.dumps(out, indent=2) if ok else json.dumps({"ok": False, "error": out}, indent=2)

                v_btn.click(
                    fn=_verify,
                    inputs=[api_base, api_key_in, tenant_dd, ibm_tok, ibm_crn],
                    outputs=[q_status, server_ctx_md, q_action_out],
                )
                c_btn.click(
                    fn=_connect,
                    inputs=[api_base, api_key_in, tenant_dd, ibm_tok, ibm_crn],
                    outputs=[q_status, server_ctx_md, q_action_out],
                )
                d_btn.click(
                    fn=_disconnect,
                    inputs=[api_base, api_key_in, tenant_dd],
                    outputs=[q_status, server_ctx_md, q_action_out],
                )
                st_btn.click(
                    fn=_status_only,
                    inputs=[api_base, api_key_in, tenant_dd],
                    outputs=[q_status, server_ctx_md, q_action_out],
                )
                smoke_btn.click(
                    fn=_smoke,
                    inputs=[api_base, api_key_in, tenant_dd, smoke_mode],
                    outputs=q_action_out,
                )
                wl_btn.click(
                    fn=_workloads_table,
                    inputs=[api_base, api_key_in, tenant_dd],
                    outputs=wl_md,
                )

            with gr.Tab("Diagnostics"):
                h_btn = gr.Button("GET /api/health")
                diag_out = gr.Code(language="json")

                def _health_json(b: str, k: str, t: str) -> str:
                    ok, data = api_request("GET", b, "/api/health", k, (t or "").strip(), timeout=30.0)
                    return json.dumps({"ok": ok, "data": data}, indent=2, default=str)

                h_btn.click(
                    fn=_health_json,
                    inputs=[api_base, api_key_in, tenant_dd],
                    outputs=diag_out,
                )

        # Initial session hints
        demo.load(
            fn=lambda: format_session_strip("hybrid", "—", 10, 0.005, 0.20),
            outputs=session_strip_q,
        )

    return demo


def main() -> None:
    p = argparse.ArgumentParser(description="Quantum Ledger Gradio lite (Portfolio Lab + Quantum Engine)")
    p.add_argument("--api-url", default="http://127.0.0.1:5000", help="Flask API base URL")
    p.add_argument("--api-key", default="", help="Optional X-API-Key")
    p.add_argument("--host", default="127.0.0.1", help="Gradio bind address")
    p.add_argument("--port", type=int, default=7861, help="Gradio port")
    p.add_argument("--share", action="store_true", help="Temporary public Gradio link")
    args = p.parse_args()

    app = build_app(args.api_url, args.api_key)
    app.launch(
        server_name=args.host,
        server_port=args.port,
        share=args.share,
        theme=gr.themes.Soft(primary_hue="blue", neutral_hue="slate"),
        css="""
        .gradio-container { max-width: 1280px !important; margin: auto; }
        footer { visibility: hidden; }
        .ql-lite-kpi { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
        .ql-lite-kpi-card {
          flex: 1 1 120px; border: 1px solid #e5e7eb; border-radius: 10px;
          padding: 10px 12px; background: #fafafa;
        }
        .ql-lite-kpi-card.ql-lite-accent { border-color: #93c5fd; background: #eff6ff; }
        .ql-lite-kpi-card.ql-lite-var { border-color: #fecaca; background: #fef2f2; }
        .ql-lite-kpi-label { display: block; font-size: 11px; text-transform: uppercase; color: #64748b; }
        .ql-lite-kpi-val { font-size: 1.35rem; font-weight: 600; color: #0f172a; }
        .ql-lite-err { color: #b91c1c; }
        pre.ql-lite-err { white-space: pre-wrap; font-size: 12px; }
        """,
    )


if __name__ == "__main__":
    main()
