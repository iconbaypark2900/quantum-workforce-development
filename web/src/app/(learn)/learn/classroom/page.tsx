import Link from "next/link";

import LearnPageHeader from "@/components/learn/LearnPageHeader";
import { LearnButton } from "@/components/learn/LearnButton";
import { SectionHeader } from "@/components/learn/ProgramStageCard";
import { LIBRARY_ITEMS } from "@/lib/curriculum/library";
import { PARTNER_COURSES, QULTURE_LESSONS } from "@/lib/curriculum/qulture";

export default function ClassroomPage() {
  return (
    <div className="space-y-14">
      <LearnPageHeader
        eyebrow="02 · Classroom"
        title="Quantum Classroom"
        subtitle="Beginner-friendly learning sheets, hands-on activities, and trusted resources for building quantum intuition before formalism."
        showJourney
      >
        <LearnButton href="/dashboard" variant="secondary">
          Apply in Portfolio Lab
        </LearnButton>
      </LearnPageHeader>

      <p className="max-w-3xl text-sm text-ql-on-surface-variant">
        Quantum Global Group uses partner platforms and open resources so cohorts can learn
        hands-on fundamentals. Partner names appear only on resources they actually provide;
        the learning journey is owned by Quantum Global Group.
      </p>

      <section className="rounded-2xl border border-ql-primary/35 bg-ql-surface-low p-6 sm:p-8">
        <SectionHeader
          title="Run on real hardware"
          description="QUANTUM GLOBAL GROUP provides hardware access for the cohort — QPU time without a student credit card. There is no public invite link: request access with your email and we will add you. If you already have access, sign in to the platform."
        />
        <div className="mt-6 flex flex-wrap gap-3">
          <LearnButton href="https://www.quantumglobalgroup.io/#contact" variant="primary">
            Request hardware access
          </LearnButton>
          <LearnButton href="https://quantum.cloud.ibm.com/" variant="secondary" external>
            Sign in to Platform
          </LearnButton>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Quantum for the Qulture"
          description="Bitstrings before qubits. Same slogan on every sheet: learn the math, see the quantum, find your pathway."
        />
        <div className="space-y-3">
          {QULTURE_LESSONS.map((lesson) => (
            <article
              key={lesson.id}
              className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-ql-tertiary">
                Lesson {lesson.number} · Week {lesson.week} · Classroom
              </p>
              <h3 className="mt-1 font-headline text-xl font-bold text-ql-on-surface">{lesson.title}</h3>
              <p className="mt-2 text-sm text-ql-on-surface-variant">{lesson.hook}</p>
              <p className="mt-2 text-sm text-ql-on-surface">
                <span className="font-semibold">Takeaway. </span>
                {lesson.takeaway}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Partner learning resources" description="External courses and tools linked from the curriculum." />
        <ul className="grid gap-3 md:grid-cols-2">
          {PARTNER_COURSES.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5 shadow-sm"
            >
              <a
                href={c.href}
                target="_blank"
                rel="noreferrer noopener"
                className="font-headline text-lg font-bold text-ql-primary no-underline hover:underline"
              >
                {c.name}
              </a>
              <p className="mt-2 text-sm text-ql-on-surface-variant">{c.role}</p>
              <p className="mt-3 text-xs font-medium uppercase tracking-wider text-ql-on-surface-variant">
                Partner resource · Open
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Downloadable references"
          description="Qulture math sheets, Max Cut workforce pair, IQM circuit sheet, and PQC vs QKD quick reference."
        />
        <ul className="grid gap-3 md:grid-cols-2">
          {LIBRARY_ITEMS.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5 shadow-sm"
            >
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="font-headline text-lg font-bold text-ql-primary no-underline hover:underline"
              >
                {item.title}
              </a>
              <p className="mt-1 text-xs text-ql-on-surface-variant">
                {item.source} · Week {item.week}
              </p>
              <p className="mt-2 text-sm text-ql-on-surface-variant">{item.note}</p>
              <p className="mt-3 text-xs font-medium uppercase tracking-wider text-ql-on-surface-variant">
                Download / Open
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-ql-primary/30 bg-ql-surface-low p-6">
        <h2 className="font-headline text-xl font-bold text-ql-on-surface">Apply what you learned</h2>
        <p className="mt-2 max-w-2xl text-sm text-ql-on-surface-variant">
          Use Portfolio Lab to run hybrid workflows, compare against classical baselines, and build evidence
          you can show employers or partners.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <LearnButton href="/dashboard">Apply What You Learned</LearnButton>
          <LearnButton href="/learn/navigator" variant="secondary">
            Return to Navigator
          </LearnButton>
        </div>
      </section>

      <p className="text-sm">
        <Link href="/learn" className="text-ql-primary no-underline hover:underline">
          ← Back to program home
        </Link>
      </p>
    </div>
  );
}
