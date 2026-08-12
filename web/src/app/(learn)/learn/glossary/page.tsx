import { glossarySorted } from "@/lib/curriculum";

export default function GlossaryPage() {
  const entries = glossarySorted();
  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-ql-primary">
          Course 4 studio · QR-4
        </p>
        <h1 className="font-headline text-4xl font-bold tracking-tight text-ql-on-surface">
          Primary quantum vocabulary
        </h1>
        <p className="text-lg text-ql-on-surface-variant">
          These are the words the month requires you to define explicitly. A passing week-4 card
          uses this level of precision — not circular slogans.
        </p>
      </header>
      <div className="space-y-4">
        {entries.map((entry) => (
          <article
            key={entry.term}
            id={entry.term.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
            className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5"
          >
            <h2 className="font-headline text-2xl font-bold text-ql-on-surface">{entry.term}</h2>
            <p className="mt-2 font-medium text-ql-on-surface">{entry.shortDef}</p>
            <p className="mt-3 text-sm text-ql-on-surface-variant">{entry.fullDef}</p>
            <p className="mt-3 text-sm text-ql-on-surface">
              <span className="font-semibold">Why it matters. </span>
              {entry.whyItMatters}
            </p>
            <p className="mt-2 text-xs text-ql-on-surface-variant">
              Related: {entry.related.join(" · ")}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
