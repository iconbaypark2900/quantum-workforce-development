import { describe, expect, it } from "vitest";

import { READINESS_QUESTIONS } from "./questions";
import { isReadinessComplete, scoreReadiness } from "./scoreReadiness";
import { PATHWAY_IDS } from "./types";

const financeAnswers = {
  background: "quant-finance",
  "work-mode": "analyze",
  math: "mid",
  code: "script",
  draw: ["advantage"],
  contribution: "mapper",
  horizon: "now",
};

const educatorAnswers = {
  background: "teach",
  "work-mode": "explain",
  math: "low",
  code: "none",
  draw: ["talent", "intuition"],
  contribution: "translator",
  horizon: "field",
};

const securityAnswers = {
  background: "cyber",
  "work-mode": "secure",
  math: "mid",
  code: "script",
  draw: ["pqc"],
  contribution: "owner",
  horizon: "now",
};

describe("scoreReadiness", () => {
  it("ranks applied / algorithms highest for a finance SME", () => {
    const result = scoreReadiness(financeAnswers);
    expect(result.primary.pathway.id).toBe("applied");
    const topIds = result.ranked.slice(0, 3).map((r) => r.pathway.id);
    expect(topIds).toContain("algorithms");
    expect(result.primary.share).toBeGreaterThan(0.15);
    expect(result.primary.why.length).toBeGreaterThan(0);
  });

  it("ranks education highest for a curriculum / community profile", () => {
    const result = scoreReadiness(educatorAnswers);
    expect(result.primary.pathway.id).toBe("education");
  });

  it("ranks security highest for a cryptography profile", () => {
    const result = scoreReadiness(securityAnswers);
    expect(result.primary.pathway.id).toBe("security");
  });

  it("ignores unknown option ids and still returns every pathway", () => {
    const result = scoreReadiness({
      ...financeAnswers,
      background: "not-a-real-option",
      extra: "ignored",
    });
    expect(result.ranked).toHaveLength(PATHWAY_IDS.length);
    expect(result.answers.background).toEqual([]);
  });

  it("treats multi-select as a single question's worth of weight", () => {
    const one = scoreReadiness({ ...educatorAnswers, draw: ["talent"] });
    const two = scoreReadiness({ ...educatorAnswers, draw: ["talent", "intuition"] });
    const oneDraw = one.ranked.find((r) => r.pathway.id === "education")?.score ?? 0;
    const twoDraw = two.ranked.find((r) => r.pathway.id === "education")?.score ?? 0;
    expect(twoDraw).toBeLessThanOrEqual(oneDraw + 0.01);
  });
});

describe("isReadinessComplete", () => {
  it("requires every question", () => {
    expect(isReadinessComplete(financeAnswers)).toBe(true);
    expect(isReadinessComplete({ ...financeAnswers, horizon: [] })).toBe(false);
    expect(isReadinessComplete({})).toBe(false);
  });

  it("covers every question id used in fixtures", () => {
    const ids = READINESS_QUESTIONS.map((q) => q.id);
    expect(ids).toEqual([
      "background",
      "work-mode",
      "math",
      "code",
      "draw",
      "contribution",
      "horizon",
    ]);
  });
});
