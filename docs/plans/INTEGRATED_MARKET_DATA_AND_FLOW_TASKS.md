# Integrated market data & portfolio flow — task plan

This document consolidates work to: **Tiingo-backed prices**, **synthetic + live** lab modes, **unified fetch paths**, **classical / hybrid / quantum** optimization, and **historical vs lab $** semantics. Tasks are **grouped** so related items ship together.

---

## Phase 1 — Tiingo provider + unified price path

**Deliverable:** `DATA_PROVIDER=tiingo` loads adjusted daily prices through the same pipeline as the main API.

| ID | Coupled work |
|----|----------------|
| **1.1** | Implement **`TiingoProvider`** in `services/data_provider_v2.py` (REST daily prices → `DataFrame` of adj. closes; handle partial failures, retries/429). Register in `MarketDataProvider`; add **`TIINGO_API_KEY`** + **`DATA_PROVIDER`** to `.env.example`. |
| **1.2** | **Decouple metadata from Yahoo:** when `provider_name` is `tiingo`, resolve names/sector via Tiingo meta or minimal placeholders; pass **`provider_name`** into `_process_prices` / metadata helpers so `get_asset_metadata` does not call `yf.Ticker` on Tiingo runs. |
| **1.3** | **Unit tests:** mock HTTP for Tiingo; smoke that `fetch_market_data` returns the same shape as today (`assets`, `returns`, `covariance`, `provider`). |

**Exit criteria:** Lab “live tickers” path (via `fetch_market_data`) works with Tiingo; no yfinance on that path.

---

## Phase 2 — Legacy `market_data` + scripts

**Deliverable:** One canonical “tickers → μ, Σ” implementation; no duplicate yfinance logic.

| ID | Coupled work |
|----|----------------|
| **2.1** | **`services/market_data.py`:** delegate `fetch_market_data` to `data_provider_v2.fetch_market_data` (or thin wrapper); remove direct `yf.download` from the primary code path. |
| **2.2** | Update **`legacy/api/enhanced_api.py` / `legacy/api/fixed_enhanced_api.py`** (archived; if ever revived) to use the same entry point. |
| **2.3** | Update **`examples/basic_qsw_example.py`** and **`test_enhanced_system.py`** to Tiingo or synthetic-only; document required env. |

**Exit criteria:** Grep shows no `yfinance` in primary fetch paths outside optional fallback (if you keep it temporarily).

---

## Phase 3 — Backtest + Tiingo

**Deliverable:** Rolling backtest uses the same market stack as the Lab.

| ID | Coupled work |
|----|----------------|
| **3.1** | **`services/backtest.py`:** replace `yf.download` with **`MarketDataProvider`** (or shared `fetch_price_panel`) so date range + tickers pull from Tiingo when configured. |
| **3.2** | **Tests:** `tests/test_services.py` — mock provider layer instead of `yf.download`. |
| **3.3** | Quick **manual checklist:** same tickers + window → Lab optimize vs backtest summary metrics sanity (no lookahead bugs in backtest code). |

**Exit criteria:** `POST /api/portfolio/backtest` runs without yfinance.

---

## Phase 4 — API docs & operator clarity

**Deliverable:** Operators know Tiingo is required for live/history and how Lab differs from backtest.

| ID | Coupled work |
|----|----------------|
| **4.1** | Update **`api.py`** docstrings, **`docs/openapi.yaml`**, **`docs/API_PRODUCT_GUIDE.md`**, and **`AGENTS.md`** (one bullet): market data = configured provider (Tiingo); Tiingo needs API key. |
| **4.2** | **UX copy (Portfolio Lab):** clarify “Live” = **historical series through last close** (refresh on load), not streaming intraday, unless you add a future feed. |

**Exit criteria:** New developer can configure Tiingo without reading source.

---

## Phase 5 — Deprecate yfinance (hard cutover)

**Deliverable:** yfinance optional or removed.

| ID | Coupled work |
|----|----------------|
| **5.1** | If keeping **`YfinanceProvider`** briefly: log **deprecation** when `DATA_PROVIDER=yfinance`. |
| **5.2** | Remove **`yfinance`** from **`requirements.txt`** after soak; delete **`YfinanceProvider`** and fallback to Tiingo + Alpaca/Polygon only. |
| **5.3** | **Docs sweep:** `README`, `GETTING_STARTED`, architecture diagrams, `DOCUMENTATION_INDEX` — replace yfinance-first language. |

**Exit criteria:** `pip install` no longer pulls yfinance (or only as optional extra documented separately).

---

## Phase 6 — “Full flow” product semantics (documentation, not always code)

**Deliverable:** Users understand **notional**, **single-period optimize**, vs **rolling backtest**.

| ID | Coupled work |
|----|----------------|
| **6.1** | **Short doc** — see **`docs/guides/LAB_VS_BACKTEST.md`**: Lab **notional** = scale **weights × $** and **forward sim** on loaded returns; **backtest** = **rebalanced** history using `POST /api/portfolio/backtest` (classical objectives as implemented today). |
| **6.2** | **Optional:** URL/session **notional** in deep links for Portfolio Lab — only if product wants shareable dollar views. |

**Exit criteria:** Support questions “is this real P&L?” answered by docs.

---

## Phase 7 — Stretch: hybrid/quantum in rolling backtest

**Deliverable (optional, high cost):** Historical simulation with non-classical objectives.

| ID | Coupled work |
|----|----------------|
| **7.1** | Extend **`_run_backtest_payload`** / `run_backtest` **objective** allow-list and **`portfolio_optimizer`** dispatch to include **hybrid** (and optionally **QAOA/VQE**) with explicit **lookback**, **rebalance frequency**, and **backend** (simulator vs IBM). |
| **7.2** | **Cost & limits:** caps on universe size, max rebalance count, timeouts; document that quantum-per-step backtests are research-grade, not default prod. |

**Exit criteria:** Only if Phase 1–6 are stable and product demands it.

---

## Phase 8 — Stretch: capital in the optimizer

**Deliverable (optional):** Notional affects optimization math (min lot, cash, integer shares).

| ID | Coupled work |
|----|----------------|
| **8.1** | New API fields + optimizer constraints — **separate** from Tiingo; design doc before implementation. |

---

## Summary table

| Phase | Focus | Couples |
|-------|--------|---------|
| **1** | Tiingo + metadata + tests | Provider + no Yahoo metadata + tests |
| **2** | Single fetch path + examples | `market_data` + legacy entry points + examples |
| **3** | Backtest uses same stack | `backtest.py` + tests + sanity check |
| **4** | Docs + Lab copy | API docs + AGENTS + UI strings |
| **5** | Remove yfinance | Deprecation → delete → docs sweep |
| **6** | Product semantics | Notional vs backtest doc + optional deep link |
| **7** | Quantum/hybrid backtest | Stretch |
| **8** | Notional in solver | Stretch |

---

## Related files (implementation touchpoints)

- `services/data_provider_v2.py` — providers + `fetch_market_data`
- `services/market_data.py` — legacy fetch + `get_asset_metadata`
- `services/backtest.py` — price download
- `api.py` — market + backtest routes
- `web/src/components/CustomizableQuantumDashboard.js` — Lab modes, notional
- `.env.example` — `TIINGO_API_KEY`, `DATA_PROVIDER`

---

## See also

- **`docs/guides/LAB_VS_BACKTEST.md`** — Lab notional vs rolling backtest semantics

---

*Task consolidation for Tiingo + integrated flow planning.*
