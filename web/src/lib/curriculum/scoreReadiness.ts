import { PATHWAYS } from "./pathways";
import { READINESS_QUESTIONS } from "./questions";
import type {
  PathwayId,
  PathwayWeights,
  RankedPathway,
  ReadinessResult,
} from "./types";
import { PATHWAY_IDS } from "./types";

const WHY_LIMIT = 3;

function emptyScores(): Record<PathwayId, number> {
  return PATHWAY_IDS.reduce(
    (acc, id) => {
      acc[id] = 0;
      return acc;
    },
    {} as Record<PathwayId, number>
  );
}

function addWeights(
  scores: Record<PathwayId, number>,
  weights: PathwayWeights,
  scale = 1
): void {
  for (const [id, value] of Object.entries(weights) as [PathwayId, number | undefined][]) {
    if (value) scores[id] += value * scale;
  }
}

function normalizeAnswers(
  answers: Record<string, string | string[] | undefined>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const question of READINESS_QUESTIONS) {
    const raw = answers[question.id];
    if (raw == null) {
      out[question.id] = [];
      continue;
    }
    const list = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
    const allowed = new Set(question.options.map((o) => o.id));
    const unique = [...new Set(list.filter((id) => allowed.has(id)))];
    out[question.id] = question.kind === "single" ? unique.slice(0, 1) : unique;
  }
  return out;
}

function whyFor(
  pathwayId: PathwayId,
  answers: Record<string, string[]>
): string[] {
  const reasons: string[] = [];
  for (const question of READINESS_QUESTIONS) {
    for (const optionId of answers[question.id] ?? []) {
      const option = question.options.find((o) => o.id === optionId);
      if (!option) continue;
      const weight = option.weights[pathwayId] ?? 0;
      if (weight >= 2) {
        reasons.push(`${option.label} (${question.prompt.replace(/\?$/, "")})`);
      }
    }
  }
  return reasons.slice(0, WHY_LIMIT);
}

export function isReadinessComplete(
  answers: Record<string, string | string[] | undefined>
): boolean {
  const normalized = normalizeAnswers(answers);
  return READINESS_QUESTIONS.every((q) => (normalized[q.id] ?? []).length > 0);
}

export function scoreReadiness(
  answers: Record<string, string | string[] | undefined>
): ReadinessResult {
  const normalized = normalizeAnswers(answers);
  const scores = emptyScores();

  for (const question of READINESS_QUESTIONS) {
    const selected = normalized[question.id] ?? [];
    const scale = question.kind === "multi" && selected.length > 0 ? 1 / selected.length : 1;
    for (const optionId of selected) {
      const option = question.options.find((o) => o.id === optionId);
      if (option) addWeights(scores, option.weights, scale);
    }
  }

  const total = PATHWAY_IDS.reduce((sum, id) => sum + scores[id], 0);
  const ranked: RankedPathway[] = PATHWAY_IDS.map((id) => ({
    pathway: PATHWAYS[id],
    score: scores[id],
    share: total > 0 ? scores[id] / total : 0,
    why: whyFor(id, normalized),
  })).sort((a, b) => b.score - a.score || a.pathway.name.localeCompare(b.pathway.name));

  const primary = ranked[0];
  const secondary = ranked.slice(1, 3).filter((row) => row.score > 0);

  return {
    ranked,
    primary,
    secondary,
    answers: normalized,
  };
}
