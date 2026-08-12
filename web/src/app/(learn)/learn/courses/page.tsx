import Link from "next/link";

import { COURSES } from "@/lib/curriculum";

export default function CoursesPage() {
  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-ql-primary">
          One-month program
        </p>
        <h1 className="font-headline text-4xl font-bold tracking-tight text-ql-on-surface">
          Four courses
        </h1>
        <p className="text-lg text-ql-on-surface-variant">
          Each week is a complete course with outcomes, modules, a deliverable, and an assessment.
          Full facilitator packets live in{" "}
          <code className="font-mono text-sm">docs/curriculum/</code>.
        </p>
      </header>
      <ol className="space-y-4">
        {COURSES.map((course) => (
          <li key={course.slug}>
            <Link
              href={`/learn/courses/${course.slug}`}
              className="block rounded-xl border border-ql-outline-variant bg-ql-surface-low p-6 no-underline hover:border-ql-primary"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-ql-primary">
                  Week {course.week} · {course.code} · {course.hours}
                </p>
                <p className="text-xs text-ql-on-surface-variant">{course.partner}</p>
              </div>
              <h2 className="mt-2 font-headline text-2xl font-bold text-ql-on-surface">
                {course.title}
              </h2>
              <p className="mt-2 text-ql-on-surface-variant">{course.summary}</p>
              <p className="mt-4 text-sm font-medium text-ql-primary">Open syllabus →</p>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
