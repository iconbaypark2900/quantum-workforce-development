export const PATHWAY_IDS = [
  "algorithms",
  "software",
  "hardware",
  "security",
  "sensing",
  "business",
  "education",
  "applied",
] as const;

export type PathwayId = (typeof PATHWAY_IDS)[number];

export type PathwayWeights = Partial<Record<PathwayId, number>>;

export type QuestionKind = "single" | "multi";

export interface ReadinessOption {
  id: string;
  label: string;
  hint?: string;
  weights: PathwayWeights;
}

export interface ReadinessQuestion {
  id: string;
  prompt: string;
  help: string;
  kind: QuestionKind;
  options: ReadinessOption[];
}

export interface Pathway {
  id: PathwayId;
  name: string;
  shortName: string;
  tagline: string;
  whoItFits: string;
  exampleRoles: string[];
  adjacentSkills: string[];
  monthEmphasis: string;
}

export interface RankedPathway {
  pathway: Pathway;
  score: number;
  share: number;
  why: string[];
}

export interface ReadinessResult {
  ranked: RankedPathway[];
  primary: RankedPathway;
  secondary: RankedPathway[];
  answers: Record<string, string[]>;
}

export type CourseSlug =
  | "quantum-readiness"
  | "qubit-fundamentals"
  | "business-foundations"
  | "vocabulary-and-baseline";

export interface CourseModule {
  title: string;
  duration: string;
  outcomes: string[];
  activities: string[];
}

export interface Course {
  slug: CourseSlug;
  week: 1 | 2 | 3 | 4;
  code: string;
  title: string;
  subtitle: string;
  partner: string;
  partnerUrl?: string;
  hours: string;
  format: string;
  summary: string;
  whyThisWeek: string;
  learningOutcomes: string[];
  modules: CourseModule[];
  deliverable: string;
  assessment: string;
}

export interface GlossaryEntry {
  term: string;
  shortDef: string;
  fullDef: string;
  whyItMatters: string;
  related: string[];
  courseSlugs: CourseSlug[];
}
