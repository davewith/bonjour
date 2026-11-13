import { z } from "zod";

/**
 * Zod schemas for curriculum Markdown frontmatter.
 * The markdown body is free-form teaching prose; everything structured
 * lives in frontmatter so the learning engine can load it reliably.
 */

export const LessonLevelSchema = z.enum(["A1", "A2", "B1", "B2"]);
export type LessonLevel = z.infer<typeof LessonLevelSchema>;

/** Stable id: lowercase letters/digits separated by single dashes. */
export const StableIdSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "must be lowercase-with-dashes (e.g. a1-01-greetings)",
  );

export const ConceptKindSchema = z.enum([
  "grammar",
  "vocabulary",
  "pronunciation",
  "usage",
]);

export const ConceptSchema = z.object({
  id: StableIdSchema,
  kind: ConceptKindSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  explanation: z.string().default(""),
});
export type Concept = z.infer<typeof ConceptSchema>;

export const VocabularyItemSchema = z.object({
  /** Optional stable id; generated from lesson id + french text when absent. */
  id: StableIdSchema.optional(),
  fr: z.string().min(1),
  en: z.string().min(1),
  ipa: z.string().optional(),
  pos: z.string().optional(),
  exampleFr: z.string().optional(),
  exampleEn: z.string().optional(),
  /** Id of the concept this word belongs to (must exist in same lesson). */
  concept: StableIdSchema.optional(),
  tags: z.array(z.string().min(1)).default([]),
});
export type VocabularyItem = z.infer<typeof VocabularyItemSchema>;

export const ExerciseTypeSchema = z.enum([
  "translation",
  "fill_blank",
  "multiple_choice",
  "production",
  "matching",
  "listening",
  "comprehension",
]);

export const ExerciseSchema = z.object({
  id: StableIdSchema,
  type: ExerciseTypeSchema,
  concept: StableIdSchema.optional(),
  /** Vocabulary reference: stable id or french text of a word in the same lesson. */
  vocab: z.string().min(1).optional(),
  prompt: z.string().min(1),
  answer: z.coerce.string().min(1),
  /** Alternative acceptable answers; YAML numbers are coerced to strings. */
  accepted: z.array(z.coerce.string().min(1)).default([]),
  options: z.array(z.coerce.string().min(1)).min(2).optional(),
  hint: z.string().optional(),
  explanation: z.string().optional(),
  difficulty: z.number().int().min(1).max(5).default(1),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

export const CommonMistakeSchema = z.object({
  wrong: z.string().min(1),
  right: z.string().optional(),
  why: z.string().min(1),
});
export type CommonMistake = z.infer<typeof CommonMistakeSchema>;

export const SpokenExampleSchema = z.object({
  fr: z.string().min(1),
  en: z.string().optional(),
  note: z.string().optional(),
});
export type SpokenExample = z.infer<typeof SpokenExampleSchema>;

export const LessonFrontmatterSchema = z.object({
  id: StableIdSchema,
  level: LessonLevelSchema,
  order: z.number().int().positive(),
  title: z.string().min(1),
  objectives: z.array(z.string().min(1)).min(1),
  concepts: z.array(ConceptSchema).default([]),
  vocabulary: z.array(VocabularyItemSchema).default([]),
  exercises: z.array(ExerciseSchema).min(1),
  commonMistakes: z.array(CommonMistakeSchema).default([]),
  spokenExamples: z.array(SpokenExampleSchema).default([]),
});
export type LessonFrontmatter = z.infer<typeof LessonFrontmatterSchema>;

/** A fully loaded and cross-validated lesson. */
export interface Lesson {
  frontmatter: LessonFrontmatter;
  body: string;
  sourcePath: string;
}
