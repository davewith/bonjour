import type { Db } from "../db/connection.js";
import {
  CommonMistakeSchema,
  SpokenExampleSchema,
  type CommonMistake,
  type SpokenExample,
} from "../types/curriculum.js";

export interface LessonSummary {
  id: string;
  level: string;
  order: number;
  title: string;
  sourcePath: string;
  objectives: string[];
  exerciseCount: number;
  vocabularyCount: number;
  conceptCount: number;
  attempts: number;
}

export interface LessonDetail extends LessonSummary {
  body: string;
  concepts: Array<{
    id: string;
    kind: string;
    title: string;
    summary: string;
    explanation: string;
  }>;
  vocabulary: Array<{
    id: string;
    french: string;
    english: string;
    ipa: string | null;
    partOfSpeech: string | null;
    exampleFr: string | null;
    exampleEn: string | null;
    tags: string[];
  }>;
  exercises: Array<{
    id: string;
    type: string;
    conceptId: string | null;
    vocabId: string | null;
    prompt: string;
    answer: string;
    accepted: string[];
    options: string[] | null;
    hint: string | null;
    explanation: string | null;
    difficulty: number;
  }>;
  commonMistakes: CommonMistake[];
  spokenExamples: SpokenExample[];
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function listLessons(db: Db): LessonSummary[] {
  const rows = db
    .prepare(
      `SELECT l.id, l.level, l.ord, l.title, l.source_path, l.objectives,
              (SELECT COUNT(*) FROM exercises e WHERE e.lesson_id = l.id) AS exercise_count,
              (SELECT COUNT(*) FROM vocabulary v WHERE v.lesson_id = l.id) AS vocab_count,
              (SELECT COUNT(*) FROM concepts c WHERE c.lesson_id = l.id) AS concept_count,
              (SELECT COUNT(*) FROM exercise_attempts a
                 JOIN exercises e2 ON e2.id = a.exercise_id
                 WHERE e2.lesson_id = l.id) AS attempts
       FROM lessons l
       ORDER BY l.level, l.ord`,
    )
    .all() as Array<Record<string, string | number>>;

  return rows.map((r) => ({
    id: String(r["id"]),
    level: String(r["level"]),
    order: Number(r["ord"]),
    title: String(r["title"]),
    sourcePath: String(r["source_path"]),
    objectives: parseJson<string[]>(String(r["objectives"]), []),
    exerciseCount: Number(r["exercise_count"]),
    vocabularyCount: Number(r["vocab_count"]),
    conceptCount: Number(r["concept_count"]),
    attempts: Number(r["attempts"]),
  }));
}

export function getLesson(db: Db, id: string): LessonDetail | null {
  const row = db
    .prepare(
      `SELECT id, level, ord, title, source_path, objectives, body,
              common_mistakes, spoken_examples
       FROM lessons WHERE id = ?`,
    )
    .get(id) as Record<string, string> | undefined;
  if (!row) return null;

  const summary = listLessons(db).find((l) => l.id === id);
  if (!summary) return null;

  const concepts = db
    .prepare(
      `SELECT id, kind, title, summary, explanation FROM concepts
       WHERE lesson_id = ? ORDER BY ord`,
    )
    .all(id) as Array<Record<string, string>>;

  const vocab = db
    .prepare(
      `SELECT id, french, english, ipa, part_of_speech, example_fr, example_en, tags
       FROM vocabulary WHERE lesson_id = ? ORDER BY ord`,
    )
    .all(id) as Array<Record<string, string | null>>;

  const exercises = db
    .prepare(
      `SELECT id, type, concept_id, vocab_id, prompt, expected_answer,
              accepted_answers, options, hint, explanation, difficulty
       FROM exercises WHERE lesson_id = ? ORDER BY ord`,
    )
    .all(id) as Array<Record<string, string | number | null>>;

  return {
    ...summary,
    body: String(row["body"]),
    concepts: concepts.map((c) => ({
      id: String(c["id"]),
      kind: String(c["kind"]),
      title: String(c["title"]),
      summary: String(c["summary"]),
      explanation: String(c["explanation"]),
    })),
    vocabulary: vocab.map((v) => ({
      id: String(v["id"]),
      french: String(v["french"]),
      english: String(v["english"]),
      ipa: v["ipa"] == null ? null : String(v["ipa"]),
      partOfSpeech: v["part_of_speech"] == null ? null : String(v["part_of_speech"]),
      exampleFr: v["example_fr"] == null ? null : String(v["example_fr"]),
      exampleEn: v["example_en"] == null ? null : String(v["example_en"]),
      tags: parseJson<string[]>(String(v["tags"] ?? "[]"), []),
    })),
    exercises: exercises.map((e) => ({
      id: String(e["id"]),
      type: String(e["type"]),
      conceptId: e["concept_id"] == null ? null : String(e["concept_id"]),
      vocabId: e["vocab_id"] == null ? null : String(e["vocab_id"]),
      prompt: String(e["prompt"]),
      answer: String(e["expected_answer"]),
      accepted: parseJson<string[]>(String(e["accepted_answers"] ?? "[]"), []),
      options: e["options"] == null ? null : parseJson<string[]>(String(e["options"]), []),
      hint: e["hint"] == null ? null : String(e["hint"]),
      explanation: e["explanation"] == null ? null : String(e["explanation"]),
      difficulty: Number(e["difficulty"]),
    })),
    commonMistakes: parseJson<unknown[]>(row["common_mistakes"], []).flatMap(
      (m) => {
        const r = CommonMistakeSchema.safeParse(m);
        return r.success ? [r.data] : [];
      },
    ),
    spokenExamples: parseJson<unknown[]>(row["spoken_examples"], []).flatMap(
      (s) => {
        const r = SpokenExampleSchema.safeParse(s);
        return r.success ? [r.data] : [];
      },
    ),
  };
}
