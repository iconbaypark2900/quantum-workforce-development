import Link from "next/link";

import {
  CERT_OBJECTIVES,
  LINKEDIN_MOVES,
  OPPORTUNITIES,
  REGION_HUBS,
} from "@/lib/curriculum/nextSteps";

const KIND_LABEL: Record<(typeof OPPORTUNITIES)[number]["kind"], string> = {
  hackathon: "Hackathon",
  "summer-school": "Summer school",
  festival: "Festival",
  credential: "Credential",
  community: "Community",
  classroom: "Classroom",
};

export default function NextPage() {
  return (
    <div className="space-y-12">
      <header className="max-w-3xl space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-ql-primary">
          After you know your interest
        </p>
        <h1 className="font-headline text-4xl font-bold tracking-tight text-ql-on-surface">
          Locations, LinkedIn, projects, and credentials
        </h1>
        <p className="text-lg text-ql-on-surface-variant">
          Working on projects is the real next step — Fall Fest, Summer School, hackathons, the
          IBM developer cert, and the Advocate program. Geography comes after the pathway, not
          before.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="font-headline text-2xl font-bold text-ql-on-surface">Regional hubs</h2>
        <p className="max-w-3xl text-sm text-ql-on-surface-variant">
          Availability is not “every city has a QPU.” It is people, a Classroom Account, and a
          community that already runs events.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {REGION_HUBS.map((hub) => (
            <article
              key={hub.id}
              className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5"
            >
              <h3 className="font-headline text-xl font-bold text-ql-on-surface">{hub.name}</h3>
              <p className="text-xs uppercase tracking-wider text-ql-primary">{hub.region}</p>
              <p className="mt-2 text-sm text-ql-on-surface-variant">{hub.next}</p>
              <ul className="mt-3 list-disc pl-5 text-sm text-ql-on-surface-variant">
                {hub.assets.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-headline text-2xl font-bold text-ql-on-surface">LinkedIn</h2>
        <ol className="grid gap-3">
          {LINKEDIN_MOVES.map((move, i) => (
            <li
              key={move.title}
              className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5"
            >
              <h3 className="font-headline text-lg font-bold text-ql-on-surface">
                {i + 1}. {move.title}
              </h3>
              <p className="mt-2 text-sm text-ql-on-surface-variant">{move.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="font-headline text-2xl font-bold text-ql-on-surface">
          Hackathons, summer schools, Fall Fest
        </h2>
        <div className="space-y-3">
          {OPPORTUNITIES.map((op) => (
            <article
              key={op.id}
              className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5"
            >
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-ql-primary">
                {KIND_LABEL[op.kind]}
              </p>
              <h3 className="mt-1 font-headline text-xl font-bold text-ql-on-surface">
                <a href={op.href} className="text-ql-on-surface no-underline hover:text-ql-primary">
                  {op.name}
                </a>
              </h3>
              <p className="mt-1 text-sm text-ql-on-surface-variant">
                {op.when} · {op.where}
              </p>
              <p className="mt-2 text-sm text-ql-on-surface">{op.who}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-headline text-2xl font-bold text-ql-on-surface">
          IBM developer cert (C1000-179) → Advocate
        </h2>
        <p className="max-w-3xl text-sm text-ql-on-surface-variant">
          Sit the assessment, then Pearson VUE for{" "}
          <a
            href="https://www.ibm.com/quantum/blog/qiskit-v2x-developer-certification"
            className="text-ql-primary"
          >
            Qiskit v2.X developer certification
          </a>
          . That cert is the hard gate past Advocate Tier 0. Apply year-round:{" "}
          <a href="https://www.ibm.com/quantum/blog/qiskit-advocate-program" className="text-ql-primary">
            Advocate program
          </a>
          . This cohort uses an approved{" "}
          <a
            href="https://quantum.cloud.ibm.com/docs/en/guides/classroom-accounts"
            className="text-ql-primary"
          >
            IBM Quantum Classroom Account
          </a>{" "}
          so you can run on hardware without a student credit card.
        </p>
        <div className="overflow-x-auto rounded-xl border border-ql-outline-variant">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-ql-surface-container text-ql-on-surface">
              <tr>
                <th className="px-4 py-2 font-semibold">Section</th>
                <th className="px-4 py-2 font-semibold">Weight</th>
                <th className="px-4 py-2 font-semibold">Tasks</th>
              </tr>
            </thead>
            <tbody>
              {CERT_OBJECTIVES.map((row) => (
                <tr key={row.section} className="border-t border-ql-outline-variant">
                  <td className="px-4 py-2 text-ql-on-surface">{row.section}</td>
                  <td className="px-4 py-2 font-mono text-ql-primary">{row.weight}</td>
                  <td className="px-4 py-2 text-ql-on-surface-variant">{row.tasks.join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ql-on-surface-variant">
          Objectives summarized from IBM’s C1000-179 study guide for facilitator planning. Take the
          exam on IBM / Pearson — we do not host IBM’s PDF on the public site.
        </p>
      </section>

      <p className="text-sm">
        <Link href="/learn/classroom" className="text-ql-primary">
          Classroom + Qulture lessons →
        </Link>
      </p>
    </div>
  );
}
