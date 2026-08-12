import Link from "next/link";
import { notFound } from "next/navigation";

import { COURSES, courseBySlug } from "@/lib/curriculum";

export function generateStaticParams() {
  return COURSES.map((course) => ({ slug: course.slug }));
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const course = courseBySlug(slug);
  if (!course) notFound();

  const prev = COURSES.find((c) => c.week === course.week - 1);
  const next = COURSES.find((c) => c.week === course.week + 1);

  return (
    <article className="space-y-10">
      <header className="max-w-3xl space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-ql-primary">
          Week {course.week} · {course.code} · {course.format}
        </p>
        <h1 className="font-headline text-4xl font-bold tracking-tight text-ql-on-surface">
          {course.title}
        </h1>
        <p className="text-lg text-ql-on-surface-variant">{course.subtitle}</p>
        <p className="text-sm text-ql-on-surface-variant">
          Partner:{" "}
          {course.partnerUrl ? (
            <a href={course.partnerUrl} className="text-ql-primary">
              {course.partner}
            </a>
          ) : (
            course.partner
          )}{" "}
          · {course.hours}
        </p>
      </header>

      <section className="max-w-3xl space-y-3">
        <h2 className="font-headline text-2xl font-bold text-ql-on-surface">Why this week</h2>
        <p className="text-ql-on-surface-variant">{course.whyThisWeek}</p>
        <p className="text-ql-on-surface-variant">{course.summary}</p>
      </section>

      <section className="max-w-3xl">
        <h2 className="font-headline text-2xl font-bold text-ql-on-surface">Learning outcomes</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-ql-on-surface-variant">
          {course.learningOutcomes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-headline text-2xl font-bold text-ql-on-surface">Modules</h2>
        <div className="grid gap-4">
          {course.modules.map((mod) => (
            <div
              key={mod.title}
              className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-headline text-xl font-bold text-ql-on-surface">{mod.title}</h3>
                <p className="text-xs font-bold uppercase tracking-wider text-ql-primary">
                  {mod.duration}
                </p>
              </div>
              <h4 className="mt-3 text-sm font-semibold text-ql-on-surface">Outcomes</h4>
              <ul className="mt-1 list-disc pl-5 text-sm text-ql-on-surface-variant">
                {mod.outcomes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h4 className="mt-3 text-sm font-semibold text-ql-on-surface">Activities</h4>
              <ul className="mt-1 list-disc pl-5 text-sm text-ql-on-surface-variant">
                {mod.activities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5">
          <h2 className="font-headline text-xl font-bold text-ql-on-surface">Deliverable</h2>
          <p className="mt-2 text-sm text-ql-on-surface-variant">{course.deliverable}</p>
        </div>
        <div className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5">
          <h2 className="font-headline text-xl font-bold text-ql-on-surface">Assessment</h2>
          <p className="mt-2 text-sm text-ql-on-surface-variant">{course.assessment}</p>
        </div>
      </section>

      {course.slug === "quantum-readiness" ? (
        <div className="flex flex-wrap gap-3">
          <a
            href="/learn/navigator"
            className="inline-block rounded-lg bg-ql-primary px-5 py-2.5 text-sm font-semibold text-ql-on-primary no-underline"
          >
            Launch the Career Navigator
          </a>
          <Link
            href="/learn/readiness"
            className="inline-block rounded-lg border border-ql-outline-variant px-5 py-2.5 text-sm font-medium text-ql-on-surface no-underline"
          >
            WISER Readiness Track
          </Link>
        </div>
      ) : null}
      {course.slug === "vocabulary-and-baseline" ? (
        <div className="flex flex-wrap gap-3">
          <Link
            href="/learn/glossary"
            className="rounded-lg bg-ql-primary px-5 py-2.5 text-sm font-semibold text-ql-on-primary no-underline"
          >
            Open the glossary
          </Link>
          <Link
            href="/learn/baseline"
            className="rounded-lg border border-ql-outline-variant px-5 py-2.5 text-sm font-medium text-ql-on-surface no-underline"
          >
            Classical baseline lab
          </Link>
        </div>
      ) : null}

      <nav className="flex flex-wrap justify-between gap-3 border-t border-ql-outline-variant pt-6 text-sm">
        {prev ? (
          <Link href={`/learn/courses/${prev.slug}`} className="text-ql-primary no-underline">
            ← Week {prev.week}: {prev.code}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/learn/courses/${next.slug}`} className="text-ql-primary no-underline">
            Week {next.week}: {next.code} →
          </Link>
        ) : (
          <Link href="/learn/glossary" className="text-ql-primary no-underline">
            Vocabulary glossary →
          </Link>
        )}
      </nav>
    </article>
  );
}
