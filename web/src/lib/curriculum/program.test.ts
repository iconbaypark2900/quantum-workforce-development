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

  it("maps eight role families and Qulture lessons", async () => {
    const { ROLE_FAMILIES } = await import("./roles");
    const { QULTURE_LESSONS } = await import("./qulture");
    const { OPPORTUNITIES } = await import("./nextSteps");
    expect(ROLE_FAMILIES).toHaveLength(8);
    expect(QULTURE_LESSONS.length).toBeGreaterThanOrEqual(12);
    expect(OPPORTUNITIES.some((o) => o.id === "advocate")).toBe(true);
    expect(OPPORTUNITIES.some((o) => o.id === "black-opal")).toBe(true);
    expect(OPPORTUNITIES.some((o) => o.id === "enigmas")).toBe(true);
  });

  it("points Course 1 at the public Career Navigator", async () => {
    const { NAVIGATOR_HREF, NAVIGATION_REPO, COURSES: courses } = await import("./index");
    expect(NAVIGATOR_HREF).toBe("/learn/navigator");
    expect(NAVIGATION_REPO.href).toMatch(/ibm-quantum-navigation/);
    expect(NAVIGATION_REPO.pages).toMatch(/quantumkev\.github\.io\/ibm-quantum-navigation/);
    const week1 = courses.find((c) => c.slug === "quantum-readiness");
    expect(week1?.modules.some((m) => /Career Navigator/i.test(m.title))).toBe(true);
    expect(week1?.modules.flatMap((m) => m.activities).some((a) => a.includes("/learn/navigator"))).toBe(
      true,
    );
  });
});
