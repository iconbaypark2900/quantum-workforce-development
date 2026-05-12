"use client";

interface Props {
  onRun: () => void;
  loading: boolean;
  disabled?: boolean;
}

export default function QoblibRunControls({ onRun, loading, disabled }: Props) {
  return (
    <div className="flex items-center gap-4 pt-2">
      <button
        onClick={onRun}
        disabled={loading || disabled}
        className="px-6 py-2 rounded-lg text-sm font-bold primary-gradient text-[#001D33] disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {loading ? "Running…" : "Run Benchmark"}
      </button>
      {loading && (
        <span className="text-xs text-ql-on-surface-variant animate-pulse">
          Solving — this may take a few seconds…
        </span>
      )}
    </div>
  );
}
