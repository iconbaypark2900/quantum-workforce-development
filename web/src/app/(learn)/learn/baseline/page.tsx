import Link from "next/link";

const STEPS = [
  {
    title: "1. Name the problem",
    body: "Owner, decision, and constraint. Example: allocate a long-only equity book under weight caps with a stated risk metric.",
  },
  {
    title: "2. Freeze the instance",
    body: "Same tickers, same date window, same data vendor. If the instance moves when the method moves, it is not a comparison.",
  },
  {
    title: "3. Pick the classical method",
    body: "Equal weight, Markowitz, min-variance, HRP — whatever is the honest production-grade default. Tune it. Write the hyperparameters.",
  },
  {
    title: "4. Declare the metric",
    body: "Sharpe, volatility, drawdown, energy, feasibility, PR-AUC. One primary metric, two secondary. Include uncertainty.",
  },
  {
    title: "5. Map toward quantum",
    body: "Show the encoding (often QUBO / Ising) or the variational cost. Say what does not map. Hybrid is expected.",
  },
  {
    title: "6. Optimize on the quantum-inspired or QPU path",
    body: "QUBO+SA, QAOA, VQE — simulator is enough for the month. Record shots, iterations, backend, noise model.",
  },
  {
    title: "7. Compare, then recommend",
    body: "Fill the table. A go means the quantum path earned a follow-up. A no-go is a passing grade if the reasoning is clean.",
  },
];

export default function BaselinePage() {
  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-ql-primary">
          Course 4 lab · QR-4
        </p>
        <h1 className="font-headline text-4xl font-bold tracking-tight text-ql-on-surface">
          Classical baseline to quantum comparison
        </h1>
        <p className="text-lg text-ql-on-surface-variant">
          This is the professional habit Quantum Global Group teaches with the Portfolio Lab:
          define the classical baseline, map the problem, optimize, and benchmark. A circuit
          without this paragraph cannot pass the month.
        </p>
      </header>

      <ol className="grid gap-4">
        {STEPS.map((step) => (
          <li
            key={step.title}
            className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5"
          >
            <h2 className="font-headline text-xl font-bold text-ql-on-surface">{step.title}</h2>
            <p className="mt-2 text-sm text-ql-on-surface-variant">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-ql-primary/40 bg-ql-surface-low p-6">
        <h2 className="font-headline text-xl font-bold text-ql-on-surface">Worked example</h2>
        <p className="mt-2 text-sm text-ql-on-surface-variant">
          Use the Portfolio Lab on a small universe (for example Mag 7 + JPM). Run a classical
          objective first. Then run a QUBO+SA or VQE/QAOA path on the same instance. Export the
          comparison into the week-4 capstone brief.
        </p>
        <Link
          href="/portfolio"
          className="mt-4 inline-block rounded-lg bg-ql-primary px-5 py-2.5 text-sm font-semibold text-ql-on-primary no-underline"
        >
          Open Portfolio Lab
        </Link>
      </div>
    </div>
  );
}
