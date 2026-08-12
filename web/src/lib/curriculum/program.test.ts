import { describe, expect, it } from "vitest";

import { COURSES, COURSE_SLUGS, GLOSSARY, PATHWAY_LIST, courseBySlug } from "./index";
import { PATHWAY_IDS } from "./types";

describe("curriculum catalog", () => {
  it("has four weekly courses in order", () => {
    expect(COURSES).toHaveLength(4);
    expect(COURSES.map((c) => c.week)).toEqual([1, 2, 3, 4]);
    expect(COURSE_SLUGS).toEqual([
      "quantum-readiness",
      "qubit-fundamentals",
      "business-foundations",
      "vocabulary-and-baseline",
    ]);
  });

  it("resolves each slug and names the intended partners", () => {
    expect(courseBySlug("qubit-fundamentals")?.partner).toMatch(/Qolour/);
    expect(courseBySlug("business-foundations")?.partner).toMatch(/IBM/);
    expect(courseBySlug("missing")).toBeUndefined();
  });

  it("covers every pathway id exactly once in the display list", () => {
    expect(PATHWAY_LIST.map((p) => p.id).sort()).toEqual([...PATHWAY_IDS].sort());
  });

  it("has unique glossary terms", () => {
    const terms = GLOSSARY.map((e) => e.term);
    expect(new Set(terms).size).toBe(terms.length);
    expect(terms.length).toBeGreaterThanOrEqual(24);
  });
});
