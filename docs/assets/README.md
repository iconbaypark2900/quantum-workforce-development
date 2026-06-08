# Documentation Assets

This folder contains static images used by README and project documentation.

| Asset | Source | How to Regenerate |
|---|---|---|
| `architecture.svg` | Mermaid / Excalidraw / Figma | Export from source diagram in [ARCHITECTURE.md](../ARCHITECTURE.md) |
| `calibration-reliability.svg` | Evaluation script | Not yet automated — export from QOBLIB or sensitivity reports |
| `backtest-equity-curve.svg` | Backtest report | Export from Portfolio Lab backtest or `POST /api/portfolio/backtest` |
| `latency-breakdown.svg` | Benchmark script | Export from `benchmarks/` runs when available |

Rules:

- Prefer SVG for GitHub readability.
- Keep generated charts reproducible.
- Do not commit screenshots when a generated chart is available.
- Do not reference missing files from README.
- Keep source diagram files when possible.
