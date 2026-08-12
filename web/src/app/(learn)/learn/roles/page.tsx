import Link from "next/link";

import { PATHWAYS } from "@/lib/curriculum/pathways";
import { ROLE_FAMILIES } from "@/lib/curriculum/roles";

export default function RolesPage() {
  return (
    <div className="space-y-10">
      <header className="max-w-3xl space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-ql-primary">
          After the Readiness Track
        </p>
        <h1 className="font-headline text-4xl font-bold tracking-tight text-ql-on-surface">
          Roles, skills, and who hires them
        </h1>
        <p className="text-lg text-ql-on-surface-variant">
          First see the role family. Then see the skill set. Then see the kinds of companies that
          post those jobs. This is a market map, not a live job board — always verify the posting.
        </p>
        <p className="text-sm text-ql-on-surface-variant">
          Run{" "}
          <Link href="/learn/readiness" className="text-ql-primary">
            the Readiness Track
          </Link>{" "}
          if you do not yet know which family is yours.
        </p>
      </header>

      <div className="space-y-6">
        {ROLE_FAMILIES.map((role) => {
          const pathway = PATHWAYS[role.pathwayId];
          return (
            <article
              key={role.pathwayId}
              id={role.pathwayId}
              className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-6"
            >
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-ql-primary">
                {pathway.shortName} · PhD {role.phdRequired}
              </p>
              <h2 className="mt-1 font-headline text-2xl font-bold text-ql-on-surface">
                {pathway.name}
              </h2>
              <p className="mt-2 text-sm text-ql-on-surface-variant">{role.whatTheyDo}</p>
              <p className="mt-2 text-sm text-ql-on-surface">
                <span className="font-semibold">Typical titles. </span>
                {role.titles.join(" · ")}
              </p>
              <p className="mt-2 text-sm text-ql-on-surface-variant">{role.typicalBackground}</p>
              <h3 className="mt-4 text-sm font-semibold text-ql-on-surface">Skill set</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-ql-on-surface-variant">
                {role.skills.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <h3 className="mt-4 text-sm font-semibold text-ql-on-surface">
                Companies that hire this family
              </h3>
              <ul className="mt-1 space-y-1 text-sm text-ql-on-surface-variant">
                {role.employers.map((e) => (
                  <li key={e.name}>
                    <span className="font-medium text-ql-on-surface">{e.name}.</span> {e.why}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                {role.boards.map((b, i) => (
                  <span key={b.href}>
                    {i > 0 ? " · " : ""}
                    <a href={b.href} className="text-ql-primary">
                      {b.label}
                    </a>
                  </span>
                ))}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
