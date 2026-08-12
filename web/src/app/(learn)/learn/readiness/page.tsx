import ReadinessTrack from "@/components/learn/ReadinessTrack";
import { NAVIGATOR_HREF, NAVIGATION_REPO } from "@/lib/curriculum";

export default function ReadinessPage() {
  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-ql-primary">
          Course 1 lab · QR-1
        </p>
        <h1 className="font-headline text-4xl font-bold tracking-tight text-ql-on-surface">
          Quantum Readiness Track
        </h1>
        <p className="text-lg text-ql-on-surface-variant">
          This is not a personality quiz and it is not a hiring test. It maps the expertise you
          already have onto eight WISER-aligned pathways so you can see where you fit — applied
          SME, algorithms, software, hardware, security, sensing, business, or education.
        </p>
        <p className="text-sm text-ql-on-surface-variant">
          The primary Course 1 lab is the{" "}
          <a href={NAVIGATOR_HREF} className="text-ql-primary">
            Career Navigator
          </a>{" "}
          (profile × interest × goal → a board-game pathway). Use this quiz as the complement:
          it is shorter, WISER-taxonomy-aligned, and stays in this browser. Source:{" "}
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
            Open the Career Navigator
          </a>
        </p>
      </header>
      <ReadinessTrack />
    </div>
  );
}
