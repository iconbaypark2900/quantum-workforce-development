"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { getObjectives, getPresets } from "@/lib/api";
import {
  normalizeObjectives,
  normalizePresets,
  type ObjectiveFamily,
  type ObjectiveInfo,
  type PaperRole,
  type PresetInfo,
} from "@/lib/configApiNormalize";
import { useNextPageProps, type NextClientPageProps } from "@/lib/nextPageProps";

const FAMILY_ORDER: ObjectiveFamily[] = ["classical", "hybrid", "quantum"];

const FAMILY_HEADINGS: Record<ObjectiveFamily, string> = {
  classical: "Classical",
  hybrid: "Hybrid",
  quantum: "Quantum",
};

const FAMILY_DESC: Record<ObjectiveFamily, string> = {
  classical: "Continuous / convex optimization (Markowitz, HRP, min-variance). Fast, deterministic results.",
  hybrid: "Multi-stage pipeline: score & screen assets → QUBO combinatorial selection → continuous refinement.",
  quantum: "Variational quantum eigensolver (VQE) or QUBO-SA — runs on IBM Quantum Runtime or falls back to simulator.",
};

function familyBadgeClass(f: ObjectiveFamily): string {
  switch (f) {
    case "classical":
      return "bg-ql-surface-container text-ql-on-surface-variant border-ql-outline-variant";
    case "hybrid":
      return "bg-ql-primary/15 text-ql-primary border-ql-primary/25";
    case "quantum":
      return "bg-violet-500/10 text-violet-300 border-violet-500/20";
  }
}

function repoFileUrl(path: string, base: string): string {
  const b = base.replace(/\/$/, "");
  const p = path.replace(/^\//, "");
  return `${b}/${p}`;
}

function CopyPathButton({
  path,
  className,
}: {
  path: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(path);
        toast.success("Path copied");
      }}
      className={
        className ??
        "text-[10px] font-bold uppercase text-ql-primary hover:underline"
      }
    >
      Copy path
    </button>
  );
}

function PaperRoleBadge({ role }: { role?: PaperRole }) {
  if (!role || role === "foundational") {
    return (
      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-ql-surface-container text-ql-on-surface-variant border border-ql-outline-variant">
        Foundational
      </span>
    );
  }
  return (
    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">
      Modern
    </span>
  );
}

function DownloadLink({
  href,
  label = "Download",
  isLocal = false,
}: {
  href: string;
  label?: string;
  isLocal?: boolean;
}) {
  return (
    <a
      href={href}
      target={isLocal ? undefined : "_blank"}
      rel={isLocal ? undefined : "noopener noreferrer"}
      download={isLocal || undefined}
      onClick={(e) => e.stopPropagation()}
      className="text-[10px] font-bold uppercase text-ql-primary hover:underline"
    >
      {label} ↓
    </a>
  );
}

