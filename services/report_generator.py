"""
PDF report generation — render a lab run as a styled HTML report and convert to PDF.

Uses Jinja2 (bundled with Flask) for templating and WeasyPrint for HTML→PDF.
Equity curve chart rendered via matplotlib and embedded as base64 PNG.
"""
from __future__ import annotations

import base64
import io
import logging
import os
from typing import Any

from jinja2 import Environment, FileSystemLoader

logger = logging.getLogger(__name__)

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_TEMPLATE_DIR = os.path.join(_REPO_ROOT, "templates")


def _equity_curve_png(results: list[dict[str, Any]]) -> str | None:
    """Render an equity curve from backtest results as a base64-encoded PNG."""
    if not results:
        return None
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.dates as mdates
        from datetime import datetime

        dates_raw = [r.get("date", "") for r in results]
        values = [float(r.get("cumulative_value", 1.0)) for r in results]

        dates = []
        for d in dates_raw:
            try:
                dates.append(datetime.fromisoformat(str(d).replace("Z", "+00:00")))
            except (ValueError, TypeError):
                dates.append(d)

        fig, ax = plt.subplots(figsize=(10, 3.5))
        ax.plot(dates, values, linewidth=1.5, color="#4fc3f7")
        ax.fill_between(dates, values, alpha=0.15, color="#4fc3f7")
        ax.set_ylabel("Cumulative Value")
        ax.set_title("Equity Curve")
        ax.grid(True, alpha=0.3)

        if dates and hasattr(dates[0], "strftime"):
            ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
            fig.autofmt_xdate(rotation=30)

        fig.tight_layout()
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        logger.exception("Failed to render equity curve PNG")
        return None


def _build_template_context(run: dict[str, Any]) -> dict[str, Any]:
    """Extract and normalise template variables from the lab run dict."""
    spec = run.get("spec") or {}
    result = run.get("result") or {}

    holdings = result.get("holdings") or []
    risk = result.get("risk_metrics") or {}

    backtest_results = result.get("results")
    chart_png = None
    if isinstance(backtest_results, list) and len(backtest_results) > 0:
        chart_png = _equity_curve_png(backtest_results)

    return {
        "run": {
            "id": run.get("id", ""),
            "created_at": run.get("created_at", ""),
            "finished_at": run.get("finished_at", ""),
            "objective": spec.get("objective", result.get("objective", "N/A")),
            "tickers": spec.get("tickers", []),
            "execution_kind": run.get("execution_kind", ""),
            "status": run.get("status", ""),
        },
        "outputs": {
            "sharpe_ratio": result.get("sharpe_ratio"),
            "expected_return": result.get("expected_return"),
            "volatility": result.get("volatility"),
            "n_active": result.get("n_active"),
            "holdings": sorted(holdings, key=lambda h: h.get("weight", 0), reverse=True),
            "risk_metrics": {
                "var_95": risk.get("var_95"),
                "cvar_95": risk.get("cvar") or risk.get("cvar_95_parametric"),
            },
            "data_source": result.get("data_source", "Tiingo"),
        },
        "chart_png": chart_png,
    }


class PdfDependencyMissingError(RuntimeError):
    """Raised when WeasyPrint or its native dependencies are not installed.

    PDF export requires WeasyPrint plus the GTK/Pango/Cairo system libraries.
    On Debian/Ubuntu: `apt install libpango-1.0-0 libpangoft2-1.0-0 libcairo2`.
    On macOS: `brew install pango`. Then: `pip install weasyprint`.
    """


def is_pdf_export_available() -> tuple[bool, str | None]:
    """Lightweight availability check: returns (available, reason_if_not).

    Used by the API/UI to surface a friendly error before attempting export.
    """
    try:
        import weasyprint  # noqa: F401
        return True, None
    except ImportError as exc:
        return False, (
            f"WeasyPrint is not installed ({exc}). "
            "Install: pip install weasyprint. On Linux you also need "
            "libpango-1.0-0 libpangoft2-1.0-0 libcairo2."
        )
    except OSError as exc:
        return False, (
            f"WeasyPrint native libraries missing ({exc}). "
            "On Debian/Ubuntu: apt install libpango-1.0-0 libpangoft2-1.0-0 libcairo2. "
            "On macOS: brew install pango."
        )


def generate_pdf(run: dict[str, Any]) -> bytes:
    """Render a lab run as a PDF report (HTML→PDF via WeasyPrint).

    Raises:
        PdfDependencyMissingError: When WeasyPrint or its native deps are missing.
    """
    try:
        from weasyprint import HTML
    except ImportError as exc:
        raise PdfDependencyMissingError(
            f"WeasyPrint is not installed: {exc}. "
            "Install with: pip install weasyprint. "
            "Linux requires libpango-1.0-0 libpangoft2-1.0-0 libcairo2 system packages."
        ) from exc
    except OSError as exc:
        raise PdfDependencyMissingError(
            f"WeasyPrint native libraries failed to load: {exc}. "
            "On Debian/Ubuntu: apt install libpango-1.0-0 libpangoft2-1.0-0 libcairo2. "
            "On macOS: brew install pango."
        ) from exc

    env = Environment(loader=FileSystemLoader(_TEMPLATE_DIR), autoescape=True)
    template = env.get_template("report.html")
    ctx = _build_template_context(run)
    html_str = template.render(**ctx)
    return HTML(string=html_str, base_url=_TEMPLATE_DIR).write_pdf()
