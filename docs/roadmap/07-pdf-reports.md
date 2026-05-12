# 07 — PDF Report Generation

**Priority:** Medium  
**Status:** Missing — JSON and CSV exports exist; PDF generation is listed as deferred in `QUANTUM_LEDGER_MANIFEST.md`  
**Area:** Backend `api/app.py`, `services/`; Frontend `/reports` page

---

## Problem

The `/reports` page exports JSON and CSV blobs from the last optimization run. Institutional users — fund managers, compliance officers, portfolio analysts — expect formatted PDF reports containing:

- Executive summary with portfolio name, date, and objective
- KPI summary table (Sharpe, return, volatility, VaR, CVaR)
- Holdings allocation table
- Sector breakdown
- Equity curve chart image
- Risk metrics and constraint report
- Compliance attestation block (methodology, data source, disclaimer)

Without PDF, every report consumer must perform formatting work downstream. CSV/JSON are intermediary formats, not deliverable documents.

---

## Scope

**In scope:**
- `GET /api/export/report/{run_id}.pdf` — generate and stream a PDF for a given run ID
- PDF rendered server-side using `weasyprint` (HTML→PDF, easier to style than reportlab)
- HTML report template using Jinja2 (consistent with Flask ecosystem)
- Charts embedded as SVG or base64 PNG in the HTML before conversion
- Frontend: "Download PDF" button in the Reports page

**Out of scope:**
- Interactive PDF (form fields, clickable charts)
- Email delivery of PDF
- Scheduled PDF generation (cron reports)

---

## Affected Files

| File | Change |
|------|--------|
| `api/app.py` | Add `GET /api/export/report/<run_id>.pdf` route |
| `services/report_generator.py` | New file — HTML template rendering + PDF conversion |
| `templates/report.html` | New Jinja2 HTML template for the report |
| `templates/report.css` | Print-optimized CSS |
| `deps/requirements.txt` | Add `weasyprint` |
| `deps/requirements-vercel.txt` | Add `weasyprint` only if Vercel bundle size permits (check; may need server-only flag) |
| `web/src/app/(ledger)/reports/page.tsx` | Add "Download PDF" button that calls the PDF endpoint |

---

## Report Template Structure

```html
<!-- templates/report.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Portfolio Report — {{ run.created_at }}</title>
  <link rel="stylesheet" href="report.css" />
</head>
<body>
  <header>
    <h1>Quantum Ledger — Portfolio Optimization Report</h1>
    <p>Generated: {{ run.created_at }} | Objective: {{ run.objective }}</p>
    <p>Universe: {{ run.tickers | join(', ') }}</p>
  </header>

  <section class="kpi-table">
    <h2>Performance Summary</h2>
    <table>
      <tr><th>Sharpe Ratio</th><td>{{ outputs.sharpe_ratio | round(3) }}</td></tr>
      <tr><th>Expected Return</th><td>{{ (outputs.expected_return * 100) | round(2) }}%</td></tr>
      <tr><th>Volatility</th><td>{{ (outputs.volatility * 100) | round(2) }}%</td></tr>
      <tr><th>VaR (95%)</th><td>{{ (outputs.risk_metrics.var_95 * 100) | round(2) }}%</td></tr>
      <tr><th>CVaR (95%)</th><td>{{ (outputs.risk_metrics.cvar_95 * 100) | round(2) }}%</td></tr>
    </table>
  </section>

  <section class="holdings">
    <h2>Holdings</h2>
    <table>
      <thead><tr><th>Asset</th><th>Sector</th><th>Weight</th></tr></thead>
      <tbody>
        {% for h in outputs.holdings | sort(attribute='weight', reverse=True) %}
        <tr><td>{{ h.name }}</td><td>{{ h.sector }}</td><td>{{ (h.weight * 100) | round(1) }}%</td></tr>
        {% endfor %}
      </tbody>
    </table>
  </section>

  {% if chart_png %}
  <section class="chart">
    <h2>Equity Curve</h2>
    <img src="data:image/png;base64,{{ chart_png }}" />
  </section>
  {% endif %}

  <section class="disclaimer">
    <h2>Methodology & Disclaimer</h2>
    <p>Optimization method: {{ run.objective }}. Data source: {{ outputs.data_source | default('Tiingo') }}.
    Past performance does not guarantee future results. This report is for informational purposes only.</p>
  </section>
</body>
</html>
```

---

## Implementation Plan

1. **Add `weasyprint` to `deps/requirements.txt`**. Verify it installs on Linux (it requires system libs: `libpango`, `libcairo`). Add to `deploy/docker/Dockerfile.fly` system deps if needed:
   ```dockerfile
   RUN apt-get install -y libpango-1.0-0 libpangocairo-1.0-0 libcairo2
   ```

2. **Create `services/report_generator.py`**:
   ```python
   from weasyprint import HTML
   from jinja2 import Environment, FileSystemLoader
   
   def generate_pdf(run: dict) -> bytes:
       env = Environment(loader=FileSystemLoader('templates'))
       template = env.get_template('report.html')
       html_str = template.render(run=run, outputs=run['outputs'])
       return HTML(string=html_str, base_url='.').write_pdf()
   ```

3. **Generate equity curve chart as PNG** — if the run has an equity curve, render it with `matplotlib` (already a dependency in `deps/requirements.txt`) and encode as base64:
   ```python
   import matplotlib.pyplot as plt
   import base64, io
   
   def equity_curve_png(dates, values) -> str:
       fig, ax = plt.subplots(figsize=(10, 4))
       ax.plot(dates, values)
       buf = io.BytesIO()
       fig.savefig(buf, format='png', dpi=150)
       return base64.b64encode(buf.getvalue()).decode()
   ```

4. **Add `GET /api/export/report/<run_id>.pdf`** in `api/app.py`:
   ```python
   @app.route('/api/export/report/<run_id>.pdf')
   @require_api_key
   def export_report_pdf(run_id):
       run = run_repository.get_run(db, run_id, tenant_id)
       if not run:
           abort(404)
       pdf_bytes = report_generator.generate_pdf(run)
       return Response(pdf_bytes,
           mimetype='application/pdf',
           headers={'Content-Disposition': f'attachment; filename="report-{run_id}.pdf"'})
   ```

5. **Frontend**: add "Download PDF" button to `web/src/app/(ledger)/reports/page.tsx`:
   ```tsx
   <a href={`/api/export/report/${runId}.pdf`} download>
     Download PDF
   </a>
   ```
   Note: This requires `run_id` from `03-persistent-run-history.md` to be completed first.

6. **Write tests**:
   - `test_pdf_endpoint_returns_pdf_content_type` — assert `Content-Type: application/pdf`
   - `test_pdf_contains_run_id` — PDF bytes are non-empty and > 1000 bytes
   - `test_pdf_404_unknown_run` — returns 404 for unknown run ID

---

## Acceptance Criteria

- [ ] `GET /api/export/report/{run_id}.pdf` returns a valid PDF
- [ ] PDF includes: KPI table, holdings table, methodology disclaimer
- [ ] PDF includes equity curve chart image if backtest data is available for that run
- [ ] "Download PDF" button appears in the `/reports` page UI
- [ ] All three new tests pass
- [ ] `weasyprint` is listed in `deps/requirements.txt`

---

## Parking Lot

- Email delivery: `POST /api/export/report/{run_id}/email`
- Scheduled weekly PDF (cron job)
- Custom branding / logo injection
- Compliance-specific template (GIPS-style attestation)