export default function StrategyPage(props: NextClientPageProps) {
  useNextPageProps(props);
  const [objectives, setObjectives] = useState<Record<string, ObjectiveInfo>>(
    {}
  );
  const [presets, setPresets] = useState<Record<string, PresetInfo>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [selectedObj, setSelectedObj] = useState("hybrid");
  const [tickerLine, setTickerLine] = useState("");
  const [config, setConfig] = useState({
    weight_min: 0.005,
    weight_max: 0.2,
    K_screen: "",
    K_select: "",
  });
  /** Set after mount so SSR and first client paint match (avoids hydration mismatch from Date). */
  const [manifestGeneratedAt, setManifestGeneratedAt] = useState<string | null>(
    null
  );

  const repoFileBase =
    typeof process.env.NEXT_PUBLIC_REPO_FILE_BASE === "string"
      ? process.env.NEXT_PUBLIC_REPO_FILE_BASE
      : "";

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const [objPayload, presetPayload] = await Promise.all([
          getObjectives(),
          getPresets(),
        ]);
        if (cancelled) return;
        setObjectives(normalizeObjectives(objPayload));
        setPresets(normalizePresets(presetPayload));
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load config");
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setManifestGeneratedAt(new Date().toISOString());
  }, []);

  const applyPreset = useCallback(
    (key: string) => {
      const p = presets[key];
      if (!p) return;
      setSelectedObj(p.objective);
      const kScreen =
        p.K_screen != null
          ? String(p.K_screen)
          : p.K != null
            ? String(p.K)
            : "";
      const kSelect = p.K_select != null ? String(p.K_select) : "";
      setConfig({
        weight_min: p.weight_min,
        weight_max: p.weight_max,
        K_screen: kScreen,
        K_select: kSelect,
      });
    },
    [presets]
  );

  const selectedInfo = objectives[selectedObj];

  const yamlManifest = useMemo(() => {
    const doc =
      selectedInfo &&
      `# documentation:
#   family: ${selectedInfo.family}
#   primary_notebook: ${selectedInfo.notebooks[0]?.path ?? "none"}
#   primary_code: ${selectedInfo.codeRefs[0]?.path ?? "none"}
`;
    const generated =
      manifestGeneratedAt != null ? manifestGeneratedAt : "—";
    return `# Quantum Workforce Development Strategy Manifest
# Generated: ${generated}
objective: ${selectedObj}
constraints:
  weight_min: ${config.weight_min}
  weight_max: ${config.weight_max}
${config.K_screen ? `  K_screen: ${config.K_screen}` : "  # K_screen: auto"}
${config.K_select ? `  K_select: ${config.K_select}` : "  # K_select: auto"}
engine: quantum_ledger_v1
${doc ?? ""}`;
  }, [selectedObj, config, selectedInfo, manifestGeneratedAt]);

  const groupedObjectives = useMemo(() => {
    const groups: { family: ObjectiveFamily; entries: [string, ObjectiveInfo][] }[] =
      [];
    for (const fam of FAMILY_ORDER) {
      const entries = Object.entries(objectives).filter(
        ([, o]) => o.family === fam
      );
      if (entries.length > 0) {
        groups.push({ family: fam, entries });
      }
    }
    return groups;
  }, [objectives]);

  const parsedTickers = tickerLine
    .split(/[,\s]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  const labQueryString = new URLSearchParams({
    objective: selectedObj,
    weight_min: String(config.weight_min),
    weight_max: String(config.weight_max),
    ...(config.K_screen ? { K_screen: config.K_screen } : {}),
    ...(config.K_select ? { K_select: config.K_select } : {}),
    ...(parsedTickers.length > 0 ? { tickers: parsedTickers.join(",") } : {}),
  }).toString();

  const labUrl = `/portfolio?${labQueryString}`;

  const copyLabLink = useCallback(() => {
    const full = `${window.location.origin}${labUrl}`;
    navigator.clipboard.writeText(full);
    toast.success("Portfolio Lab link copied");
  }, [labUrl]);

  return (
    <div className="p-6 lg:p-10 space-y-8">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4">
        <div>
          <h2 className="font-headline text-3xl font-bold tracking-tighter">
            Strategy Builder
          </h2>
          <p className="text-ql-on-surface-variant text-sm mt-1">
            Configure optimization pipelines and export deployment manifests
          </p>
        </div>
        <div className="flex gap-3 w-full lg:w-auto">
          <Link
            href={labUrl}
            className="flex-1 lg:flex-none primary-gradient text-[#001D33] inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-lg text-sm font-bold shadow-lg shadow-ql-primary/20 hover:opacity-95 transition-opacity"
          >
            <span className="material-symbols-outlined text-lg">science</span>
            PL
          </Link>
          <button
            type="button"
            onClick={copyLabLink}
            className="px-4 py-3 rounded-lg text-sm font-bold border border-ql-outline-variant text-ql-on-surface-variant hover:bg-ql-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-lg">link</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div
          className="rounded-lg border border-ql-error/20 bg-ql-error-container/20 px-4 py-3 text-sm text-ql-error"
          role="alert"
        >
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Objectives by family */}
        <div className="lg:col-span-5 bg-ql-surface-low rounded-xl p-6">
          <h3 className="font-headline text-lg font-bold mb-4">
            Optimization Method
          </h3>
          <div className="space-y-6">
            {configLoading && !loadError ? (
              <p className="text-sm text-ql-on-surface-variant">Loading…</p>
            ) : groupedObjectives.length === 0 ? (
              <p className="text-sm text-ql-on-surface-variant">
                No optimization methods available.
              </p>
            ) : (
              groupedObjectives.map(({ family, entries }) => (
                <div key={family}>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-ql-on-surface-variant mb-1">
                    {FAMILY_HEADINGS[family]}
                  </h4>
                  <p className="text-[10px] text-ql-on-surface-variant/70 mb-2 leading-relaxed">
                    {FAMILY_DESC[family]}
                  </p>
                  <div className="space-y-3">
                    {entries.map(([key, obj]) => (
                      <div
                        key={key}
                        className={`rounded-lg border overflow-hidden transition-all ${
                          selectedObj === key
                            ? "border-ql-primary/40 bg-ql-primary/5 ring-1 ring-ql-primary/20"
                            : "border-ql-outline-variant bg-ql-surface-lowest/50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedObj(key)}
                          className="w-full text-left px-4 py-3 hover:bg-ql-surface-container/30 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-bold">{obj.label}</span>
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              <span
                                className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${familyBadgeClass(obj.family)}`}
                              >
                                {FAMILY_HEADINGS[obj.family]}
                              </span>
                              <span
                                className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${
                                  obj.fast
                                    ? "bg-ql-tertiary/10 text-ql-tertiary"
                                    : "bg-amber-500/10 text-amber-400"
                                }`}
                                title={obj.fast
                                  ? "Runs in < 1 s locally — deterministic, no external compute"
                                  : "May take 10–60 s — involves iterative solve or external runtime"}
                              >
                                {obj.fast ? "Fast" : "Compute"}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-ql-on-surface-variant mt-1">
                            {obj.description}
                          </p>
                        </button>
                        <div className="px-4 pb-3 pt-0 space-y-2 border-t border-ql-outline-variant">
                          {obj.papers.length > 0 && (
                            <div>
                              <p className="text-[9px] font-bold uppercase text-ql-on-surface-variant mb-1">
                                Papers
                              </p>
                              <ul className="space-y-2">
                                {obj.papers.map((p, i) => (
                                  <li
                                    key={i}
                                    className="text-[10px] text-ql-on-surface-variant leading-snug space-y-0.5"
                                  >
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <PaperRoleBadge role={p.role} />
                                      {p.url ? (
                                        <a
                                          href={p.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-ql-primary hover:underline"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {p.title || p.citation || p.url}
                                        </a>
                                      ) : (
                                        <span>
                                          {p.title
                                            ? `${p.title}${p.citation ? ` — ${p.citation}` : ""}`
                                            : p.citation}
                                        </span>
                                      )}
                                      {p.downloadPath && (
                                        <DownloadLink
                                          href={p.downloadPath}
                                          label="PDF"
                                          isLocal={p.downloadPath.startsWith("/")}
                                        />
                                      )}
                                    </div>
                                    {p.citation && p.url && (
                                      <p className="text-[10px] text-ql-on-surface-variant/70 pl-0.5">
                                        {p.citation}
                                      </p>
                                    )}
                                    {p.note && (
                                      <p className="text-[10px] italic text-ql-on-surface-variant/60 pl-0.5">
                                        {p.note}
                                      </p>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {obj.notebooks.length > 0 && (
                            <div>
                              <p className="text-[9px] font-bold uppercase text-ql-on-surface-variant mb-1">
                                Notebooks
                              </p>
                              <ul className="space-y-1">
                                {obj.notebooks.map((nb) => (
                                  <li
                                    key={nb.path}
                                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-ql-on-surface-variant"
                                  >
                                    <span className="break-all">
                                      {nb.title ? `${nb.title}: ` : ""}
                                      {nb.path}
                                    </span>
                                    <CopyPathButton path={nb.path} />
                                    {repoFileBase ? (
                                      <a
                                        href={repoFileUrl(nb.path, repoFileBase)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] font-bold text-ql-primary uppercase hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        View on GitHub
                                      </a>
                                    ) : null}
                                    {nb.downloadPath && (
                                      <DownloadLink
                                        href={nb.downloadPath}
                                        label="Download"
                                        isLocal={nb.downloadPath.startsWith("/")}
                                      />
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {obj.codeRefs.length > 0 && (
                            <div>
                              <p className="text-[9px] font-bold uppercase text-ql-on-surface-variant mb-1">
                                Code
                              </p>
                              <ul className="space-y-1">
                                {obj.codeRefs.map((c) => (
                                  <li
                                    key={`${c.path}-${c.label ?? ""}`}
                                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-ql-on-surface-variant"
                                  >
                                    <span className="break-all">
                                      {c.label ? `${c.label} — ` : ""}
                                      {c.path}
                                    </span>
                                    <CopyPathButton path={c.path} />
                                    {repoFileBase ? (
                                      <a
                                        href={repoFileUrl(c.path, repoFileBase)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] font-bold text-ql-primary uppercase hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        View on GitHub
                                      </a>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Config + Presets */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-ql-surface-low rounded-xl p-6">
            <h3 className="font-headline text-lg font-bold mb-1">Presets</h3>
            <p className="text-[10px] text-ql-on-surface-variant mb-4 leading-relaxed">
              Same catalog as Portfolio Lab. Stress · * presets mirror narratives on the{" "}
              <a href="/simulations" className="text-ql-primary font-bold hover:underline">
                Simulations
              </a>{" "}
              page (heuristic shocks — not auto-linked to optimizer math).
            </p>
            <div className="flex flex-col gap-2 max-h-[min(420px,50vh)] overflow-y-auto pr-1">
              {Object.entries(presets).map(([key, p]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  title={p.description ?? p.label}
                  className="text-left px-3 py-2.5 bg-ql-surface-container text-xs font-bold rounded-lg hover:bg-ql-surface-high transition-colors border border-ql-outline-variant"
                >
                  <span className="block text-ql-on-surface">{p.label}</span>
                  {p.description ? (
                    <span className="block text-[10px] font-normal text-ql-on-surface-variant font-sans leading-snug mt-1">
                      {p.description}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-ql-surface-low rounded-xl p-6">
            <h3 className="font-headline text-lg font-bold mb-4">
              Constraints
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-ql-on-surface-variant uppercase tracking-wider font-bold block mb-1">
                  Tickers (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. AAPL, MSFT, GOOGL — or leave blank for Lab default"
                  value={tickerLine}
                  onChange={(e) => setTickerLine(e.target.value)}
                  className="w-full bg-ql-surface-lowest border border-ql-outline-variant rounded-lg px-3 py-2 text-sm font-mono focus:border-ql-primary focus:ring-1 focus:ring-ql-primary/30 outline-none"
                />
                {parsedTickers.length > 0 && (
                  <p className="text-[10px] text-ql-on-surface-variant mt-1">
                    {parsedTickers.length} ticker{parsedTickers.length !== 1 ? "s" : ""} will be passed to Portfolio Lab
                  </p>
                )}
              </div>
              {[
                {
                  label: "Min Weight",
                  key: "weight_min" as const,
                  step: 0.005,
                  max: 0.1,
                },
                {
                  label: "Max Weight",
                  key: "weight_max" as const,
                  step: 0.01,
                  max: 1.0,
                },
              ].map((c) => (
                <div key={c.key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-ql-on-surface-variant uppercase tracking-wider font-bold">
                      {c.label}
                    </span>
                    <span className="font-mono text-ql-primary font-bold">
                      {(config[c.key] as number).toFixed(3)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={c.max}
                    step={c.step}
                    value={config[c.key] as number}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        [c.key]: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full h-1 appearance-none bg-ql-outline-variant/30 rounded-full cursor-pointer accent-ql-primary"
                  />
                  <p className="text-[10px] text-ql-on-surface-variant/70 mt-1">
                    {c.key === "weight_min"
                      ? "Minimum allocation per asset — positions below this are excluded."
                      : "Maximum allocation per asset — caps concentration risk."}
                  </p>
                </div>
              ))}
              {["K_screen", "K_select"].map((k) => (
                <div key={k}>
                  <label className="text-[10px] text-ql-on-surface-variant uppercase tracking-wider font-bold block mb-1">
                    {k}
                  </label>
                  <input
                    type="number"
                    placeholder="auto"
                    value={config[k as "K_screen" | "K_select"]}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, [k]: e.target.value }))
                    }
                    className="w-full bg-ql-surface-lowest border border-ql-outline-variant rounded-lg px-3 py-2 text-sm font-mono focus:border-ql-primary focus:ring-1 focus:ring-ql-primary/30 outline-none"
                  />
                </div>
              ))}
              <p className="text-[10px] text-ql-on-surface-variant/70 mt-2 leading-relaxed">
                <strong className="text-ql-on-surface-variant">K_screen</strong>: number of assets kept after the initial scoring stage. <strong className="text-ql-on-surface-variant">K_select</strong>: number chosen by the QUBO combinatorial stage. Both default to &quot;auto&quot; (derived from universe size). Only used by Hybrid / QUBO-SA objectives.
              </p>
            </div>
          </div>
        </div>

        {/* YAML Export */}
        <div className="lg:col-span-3 bg-ql-surface-low rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-headline text-lg font-bold">Manifest</h3>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(yamlManifest)}
              className="text-[10px] font-bold text-ql-primary uppercase hover:underline"
            >
              Copy YAML
            </button>
          </div>
          <p className="text-[10px] text-ql-on-surface-variant/70 mb-3 leading-relaxed">
            Deployment manifest — captures the objective, constraints, and provenance as a shareable YAML config. Used to reproduce runs or hand off to a CI/CD pipeline.
          </p>
          <pre className="text-[11px] font-mono text-ql-on-surface-variant bg-ql-surface-lowest rounded-lg p-4 overflow-x-auto whitespace-pre leading-relaxed border border-ql-outline-variant">
            {yamlManifest}
          </pre>
        </div>
      </div>
    </div>
  );
}
