import Link from "next/link";

import {
  ECOSYSTEM_PATHWAY,
  ECOSYSTEM_STEPS,
  INDUSTRY_PATH,
  NAVIGATION_REPO,
  NAVIGATOR_HREF,
  UNIVERSITY_PATH,
} from "@/lib/curriculum/ecosystem";

export default function PathwayPage() {
  return (
    <div className="space-y-10">
      <header className="max-w-3xl space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-ql-primary">
          Quantum Global Group one-pager
        </p>
        <h1 className="font-headline text-4xl font-bold tracking-tight text-ql-on-surface">
          {ECOSYSTEM_PATHWAY.title}
        </h1>
        <p className="text-lg text-ql-on-surface-variant">{ECOSYSTEM_PATHWAY.goal}</p>
        <p className="text-sm text-ql-on-surface-variant">
          The live engine is the{" "}
          <a href={NAVIGATOR_HREF} className="text-ql-primary">
            Career Navigator
          </a>{" "}
          — profile, interest, and goal into a pathway board, role family, forecast, and
          enterprise meter. This page is the one-pager summary (university vs industry). Slide
          source:{" "}
          <code className="font-mono text-xs">
            docs/curriculum/references/Quantum_Ecosystem_Pathway_OnePager.pptx
          </code>
          . Code:{" "}
          <a href={NAVIGATION_REPO.href} className="text-ql-primary">
            {NAVIGATION_REPO.owner}/{NAVIGATION_REPO.name}
          </a>
          .
        </p>
        <p>
          <a
            href={NAVIGATOR_HREF}
            className="inline-block rounded-lg bg-ql-primary px-5 py-2.5 text-sm font-semibold text-ql-on-primary no-underline"
          >
            Launch the Career Navigator
          </a>
        </p>
      </header>

      <ol className="grid gap-4 md:grid-cols-2">
        {ECOSYSTEM_STEPS.map((step, i) => (
          <li
            key={step.id}
            className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ql-primary">
              Step {i + 1}
            </p>
            <h2 className="mt-1 font-headline text-xl font-bold text-ql-on-surface">{step.title}</h2>
            <p className="mt-2 text-sm text-ql-on-surface-variant">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5">
          <h2 className="font-headline text-xl font-bold text-ql-on-surface">University path</h2>
          <ul className="mt-3 list-disc pl-5 text-sm text-ql-on-surface-variant">
            {UNIVERSITY_PATH.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5">
          <h2 className="font-headline text-xl font-bold text-ql-on-surface">Industry path</h2>
          <ul className="mt-3 list-disc pl-5 text-sm text-ql-on-surface-variant">
            {INDUSTRY_PATH.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>

      <p className="text-sm">
        <a href={NAVIGATOR_HREF} className="text-ql-primary">
          Career Navigator
        </a>
        {" · "}
        <Link href="/learn/readiness" className="text-ql-primary">
          WISER Readiness Track
        </Link>
        {" · "}
        <Link href="/learn/roles" className="text-ql-primary">
          See hiring maps
        </Link>
        {" · "}
        <Link href="/learn/next" className="text-ql-primary">
          Locations, LinkedIn, events
        </Link>
      </p>
    </div>
  );
}
