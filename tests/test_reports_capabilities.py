"""
Tests for ``GET /api/reports/capabilities`` (QOBLIB overhaul gap #3).

The endpoint is a pre-flight that lets the UI disable the "Download PDF"
button + tooltip the reason when WeasyPrint isn't installed, instead of
surfacing the failure only on click. Verified contract:

* Auth required (matches /api/export/report/<run_id>.pdf)
* Returns ``{pdf_export, pdf_message}`` under the standard ``data`` envelope
* When WeasyPrint is available: ``pdf_export=True``, ``pdf_message=None``
* When WeasyPrint is missing:   ``pdf_export=False``, ``pdf_message="..."``
"""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest


@pytest.fixture
def client():
    os.environ.setdefault("API_KEY", "test-api-key")
    from api.app import app
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def _headers() -> dict:
    return {"X-API-Key": os.environ["API_KEY"]}


class TestReportsCapabilitiesEndpoint:
    def test_returns_pdf_available_when_weasyprint_installed(self, client):
        """``is_pdf_export_available`` returns ``(True, None)`` -> shape pass-through."""
        with patch(
            "services.report_generator.is_pdf_export_available",
            return_value=(True, None),
        ):
            res = client.get("/api/reports/capabilities", headers=_headers())

        assert res.status_code == 200
        body = res.get_json()
        # success_response wraps under "data"; the test envelope check.
        assert body["data"]["pdf_export"] is True
        assert body["data"]["pdf_message"] is None

    def test_returns_pdf_unavailable_with_reason_when_weasyprint_missing(self, client):
        """Reason string flows through to ``pdf_message`` for the UI tooltip."""
        reason = (
            "WeasyPrint is not installed (No module named 'weasyprint'). "
            "Install: pip install weasyprint."
        )
        with patch(
            "services.report_generator.is_pdf_export_available",
            return_value=(False, reason),
        ):
            res = client.get("/api/reports/capabilities", headers=_headers())

        assert res.status_code == 200
        body = res.get_json()
        assert body["data"]["pdf_export"] is False
        assert body["data"]["pdf_message"] == reason

    def test_requires_api_key(self, client):
        """Endpoint is auth-gated; no key -> 401."""
        res = client.get("/api/reports/capabilities")
        # ``require_api_key`` decorator returns 401 with our standard envelope.
        assert res.status_code == 401

    def test_rejects_post_method(self, client):
        """Capabilities is GET-only — POST should be 405."""
        res = client.post("/api/reports/capabilities", headers=_headers())
        assert res.status_code == 405
