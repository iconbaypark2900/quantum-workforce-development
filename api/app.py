"""
Backend API for Quantum Hybrid Portfolio Dashboard
Provides REST API endpoints for the React frontend
"""
from __future__ import annotations

from flask import Flask, Response, request, jsonify, g
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from functools import wraps
import numpy as np
import pandas as pd
import csv
import json
import os
import re
import uuid
import time
import hashlib
import sqlite3
import threading
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import logging
from pythonjsonlogger.json import JsonFormatter as jsonlogger_JsonFormatter
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

# Repo root (this file lives in api/; data/ and docs/ are at project root)
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# QOBLIB benchmark artifacts (written by benchmarks/qoblib/runner.py)
_QOBLIB_RESULTS_CSV_PATH = os.path.join(_REPO_ROOT, "results", "qoblib", "results.csv")
_QOBLIB_RUNS_DIR = os.path.join(_REPO_ROOT, "results", "qoblib", "runs")

# Import portfolio optimization (unified service routes to methods)
from core.portfolio_optimizer import (
    run_optimization,
    OBJECTIVES,
    compute_efficient_frontier,
    _portfolio_metrics,
)
from methods.vqe import MAX_IBM_QUBITS, vqe_weights_ibm_strict
from methods.qaoa import qaoa_weights_ibm_strict
from methods.hybrid_pipeline import hybrid_qaoa_weights as _hybrid_qaoa_weights
from config.api_config import OBJECTIVES_CONFIG, PRESETS_CONFIG, REGIME_OPTIMIZER_PARAMS
from services.constraints import PortfolioConstraints
from services import ibm_quantum as ibm_quantum_service
from services import lab_run_service
from services import report_generator
from services import regime_detector
from services.auth import (
    init_jwt,
    create_access_token,
    create_refresh_token,
    verify_token,
    revoke_token,
    get_current_user,
    hash_api_key,
    generate_api_key,
    JWT_AVAILABLE,
)

# Import market data service (multi-provider: Tiingo (default), Alpaca, Polygon, yfinance fallback)
from services.data_provider_v2 import (
    MarketDataError,
    MarketDataProvider,
    fetch_market_data,
    fetch_price_panel,
)
from services.market_data import validate_tickers

# Import backtesting service
from services.backtest import run_backtest as run_backtesting, walk_forward_backtest
from services.data_provider import load_market_payload
from services.risk_models import build_risk_metrics_bundle

# ─── Logging (JSON for prod/aggregation, console for dev readability) ───
LOG_FORMAT = os.getenv('LOG_FORMAT', 'json')
log_handler = logging.StreamHandler()
if LOG_FORMAT == 'console':
    log_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)-8s %(name)s %(message)s'))
else:
    log_handler.setFormatter(jsonlogger_JsonFormatter(
        '%(asctime)s %(name)s %(levelname)s %(message)s',
        rename_fields={'asctime': 'timestamp', 'levelname': 'level', 'name': 'logger'},
    ))

logging.root.handlers = []
logging.root.addHandler(log_handler)
logging.root.setLevel(getattr(logging, os.getenv('LOG_LEVEL', 'INFO').upper(), logging.INFO))
logger = logging.getLogger(__name__)

# ─── Prometheus Metrics ───
REQUEST_COUNT = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)
REQUEST_LATENCY = Histogram(
    'http_request_duration_seconds',
    'HTTP request latency',
    ['method', 'endpoint'],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0]
)
OPTIMIZATION_LATENCY = Histogram(
    'optimization_duration_seconds',
    'Portfolio optimization duration',
    ['objective'],
    buckets=[0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0]
)
MARKET_DATA_LATENCY = Histogram(
    'market_data_fetch_duration_seconds',
    'Market data fetch duration',
    buckets=[0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0]
)

# ─── In-Memory Cache for Market Data ───
_market_data_cache = {}
CACHE_TTL = int(os.getenv('CACHE_TTL', 3600))  # 1 hour default
# Vercel serverless: only /tmp is writable; repo data/ is not. Override with API_DB_PATH if needed.
def _env_api_db_path() -> str | None:
    v = os.getenv("API_DB_PATH")
    if v is not None and str(v).strip() != "":
        return v
    return None


def _default_api_db_path() -> str:
    # Vercel sets VERCEL=1 and VERCEL_ENV (production|preview|development).
    if os.getenv("VERCEL") or os.getenv("VERCEL_ENV"):
        return "/tmp/api.sqlite3"
    return os.path.join(_REPO_ROOT, "data", "api.sqlite3")


def _is_vercel_runtime() -> bool:
    return bool(
        os.getenv("VERCEL")
        or os.getenv("VERCEL_ENV")
        or _REPO_ROOT.startswith("/var/task")
    )


API_DB_PATH = _env_api_db_path() or _default_api_db_path()

# ─── Async Job Runtime ───
_executor = ThreadPoolExecutor(max_workers=int(os.getenv("JOB_WORKERS", "4")))
_jobs = {}
_jobs_lock = threading.Lock()

def _cache_key(tickers, start_date, end_date, include_daily_returns=False):
    raw = f"{','.join(sorted(tickers))}:{start_date}:{end_date}:daily={include_daily_returns}"
    return hashlib.md5(raw.encode()).hexdigest()

def cache_get(key):
    entry = _market_data_cache.get(key)
    if entry and time.time() - entry['ts'] < CACHE_TTL:
        return entry['data']
    if entry:
        del _market_data_cache[key]
    return None

def cache_set(key, data):
    # Evict old entries if cache grows too large (max 100 entries)
    if len(_market_data_cache) >= 100:
        oldest = min(_market_data_cache, key=lambda k: _market_data_cache[k]['ts'])
        del _market_data_cache[oldest]
    _market_data_cache[key] = {'data': data, 'ts': time.time()}


app = Flask(__name__)


