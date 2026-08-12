import ReadinessTrack from "@/components/learn/ReadinessTrack";

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
          already have onto the quantum ecosystem so you can see where you fit — applied SME,
          algorithms, software, hardware, security, sensing, business, or education.
        </p>
        <p className="text-sm text-ql-on-surface-variant">
          Answers stay in this browser. Use the result to write your week-1 learning plan.
        </p>
      </header>
      <ReadinessTrack />
    </div>
  );
}
