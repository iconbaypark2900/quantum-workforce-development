"""Write Markdown benchmark reports."""

from __future__ import annotations
from pathlib import Path
from .schemas import SolverResult


def write_markdown_report(result: SolverResult, path: Path) -> None:
    status = "FEASIBLE" if result.feasible else "INFEASIBLE"
    lines = [
        f"# QOBLIB Run Report — {result.run_id}",
        "",
        f"**Instance:** `{result.instance_id}`  ",
        f"**Status:** {status}  ",
        f"**Requested Backend:** `{result.requested_backend}`  ",
        f"**Actual Backend:** `{result.actual_backend}`  ",
        f"**Timestamp:** {result.timestamp}  ",
        f"**Wall Time:** {result.wall_time_seconds:.4f}s  ",
        "",
        "## Results",
        "",
        f"| Metric | Value |",
        f"|---|---|",
        f"| Objective Value | {result.objective_value:.6f} |",
        f"| Expected Return | {result.expected_return:.4%} |",
        f"| Portfolio Volatility | {result.portfolio_volatility:.4%} |",
        f"| Sharpe Ratio | {result.sharpe_ratio:.4f} |",
        f"| Active Assets | {result.n_active_assets} |",
        "",
    ]

    if result.qubo_encoding:
        q = result.qubo_encoding
        lines += [
            "## QUBO Encoding",
            "",
            f"| Property | Value |",
            f"|---|---|",
            f"| Qubits | {q.n_qubits} |",
            f"| Variables | {q.n_variables} |",
            f"| Encoding | {q.encoding_type} |",
            f"| Penalty λ | {q.penalty_lambda} |",
            f"| QUBO Density | {q.qubo_density:.4f} |",
            "",
        ]

    lines += [
        "## Weights",
        "",
        "| Asset | Weight |",
        "|---|---|",
    ]
    for i, w in enumerate(result.weights):
        lines.append(f"| Asset {i} | {w:.4f} |")

    if result.error:
        lines += ["", f"## Error", "", f"```", result.error, "```"]

    path.write_text("\n".join(lines))
