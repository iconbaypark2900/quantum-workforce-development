import type { Metadata } from "next";

import LearnShell from "@/components/learn/LearnShell";

export const metadata: Metadata = {
  title: "Quantum Readiness Month · Quantum Global Group",
  description:
    "One-month workforce curriculum: find your fit, qubit fundamentals with Qolour, IBM Quantum Business Foundations, and a classical baseline lab.",
};

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return <LearnShell>{children}</LearnShell>;
}
