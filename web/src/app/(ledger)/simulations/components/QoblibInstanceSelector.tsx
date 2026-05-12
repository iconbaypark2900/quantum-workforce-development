"use client";

import { useEffect, useState } from "react";
import type { QoblibInstanceMeta } from "@/types/qoblib";

interface Props {
  selected: string;
  onChange: (id: string) => void;
}

export default function QoblibInstanceSelector({ selected, onChange }: Props) {
  const [instances, setInstances] = useState<QoblibInstanceMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/simulations/qoblib/instances")
      .then((r) => r.json())
      .then((d) => {
        setInstances(d.instances ?? []);
        if (d.instances?.length && !selected) onChange(d.instances[0].instance_id);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-xs text-ql-on-surface-variant">Loading instances…</div>;
  if (error) return <div className="text-xs text-ql-error">{error}</div>;
  if (!instances.length) return <div className="text-xs text-ql-on-surface-variant">No instances found in data/qoblib/raw/</div>;

  const active = instances.find((i) => i.instance_id === selected);

  return (
    <div className="space-y-2">
      <label className="block text-[10px] uppercase tracking-widest text-ql-on-surface-variant font-bold">
        Benchmark Instance
      </label>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-ql-outline-variant bg-ql-surface-container px-3 py-2 text-sm font-mono"
      >
        {instances.map((inst) => (
          <option key={inst.instance_id} value={inst.instance_id}>
            {inst.instance_id} — {inst.n_assets}A/{inst.n_periods}T
          </option>
        ))}
      </select>
      {active && (
        <p className="text-[11px] text-ql-on-surface-variant leading-relaxed">
          {active.description} &middot; {active.n_assets} assets &middot; {active.n_periods} periods
        </p>
      )}
    </div>
  );
}