def _ensure_runtime_tables() -> None:
    """Create local runtime tables for API keys, audit logs, and async jobs metadata."""
    global API_DB_PATH

    def _init_at(db_path: str) -> None:
        parent = os.path.dirname(db_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        conn = sqlite3.connect(db_path)
        try:
            cur = conn.cursor()
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS api_keys (
                    key_hash TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    key_name TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_used_at TEXT,
                    usage_count INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT,
                    tenant_id TEXT,
                    action TEXT,
                    endpoint TEXT,
                    method TEXT,
                    payload_json TEXT,
                    response_status INTEGER,
                    duration_ms REAL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_request_id ON audit_log(request_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_tenant_id ON audit_log(tenant_id)")
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS tenant_integration_secrets (
                    tenant_id TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    secret_enc TEXT NOT NULL,
                    metadata_json TEXT,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (tenant_id, provider)
                )
                """
            )
            # Per-tenant IBM job ID tracking — only show a user their own jobs.
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS tenant_jobs (
                    tenant_id TEXT NOT NULL,
                    ibm_job_id TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (tenant_id, ibm_job_id)
                )
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_tenant_jobs_tid ON tenant_jobs(tenant_id)"
            )
            conn.commit()
        finally:
            conn.close()

    tmp_default = "/tmp/api.sqlite3"
    # On Vercel, try /tmp first even if API_DB_PATH was set to e.g. data/... in the dashboard.
    if _is_vercel_runtime():
        candidates = [tmp_default]
        if API_DB_PATH != tmp_default:
            candidates.append(API_DB_PATH)
    else:
        candidates = [API_DB_PATH]
        if API_DB_PATH != tmp_default:
            candidates.append(tmp_default)
    last_err: Exception | None = None
    for db_path in candidates:
        try:
            _init_at(db_path)
            API_DB_PATH = db_path
            return
        except (OSError, sqlite3.OperationalError) as e:
            last_err = e
    assert last_err is not None
    raise last_err


def _db_conn():
    return sqlite3.connect(API_DB_PATH)


def _record_tenant_jobs(tenant_id: str, job_ids: list) -> None:
    """Persist IBM job IDs for a tenant so workload listing can filter to their own jobs."""
    if not job_ids:
        return
    try:
        conn = _db_conn()
        cur = conn.cursor()
        cur.executemany(
            "INSERT OR IGNORE INTO tenant_jobs (tenant_id, ibm_job_id) VALUES (?, ?)",
            [(tenant_id, str(jid)) for jid in job_ids if jid],
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.warning("tenant_jobs record failed tenant=%s: %s", tenant_id, exc)


def _get_tenant_job_ids(tenant_id: str) -> set:
    """Return the set of IBM job IDs previously submitted by this tenant."""
    try:
        conn = _db_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT ibm_job_id FROM tenant_jobs WHERE tenant_id = ?", (tenant_id,)
        )
        ids = {row[0] for row in cur.fetchall()}
        conn.close()
        return ids
    except Exception as exc:
        logger.warning("tenant_jobs fetch failed tenant=%s: %s", tenant_id, exc)
        return set()


_ensure_runtime_tables()

ibm_quantum_service.set_db_conn_factory(_db_conn)
lab_run_service.set_db_conn_factory(_db_conn)
lab_run_service.ensure_table()

# Initialize JWT authentication
if JWT_AVAILABLE:
    init_jwt(app)
    logger.info("JWT authentication enabled")
else:
    logger.warning("JWT authentication disabled - install flask-jwt-extended to enable")


def log_business_audit(action: str, payload: dict, result: dict, status: int = 200):
    """Persist business-level audit record including request payload and result summary."""
    try:
        conn = _db_conn()
        cur = conn.cursor()
        merged_payload = {
            "request": payload or {},
            "result_summary": result or {},
        }
        cur.execute(
            """
            INSERT INTO audit_log (
                request_id, tenant_id, action, endpoint, method,
                payload_json, response_status, duration_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                getattr(g, "request_id", ""),
                getattr(g, "tenant_id", "anonymous"),
                action,
                request.path if request else action,
                request.method if request else "INTERNAL",
                json.dumps(merged_payload),
                int(status),
                0.0,
            ),
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.warning(f"business_audit_write_failed: {exc}")


def log_async_audit(tenant_id: str, action: str, payload: dict, result: dict, status: int):
    """Audit logger for async workers where request context is unavailable."""
    try:
        conn = _db_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO audit_log (
                request_id, tenant_id, action, endpoint, method,
                payload_json, response_status, duration_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "",
                tenant_id or "anonymous",
                action,
                action,
                "ASYNC",
                json.dumps({"request": payload or {}, "result_summary": result or {}}),
                int(status),
                0.0,
            ),
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.warning(f"async_audit_write_failed: {exc}")

# ─── Security Configuration ───

# Request size limit (1 MB)
app.config['MAX_CONTENT_LENGTH'] = 1 * 1024 * 1024

# CORS: restrict to configured origins
cors_origins = os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(',')
CORS(app, origins=[o.strip() for o in cors_origins])

# Rate limiting
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["100 per minute"],
    storage_uri=os.getenv('RATELIMIT_STORAGE_URL', 'memory://'),
)

# API key authentication
API_KEY = os.getenv('API_KEY', '')
API_KEY_REQUIRED = os.getenv('API_KEY_REQUIRED', 'false').lower() == 'true'


def _hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _lookup_tenant_by_key(key: str):
    """Lookup tenant by API key hash in local auth table."""
    if not key:
        return None
    key_hash = _hash_api_key(key)
    conn = _db_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT tenant_id, key_name, usage_count
            FROM api_keys
            WHERE key_hash = ? AND is_active = 1
            """,
            (key_hash,),
        )
        row = cur.fetchone()
        if not row:
            return None
        tenant_id, key_name, usage_count = row
        cur.execute(
            """
            UPDATE api_keys
            SET last_used_at = CURRENT_TIMESTAMP,
                usage_count = ?
            WHERE key_hash = ?
            """,
            (int(usage_count or 0) + 1, key_hash),
        )
        conn.commit()
        return {"tenant_id": tenant_id, "key_name": key_name}
    finally:
        conn.close()


def _create_api_key(tenant_id: str, key_name: str = "") -> str:
    """Create and store a tenant API key, returning plaintext once."""
    plain = hashlib.sha256(f"{uuid.uuid4()}:{tenant_id}:{time.time()}".encode()).hexdigest()
    key_hash = _hash_api_key(plain)
    conn = _db_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT OR REPLACE INTO api_keys (key_hash, tenant_id, key_name, is_active, created_at)
            VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
            """,
            (key_hash, tenant_id, key_name or ""),
        )
        conn.commit()
    finally:
        conn.close()
    return plain


_SAFE_TENANT_RE = re.compile(r'^[a-zA-Z0-9_\-]{8,64}$')


def integration_effective_tenant_id():
    """
    Tenant id for integration credentials (IBM, Braket metadata).
    - Static API_KEY + same header value: X-Tenant-Id selects enterprise.
    - Database API key: tenant from key (ignores X-Tenant-Id).
    - No API_KEY configured: X-Tenant-Id used as anonymous session key when
      it passes the safe-format check (UUID / alphanumeric+hyphen, 8-64 chars).
      This lets each browser generate its own UUID and keep credentials isolated
      without requiring a full auth system.
    - Anonymous fallback: default.
    """
    header_tid = (request.headers.get("X-Tenant-Id") or "").strip()
    client_key = request.headers.get("X-API-Key", "")
    if API_KEY and client_key == API_KEY:
        return header_tid or "default"
    tenant = _lookup_tenant_by_key(client_key) if client_key else None
    if tenant:
        return str(tenant["tenant_id"])
    # Anonymous mode: honor X-Tenant-Id as a session-scoped tenant when no
    # static API_KEY is set. UUID from the browser is the common case.
    if not API_KEY and header_tid and _SAFE_TENANT_RE.match(header_tid):
        return header_tid
    gid = getattr(g, "tenant_id", "anonymous")
    if gid not in ("anonymous", None, ""):
        return str(gid)
    return "default"


def require_api_key(f):
    """
    Multi-tenant API key auth.
    Priority:
    1) If static API_KEY env is set, it must match.
    2) Else if key exists in api_keys table, use tenant mapping.
    3) Else allow only when API_KEY_REQUIRED is false.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        key = request.headers.get('X-API-Key', '')
        if API_KEY:
            if key != API_KEY:
                return error_response('Unauthorized. Provide a valid X-API-Key header.', code='UNAUTHORIZED', status=401)
            g.tenant_id = "default"
            return f(*args, **kwargs)

        tenant = _lookup_tenant_by_key(key) if key else None
        if tenant:
            g.tenant_id = tenant["tenant_id"]
            g.api_key_name = tenant["key_name"]
            return f(*args, **kwargs)

        if API_KEY_REQUIRED:
            return error_response('Unauthorized. Provide a valid X-API-Key header.', code='UNAUTHORIZED', status=401)

        g.tenant_id = "anonymous"
        return f(*args, **kwargs)
    return decorated

# ─── Standardized Response Helpers ───

def success_response(data, status=200, extra_meta=None):
    """Wrap successful payload in standard envelope."""
    meta = {
        "request_id": getattr(g, "request_id", ""),
        "duration_ms": round((time.time() - getattr(g, "start_time", time.time())) * 1000, 2),
    }
    if extra_meta:
        meta.update(extra_meta)
    return jsonify({"data": data, "meta": meta}), status


def error_response(message, code="ERROR", status=400):
    """Wrap error in standard envelope."""
    return jsonify({
        "error": {"code": code, "message": str(message)},
        "meta": {"request_id": getattr(g, "request_id", "")},
    }), status


# ─── Request Lifecycle Hooks ───

@app.before_request
def before_request_hook():
    g.request_id = str(uuid.uuid4())
    g.start_time = time.time()

@app.after_request
def after_request_hook(response):
    # Metrics (never fail the response if Prometheus labels error)
    duration = time.time() - getattr(g, 'start_time', time.time())
    endpoint = request.endpoint or 'unknown'
    try:
        REQUEST_COUNT.labels(method=request.method, endpoint=endpoint, status=response.status_code).inc()
        REQUEST_LATENCY.labels(method=request.method, endpoint=endpoint).observe(duration)
    except Exception as metric_exc:
        logger.warning("prometheus_metrics_failed: %s", metric_exc)

    # Structured log
    logger.info('request_completed', extra={
        'request_id': getattr(g, 'request_id', ''),
        'tenant_id': getattr(g, 'tenant_id', 'anonymous'),
        'method': request.method,
        'path': request.path,
        'status': response.status_code,
        'duration_ms': round(duration * 1000, 2),
        'remote_addr': request.remote_addr,
    })

    # Persist audit trail (best-effort)
    try:
        payload = None
        if request.method in ("POST", "PUT", "PATCH"):
            payload = request.get_json(silent=True)
        conn = _db_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO audit_log (
                request_id, tenant_id, action, endpoint, method,
                payload_json, response_status, duration_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                getattr(g, "request_id", ""),
                getattr(g, "tenant_id", "anonymous"),
                request.endpoint or "unknown",
                request.path,
                request.method,
                json.dumps(payload) if payload is not None else None,
                int(response.status_code),
                float(round(duration * 1000, 2)),
            ),
        )
        conn.commit()
        conn.close()
    except Exception as audit_exc:
        logger.warning(f"audit_log_write_failed: {audit_exc}")

    # Security headers
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['X-Request-Id'] = getattr(g, 'request_id', '')

    if os.getenv('HF_SPACES') == '1':
        response.headers['Content-Security-Policy'] = (
            "default-src 'self' https://*.hf.space; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "connect-src 'self' https://*.hf.space; "
            "frame-ancestors 'self' https://huggingface.co https://*.hf.space"
        )
    else:
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "font-src 'self' https://fonts.gstatic.com; "
            "connect-src 'self'"
        )
    return response

def generate_mock_data(n_assets, regime):
    """Generate mock market data for demonstration.

    Gated: raises RuntimeError when FLASK_ENV is ``production`` to prevent
    synthetic data from leaking into production responses.
    """
    if os.getenv("FLASK_ENV", "").lower() == "production":
        raise RuntimeError("generate_mock_data is disabled in production")
    # Asset names
    names = ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","JPM","V","JNJ",
             "PG","UNH","HD","MA","BAC","DIS","NFLX","KO","PFE","CVX","WMT",
             "MRK","ABT","ADBE","NKE","PEP","T","VZ","PYPL","BRK"]

    sectors = ["Tech","Tech","Tech","Tech","Tech","Tech","Tech","Finance","Finance","Health",
               "Consumer","Health","Consumer","Finance","Finance","Consumer","Tech","Consumer",
               "Health","Energy","Consumer","Health","Health","Tech","Consumer","Consumer",
               "Telecom","Telecom","Tech","Finance"]

    # Adjust regime parameters
    regime_params = {
        'bull': {'drift': 0.0008, 'vol': 0.012, 'corr_base': 0.3},
        'bear': {'drift': -0.0003, 'vol': 0.022, 'corr_base': 0.6},
        'volatile': {'drift': 0.0002, 'vol': 0.028, 'corr_base': 0.45},
        'normal': {'drift': 0.0004, 'vol': 0.015, 'corr_base': 0.35},
    }

    params = regime_params.get(regime, regime_params['normal'])

    assets = []
    for i in range(n_assets):
        # Generate returns and volatility
        drift = params['drift'] + (np.random.random() - 0.4) * 0.001
        vol = params['vol'] * (0.7 + np.random.random() * 0.6)

        # Create artificial returns for the past year (252 trading days)
        returns = np.random.normal(drift, vol, 252)

        ann_return = np.mean(returns) * 252
        ann_vol = np.std(returns) * np.sqrt(252)
        sharpe = ann_return / ann_vol if ann_vol != 0 else 0

        assets.append({
            'name': names[i] if i < len(names) else f'ASSET_{i}',
            'sector': sectors[i] if i < len(sectors) else 'Other',
            'ann_return': ann_return,
            'ann_vol': ann_vol,
            'sharpe': sharpe
        })

    # Create correlation matrix
    corr = np.eye(n_assets)
    for i in range(n_assets):
        for j in range(i+1, n_assets):
            # Same sector gets slightly higher correlation
            same_sector_bonus = 0.1 if assets[i]['sector'] == assets[j]['sector'] else 0
            base_corr = params['corr_base']
            random_corr = np.random.uniform(-0.2, 0.4)
            corr_val = np.clip(base_corr + same_sector_bonus + random_corr, -0.3, 0.95)
            corr[i, j] = corr_val
            corr[j, i] = corr_val

    return assets, corr


# ─── Input Validation Helpers ───

import re

def sanitize_ticker(ticker):
    """Sanitize a ticker symbol to alphanumeric + dots/hyphens only."""
    cleaned = re.sub(r'[^A-Za-z0-9.\-]', '', str(ticker).strip().upper())
    return cleaned[:10]  # Max 10 chars

def validate_tickers_input(data, field='tickers'):
    """Validate and sanitize a list of tickers from request data. Returns (tickers, error)."""
    raw = data.get(field)
    if not raw:
        return None, f"'{field}' is required"
    if not isinstance(raw, list):
        return None, f"'{field}' must be a list"
    if len(raw) > 50:
        return None, f"Maximum 50 tickers allowed, got {len(raw)}"
    tickers = [sanitize_ticker(t) for t in raw if t]
    tickers = [t for t in tickers if t]  # Remove empty after sanitization
    if not tickers:
        return None, "No valid tickers provided after sanitization"
    return tickers, None

def validate_date(date_str, field_name='date'):
    """Validate a date string in YYYY-MM-DD format. Returns (date_str, error)."""
    if not date_str:
        return None, None  # Optional
    try:
        datetime.strptime(str(date_str), '%Y-%m-%d')
        return str(date_str), None
    except ValueError:
        return None, f"'{field_name}' must be in YYYY-MM-DD format, got '{date_str}'"

def validate_request(data, required_fields=None, numeric_ranges=None):
    """
    Validate request data with required fields and numeric range checks.
    Returns (cleaned_data, error_message).
    """
    if data is None:
        return None, "Request body is required (JSON)"

    errors = []

    if required_fields:
        for field in required_fields:
            if field not in data or data[field] is None:
                errors.append(f"'{field}' is required")

    if numeric_ranges:
        for field, (lo, hi) in numeric_ranges.items():
            val = data.get(field)
            if val is not None:
                try:
                    val = float(val)
                    if val < lo or val > hi:
                        errors.append(f"'{field}' must be between {lo} and {hi}, got {val}")
                except (ValueError, TypeError):
                    errors.append(f"'{field}' must be a number")

    if errors:
        return None, '; '.join(errors)
    return data, None


@app.route('/api/market-data', methods=['GET', 'POST'])
@require_api_key
@limiter.limit("10 per minute")
def get_market_data():
    """Endpoint to fetch real market data via the configured market data provider (Tiingo by default)."""
    try:
        # Handle both GET and POST requests
        include_daily_returns = False  # default; overridden per-method below
        if request.method == 'GET':
            # Get parameters from query string
            tickers_param = request.args.get('tickers', '')
            start_date = request.args.get('start', None)
            end_date = request.args.get('end', None)
            include_daily_returns = request.args.get('include_daily_returns', '').lower() in ('1', 'true', 'yes')

            if not tickers_param:
                return error_response('Tickers parameter is required', code='BAD_REQUEST', status=400)

            tickers = [t.strip().upper() for t in tickers_param.split(',')]
        else:  # POST
            # Get parameters from request body
            data = request.json
            if not data:
                return error_response('Request body is required for POST requests', code='BAD_REQUEST', status=400)

            tickers = data.get('tickers', [])
            start_date = data.get('start_date', None)
            end_date = data.get('end_date', None)
            include_daily_returns = bool(data.get('include_daily_returns', False))

            if not tickers:
                return error_response('Tickers parameter is required', code='BAD_REQUEST', status=400)
        
        # Validate tickers
        if not isinstance(tickers, list) or len(tickers) == 0:
            return error_response('Tickers must be a non-empty list', code='BAD_REQUEST', status=400)
            
        # Limit number of tickers to prevent abuse
        if len(tickers) > 50:
            return error_response('Maximum of 50 tickers allowed', code='BAD_REQUEST', status=400)
            
        # Validate dates if provided
        if start_date:
            try:
                pd.to_datetime(start_date)
            except:
                return error_response('Invalid start date format. Use YYYY-MM-DD.', code='BAD_REQUEST', status=400)
                
        if end_date:
            try:
                pd.to_datetime(end_date)
            except:
                return error_response('Invalid end date format. Use YYYY-MM-DD.', code='BAD_REQUEST', status=400)
        
        # Check cache first (key includes include_daily_returns flag)
        ck = _cache_key(tickers, start_date or '', end_date or '', include_daily_returns)
        cached = cache_get(ck)
        if cached is not None:
            logger.info('market_data_cache_hit', extra={'cache_key': ck, 'tickers': tickers})
            return success_response(cached)

        # Fetch market data (with latency tracking)
        with MARKET_DATA_LATENCY.time():
            market_data = fetch_market_data(
                tickers=tickers,
                start_date=start_date,
                end_date=end_date,
                include_daily_returns=include_daily_returns,
            )

        # Store in cache
        cache_set(ck, market_data)
        
        return success_response(market_data)

    except MarketDataError as e:
        # Typed market-data failures carry a stable ``code`` the frontend uses
        # to render an actionable banner ("set TIINGO_API_KEY", "switch to
        # synthetic mode", "rate limit — back off"). Catch BEFORE ValueError
        # since MarketDataError is a ValueError subclass.
        status_map = {
            'TIINGO_NO_API_KEY': 503,
            'TIINGO_AUTH_FAILED': 503,
            'TIINGO_RATE_LIMITED': 429,
            'TIINGO_INVALID_TICKER': 400,
        }
        code = getattr(e, 'code', 'MARKET_DATA_FETCH_FAILED')
        status = status_map.get(code, 502)
        return error_response(str(e), code=code, status=status)
    except ValueError as e:
        return error_response(str(e), code='BAD_REQUEST', status=400)
    except Exception as e:
        return error_response(f'Internal server error: {str(e)}', code='INTERNAL_ERROR', status=500)


@app.route('/api/market/regime', methods=['GET'])
@require_api_key
@limiter.limit("20 per minute")
def get_market_regime():
    """Classify current market regime and recommend an optimization objective."""
    tickers_raw = request.args.get("tickers", "SPY")
    method = request.args.get("method", "threshold")
    tickers = [t.strip().upper() for t in tickers_raw.split(",") if t.strip()]
    if not tickers:
        tickers = ["SPY"]

    from datetime import timedelta
    end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    start_date = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y-%m-%d")
    try:
        prices = fetch_price_panel(tickers, start_date, end_date)
        ew_returns = prices.pct_change().dropna().mean(axis=1)
        result = regime_detector.detect_regime(ew_returns, method=method)
    except MarketDataError as exc:
        # Tiingo / market-data failures carry their own structured code
        # (TIINGO_NO_API_KEY, TIINGO_RATE_LIMITED, ...). Pass it through so
        # the auto-detect button can surface "set TIINGO_API_KEY" rather
        # than a generic "regime detection failed".
        status_map = {
            'TIINGO_NO_API_KEY': 503,
            'TIINGO_AUTH_FAILED': 503,
            'TIINGO_RATE_LIMITED': 429,
            'TIINGO_INVALID_TICKER': 400,
        }
        code = getattr(exc, 'code', 'MARKET_DATA_FETCH_FAILED')
        return error_response(str(exc), code=code, status=status_map.get(code, 502))
    except ValueError as exc:
        # ``regime_detector.detect_regime`` raises ValueError on
        # "Need at least 10 return observations for regime detection".
        # Map to 400 INSUFFICIENT_DATA so the UI can distinguish "not enough
        # market data" from "auth failed" (Gap #8).
        return error_response(str(exc), code="INSUFFICIENT_DATA", status=400)
    except Exception as exc:
        logger.exception("Regime detection failed")
        return error_response(f"Regime detection failed: {exc}", code="REGIME_ERROR", status=500)
    return success_response(result)


@app.route('/api/portfolio/backtest', methods=['POST'])
@require_api_key
@limiter.limit("10 per minute")
def run_backtest():
    """Endpoint to run portfolio backtesting."""
    try:
        data = request.json
        backtest_results = _run_backtest_payload(data)
        log_business_audit(
            action="backtest_run",
            payload=data or {},
            result={
                "summary_metrics": backtest_results.get("summary_metrics", {}),
                "points": len(backtest_results.get("results", [])),
            },
            status=200,
        )
        return success_response(backtest_results)
        
    except ValueError as e:
        return error_response(str(e), code='BAD_REQUEST', status=400)
    except Exception as e:
        logger.error(f"Backtest endpoint error: {str(e)}", exc_info=True)
        return error_response(f'Internal server error: {str(e)}', code='INTERNAL_ERROR', status=500)


def _run_backtest_payload(data):
    """Shared backtest execution used by sync and async endpoints."""
    if not data:
        raise ValueError('Request body is required')

    tickers = data.get('tickers', [])
    start_date = data.get('start_date', None)
    end_date = data.get('end_date', None)
    rebalance_frequency = data.get('rebalance_frequency', 'monthly')
    objective = data.get('objective', 'max_sharpe')
    target_return = data.get('target_return', None)
    strategy_preset = data.get('strategy_preset', 'balanced')
    constraints = PortfolioConstraints.from_dict(data.get('constraints'))

    if not tickers:
        raise ValueError('Tickers parameter is required')
    if not start_date or not end_date:
        raise ValueError('Both start_date and end_date are required')

    start_dt = datetime.strptime(start_date, '%Y-%m-%d')
    end_dt = datetime.strptime(end_date, '%Y-%m-%d')
    if start_dt >= end_dt:
        raise ValueError('Start date must be before end date')

    valid_freqs = ['weekly', 'monthly', 'quarterly', 'yearly']
    if rebalance_frequency not in valid_freqs:
        raise ValueError(f'Invalid rebalance frequency. Valid options: {valid_freqs}')

    valid_objectives = ['max_sharpe', 'min_variance', 'target_return', 'risk_parity', 'hrp', 'braket_annealing']
    if objective not in valid_objectives:
        raise ValueError(f'Invalid objective. Valid options: {valid_objectives}')

    return run_backtesting(
        tickers=tickers,
        start_date=start_date,
        end_date=end_date,
        rebalance_frequency=rebalance_frequency,
        objective=objective,
        target_return=target_return,
        strategy_preset=strategy_preset,
        constraints=constraints
    )

@app.route('/api/backtest/walkforward', methods=['POST'])
@require_api_key
@limiter.limit("5 per minute")
def walkforward_backtest_endpoint():
    """Walk-forward backtest: train/test split with turnover and transaction costs."""
    try:
        data = request.get_json(silent=True) or {}

        tickers = data.get("tickers", [])
        start = data.get("start")
        end = data.get("end")
        train_months = int(data.get("train_months", 12))
        test_months = int(data.get("test_months", 3))
        objective = data.get("objective", "hybrid")
        cost_bps = float(data.get("cost_bps", 0))
        benchmark_ticker = data.get("benchmark_ticker")
        constraints_raw = data.get("constraints")
        constraints = PortfolioConstraints.from_dict(constraints_raw) if constraints_raw else None

        if not tickers or not isinstance(tickers, list):
            return error_response("tickers must be a non-empty list", code='BAD_REQUEST', status=400)
        if not start or not end:
            return error_response("start and end dates are required", code='BAD_REQUEST', status=400)
        if train_months < 6:
            return error_response("train_months must be >= 6", code='BAD_REQUEST', status=400)
        if test_months < 1:
            return error_response("test_months must be >= 1", code='BAD_REQUEST', status=400)

        result = walk_forward_backtest(
            tickers=tickers,
            start=start,
            end=end,
            train_months=train_months,
            test_months=test_months,
            objective=objective,
            constraints=constraints,
            cost_bps=cost_bps,
            benchmark_ticker=benchmark_ticker,
        )

        run_id = str(uuid.uuid4())
        try:
            _spec = {
                "objective": objective,
                "train_months": train_months,
                "test_months": test_months,
                "cost_bps": cost_bps,
                "tickers": tickers,
                "n_assets": len(tickers),
            }
            _run = lab_run_service.create_run(
                tenant_id=getattr(g, "tenant_id", "anonymous"),
                spec=_spec,
                execution_kind="walkforward_backtest",
                request_payload=data,
            )
            run_id = _run["id"]
            lab_run_service.update_status(run_id, "completed", result=result)
        except Exception as _persist_err:
            logger.warning("wf_run_persist_failed: %s", _persist_err)

        result["run_id"] = run_id

        log_business_audit(
            action="walkforward_backtest",
            payload=data,
            result={"run_id": run_id, "n_periods": result["metadata"]["n_periods"]},
            status=200,
        )
        return success_response(result)

    except ValueError as e:
        return error_response(str(e), code='BAD_REQUEST', status=400)
    except Exception as e:
        logger.error("walkforward_backtest error: %s", e, exc_info=True)
        return error_response(f"Internal server error: {e}", code='INTERNAL_ERROR', status=500)


def calculate_portfolio_metrics(weights, returns, covariance_matrix):
    """Calculate portfolio metrics from weights, returns and covariance."""
    # Expected return
    portfolio_return = np.dot(weights, returns)
    
    # Volatility
    portfolio_variance = np.dot(weights, np.dot(covariance_matrix, weights))
    portfolio_volatility = np.sqrt(portfolio_variance)
    
    # Sharpe ratio (assuming 0 risk-free rate)
    sharpe_ratio = portfolio_return / portfolio_volatility if portfolio_volatility != 0 else 0
    
    # Effective number of assets
    n_assets_effective = 1 / np.sum(weights ** 2) if np.sum(weights ** 2) != 0 else 0
    
    # Number of active assets (with meaningful weight)
    n_active = np.sum(weights > 0.005)
    
    return {
        'expected_return': float(portfolio_return),
        'volatility': float(portfolio_volatility),
        'sharpe_ratio': float(sharpe_ratio),
        'n_active': int(n_active),
        'n_effective': float(n_assets_effective)
    }


# Legacy demo helpers — not called by any API route.  Kept for test/notebook
# use only; the optimize endpoint uses services.risk_models.build_risk_metrics_bundle.

def serialize_numpy(obj):
    """Convert numpy objects to JSON serializable types."""
    if isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, np.bool_):
        return bool(obj)
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")


def _safe_serialize_metrics(obj):
    """Recursively convert metrics dict to JSON-serializable types."""
    if isinstance(obj, (np.integer, np.int32, np.int64)):
        return int(obj)
    if isinstance(obj, (np.floating, np.float32, np.float64)):
        v = float(obj)
        return v if np.isfinite(v) else None
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, dict):
        return {k: _safe_serialize_metrics(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_safe_serialize_metrics(v) for v in obj]
    if isinstance(obj, (int, float, str, bool, type(None))):
        return obj
    return str(obj)


@app.route('/api/portfolio/optimize', methods=['POST'])
@require_api_key
@limiter.limit("10 per minute")
def optimize_portfolio():
    """Portfolio optimisation endpoint — routes by objective to notebook methods."""
    try:
        data = request.json
        if not data:
            return error_response('Request body is required', code='BAD_REQUEST', status=400)

        # ── Market data: prefer direct matrix, fallback to ticker fetch ─────
        market_payload = load_market_payload(data)
        assets = market_payload.assets
        returns = market_payload.returns
        covariance = market_payload.covariance
        tickers = market_payload.tickers

        # ── Objective & method params ────────────────────────────────────────
        objective = data.get('objective', 'hybrid')
        # Backward compatibility: legacy objective names.
        # braket_annealing is NOT remapped to qubo_sa here — it is forwarded to
        # services.portfolio_optimizer which dispatches to BraketAnnealingOptimizer
        # (real QPU or classical fallback) when BRAKET_ENABLED=true. The legacy
        # qubo_sa objective is kept for callers that want classical SA explicitly.
        braket_fallback = objective == 'braket_annealing'
        objective = {
            'max_sharpe': 'markowitz',
            'risk_parity': 'hrp',
        }.get(objective, objective)
        target_return = data.get('targetReturn') or data.get('target_return')

        # Cardinality params (QUBO-SA and Hybrid)
        K = data.get('K')
        K_screen = data.get('K_screen')
        K_select = data.get('K_select')

        # QUBO tuning
        lambda_risk = float(data.get('lambda_risk', 1.0))
        gamma = float(data.get('gamma', 8.0))

        # VQE tuning
        n_layers = int(data.get('n_layers', 3))
        n_restarts = int(data.get('n_restarts', 8))

        # Weight bounds
        weight_min = float(data.get('weight_min', data.get('minWeight', 0.005)))
        weight_max = float(data.get('weight_max', data.get('maxWeight', 0.30)))

        # Regime adjustments — factually alter risk aversion and weight cap.
        regime = str(data.get('regime', 'normal')).lower()
        regime_params = REGIME_OPTIMIZER_PARAMS.get(regime, REGIME_OPTIMIZER_PARAMS['normal'])
        lambda_risk = lambda_risk * regime_params['lambda_risk_factor']
        weight_max = max(0.05, min(1.0, weight_max + regime_params['weight_max_delta']))

        # Reproducibility
        seed = int(data.get('seed', 42))

        # ── Validate objective ───────────────────────────────────────────────
        if objective not in OBJECTIVES:
            return error_response(
                f"Unknown objective '{objective}'. Valid: {list(OBJECTIVES.keys())}",
                code='BAD_REQUEST', status=400
            )

        # ── Run optimisation ─────────────────────────────────────────────────
        asset_names = [a['name'] for a in assets]
        sectors_list = [a['sector'] for a in assets]
        t0 = time.time()
        if LOG_FORMAT == 'console':
            tickers_preview = tickers[:5] if tickers and len(tickers) > 5 else tickers
            logger.info(
                "optimization_start objective=%s n_assets=%d weight_min=%s weight_max=%s tickers=%s",
                objective, len(asset_names), weight_min, weight_max, tickers_preview,
            )
        else:
            logger.info("optimization_start", extra={
                "objective": objective,
                "n_assets": len(asset_names),
                "weight_min": weight_min,
                "weight_max": weight_max,
                "tickers": tickers[:5] if tickers and len(tickers) > 5 else tickers,
            })

        with OPTIMIZATION_LATENCY.labels(objective=objective).time():
            tr_opt = target_return
            if objective == "target_return" and tr_opt is None:
                tr_opt = float(np.mean(returns))
            result = run_optimization(
                returns=returns,
                covariance=covariance,
                objective=objective,
                target_return=float(tr_opt) if tr_opt is not None else None,
                asset_names=asset_names,
                K=int(K) if K is not None else None,
                K_screen=int(K_screen) if K_screen is not None else None,
                K_select=int(K_select) if K_select is not None else None,
                lambda_risk=lambda_risk,
                gamma=gamma,
                n_layers=n_layers,
                n_restarts=n_restarts,
                weight_min=weight_min,
                weight_max=weight_max,
                seed=seed,
            )

        duration_ms = round((time.time() - t0) * 1000, 2)

        # ── Build holdings list ──────────────────────────────────────────────
        holdings = [
            {
                'name': asset_names[i],
                'sector': sectors_list[i] if i < len(sectors_list) else 'Unknown',
                'weight': float(result.weights[i]),
            }
            for i in range(len(asset_names))
            if result.weights[i] > 1e-4
        ]
        sorted_holdings = sorted(holdings, key=lambda x: -x['weight'])
        # ── Sector aggregation ────────────────────────────────────────────────
        sector_alloc = {}
        for i, (name, sector) in enumerate(zip(asset_names, sectors_list)):
            w = float(result.weights[i])
            if w > 1e-4:
                sector_alloc[sector] = sector_alloc.get(sector, 0.0) + w
        sector_data = [{'sector': s, 'weight': round(w, 6)} for s, w in sector_alloc.items()]

        # ── Log results (format-aware) ────────────────────────────────────────
        if LOG_FORMAT == 'console':
            logger.info(
                "optimization_completed objective=%s sharpe=%.4f return=%.4f vol=%.4f n_active=%d duration=%.0fms",
                objective, result.sharpe_ratio, result.expected_return, result.volatility,
                result.n_active, duration_ms,
            )
            holdings_cap = sorted_holdings[:50]
            logger.info("Holdings (%d):", len(holdings_cap))
            for h in holdings_cap:
                logger.info("  %s: %.1f%% (%s)", h['name'], h['weight'] * 100, h['sector'])
            sector_str = ", ".join("%s %.0f%%" % (s, w * 100) for s, w in sorted(sector_alloc.items(), key=lambda x: -x[1]))
            logger.info("Sectors: %s", sector_str)
        else:
            logger.info("optimization_completed", extra={
                "objective": objective,
                "sharpe_ratio": round(result.sharpe_ratio, 4),
                "n_active": result.n_active,
                "expected_return": round(result.expected_return, 6),
                "volatility": round(result.volatility, 6),
                "duration_ms": duration_ms,
            })
            full_holdings = [(h['name'], round(h['weight'] * 100, 1), h['sector']) for h in sorted_holdings[:50]]
            logger.info("optimization_holdings", extra={
                "n_holdings": len(holdings),
                "holdings": full_holdings,
                "sector_allocation": [{"sector": s, "weight_pct": round(w * 100, 1)} for s, w in sector_alloc.items()],
            })

        # ── Risk metrics (parametric + historical when daily panel available) ─
        risk_metrics = build_risk_metrics_bundle(
            portfolio_volatility=result.volatility,
            weights=result.weights,
            daily_returns=market_payload.daily_returns,
            has_empirical_cov=True,
        )

        # ── Benchmark comparison (light classical methods for reference) ────────
        try:
            from core.optimizers.equal_weight import equal_weight
            from core.optimizers.markowitz import min_variance, markowitz_max_sharpe
            from core.optimizers.hrp import hrp_weights

            def _metrics(w):
                r = float(w @ returns)
                v = float(np.sqrt(w @ covariance @ w))
                sr = r / v if v > 1e-10 else 0.0
                return {'weights': w.tolist(), 'sharpe': round(sr, 4),
                        'expected_return': round(r, 6), 'volatility': round(v, 6)}

            benchmarks = {
                'equal_weight': _metrics(equal_weight(returns, covariance)),
                'min_variance': _metrics(min_variance(returns, covariance)),
                'markowitz': _metrics(markowitz_max_sharpe(returns, covariance,
                                    weight_bounds=(weight_min, weight_max))),
                'hrp': _metrics(hrp_weights(returns, covariance)),
            }
        except Exception:
            benchmarks = {}

        # ── Assemble response (backward-compatible shape) ────────────────────
        # For braket_annealing, reflect the actual backend used (quantum or fallback).
        if braket_fallback:
            stage = getattr(result, 'stage_info', None) or {}
            _bt = stage.get('backend') or 'classical_qubo'
        else:
            _bt = None
        response_payload = {
            'backend_type': _bt,
            'qsw_result': {
                'weights': result.weights.tolist(),
                'sharpe_ratio': round(result.sharpe_ratio, 4),
                'expected_return': round(result.expected_return, 6),
                'volatility': round(result.volatility, 6),
                'n_active': result.n_active,
                'objective': result.objective,
            },
            'weights': result.weights.tolist(),
            'sharpe_ratio': round(result.sharpe_ratio, 4),
            'expected_return': round(result.expected_return, 6),
            'volatility': round(result.volatility, 6),
            'n_active': result.n_active,
            'objective': result.objective,
            'holdings': holdings,
            'sector_allocation': sector_data,
            'risk_metrics': risk_metrics,
            'benchmarks': benchmarks,
            'stage_info': result.stage_info,
            'assets': [
                {
                    'name': asset_names[i],
                    'sector': sectors_list[i] if i < len(sectors_list) else 'Unknown',
                    'return': round(float(returns[i]), 6),
                    'volatility': round(float(covariance[i][i] ** 0.5), 6),
                    'sharpe': round(
                        float(returns[i]) / max(float(covariance[i][i] ** 0.5), 1e-10), 4
                    ),
                }
                for i in range(len(asset_names))
            ],
            'metadata': {
                'tickers': tickers,
                'n_assets': len(asset_names),
                'objective': objective,
                'weight_min': weight_min,
                'weight_max': weight_max,
                'regime': regime,
                'regime_description': regime_params.get('description', ''),
                'lambda_risk_applied': round(lambda_risk, 4),
                'capital': float(data.get('capital', 1.0)),
            },
            'dollar_holdings': [
                {
                    'name': asset_names[i],
                    'sector': sectors_list[i] if i < len(sectors_list) else 'Unknown',
                    'weight': float(result.weights[i]),
                    'dollar_value': float(result.weights[i]) * float(data.get('capital', 1.0)),
                }
                for i in range(len(asset_names))
                if result.weights[i] > 1e-4
            ],
        }
        if getattr(result, "quantum_metadata", None) is not None:
            response_payload["quantum_metadata"] = _safe_serialize_metrics(
                result.quantum_metadata
            )

        if getattr(result, "constraint_report", None) is not None:
            response_payload["constraint_report"] = result.constraint_report

        if getattr(result, "factor_exposures", None) is not None:
            response_payload["factor_exposures"] = result.factor_exposures

        # Include correlation matrix if tickers provided
        if tickers:
            vols = np.sqrt(np.maximum(np.diag(covariance), 1e-10))
            correlation = covariance / np.outer(vols, vols)
            response_payload['correlation_matrix'] = [[float(c) for c in row] for row in correlation.tolist()]

        log_business_audit(
            action='portfolio_optimize',
            payload={'objective': objective, 'n_assets': len(asset_names), 'tickers': tickers},
            result={'sharpe': result.sharpe_ratio, 'n_active': result.n_active},
            status=200,
        )

        # Persist run record so GET /api/runs/{id} can retrieve it later.
        run_id = str(uuid.uuid4())
        try:
            _spec = {
                "objective": objective,
                "weight_min": weight_min,
                "weight_max": weight_max,
                "seed": seed,
                "tickers": tickers or None,
                "n_assets": len(asset_names),
                "K": K,
                "K_screen": K_screen,
                "K_select": K_select,
            }
            _run = lab_run_service.create_run(
                tenant_id=getattr(g, "tenant_id", "anonymous"),
                spec=_spec,
                execution_kind="sync_optimize",
                request_payload=data,
            )
            run_id = _run["id"]
            lab_run_service.update_status(run_id, "completed", result=response_payload)
        except Exception as _persist_err:
            logger.warning("run_persist_failed: %s", _persist_err)
        response_payload["run_id"] = run_id

        return success_response(_safe_serialize_metrics(response_payload))

    except ValueError as e:
        return error_response(str(e), code='BAD_REQUEST', status=400)
    except Exception as e:
        logger.error(f"optimize_portfolio error: {str(e)}", exc_info=True)
        return error_response(f'Internal server error: {str(e)}', code='INTERNAL_ERROR', status=500)


def _post_webhook(url: str, body: dict):
    """Best-effort webhook callback."""
    try:
        payload = json.dumps(body).encode("utf-8")
        req = Request(
            url,
            data=payload,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urlopen(req, timeout=10):
            pass
    except Exception as exc:
        logger.warning(f"webhook_delivery_failed: {exc}")


def _run_job_endpoint(path: str, payload: dict):
    """Execute existing endpoint logic in-process using Flask test client."""
    with app.test_client() as client:
        headers = {}
        inherited_key = payload.pop("__api_key", None)
        if inherited_key:
            headers["X-API-Key"] = inherited_key
        resp = client.post(path, json=payload, headers=headers)
        data = resp.get_json(silent=True) or {}
        if resp.status_code >= 400:
            err = data.get("error")
            msg = err.get("message", str(err)) if isinstance(err, dict) else (err or f"{path} failed with {resp.status_code}")
            raise ValueError(msg)
        return data.get("data", data)


def _submit_async_job(job_type: str, payload: dict, webhook_url: str = ""):
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with _jobs_lock:
        _jobs[job_id] = {
            "job_id": job_id,
            "job_type": job_type,
            "status": "queued",
            "created_at": now,
            "started_at": None,
            "finished_at": None,
            "error": None,
            "result": None,
            "webhook_url": webhook_url or None,
            "tenant_id": getattr(g, "tenant_id", "anonymous"),
        }

    def _runner():
        with _jobs_lock:
            _jobs[job_id]["status"] = "running"
            _jobs[job_id]["started_at"] = datetime.now(timezone.utc).isoformat()
        try:
            if job_type == "optimize":
                result = _run_job_endpoint("/api/portfolio/optimize", dict(payload))
            elif job_type == "backtest":
                result = _run_job_endpoint("/api/portfolio/backtest", dict(payload))
            else:
                raise ValueError(f"Unsupported job type: {job_type}")

            with _jobs_lock:
                _jobs[job_id]["status"] = "completed"
                _jobs[job_id]["result"] = result
                _jobs[job_id]["finished_at"] = datetime.now(timezone.utc).isoformat()
            log_async_audit(
                tenant_id=_jobs[job_id].get("tenant_id", "anonymous"),
                action=f"{job_type}_job_completed",
                payload=payload,
                result={"job_id": job_id, "status": "completed"},
                status=200,
            )

            if webhook_url:
                _post_webhook(
                    webhook_url,
                    {
                        "job_id": job_id,
                        "status": "completed",
                        "result": result,
                    },
                )
        except Exception as exc:
            with _jobs_lock:
                _jobs[job_id]["status"] = "failed"
                _jobs[job_id]["error"] = str(exc)
                _jobs[job_id]["finished_at"] = datetime.now(timezone.utc).isoformat()
            log_async_audit(
                tenant_id=_jobs[job_id].get("tenant_id", "anonymous"),
                action=f"{job_type}_job_failed",
                payload=payload,
                result={"job_id": job_id, "status": "failed", "error": str(exc)},
                status=500,
            )
            if webhook_url:
                _post_webhook(
                    webhook_url,
                    {
                        "job_id": job_id,
                        "status": "failed",
                        "error": str(exc),
                    },
                )

    _executor.submit(_runner)
    return _jobs[job_id]


@app.route('/api/portfolio/optimize/batch', methods=['POST'])
@require_api_key
@limiter.limit("3 per minute")
def optimize_portfolio_batch():
    """
    Batch optimization endpoint.
    Body: {"requests":[{...},{...}], "stop_on_error": false}
    """
    data = request.get_json(silent=True) or {}
    reqs = data.get("requests", [])
    stop_on_error = bool(data.get("stop_on_error", False))
    if not isinstance(reqs, list) or len(reqs) == 0:
        return error_response("requests must be a non-empty list", code='BAD_REQUEST', status=400)
    if len(reqs) > 100:
        return error_response("maximum 100 optimization requests per batch", code='BAD_REQUEST', status=400)

    api_key = request.headers.get("X-API-Key", "")
    results = []
    for idx, payload in enumerate(reqs):
        try:
            if not isinstance(payload, dict):
                raise ValueError("each request payload must be an object")
            local_payload = dict(payload)
            if api_key:
                local_payload["__api_key"] = api_key
            result = _run_job_endpoint("/api/portfolio/optimize", local_payload)
            results.append({"index": idx, "status": "ok", "result": result})
        except Exception as exc:
            results.append({"index": idx, "status": "error", "error": str(exc)})
            if stop_on_error:
                break

    return success_response({"count": len(results), "results": results})


@app.route('/api/portfolio/backtest/batch', methods=['POST'])
@require_api_key
@limiter.limit("3 per minute")
def backtest_portfolio_batch():
    """
    Batch backtest endpoint.
    Body: {"requests":[{tickers, start_date, end_date, ...}, ...], "stop_on_error": false}
    Returns: {"count": N, "results": [{"index": 0, "status": "ok"|"error", "result"|"error": ...}, ...]}
    """
    data = request.get_json(silent=True) or {}
    reqs = data.get("requests", [])
    stop_on_error = bool(data.get("stop_on_error", False))
    if not isinstance(reqs, list) or len(reqs) == 0:
        return error_response("requests must be a non-empty list", code='BAD_REQUEST', status=400)
    if len(reqs) > 50:
        return error_response("maximum 50 backtest requests per batch", code='BAD_REQUEST', status=400)

    results = []
    for idx, payload in enumerate(reqs):
        try:
            if not isinstance(payload, dict):
                raise ValueError("each request payload must be an object")
            result = _run_backtest_payload(payload)
            results.append({"index": idx, "status": "ok", "result": result})
        except Exception as exc:
            results.append({"index": idx, "status": "error", "error": str(exc)})
            if stop_on_error:
                break

    return success_response({"count": len(results), "results": results})


@app.route('/api/jobs/optimize', methods=['POST'])
@require_api_key
@limiter.limit("10 per minute")
def submit_optimize_job():
    """Submit optimization job for async execution."""
    data = request.get_json(silent=True) or {}
    payload = data.get("payload", data)
    webhook_url = data.get("webhook_url", "")
    if not isinstance(payload, dict):
        return error_response("payload must be an object", code='BAD_REQUEST', status=400)
    payload["__api_key"] = request.headers.get("X-API-Key", "")
    job = _submit_async_job("optimize", payload, webhook_url)
    return success_response({"job_id": job["job_id"], "status": job["status"]}, status=202)


@app.route('/api/jobs/backtest', methods=['POST'])
@require_api_key
@limiter.limit("10 per minute")
def submit_backtest_job():
    """Submit backtest job for async execution."""
    data = request.get_json(silent=True) or {}
    payload = data.get("payload", data)
    webhook_url = data.get("webhook_url", "")
    if not isinstance(payload, dict):
        return error_response("payload must be an object", code='BAD_REQUEST', status=400)
    payload["__api_key"] = request.headers.get("X-API-Key", "")
    job = _submit_async_job("backtest", payload, webhook_url)
    return success_response({"job_id": job["job_id"], "status": job["status"]}, status=202)


@app.route('/api/jobs', methods=['GET'])
@require_api_key
def list_jobs():
    """List async in-memory jobs for the current tenant (most recent first)."""
    tenant_id = getattr(g, "tenant_id", "anonymous")
    limit = request.args.get("limit", 20, type=int)
    with _jobs_lock:
        tenant_jobs = [
            j for j in _jobs.values()
            if j.get("tenant_id") == tenant_id
        ]
    tenant_jobs.sort(key=lambda j: j.get("created_at", ""), reverse=True)
    return success_response({"jobs": tenant_jobs[:limit], "count": len(tenant_jobs)})


@app.route('/api/jobs/<job_id>', methods=['GET'])
@require_api_key
def get_job_status(job_id):
    """Get async job status and result."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        return error_response("job not found", code='NOT_FOUND', status=404)
    if job.get("tenant_id") != getattr(g, "tenant_id", "anonymous"):
        return error_response("forbidden", code='FORBIDDEN', status=403)
    return success_response(job)


# ─── Lab Runs (durable experiment registry) ─────────────────────────────────

def _build_optimize_spec(data: dict) -> dict:
    """Extract and normalise the optimization spec from a run request body."""
    objective = data.get("objective", "hybrid")
    objective = {
        "max_sharpe": "markowitz",
        "risk_parity": "hrp",
        "braket_annealing": "qubo_sa",
    }.get(objective, objective)
    bn = data.get("backend_name")
    if isinstance(bn, str):
        bn = bn.strip() or None
    tr_raw = data.get("target_return")
    if tr_raw is None:
        tr_raw = data.get("targetReturn")
    target_return_spec = float(tr_raw) if tr_raw is not None else None
    return {
        "objective": objective,
        "weight_min": float(data.get("weight_min", data.get("minWeight", 0.005))),
        "weight_max": float(data.get("weight_max", data.get("maxWeight", 0.30))),
        "seed": int(data.get("seed", 42)),
        "K": data.get("K"),
        "K_screen": data.get("K_screen"),
        "K_select": data.get("K_select"),
        "lambda_risk": float(data.get("lambda_risk", 1.0)),
        "gamma": float(data.get("gamma", 8.0)),
        "n_layers": int(data.get("n_layers", 3)),
        "n_restarts": int(data.get("n_restarts", 8)),
        "data_mode": data.get("data_mode", "synthetic"),
        "regime": data.get("regime"),
        "tickers": data.get("tickers") or data.get("asset_names"),
        "n_assets": len(data.get("returns", [])) if data.get("returns") else None,
        "backend_name": bn,
        "ibm_backend_mode": str(data.get("ibm_backend_mode") or "auto").lower(),
        "target_return": target_return_spec,
    }


def _lab_run_holdings_and_payload(
    weights: np.ndarray,
    metrics: dict,
    assets: list,
    *,
    stage_info: dict | None = None,
    quantum_metadata: dict | None = None,
    objective: str | None = None,
) -> dict:
    sectors = [a.get("sector", "Unknown") for a in assets]
    asset_names = [a["name"] for a in assets]
    holdings = [
        {
            "name": asset_names[i],
            "sector": sectors[i] if i < len(sectors) else "Unknown",
            "weight": float(weights[i]),
        }
        for i in range(len(weights))
        if weights[i] > 0.005
    ]
    out = {
        "weights": [float(w) for w in weights],
        "sharpe_ratio": float(metrics["sharpe"]),
        "expected_return": float(metrics["return"]),
        "volatility": float(metrics["volatility"]),
        "n_active": int(metrics["n_active"]),
        "holdings": holdings,
        "stage_info": stage_info,
    }
    if objective is not None:
        out["objective"] = objective
    if quantum_metadata is not None:
        out["quantum_metadata"] = quantum_metadata
    return out


def _run_optimize_for_run(run_id: str, tenant_id: str, data: dict, execution_kind: str = "async_optimize") -> None:
    """Background worker: execute optimization and persist result on the run row."""
    lab_run_service.update_status(run_id, "running")
    try:
        market_payload = load_market_payload(data)
        spec = _build_optimize_spec(data)
        assets = market_payload.assets

        if execution_kind == "ibm_runtime":
            ibm_objective = spec.get("objective", "vqe")
            ibm_service = ibm_quantum_service.get_service()
            if ibm_objective == "hybrid_qaoa":
                w, info = _hybrid_qaoa_weights(
                    market_payload.returns,
                    market_payload.covariance,
                    K_screen=int(spec["K_screen"]) if spec.get("K_screen") is not None else None,
                    K_select=int(spec["K_select"]) if spec.get("K_select") is not None else None,
                    p=int(spec.get("p", 2)),
                    lambda_risk=spec["lambda_risk"],
                    gamma=spec["gamma"],
                    n_qaoa_restarts=spec["n_restarts"],
                    weight_bounds=(spec["weight_min"], spec["weight_max"]),
                    seed=spec["seed"],
                    ibm_service=ibm_service,
                    backend_name=spec.get("backend_name"),
                    backend_mode=spec.get("ibm_backend_mode") or "auto",
                )
                stage_info_payload = {
                    "stage2_solver": "qaoa_ibm",
                    "stage2_selected_idx": info.stage2_selected_idx,
                    "stage2_qubo_obj": info.stage2_qubo_obj,
                    "stage3_sharpe": info.stage3_sharpe,
                }
                qmeta = {"execution_kind": "ibm_runtime", "objective": "hybrid_qaoa"}
                metrics = _portfolio_metrics(w, market_payload.returns, market_payload.covariance)
                result_payload = _lab_run_holdings_and_payload(
                    w, metrics, assets,
                    stage_info=stage_info_payload,
                    quantum_metadata=qmeta,
                    objective="hybrid_qaoa",
                )
            elif ibm_objective == "qaoa":
                w, qmeta = qaoa_weights_ibm_strict(
                    market_payload.returns,
                    market_payload.covariance,
                    K=int(spec["K"]) if spec.get("K") is not None else None,
                    p=int(spec.get("p", 2)),
                    lambda_risk=spec["lambda_risk"],
                    gamma=spec["gamma"],
                    n_restarts=spec["n_restarts"],
                    seed=spec["seed"],
                    backend_name=spec.get("backend_name"),
                    backend_mode=spec.get("ibm_backend_mode") or "auto",
                )
                qmeta = dict(qmeta)
                qmeta["execution_kind"] = "ibm_runtime"
                _record_tenant_jobs(tenant_id, qmeta.get("ibm_job_ids") or [])
                metrics = _portfolio_metrics(w, market_payload.returns, market_payload.covariance)
                result_payload = _lab_run_holdings_and_payload(
                    w, metrics, assets,
                    stage_info=None,
                    quantum_metadata=qmeta,
                    objective=ibm_objective,
                )
            else:
                w, qmeta = vqe_weights_ibm_strict(
                    market_payload.returns,
                    market_payload.covariance,
                    n_layers=spec["n_layers"],
                    n_restarts=spec["n_restarts"],
                    weight_min=spec["weight_min"],
                    weight_max=spec["weight_max"],
                    seed=spec["seed"],
                    backend_name=spec.get("backend_name"),
                    backend_mode=spec.get("ibm_backend_mode") or "auto",
                )
                qmeta = dict(qmeta)
                qmeta["execution_kind"] = "ibm_runtime"
                _record_tenant_jobs(tenant_id, qmeta.get("ibm_job_ids") or [])
                metrics = _portfolio_metrics(w, market_payload.returns, market_payload.covariance)
                result_payload = _lab_run_holdings_and_payload(
                    w, metrics, assets,
                    stage_info=None,
                    quantum_metadata=qmeta,
                    objective=ibm_objective,
                )
        else:
            tr_raw = data.get("target_return")
            if tr_raw is None:
                tr_raw = data.get("targetReturn")
            if spec["objective"] == "target_return" and tr_raw is None:
                tr_raw = float(np.mean(market_payload.returns))
            target_return_val = float(tr_raw) if tr_raw is not None else None
            result = run_optimization(
                returns=market_payload.returns,
                covariance=market_payload.covariance,
                objective=spec["objective"],
                target_return=target_return_val,
                asset_names=[a["name"] for a in market_payload.assets],
                K=int(spec["K"]) if spec.get("K") is not None else None,
                K_screen=int(spec["K_screen"]) if spec.get("K_screen") is not None else None,
                K_select=int(spec["K_select"]) if spec.get("K_select") is not None else None,
                lambda_risk=spec["lambda_risk"],
                gamma=spec["gamma"],
                n_layers=spec["n_layers"],
                n_restarts=spec["n_restarts"],
                weight_min=spec["weight_min"],
                weight_max=spec["weight_max"],
                seed=spec["seed"],
            )
            metrics = {
                "sharpe": result.sharpe_ratio,
                "return": result.expected_return,
                "volatility": result.volatility,
                "n_active": result.n_active,
            }
            result_payload = _lab_run_holdings_and_payload(
                result.weights,
                metrics,
                assets,
                stage_info=result.stage_info,
                quantum_metadata=None,
                objective=None,
            )
            result_payload["objective"] = spec["objective"]
            if getattr(result, "factor_exposures", None) is not None:
                result_payload["factor_exposures"] = result.factor_exposures

        lab_run_service.update_status(run_id, "completed", result=result_payload)
        log_async_audit(tenant_id, "run_completed", {"run_id": run_id}, {"status": "completed"}, 200)
    except Exception as exc:
        logger.error("run_failed run_id=%s: %s", run_id, exc, exc_info=True)
        lab_run_service.update_status(run_id, "failed", error=str(exc))
        log_async_audit(tenant_id, "run_failed", {"run_id": run_id}, {"error": str(exc)}, 500)


@app.route('/api/runs', methods=['POST'])
@require_api_key
@limiter.limit("10 per minute")
def create_run():
    """Create a durable lab run — enqueues optimization in background."""
    data = request.get_json(silent=True) or {}
    payload = data.get("payload", data)
    if not isinstance(payload, dict):
        return error_response("payload must be an object", code='BAD_REQUEST', status=400)
    execution_kind = str(data.get("execution_kind", "async_optimize"))
    spec = _build_optimize_spec(payload)
    if spec["objective"] not in OBJECTIVES:
        return error_response(
            f"Unknown objective '{spec['objective']}'. Valid: {list(OBJECTIVES.keys())}",
            code='BAD_REQUEST', status=400,
        )
    ibm_mode = spec.get("ibm_backend_mode") or "auto"
    if ibm_mode not in ("auto", "simulator", "hardware"):
        return error_response(
            f"Invalid ibm_backend_mode {ibm_mode!r}; use auto, simulator, or hardware",
            code='BAD_REQUEST', status=400,
        )

    _IBM_RUNTIME_OBJECTIVES = ("vqe", "qaoa", "hybrid_qaoa")
    if execution_kind == "ibm_runtime":
        if spec["objective"] not in _IBM_RUNTIME_OBJECTIVES:
            return error_response(
                f"execution_kind ibm_runtime requires objective in {list(_IBM_RUNTIME_OBJECTIVES)}",
                code='BAD_REQUEST', status=400,
            )
        if not ibm_quantum_service.is_configured():
            return error_response(
                "execution_kind ibm_runtime requires IBM Quantum to be configured "
                "(POST /api/config/ibm-quantum with a valid token)",
                code='BAD_REQUEST', status=400,
            )
        na = spec.get("n_assets")
        if na is not None and na > MAX_IBM_QUBITS:
            return error_response(
                f"Universe size {na} exceeds MAX_IBM_QUBITS ({MAX_IBM_QUBITS}) for IBM Runtime",
                code='BAD_REQUEST', status=400,
            )
    tenant_id = getattr(g, "tenant_id", "anonymous")
    run = lab_run_service.create_run(
        tenant_id, spec, execution_kind, request_payload=payload
    )
    _executor.submit(_run_optimize_for_run, run["id"], tenant_id, payload, execution_kind)
    log_business_audit("run_created", {"run_id": run["id"], "spec": spec}, {"status": "queued"}, 202)
    return success_response({"run_id": run["id"], "status": "queued"}, status=202)


@app.route('/api/runs/<run_id>', methods=['GET'])
@require_api_key
def get_run(run_id):
    """Fetch a lab run by id (tenant-scoped)."""
    tenant_id = getattr(g, "tenant_id", "anonymous")
    run = lab_run_service.get_run(run_id, tenant_id)
    if not run:
        return error_response("run not found", code='NOT_FOUND', status=404)
    return success_response(run)


@app.route('/api/runs', methods=['GET'])
@require_api_key
def list_runs():
    """List recent lab runs for the current tenant."""
    tenant_id = getattr(g, "tenant_id", "anonymous")
    limit = request.args.get("limit", 20, type=int)
    runs = lab_run_service.list_runs(tenant_id, limit=limit)
    return success_response({"runs": runs, "count": len(runs)})


@app.route('/api/runs/<run_id>/stream', methods=['GET'])
@require_api_key
def stream_run(run_id):
    """Server-Sent Events stream for lab run status. Closes when run reaches terminal state."""
    import time as _time
    tenant_id = getattr(g, "tenant_id", "anonymous")

    def _event_stream():
        terminal = {"completed", "failed"}
        for _ in range(120):
            run = lab_run_service.get_run(run_id, tenant_id)
            if run is None:
                yield f"event: error\ndata: {json.dumps({'error': 'not found'})}\n\n"
                return
            yield f"data: {json.dumps({'status': run['status'], 'id': run_id})}\n\n"
            if run["status"] in terminal:
                return
            _time.sleep(5)
        yield f"event: timeout\ndata: {json.dumps({'status': 'timeout'})}\n\n"

    return Response(
        _event_stream(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


def _admin_authorized() -> bool:
    admin_key = os.getenv("ADMIN_API_KEY", "")
    if not admin_key:
        return False
    return request.headers.get("X-Admin-Key", "") == admin_key


@app.route('/api/admin/api-keys', methods=['POST'])
@limiter.limit("30 per minute")
def admin_create_api_key():
    """Admin endpoint to create tenant API keys."""
    if not _admin_authorized():
        return error_response("unauthorized", code='UNAUTHORIZED', status=401)
    data = request.get_json(silent=True) or {}
    tenant_id = str(data.get("tenant_id", "")).strip()
    key_name = str(data.get("key_name", "")).strip()
    if not tenant_id:
        return error_response("tenant_id is required", code='BAD_REQUEST', status=400)
    plain_key = _create_api_key(tenant_id=tenant_id, key_name=key_name)
    return success_response({"tenant_id": tenant_id, "key_name": key_name, "api_key": plain_key}, status=201)


@app.route('/api/admin/api-keys', methods=['GET'])
@limiter.limit("60 per minute")
def admin_list_api_keys():
    """Admin endpoint to list tenants and key usage."""
    if not _admin_authorized():
        return error_response("unauthorized", code='UNAUTHORIZED', status=401)
    conn = _db_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT tenant_id, key_name, is_active, created_at, last_used_at, usage_count
            FROM api_keys
            ORDER BY created_at DESC
            """
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    return success_response(
        {
            "keys": [
                {
                    "tenant_id": r[0],
                    "key_name": r[1],
                    "is_active": bool(r[2]),
                    "created_at": r[3],
                    "last_used_at": r[4],
                    "usage_count": int(r[5] or 0),
                }
                for r in rows
            ]
        }
    )

@app.route('/api/config/objectives', methods=['GET'])
@limiter.exempt
def get_config_objectives():
    """Return available optimization objectives."""
    return success_response({
        'objectives': [{'id': k, **v} for k, v in OBJECTIVES_CONFIG.items()]
    })


@app.route('/api/config/constraints', methods=['GET'])
@require_api_key
def get_constraints_schema():
    """Return schema for Phase 2 portfolio constraints."""
    return success_response({
        'sector_limits': {
            'type': 'object',
            'description': 'Max weight per sector, e.g. {"Technology": 0.30, "Finance": 0.25}',
            'example': {'Technology': 0.30}
        },
        'sector_min': {
            'type': 'object',
            'description': 'Min weight per sector',
            'example': {'Healthcare': 0.05}
        },
        'max_sector_weight': {
            'type': 'number',
            'description': 'Global cap for any sector (e.g. 0.40 = 40%)'
        },
        'cardinality': {
            'type': 'integer',
            'description': 'Exact number of positions (top-k heuristic)'
        },
        'min_cardinality': {'type': 'integer', 'description': 'Minimum number of positions'},
        'max_cardinality': {'type': 'integer', 'description': 'Maximum number of positions'},
        'blacklist': {
            'type': 'array',
            'items': {'type': 'string'},
            'description': 'Tickers to exclude'
        },
        'whitelist': {
            'type': 'array',
            'items': {'type': 'string'},
            'description': 'If non-empty, only these tickers allowed'
        },
        'turnover_budget': {'type': 'number', 'description': 'Max turnover per rebalance (e.g. 0.20)'}
    })


@app.route('/api/config/presets', methods=['GET'])
@limiter.exempt
def get_config_presets():
    """Return available strategy presets."""
    return success_response({
        'presets': [{'id': k, **v} for k, v in PRESETS_CONFIG.items()]
    })


@app.route('/api/config/ibm-quantum', methods=['POST'])
@require_api_key
def set_ibm_quantum_token():
    """
    Store an IBM Quantum API token and verify connectivity.

    Body: {"token": "<IBM Quantum API token>", "instance": "<optional CRN>"} (alias: crn)
    Tenant: integration_effective_tenant_id() (X-Tenant-Id when using static API_KEY).

    On success returns {"ok": true, "backends": ["ibm_kyiv", ...]}
    On failure returns {"ok": false, "error": "..."} with HTTP 400.
    """
    body = request.get_json(silent=True) or {}
    token = body.get('token', '')
    if not token:
        return error_response('token field is required', 400)
    instance_crn = (body.get('instance') or body.get('crn') or '').strip() or None

    tid = integration_effective_tenant_id()
    result = ibm_quantum_service.set_token(tid, token, instance_crn)
    if not result.get('ok'):
        return error_response(result.get('error', 'IBM Quantum connection failed'), 400)

    try:
        log_business_audit(
            "ibm_quantum_connect",
            {"tenant_id": tid},
            {"ok": True, "n_backends": len(result.get("backends") or [])},
            200,
        )
    except Exception:
        pass
    return success_response({**result, "tenant_id": tid})


@app.route('/api/config/ibm-quantum/verify', methods=['POST'])
@require_api_key
def verify_ibm_quantum_token():
    """
    Validate an IBM Quantum API token without persisting (dry-run).

    Body: {"token": "<IBM Quantum API token>", "instance": "<optional CRN>"} (alias: crn)
    Tenant: integration_effective_tenant_id() (X-Tenant-Id when using static API_KEY).

    On success returns ok, backends, ibm_instances, ibm_active_instance, tenant_id.
    On failure returns 400 with error message (same shape as connect failure).
    """
    body = request.get_json(silent=True) or {}
    token = body.get('token', '')
    if not token:
        return error_response('token field is required', 400)
    instance_crn = (body.get('instance') or body.get('crn') or '').strip() or None

    tid = integration_effective_tenant_id()
    result = ibm_quantum_service.verify_token(tid, token, instance_crn)
    if not result.get('ok'):
        return error_response(result.get('error', 'IBM Quantum verification failed'), 400)

    return success_response(result)


@app.route('/api/config/ibm-quantum', methods=['DELETE'])
@require_api_key
def clear_ibm_quantum_token():
    """Remove the stored IBM Quantum token for the effective tenant."""
    tid = integration_effective_tenant_id()
    ibm_quantum_service.clear_token(tid)
    try:
        log_business_audit("ibm_quantum_disconnect", {"tenant_id": tid}, {"cleared": True}, 200)
    except Exception:
        pass
    return success_response({'cleared': True, 'tenant_id': tid})


@app.route('/api/config/ibm-quantum/status', methods=['GET'])
@limiter.exempt
def get_ibm_quantum_status():
    """Return IBM Quantum connection status for the effective tenant."""
    tid = integration_effective_tenant_id()
    status = ibm_quantum_service.get_status(tid)
    status['integration_context'] = {
        'tenant_id': tid,
        'secrets_persistence': ibm_quantum_service.secrets_persistence_enabled(),
        'api_db_basename': os.path.basename(API_DB_PATH),
    }
    return success_response(status)


@app.route('/api/config/ibm-quantum/workloads', methods=['GET'])
@require_api_key
def get_ibm_quantum_workloads():
    """
    List recent IBM Quantum Runtime jobs for the effective tenant (requires API key).

    Query: limit (default 20, max 100).
    """
    raw_limit = request.args.get('limit', default=20, type=int)
    if raw_limit is None:
        raw_limit = 20
    tid = integration_effective_tenant_id()
    known_ids = _get_tenant_job_ids(tid)
    result = ibm_quantum_service.list_runtime_workloads(
        tid, limit=raw_limit, known_job_ids=known_ids if known_ids else None
    )
    if not result.get('ok'):
        err = result.get('error') or 'Unable to list IBM Quantum workloads'
        err_l = err.lower()
        if 'not installed' in err_l:
            http_status = 503
        elif not result.get('configured'):
            http_status = 400
        else:
            http_status = 502
        return error_response(
            err,
            code='IBM_WORKLOADS_UNAVAILABLE',
            status=http_status,
        )
    try:
        log_business_audit(
            'ibm_quantum_workloads_list',
            {'tenant_id': tid},
            {'count': len(result.get('workloads') or [])},
            200,
        )
    except Exception:
        pass
    return success_response(result)


@app.route('/api/config/ibm-quantum/smoke-test', methods=['POST'])
@require_api_key
def post_ibm_quantum_smoke_test():
    """
    VQE-shaped IBM Runtime smoke: market data (tickers or returns/covariance) + one EfficientSU2 sample.

    Body:
      mode: "hardware" | "simulator" (default hardware)
      tickers: optional list of symbols (default Mag 7 + JPM when omitted)
      start_date / end_date: optional yfinance window (or startDate / endDate)
      returns / covariance: optional matrix path (same as portfolio optimize)
      asset_names: optional with matrix path
    Tenant: integration_effective_tenant_id().
    """
    body = request.get_json(silent=True) or {}
    mode = (body.get('mode') or 'hardware').strip().lower()
    if mode not in ('hardware', 'simulator'):
        return error_response("mode must be 'hardware' or 'simulator'", 400)

    market_payload = {}
    if body.get('returns') is not None and body.get('covariance') is not None:
        market_payload['returns'] = body.get('returns')
        market_payload['covariance'] = body.get('covariance')
        if body.get('asset_names') is not None:
            market_payload['asset_names'] = body.get('asset_names')
    else:
        if body.get('tickers') is not None:
            market_payload['tickers'] = body.get('tickers')
        sd = body.get('start_date') or body.get('startDate')
        ed = body.get('end_date') or body.get('endDate')
        if sd:
            market_payload['start_date'] = sd
        if ed:
            market_payload['end_date'] = ed

    tid = integration_effective_tenant_id()
    result = ibm_quantum_service.hardware_smoke_test(
        tid, mode=mode, market_payload=market_payload or None
    )
    # Record the job ID so this tenant can retrieve their own workload history.
    if result.get('ok') and result.get('job_id'):
        _record_tenant_jobs(tid, [result['job_id']])
    if not result.get('ok'):
        err = result.get('error') or 'IBM Quantum smoke test failed'
        err_l = err.lower()
        if 'not installed' in err_l:
            http_status = 503
        elif result.get('configured') is False:
            http_status = 400
        else:
            http_status = 502
        return error_response(
            err,
            code='IBM_SMOKE_TEST_FAILED',
            status=http_status,
        )
    try:
        log_business_audit(
            'ibm_quantum_smoke_test',
            {'tenant_id': tid},
            {
                'backend': result.get('backend'),
                'mode': result.get('mode'),
                'simulator': result.get('simulator'),
                'elapsed_ms': result.get('elapsed_ms'),
                'n_assets': result.get('n_assets'),
                'market_source': result.get('market_source'),
                'smoke_profile': result.get('smoke_profile'),
            },
            200,
        )
    except Exception:
        pass
    return success_response(result)


@app.route('/api/config/braket/smoke-test', methods=['POST'])
@require_api_key
def post_braket_smoke_test():
    """
    QUBO-shaped Braket / D-Wave smoke test.

    Runs a small portfolio QUBO on the configured Braket backend (mock or real device)
    and returns a machine-readable artifact with timing and portfolio metrics.

    Body (all optional):
      returns / covariance: matrix path (same shape as /api/portfolio/optimize)
      asset_names: optional list of names (with matrix path)
      n: number of synthetic assets when matrices are not supplied (default 5)
      seed: random seed for synthetic data (default 42)

    Requires X-API-Key header.
    Uses BRAKET_* environment variables (no tenant-scoped token needed).
    """
    body = request.get_json(silent=True) or {}

    market_payload: dict = {}
    if body.get('returns') is not None and body.get('covariance') is not None:
        market_payload['returns'] = body['returns']
        market_payload['covariance'] = body['covariance']
        if body.get('asset_names') is not None:
            market_payload['asset_names'] = body['asset_names']
    else:
        if body.get('n') is not None:
            market_payload['n'] = int(body['n'])
        if body.get('seed') is not None:
            market_payload['seed'] = int(body['seed'])

    from services.braket_backend import braket_smoke_test
    result = braket_smoke_test(market_payload or None)

    if not result.get('ok'):
        err = result.get('error') or 'Braket smoke test failed'
        err_l = err.lower()
        if 'not installed' in err_l or 'not available' in err_l:
            http_status = 503
        else:
            http_status = 502
        return error_response(err, code='BRAKET_SMOKE_TEST_FAILED', status=http_status)

    try:
        log_business_audit(
            'braket_smoke_test',
            {},
            {
                'backend': result.get('backend'),
                'device': result.get('device'),
                'use_mock': result.get('use_mock'),
                'elapsed_ms': result.get('elapsed_ms'),
                'n_assets': result.get('n_assets'),
                'market_source': result.get('market_source'),
                'smoke_profile': result.get('smoke_profile'),
            },
            200,
        )
    except Exception:
        pass
    return success_response(result)


@app.route('/api/config/tenants', methods=['GET'])
@limiter.exempt
def list_integration_tenants():
    """
    Return the tenant(s) visible to the caller.

    Admin static API key  → full list from DB (enterprise management).
    DB-issued API key     → single entry for that key's tenant.
    Anonymous (session UUID in X-Tenant-Id) → single entry for that UUID.

    Anonymous users NEVER see 'default' or any other tenant's ID —
    each browser session is its own isolated namespace.
    """
    client_key = request.headers.get("X-API-Key", "")

    # Admin static key: enumerate all tenant IDs for enterprise management.
    if API_KEY and client_key == API_KEY:
        from services.tenant_integrations import list_tenant_ids
        tenants = list_tenant_ids(_db_conn)
        return success_response(
            {"tenants": [{"id": t, "label": t} for t in tenants]}
        )

    # DB-issued API key: only that key's own tenant.
    tenant = _lookup_tenant_by_key(client_key) if client_key else None
    if tenant:
        t = str(tenant["tenant_id"])
        return success_response({"tenants": [{"id": t, "label": "My Account"}]})

    # Anonymous session: resolve to the UUID from X-Tenant-Id.
    # integration_effective_tenant_id() already validates the UUID format
    # and will NOT fall back to "default" for properly-formed UUIDs.
    tid = integration_effective_tenant_id()
    return success_response({"tenants": [{"id": tid, "label": "My Session"}]})


@app.route('/api/config/tenants', methods=['POST'])
@require_api_key
def create_integration_tenant():
    """Create a named tenant entry (admin static API key only)."""
    client_key = request.headers.get("X-API-Key", "")
    if not (API_KEY and client_key == API_KEY):
        return error_response("Admin API key required", code="FORBIDDEN", status=403)
    body = request.get_json(silent=True) or {}
    tenant_id = (body.get("id") or "").strip()
    if not tenant_id or not _SAFE_TENANT_RE.match(tenant_id):
        return error_response(
            "id must be 8-64 alphanumeric/hyphen/underscore chars",
            code="BAD_REQUEST", status=400,
        )
    try:
        conn = _db_conn()
        conn.execute(
            "INSERT OR IGNORE INTO api_keys (key_hash, tenant_id, label, is_active, created_at) "
            "VALUES (?, ?, ?, 1, ?)",
            (f"__placeholder__{tenant_id}", tenant_id, f"Tenant {tenant_id}",
             datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        return error_response(f"Could not create tenant: {exc}", code="DB_ERROR", status=500)
    return success_response({"created": True, "id": tenant_id})


@app.route('/api/config/integrations', methods=['GET'])
@limiter.exempt
def get_integrations_catalog():
    """IBM + Braket (and env) status for the effective tenant."""
    from services.tenant_integrations import load_braket_metadata

    tid = integration_effective_tenant_id()
    ibm = ibm_quantum_service.get_status(tid)
    braket_env = os.getenv("BRAKET_ENABLED", "false").lower() == "true"
    br_meta = load_braket_metadata(_db_conn, tid) or {}
    return success_response(
        {
            "tenant_id": tid,
            "providers": [
                {
                    "id": "ibm",
                    "label": "IBM Quantum",
                    "configured": ibm.get("configured"),
                    "backends": ibm.get("backends") or [],
                    "error": ibm.get("error"),
                    "tenant_id": ibm.get("tenant_id", tid),
                },
                {
                    "id": "braket",
                    "label": "AWS Braket",
                    "configured": braket_env,
                    "env_enabled": braket_env,
                    "tenant_preferences": br_meta,
                    "note": "Annealing path uses BRAKET_* env; optional per-tenant JSON in DB.",
                },
            ],
        }
    )


# ─────────────────────────────────────────────────────────────────────────────
# JWT Authentication Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/auth/login', methods=['POST'])
@limiter.limit("20 per minute")
def login():
    """
    Authenticate user and return JWT tokens.
    
    For MVP: accepts any valid API key or demo credentials.
    In production: integrate with proper auth provider.
    """
    data = request.json
    if not data:
        return error_response('Request body required', code='BAD_REQUEST', status=400)
    
    username = data.get('username', '')
    password = data.get('password', '')
    api_key = data.get('api_key', '')
    
    # Demo mode: accept any non-empty credentials
    if os.getenv('DEMO_MODE', 'true').lower() == 'true':
        if username or api_key:
            tenant_id = data.get('tenant_id', 'default')
            access = create_access_token(user_id=username or 'demo_user', tenant_id=tenant_id)
            refresh = create_refresh_token(user_id=username or 'demo_user', tenant_id=tenant_id)
            
            return success_response({
                'access_token': access,
                'refresh_token': refresh,
                'token_type': 'Bearer',
                'expires_in': 3600,  # 1 hour
            })
    
    # Production mode: validate API key
    if api_key:
        tenant_info = _lookup_tenant_by_key(api_key)
        if tenant_info:
            access = create_access_token(
                user_id=tenant_info['tenant_id'],
                tenant_id=tenant_info['tenant_id']
            )
            refresh = create_refresh_token(
                user_id=tenant_info['tenant_id'],
                tenant_id=tenant_info['tenant_id']
            )
            
            return success_response({
                'access_token': access,
                'refresh_token': refresh,
                'token_type': 'Bearer',
                'expires_in': 3600,
            })
    
    return error_response('Invalid credentials', code='UNAUTHORIZED', status=401)


@app.route('/api/auth/refresh', methods=['POST'])
@limiter.limit("20 per minute")
def refresh():
    """Refresh access token using refresh token."""
    data = request.json
    if not data:
        return error_response('Request body required', code='BAD_REQUEST', status=400)
    
    refresh_token = data.get('refresh_token')
    if not refresh_token:
        return error_response('Refresh token required', code='BAD_REQUEST', status=400)
    
    # Verify refresh token
    payload = verify_token(refresh_token)
    if not payload or payload.get('type') != 'refresh':
        return error_response('Invalid or expired refresh token', code='UNAUTHORIZED', status=401)
    
    user_id = payload.get('sub')
    tenant_id = payload.get('tenant_id', 'default')
    
    # Create new access token
    access = create_access_token(user_id=user_id, tenant_id=tenant_id)
    
    return success_response({
        'access_token': access,
        'token_type': 'Bearer',
        'expires_in': 3600,
    })


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout and revoke current token."""
    auth_header = request.headers.get('Authorization', '')
    
    if not auth_header or not auth_header.startswith('Bearer '):
        return error_response('Authorization header required', code='BAD_REQUEST', status=400)
    
    token = auth_header.split(' ')[1]
    
    if revoke_token(token):
        return success_response({'message': 'Successfully logged out'})
    else:
        return error_response('Failed to revoke token', code='INTERNAL_ERROR', status=500)


@app.route('/api/auth/me', methods=['GET'])
def get_current_user_info():
    """Get current authenticated user information."""
    # Try JWT first
    if JWT_AVAILABLE:
        try:
            user = get_current_user()
            if user:
                return success_response(user)
        except Exception:
            pass
    
    # Fallback to API key auth
    api_key = request.headers.get('X-API-Key', '')
    if api_key:
        tenant_info = _lookup_tenant_by_key(api_key)
        if tenant_info:
            return success_response({
                'user_id': tenant_info['tenant_id'],
                'tenant_id': tenant_info['tenant_id'],
                'auth_method': 'api_key',
            })
    
    return error_response('Not authenticated', code='UNAUTHORIZED', status=401)


@app.route('/api/auth/api-keys', methods=['POST'])
@require_api_key
def create_api_key_endpoint():
    """Create a new API key for tenant."""
    data = request.json or {}
    tenant_id = data.get('tenant_id', getattr(g, 'tenant_id', 'default'))
    key_name = data.get('key_name', '')
    
    # Generate new API key
    plain_key = generate_api_key(tenant_id, key_name)
    key_hash = hash_api_key(plain_key)
    
    # Store in database
    try:
        conn = _db_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO api_keys (key_hash, tenant_id, key_name, is_active, created_at)
            VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
            """,
            (key_hash, tenant_id, key_name or "")
        )
        conn.commit()
        conn.close()
        
        return success_response({
            'api_key': plain_key,
            'key_name': key_name,
            'tenant_id': tenant_id,
            'message': 'Store this key securely - it cannot be retrieved again',
        })
    except Exception as e:
        logger.error(f"Failed to create API key: {e}")
        return error_response(f'Failed to create API key: {str(e)}', code='INTERNAL_ERROR', status=500)


# ─────────────────────────────────────────────────────────────────────────────
# Ticker catalog & search
# ─────────────────────────────────────────────────────────────────────────────
_TICKER_CATALOG = [
    {"symbol":"SPY","name":"SPDR S&P 500 ETF","sector":"Broad Market","type":"etf"},
    {"symbol":"QQQ","name":"Invesco Nasdaq 100 ETF","sector":"Broad Market","type":"etf"},
    {"symbol":"DIA","name":"SPDR Dow Jones Industrial ETF","sector":"Broad Market","type":"etf"},
    {"symbol":"IWM","name":"iShares Russell 2000 ETF","sector":"Broad Market","type":"etf"},
    {"symbol":"VTI","name":"Vanguard Total Stock Market ETF","sector":"Broad Market","type":"etf"},
    {"symbol":"VOO","name":"Vanguard S&P 500 ETF","sector":"Broad Market","type":"etf"},
    {"symbol":"VEA","name":"Vanguard FTSE Developed Markets","sector":"International","type":"etf"},
    {"symbol":"VWO","name":"Vanguard FTSE Emerging Markets","sector":"International","type":"etf"},
    {"symbol":"BND","name":"Vanguard Total Bond Market ETF","sector":"Fixed Income","type":"etf"},
    {"symbol":"AGG","name":"iShares Core US Aggregate Bond","sector":"Fixed Income","type":"etf"},
    {"symbol":"TLT","name":"iShares 20+ Year Treasury Bond","sector":"Fixed Income","type":"etf"},
    {"symbol":"GLD","name":"SPDR Gold Shares","sector":"Commodities","type":"etf"},
    {"symbol":"XLK","name":"Technology Select Sector SPDR","sector":"Technology","type":"etf"},
    {"symbol":"XLF","name":"Financial Select Sector SPDR","sector":"Financials","type":"etf"},
    {"symbol":"XLE","name":"Energy Select Sector SPDR","sector":"Energy","type":"etf"},
    {"symbol":"XLV","name":"Health Care Select Sector SPDR","sector":"Healthcare","type":"etf"},
    {"symbol":"AAPL","name":"Apple Inc.","sector":"Technology","type":"stock"},
    {"symbol":"MSFT","name":"Microsoft Corporation","sector":"Technology","type":"stock"},
    {"symbol":"GOOGL","name":"Alphabet Inc.","sector":"Technology","type":"stock"},
    {"symbol":"AMZN","name":"Amazon.com Inc.","sector":"Consumer Disc","type":"stock"},
    {"symbol":"NVDA","name":"NVIDIA Corporation","sector":"Technology","type":"stock"},
    {"symbol":"META","name":"Meta Platforms Inc.","sector":"Communication","type":"stock"},
    {"symbol":"TSLA","name":"Tesla Inc.","sector":"Consumer Disc","type":"stock"},
    {"symbol":"JPM","name":"JPMorgan Chase & Co.","sector":"Financials","type":"stock"},
    {"symbol":"V","name":"Visa Inc.","sector":"Financials","type":"stock"},
    {"symbol":"JNJ","name":"Johnson & Johnson","sector":"Healthcare","type":"stock"},
    {"symbol":"UNH","name":"UnitedHealth Group Inc.","sector":"Healthcare","type":"stock"},
    {"symbol":"HD","name":"Home Depot Inc.","sector":"Consumer Disc","type":"stock"},
    {"symbol":"PG","name":"Procter & Gamble Co.","sector":"Consumer Stpl","type":"stock"},
    {"symbol":"MA","name":"Mastercard Inc.","sector":"Financials","type":"stock"},
    {"symbol":"BAC","name":"Bank of America Corp.","sector":"Financials","type":"stock"},
    {"symbol":"XOM","name":"Exxon Mobil Corporation","sector":"Energy","type":"stock"},
    {"symbol":"CVX","name":"Chevron Corporation","sector":"Energy","type":"stock"},
    {"symbol":"WMT","name":"Walmart Inc.","sector":"Consumer Stpl","type":"stock"},
    {"symbol":"KO","name":"Coca-Cola Company","sector":"Consumer Stpl","type":"stock"},
    {"symbol":"PFE","name":"Pfizer Inc.","sector":"Healthcare","type":"stock"},
    {"symbol":"ABBV","name":"AbbVie Inc.","sector":"Healthcare","type":"stock"},
    {"symbol":"MRK","name":"Merck & Co. Inc.","sector":"Healthcare","type":"stock"},
    {"symbol":"NFLX","name":"Netflix Inc.","sector":"Communication","type":"stock"},
    {"symbol":"DIS","name":"Walt Disney Company","sector":"Communication","type":"stock"},
    {"symbol":"ADBE","name":"Adobe Inc.","sector":"Technology","type":"stock"},
    {"symbol":"CRM","name":"Salesforce Inc.","sector":"Technology","type":"stock"},
    {"symbol":"AMD","name":"Advanced Micro Devices Inc.","sector":"Technology","type":"stock"},
    {"symbol":"INTC","name":"Intel Corporation","sector":"Technology","type":"stock"},
    {"symbol":"CSCO","name":"Cisco Systems Inc.","sector":"Technology","type":"stock"},
    {"symbol":"NKE","name":"Nike Inc.","sector":"Consumer Disc","type":"stock"},
    {"symbol":"PEP","name":"PepsiCo Inc.","sector":"Consumer Stpl","type":"stock"},
    {"symbol":"T","name":"AT&T Inc.","sector":"Communication","type":"stock"},
    {"symbol":"VZ","name":"Verizon Communications Inc.","sector":"Communication","type":"stock"},
    {"symbol":"PYPL","name":"PayPal Holdings Inc.","sector":"Financials","type":"stock"},
]


@app.route('/api/tickers/search', methods=['GET'])
@require_api_key
@limiter.limit("30 per minute")
def search_tickers():
    """
    Search the ticker catalog by query string.
    Query params: q (search query), limit (max results, default 15).
    Returns matches sorted: exact symbol > symbol prefix > name/sector match.
    """
    q = request.args.get('q', '').strip()
    limit = min(int(request.args.get('limit', 15)), 50)
    if not q:
        return success_response({"results": _TICKER_CATALOG[:limit]})

    q_upper = q.upper()
    q_lower = q.lower()
    exact, prefix, name_match = [], [], []
    for entry in _TICKER_CATALOG:
        if entry["symbol"] == q_upper:
            exact.append(entry)
        elif entry["symbol"].startswith(q_upper):
            prefix.append(entry)
        elif q_lower in entry["name"].lower() or q_lower in entry["sector"].lower():
            name_match.append(entry)
    results = (exact + prefix + name_match)[:limit]

    if not results and len(q_upper) <= 10 and q_upper.isalpha():
        results = [{"symbol": q_upper, "name": q_upper, "sector": "Unknown", "type": "custom"}]

    return success_response({"results": results})


@app.route('/api/portfolio/efficient-frontier', methods=['POST'])
@require_api_key
@limiter.limit("10 per minute")
def get_efficient_frontier():
    """Endpoint to compute the efficient frontier."""
    try:
        data = request.json
        if not data:
            return error_response('Request body is required', code='BAD_REQUEST', status=400)

        # Extract parameters
        tickers = data.get('tickers', [])
        start_date = data.get('start_date', None)
        end_date = data.get('end_date', None)
        n_points = data.get('n_points', 15)  # Number of points on the frontier

        # Prefer direct matrix input for production; support ticker fallback.
        if data.get("returns") is not None and data.get("covariance") is not None:
            payload = load_market_payload(data)
            returns = payload.returns
            covariance = payload.covariance
            tickers = payload.tickers
        else:
            if not tickers:
                return error_response('Tickers parameter is required (or provide returns/covariance)', code='BAD_REQUEST', status=400)
            # Validate dates if provided
            if start_date and end_date:
                try:
                    start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                    end_dt = datetime.strptime(end_date, '%Y-%m-%d')
                except ValueError:
                    return error_response('Invalid date format. Use YYYY-MM-DD.', code='BAD_REQUEST', status=400)
                if start_dt >= end_dt:
                    return error_response('Start date must be before end date', code='BAD_REQUEST', status=400)

            # Fetch market data with panel-aligned stats so frontier math uses
            # the same primary μ/Σ as the Portfolio Lab (covariance_source="panel_aligned").
            market_data = fetch_market_data(
                tickers=tickers,
                start_date=start_date,
                end_date=end_date,
                include_daily_returns=True,
            )
            returns = np.array(market_data['returns'])
            covariance = np.array(market_data['covariance'])

        # Calculate efficient frontier using the portfolio optimizer function
        from core.portfolio_optimizer import compute_efficient_frontier
        frontier_points = compute_efficient_frontier(returns, covariance, n_points)
        
        # Calculate min and max possible returns for the range
        min_return = np.min([point['target_return'] for point in frontier_points]) if frontier_points else 0
        max_return = np.max([point['target_return'] for point in frontier_points]) if frontier_points else 0

        return success_response({
            'frontier_points': frontier_points,
            'min_return': float(min_return),
            'max_return': float(max_return),
            'tickers': tickers
        })

    except Exception as e:
        logger.error(f"Efficient frontier endpoint error: {str(e)}", exc_info=True)
        return error_response(f'Internal server error: {str(e)}', code='INTERNAL_ERROR', status=500)


@app.route("/", methods=["GET"])
@limiter.exempt
def api_root():
    """Discovery for the API host; browser UI is the Next.js app (separate deployment)."""
    payload = {
        "service": "quantum-hybrid-portfolio-api",
        "health": "/api/health",
        "openapi": "/api/docs/openapi",
        "note": "Operator dashboard: deploy `web/` as a separate Vercel project (see docs/VERCEL_TWO_PROJECTS.md).",
    }
    dash = os.getenv("DASHBOARD_PUBLIC_URL", "").strip()
    if dash:
        payload["dashboard"] = dash.rstrip("/")
    return jsonify(payload), 200


@app.route("/favicon.ico", methods=["GET"])
@app.route("/favicon.png", methods=["GET"])
@limiter.exempt
def favicon_placeholder():
    """Avoid noisy 404s when browsers request a favicon on the API-only host."""
    return "", 204


@app.route('/api/health', methods=['GET'])
@limiter.exempt
def health_check():
    """Enhanced health check -- reports status of API and optional dependencies."""
    import importlib

    try:
        return _health_check_body(importlib)
    except Exception as exc:
        logger.exception("health_check_failed: %s", exc)
        return success_response(
            {
                "status": "degraded",
                "checks": {"api": "error"},
                "details": {"error": str(exc)[:500]},
                "message": "Health check raised an exception; see API logs.",
            },
            status=200,
        )


def _health_check_body(importlib):
    checks = {'api': 'ok'}
    overall = 'healthy'
    details = {
        'version': '1.0.0',
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }

    # Check Redis if configured
    redis_host = os.getenv('REDIS_HOST')
    if redis_host:
        try:
            import redis
            r = redis.Redis(host=redis_host, port=int(os.getenv('REDIS_PORT', 6379)), socket_timeout=2)
            r.ping()
            checks['redis'] = 'ok'
            details['redis_host'] = redis_host
        except Exception as e:
            checks['redis'] = 'unavailable'
            overall = 'degraded'
            details['redis_error'] = str(e)

    # Check DB if configured
    db_url = os.getenv('DATABASE_URL')
    if db_url:
        try:
            if 'postgresql' in db_url:
                import psycopg2
                conn = psycopg2.connect(db_url, connect_timeout=2)
                conn.close()
                checks['database'] = 'ok'
            elif 'sqlite' in db_url:
                # SQLite - just check file exists or can be created
                db_path = db_url.replace('sqlite:///', '')
                if db_path:
                    checks['database'] = 'ok' if os.path.exists(os.path.dirname(db_path)) or db_path == ':memory:' else 'unavailable'
                else:
                    checks['database'] = 'ok'
        except Exception as e:
            checks['database'] = 'unavailable'
            overall = 'degraded'
            details['database_error'] = str(e)

    # Check Braket availability
    try:
        import braket
        checks['braket_sdk'] = 'installed'
        details['braket_enabled'] = os.getenv('BRAKET_ENABLED', 'false').lower() == 'true'
    except ImportError:
        checks['braket_sdk'] = 'not_installed'
        details['braket_enabled'] = False

    # Check critical dependencies
    critical_deps = ['numpy', 'pandas', 'scipy', 'flask', 'sklearn']
    missing_deps = []
    for dep in critical_deps:
        try:
            importlib.import_module(dep)
        except ImportError:
            missing_deps.append(dep)
            overall = 'degraded'
    
    if missing_deps:
        checks['dependencies'] = 'missing'
        details['missing_dependencies'] = missing_deps
    else:
        checks['dependencies'] = 'ok'

    # Check market data providers
    try:
        mdp = MarketDataProvider()
        available = mdp.get_available_providers()
        checks['market_data'] = 'available'
        details['data_provider'] = mdp.primary_provider
        details['available_providers'] = available
    except Exception:
        checks['market_data'] = 'degraded'
        details['data_provider_note'] = 'Provider initialization failed'

    # System info
    import psutil
    details['system'] = {
        'cpu_percent': psutil.cpu_percent(interval=0.1),
        'memory_percent': psutil.virtual_memory().percent,
    }

    return success_response({
        'status': overall,
        'checks': checks,
        'details': details,
        'cache_entries': len(_market_data_cache),
        'message': 'Quantum Portfolio Backend is running',
    })


@app.route('/metrics', methods=['GET'])
@limiter.exempt
def prometheus_metrics():
    """Expose Prometheus metrics."""
    from flask import Response
    return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)


@app.route('/api/docs/openapi', methods=['GET'])
@limiter.exempt
def openapi_spec():
    """Serve OpenAPI specification document."""
    spec_path = os.path.join(_REPO_ROOT, "docs", "openapi.yaml")
    if not os.path.exists(spec_path):
        return error_response("OpenAPI spec not found", code='NOT_FOUND', status=404)
    with open(spec_path, "r", encoding="utf-8") as f:
        content = f.read()
    from flask import Response
    return Response(content, mimetype="application/yaml")


# ─── Export & Audit Endpoints ───

@app.route('/api/export/audit-log', methods=['GET'])
@require_api_key
@limiter.limit("5 per minute")
def export_audit_log():
    """Export audit_log rows as JSON array. Query params: limit (default 100), offset (default 0)."""
    try:
        limit = min(int(request.args.get('limit', 100)), 1000)
        offset = int(request.args.get('offset', 0))
        db_path = os.path.join(_REPO_ROOT, "data", "api.sqlite3")
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        conn.close()
        return success_response([dict(r) for r in rows])
    except Exception as exc:
        return error_response(str(exc), code='EXPORT_ERROR', status=500)


@app.route('/api/export/audit-log/csv', methods=['GET'])
@require_api_key
@limiter.limit("5 per minute")
def export_audit_log_csv():
    """Export audit_log as CSV download."""
    import csv
    import io
    try:
        limit = min(int(request.args.get('limit', 500)), 5000)
        db_path = os.path.join(_REPO_ROOT, "data", "api.sqlite3")
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        conn.close()

        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=rows[0].keys())
            writer.writeheader()
            for r in rows:
                writer.writerow(dict(r))
        from flask import Response
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment; filename=audit_log.csv'},
        )
    except Exception as exc:
        return error_response(str(exc), code='EXPORT_ERROR', status=500)


@app.route('/api/export/config', methods=['GET'])
@limiter.exempt
def export_config_manifest():
    """Export current objectives and presets as a YAML-style JSON manifest."""
    return success_response({
        "objectives": OBJECTIVES_CONFIG,
        "presets": PRESETS_CONFIG,
        "version": "1.0",
        "engine": "quantum_ledger",
    })


@app.route('/api/reports/capabilities', methods=['GET'])
@require_api_key
@limiter.limit("60 per minute")
def reports_capabilities():
    """Pre-flight check for report-export features.

    Lets the UI disable the "Download PDF" button (with an explanatory
    tooltip) when WeasyPrint or its native libs aren't installed, instead
    of failing only after the user clicks. Cheap to call: a single import
    probe via :func:`services.report_generator.is_pdf_export_available`.

    Response body::

        {
          "pdf_export": bool,
          "pdf_message": str | None,   # null when pdf_export is True
        }

    Closes QOBLIB overhaul gap #3.
    """
    pdf_available, pdf_message = report_generator.is_pdf_export_available()
    return success_response({
        "pdf_export": bool(pdf_available),
        "pdf_message": pdf_message,
    })


@app.route('/api/export/report/<run_id>.pdf')
@require_api_key
@limiter.limit("10 per minute")
def export_report_pdf(run_id):
    """Generate and stream a formatted PDF report for a lab run."""
    tenant_id = getattr(g, "tenant_id", "anonymous")
    run = lab_run_service.get_run(run_id, tenant_id)
    if not run:
        return error_response("run not found", code="NOT_FOUND", status=404)
    try:
        pdf_bytes = report_generator.generate_pdf(run)
    except report_generator.PdfDependencyMissingError as exc:
        logger.warning("PDF export unavailable: %s", exc)
        return error_response(
            str(exc),
            code="PDF_DEPENDENCY_MISSING",
            status=503,
        )
    except Exception as exc:
        logger.exception("PDF generation failed for run %s", run_id)
        return error_response(f"PDF generation failed: {exc}", code="PDF_ERROR", status=500)
    return Response(
        pdf_bytes,
        mimetype='application/pdf',
        headers={'Content-Disposition': f'attachment; filename="report-{run_id}.pdf"'},
    )


# ---------------------------------------------------------------------------
# QOBLIB Benchmark Endpoints
# ---------------------------------------------------------------------------

def _read_qoblib_runs_csv(*, csv_path: str | None = None) -> list[dict[str, str | None]]:
    """Load QOBLIB run summary rows from ``results.csv`` (newest first).

    Mirrors ``benchmarks/qoblib/runner._CSV_COLUMNS`` without importing the package.
    Returns an empty list when the file is missing. Values are strings as in ``csv.DictReader``;
    only ``nan``/``NaN`` tokens become ``None`` for JSON serialization.
    """
    path = _QOBLIB_RESULTS_CSV_PATH if csv_path is None else csv_path
    if not os.path.isfile(path):
        return []
    rows: list[dict[str, str | None]] = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            row: dict[str, str | None] = {}
            for key, val in raw.items():
                if key is None:
                    continue
                s = "" if val is None else str(val).strip()
                if s.lower() == "nan":
                    row[key] = None
                else:
                    row[key] = s
            rows.append(row)
    rows.reverse()
    return rows


def _get_qoblib():
    """Lazy import of qoblib module to avoid startup failures if deps missing."""
    import sys
    sys.path.insert(0, _REPO_ROOT)
    from benchmarks.qoblib import load_instance, list_instances, run_benchmark
    return load_instance, list_instances, run_benchmark


@app.route('/api/simulations/qoblib/instances', methods=['GET'])
@limiter.limit("60 per minute")
def qoblib_list_instances():
    """List all available QOBLIB fixture instances."""
    try:
        _, list_instances, _ = _get_qoblib()
        instances = list_instances()
        return jsonify({"instances": instances, "count": len(instances)})
    except Exception as exc:
        logger.exception("QOBLIB list instances failed")
        return error_response(str(exc), code="QOBLIB_ERROR", status=500)


@app.route('/api/simulations/qoblib/solvers', methods=['GET'])
@limiter.limit("60 per minute")
def qoblib_list_solvers():
    """List available solver backends."""
    solvers = [
        {"id": "classical",      "label": "Classical (cvxpy/scipy)", "available": True,  "requires_ibm": False},
        {"id": "heuristic",      "label": "Heuristic (Diff. Evolution)", "available": True, "requires_ibm": False},
        {"id": "qaoa_sim",       "label": "QAOA Simulator",          "available": True,  "requires_ibm": False},
        {"id": "hybrid_router",  "label": "Hybrid Router (auto)",    "available": True,  "requires_ibm": False},
        {"id": "ibm_quantum",    "label": "IBM Quantum (strict)",    "available": ibm_quantum_service.is_configured(), "requires_ibm": True},
        {"id": "auto",           "label": "Auto (best available)",   "available": True,  "requires_ibm": False},
    ]
    return jsonify({"solvers": solvers})


@app.route('/api/simulations/qoblib/run', methods=['POST'])
@limiter.limit("10 per minute")
def qoblib_run():
    """Execute a QOBLIB benchmark run.

    Body: { instance_id: str, backend: str }
    Returns SolverResult with actual_backend prominently labeled.
    """
    data = request.get_json(force=True, silent=True) or {}
    instance_id = str(data.get("instance_id", "")).strip()
    backend = str(data.get("backend", "classical")).strip()

    if not instance_id:
        return error_response("instance_id is required", code="VALIDATION_ERROR", status=400)

    ibm_token = None
    if backend == "ibm_quantum":
        tenant_id = getattr(g, "tenant_id", "anonymous")
        if not ibm_quantum_service.is_configured(tenant_id):
            return error_response(
                "IBM Quantum backend requested but no token is configured. "
                "Add your IBMQ token in Settings → IBM Quantum. No classical fallback in strict mode.",
                code="IBM_NOT_CONFIGURED",
                status=400,
            )
        ibm_token = "configured"  # runner uses ibm_quantum_service directly for actual execution

    try:
        load_instance, _, run_benchmark = _get_qoblib()
        instance = load_instance(instance_id)
    except FileNotFoundError:
        return error_response(f"Instance '{instance_id}' not found.", code="NOT_FOUND", status=404)
    except Exception as exc:
        logger.exception("QOBLIB instance load failed")
        return error_response(str(exc), code="QOBLIB_ERROR", status=500)

    try:
        result = run_benchmark(instance, requested_backend=backend, ibm_token=ibm_token)
    except Exception as exc:
        logger.exception("QOBLIB run failed for instance=%s backend=%s", instance_id, backend)
        return error_response(str(exc), code="QOBLIB_RUN_ERROR", status=500)

    return jsonify(result.to_dict())


@app.route('/api/simulations/qoblib/runs', methods=['GET'])
@require_api_key
@limiter.limit("60 per minute")
def qoblib_list_runs():
    """List all past QOBLIB runs from results/qoblib/results.csv."""
    runs = _read_qoblib_runs_csv()
    return jsonify({"runs": runs, "count": len(runs)})


@app.route('/api/simulations/qoblib/runs/<run_id>', methods=['GET'])
@require_api_key
@limiter.limit("60 per minute")
def qoblib_get_run(run_id):
    """Retrieve a specific QOBLIB run result JSON artifact."""
    if not re.match(r'^[0-9a-f\-]{36}$', run_id):
        return error_response("Invalid run_id format.", code="VALIDATION_ERROR", status=400)
    json_path = os.path.join(_QOBLIB_RUNS_DIR, f"{run_id}.json")
    if not os.path.exists(json_path):
        return error_response(f"Run '{run_id}' not found.", code="NOT_FOUND", status=404)
    with open(json_path) as f:
        data = json.load(f)
    return jsonify(data)

