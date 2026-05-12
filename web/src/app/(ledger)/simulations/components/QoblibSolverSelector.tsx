"use client";

import { useEffect, useState } from "react";
import type { QoblibSolverMeta, QoblibSolverId } from "@/types/qoblib";

interface Props {
  selected: QoblibSolverId | string;
  onChange: (id: QoblibSolverId | string) => void;
}

const SOLVER_DESCRIPTIONS: Record<string, string> = {
  classical: "Exact convex solver via cvxpy (CLARABEL) or scipy fallback. Fast and optimal.",
  heuristic: "Differential evolution meta-heuristic. Good for constrained/non-convex variants.",
  qaoa_sim: "QAOA statevector simulator — encodes QUBO, runs variational quantum circuit locally.",
  hybrid_router: "Auto-routes to best available solver based on qubit count and availability.",
  ibm_quantum: "IBM Quantum hardware (strict mode — no fallback if unavailable).",
  auto: "Picks best available solver; labels actual backend used in results.",
};

export default function QoblibSolverSelector({ selected, onChange }: Props) {
  const [solvers, setSolvers] = useState<QoblibSolverMeta[]>([]);

  useEffect(() => {
    fetch("/api/simulations/qoblib/solvers")
      .then((r) => r.json())
      .then((d) => setSolvers(d.solvers ?? []))
      .catch(() => {});
  }, []);

  const active = solvers.find((s) => s.id === selected);

  return (
    <div className="space-y-2">
      <label className="block text-[10px] uppercase tracking-widest text-ql-on-surface-variant font-bold">
        Solver Backend
      </label>
      <div className="flex flex-wrap gap-2">
        {solvers.map((s) => (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            disabled={!s.available}
            title={!s.available ? "Not available — configure IBM token in Settings" : undefined}
            className={[
              "px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors",
              selected === s.id
                ? "bg-ql-primary text-ql-on-primary border-ql-primary"
                : s.available
                ? "border-ql-outline-variant text-ql-on-surface hover:border-ql-primary"
                : "border-ql-outline-variant/30 text-ql-on-surface-variant/40 cursor-not-allowed",
            ].join(" ")}
          >
            {s.label}
            {!s.available && " 🔒"}
          </button>
        ))}
      </div>
      {active && (
        <p className="text-[11px] text-ql-on-surface-variant leading-relaxed">
          {SOLVER_DESCRIPTIONS[active.id] ?? ""}
          {active.requires_ibm && !active.available && (
            <span className="ml-1 text-amber-400">
              ⚠ IBM token required — configure in Settings → IBM Quantum.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
