"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

const NAV = [
  { href: "/learn", label: "Program" },
  { href: "/learn/readiness", label: "Readiness Track" },
  { href: "/learn/courses", label: "Four Courses" },
  { href: "/learn/glossary", label: "Vocabulary" },
  { href: "/learn/baseline", label: "Classical Baseline" },
];

export default function LearnShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-ql-surface text-ql-on-surface">
      <header className="border-b border-ql-outline-variant bg-ql-surface-low/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/learn" className="no-underline">
            <p className="font-headline text-[11px] font-bold uppercase tracking-[0.22em] text-ql-primary">
              Quantum Global Group
            </p>
            <p className="font-headline text-lg font-bold tracking-tight text-ql-on-surface">
              Quantum Readiness Month
            </p>
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((item) => {
              const active =
                item.href === "/learn"
                  ? pathname === "/learn"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium no-underline transition-colors ${
                    active
                      ? "bg-ql-surface-container text-ql-primary"
                      : "text-ql-on-surface-variant hover:bg-ql-surface-container hover:text-ql-on-surface"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/dashboard"
              className="ml-1 rounded-lg border border-ql-outline-variant px-3 py-1.5 text-sm font-medium text-ql-on-surface-variant no-underline hover:border-ql-primary hover:text-ql-primary"
            >
              Portfolio Lab
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">{children}</main>
      <footer className="border-t border-ql-outline-variant px-4 py-8 text-sm text-ql-on-surface-variant sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Workforce curriculum for WISER · partners:{" "}
            <a href="https://www.qolour.io/" className="text-ql-primary">
              Qolour
            </a>
            {" · "}
            <a
              href="https://quantum.cloud.ibm.com/learning/courses/quantum-business-foundations"
              className="text-ql-primary"
            >
              IBM Quantum Business Foundations
            </a>
          </p>
          <p>Documentation: docs/curriculum/</p>
        </div>
      </footer>
    </div>
  );
}
