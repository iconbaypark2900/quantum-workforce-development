import Link from "next/link";

import { LIBRARY_ITEMS } from "@/lib/curriculum/library";
import { PARTNER_COURSES, QULTURE_LESSONS } from "@/lib/curriculum/qulture";

export default function ClassroomPage() {
  return (
    <div className="space-y-12">
      <header className="max-w-3xl space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-ql-primary">
          IBM Classroom · Quantum for the Qulture
        </p>
        <h1 className="font-headline text-4xl font-bold tracking-tight text-ql-on-surface">
          Classroom, partner courses, and the Qulture sequence
        </h1>
        <p className="text-lg text-ql-on-surface-variant">
          Quantum Global Group is approved for an IBM Quantum Classroom Account: invite the
          cohort, no student credit cards, Open Plan QPU minutes. Pair that hardware with Qolour,
          Q-CTRL Black Opal, Quantum Enigmas, and the Qulture lesson wall.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-headline text-2xl font-bold text-ql-on-surface">Partner courses</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {PARTNER_COURSES.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5"
            >
              <a href={c.href} className="font-headline text-lg font-bold text-ql-primary">
                {c.name}
              </a>
              <p className="mt-2 text-sm text-ql-on-surface-variant">{c.role}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headline text-2xl font-bold text-ql-on-surface">
          Quantum for the Qulture lessons
        </h2>
        <p className="max-w-3xl text-sm text-ql-on-surface-variant">
          Bitstrings before qubits. Vectors, matrices, complex numbers, shots, noise, tensors,
          observables, Bloch sphere, variational calculus, then graphs → QAOA. Same slogan on every
          sheet: learn the math, see the quantum, find your pathway.
        </p>
        <div className="space-y-3">
          {QULTURE_LESSONS.map((lesson) => (
            <article
              key={lesson.id}
              className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5"
            >
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-ql-primary">
                Lesson {lesson.number} · Week {lesson.week}
              </p>
              <h3 className="mt-1 font-headline text-xl font-bold text-ql-on-surface">
                {lesson.title}
              </h3>
              <p className="mt-2 text-sm text-ql-on-surface-variant">{lesson.hook}</p>
              <p className="mt-2 text-sm text-ql-on-surface">
                <span className="font-semibold">Takeaway. </span>
                {lesson.takeaway}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-headline text-2xl font-bold text-ql-on-surface">Downloadable references</h2>
        <p className="max-w-3xl text-sm text-ql-on-surface-variant">
          Qulture math sheets (QMMV), Max Cut workforce pair, IQM circuit sheet, and the PQC vs QKD
          quick reference. Open any sheet in a new tab.
        </p>
        <ul className="grid gap-3 md:grid-cols-2">
          {LIBRARY_ITEMS.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5"
            >
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="font-headline text-lg font-bold text-ql-primary"
              >
                {item.title}
              </a>
              <p className="mt-1 text-xs text-ql-on-surface-variant">
                {item.source} · Week {item.week}
              </p>
              <p className="mt-2 text-sm text-ql-on-surface-variant">{item.note}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm">
          <Link href="/learn" className="text-ql-primary">
            ← Back to the month
          </Link>
        </p>
      </section>
    </div>
  );
}
