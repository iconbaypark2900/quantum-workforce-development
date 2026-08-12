"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { READINESS_QUESTIONS } from "@/lib/curriculum/questions";
import { isReadinessComplete, scoreReadiness } from "@/lib/curriculum/scoreReadiness";
import type { PathwayId } from "@/lib/curriculum/types";

const STORAGE_KEY = "qgg-readiness-answers-v1";

type Answers = Record<string, string[]>;

function loadAnswers(): Answers {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Answers;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persist(answers: Answers) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch {
    /* ignore quota */
  }
}

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export default function ReadinessTrack() {
  const [answers, setAnswers] = useState<Answers>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const stored = loadAnswers();
    if (Object.keys(stored).length === 0) return;
    queueMicrotask(() => setAnswers(stored));
  }, []);

  const complete = isReadinessComplete(answers);
  const result = useMemo(
    () => (complete ? scoreReadiness(answers) : null),
    [answers, complete]
  );

  const toggle = (questionId: string, optionId: string, kind: "single" | "multi") => {
    setSubmitted(false);
    setAnswers((prev) => {
      const current = prev[questionId] ?? [];
      let next: string[];
      if (kind === "single") {
        next = [optionId];
      } else if (current.includes(optionId)) {
        next = current.filter((id) => id !== optionId);
      } else {
        next = [...current, optionId];
      }
      const updated = { ...prev, [questionId]: next };
      persist(updated);
      return updated;
    });
  };

  const reset = () => {
    setAnswers({});
    setSubmitted(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-8">
      {READINESS_QUESTIONS.map((question, index) => (
        <fieldset
          key={question.id}
          className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5 sm:p-6"
        >
          <legend className="font-headline text-lg font-bold text-ql-on-surface">
            <span className="mr-2 text-ql-primary">{String(index + 1).padStart(2, "0")}</span>
            {question.prompt}
          </legend>
          <p className="mt-2 text-sm text-ql-on-surface-variant">{question.help}</p>
          <div className="mt-4 grid gap-2">
            {question.options.map((option) => {
              const selected = (answers[question.id] ?? []).includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggle(question.id, option.id, question.kind)}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    selected
                      ? "border-ql-primary bg-ql-surface-container text-ql-on-surface"
                      : "border-ql-outline-variant bg-ql-surface text-ql-on-surface-variant hover:border-ql-primary/60 hover:text-ql-on-surface"
                  }`}
                >
                  <span className="block font-medium text-ql-on-surface">{option.label}</span>
                  {option.hint ? (
                    <span className="mt-0.5 block text-xs text-ql-on-surface-variant">
                      {option.hint}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!complete}
          onClick={() => setSubmitted(true)}
          className="rounded-lg bg-ql-primary px-5 py-2.5 text-sm font-semibold text-ql-on-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          See where you fit
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-ql-outline-variant px-5 py-2.5 text-sm font-medium text-ql-on-surface-variant hover:text-ql-on-surface"
        >
          Start over
        </button>
        {!complete ? (
          <p className="text-sm text-ql-on-surface-variant">
            Answer every question to generate a pathway map.
          </p>
        ) : null}
      </div>

      {submitted && result ? (
        <ResultPanel
          primaryId={result.primary.pathway.id}
          rows={result.ranked.map((row) => ({
            id: row.pathway.id,
            name: row.pathway.name,
            tagline: row.pathway.tagline,
            whoItFits: row.pathway.whoItFits,
            exampleRoles: row.pathway.exampleRoles,
            monthEmphasis: row.pathway.monthEmphasis,
            share: row.share,
            why: row.why,
            isPrimary: row.pathway.id === result.primary.pathway.id,
            isSecondary: result.secondary.some((s) => s.pathway.id === row.pathway.id),
          }))}
        />
      ) : null}
    </div>
  );
}

function ResultPanel({
  primaryId,
  rows,
}: {
  primaryId: PathwayId;
  rows: {
    id: PathwayId;
    name: string;
    tagline: string;
    whoItFits: string;
    exampleRoles: string[];
    monthEmphasis: string;
    share: number;
    why: string[];
    isPrimary: boolean;
    isSecondary: boolean;
  }[];
}) {
  const primary = rows.find((r) => r.isPrimary);
  const secondary = rows.filter((r) => r.isSecondary);

  return (
    <section className="space-y-6 rounded-xl border border-ql-primary/40 bg-ql-surface-low p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ql-primary">
          Your primary pathway
        </p>
        <h2 className="mt-1 font-headline text-3xl font-bold text-ql-on-surface">
          {primary?.name}
        </h2>
        <p className="mt-2 text-ql-on-surface-variant">{primary?.tagline}</p>
        <p className="mt-3 text-sm text-ql-on-surface">{primary?.whoItFits}</p>
      </div>

      {primary?.why.length ? (
        <div>
          <h3 className="text-sm font-semibold text-ql-on-surface">Why this scored highest</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ql-on-surface-variant">
            {primary.why.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold text-ql-on-surface">Example roles</h3>
        <p className="mt-1 text-sm text-ql-on-surface-variant">
          {primary?.exampleRoles.join(" · ")}
        </p>
      </div>

      <p className="rounded-lg bg-ql-surface-container px-4 py-3 text-sm text-ql-on-surface">
        <span className="font-semibold">How to use this month: </span>
        {primary?.monthEmphasis}
      </p>

      {secondary.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-ql-on-surface">Adjacent pathways</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {secondary.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-ql-outline-variant bg-ql-surface p-4"
              >
                <p className="font-headline font-bold text-ql-on-surface">{row.name}</p>
                <p className="mt-1 text-sm text-ql-on-surface-variant">{row.tagline}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ql-on-surface">Full mix</h3>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3">
              <span className="w-40 shrink-0 text-xs text-ql-on-surface-variant sm:w-52">
                {row.name.replace("Quantum ", "")}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ql-surface-container">
                <div
                  className={`h-full rounded-full ${
                    row.id === primaryId ? "bg-ql-primary" : "bg-ql-secondary"
                  }`}
                  style={{ width: pct(row.share) }}
                />
              </div>
              <span className="w-10 text-right font-mono text-xs text-ql-on-surface-variant">
                {pct(row.share)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Link
          href="/learn/courses/quantum-readiness"
          className="rounded-lg bg-ql-primary px-4 py-2 text-sm font-semibold text-ql-on-primary no-underline"
        >
          Open week 1 syllabus
        </Link>
        <Link
          href="/learn/courses"
          className="rounded-lg border border-ql-outline-variant px-4 py-2 text-sm font-medium text-ql-on-surface no-underline"
        >
          See all four courses
        </Link>
      </div>
    </section>
  );
}
