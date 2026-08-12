import Link from "next/link";

import { COURSES, PATHWAY_LIST, PROGRAM } from "@/lib/curriculum";

export default function LearnHomePage() {
  return (
    <div className="space-y-14">
      <section className="max-w-3xl space-y-4">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-ql-primary">
          Workforce development · 30 days
        </p>
        <h1 className="font-headline text-4xl font-bold tracking-tight text-ql-on-surface sm:text-5xl">
          {PROGRAM.name}
        </h1>
        <p className="text-lg text-ql-on-surface-variant">{PROGRAM.promise}</p>
        <p className="text-sm text-ql-on-surface-variant">
          {PROGRAM.duration} · Built by {PROGRAM.org} for mixed-background cohorts — the same
          people WISER is trying to bring into the quantum economy.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href="/learn/navigator"
            className="rounded-lg bg-ql-primary px-5 py-2.5 text-sm font-semibold text-ql-on-primary no-underline"
          >
            Open the Career Navigator
          </a>
          <Link
            href="/learn/readiness"
            className="rounded-lg border border-ql-outline-variant px-5 py-2.5 text-sm font-medium text-ql-on-surface no-underline"
          >
            WISER Readiness Track
          </Link>
          <Link
            href="/learn/roles"
            className="rounded-lg border border-ql-outline-variant px-5 py-2.5 text-sm font-medium text-ql-on-surface no-underline"
          >
            Roles and hiring
          </Link>
          <Link
            href="/learn/next"
            className="rounded-lg border border-ql-outline-variant px-5 py-2.5 text-sm font-medium text-ql-on-surface no-underline"
          >
            Events and certs
          </Link>
        </div>
      </section>

      <section>
        <h2 className="font-headline text-2xl font-bold text-ql-on-surface">The month</h2>
        <p className="mt-2 max-w-3xl text-sm text-ql-on-surface-variant">
          Four courses, one per week. Week 1 starts with the Career Navigator (profile ×
          interest × goal), then the WISER-aligned eight-pathway quiz. Then roles, regional
          hubs, LinkedIn, hackathons, Qiskit Summer School and Fall Fest, the C1000-179
          developer cert, and the Advocate program. Week 2 now includes Qolour, Q-CTRL Black
          Opal, and IBM Classroom hardware. Week 3 adds Quantum Enigmas and the PQC vs QKD
          case file.
        </p>
        <ol className="mt-6 grid gap-4 md:grid-cols-2">
          {COURSES.map((course) => (
            <li key={course.slug}>
              <Link
                href={`/learn/courses/${course.slug}`}
                className="block h-full rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5 no-underline transition-colors hover:border-ql-primary"
              >
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-ql-primary">
                  Week {course.week} · {course.code}
                </p>
                <h3 className="mt-2 font-headline text-xl font-bold text-ql-on-surface">
                  {course.title}
                </h3>
                <p className="mt-2 text-sm text-ql-on-surface-variant">{course.subtitle}</p>
                <p className="mt-3 text-xs text-ql-on-surface-variant">Partner: {course.partner}</p>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="font-headline text-2xl font-bold text-ql-on-surface">
          Where subject-matter expertise already fits
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-ql-on-surface-variant">
          Aligned with WISER’s career areas, plus an Applied Domain Specialist track for people
          whose value is the problem — finance, logistics, health, energy — not a physics pedigree.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PATHWAY_LIST.map((pathway) => (
            <Link
              key={pathway.id}
              href={`/learn/roles#${pathway.id}`}
              className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-4 no-underline hover:border-ql-primary"
            >
              <h3 className="font-headline text-base font-bold text-ql-on-surface">
                {pathway.shortName}
              </h3>
              <p className="mt-2 text-sm text-ql-on-surface-variant">{pathway.tagline}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
