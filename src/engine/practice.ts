import type { Db } from "../db/connection.js";
import { dueItems, weakAreas } from "./review.js";
import { listOpenMistakes } from "./mistakes.js";

/**
 * Practice queues for the interactive UI.
 *
 * Exercises are returned SANITISED: expected answers, accepted alternatives
 * and explanations are never included — they are revealed only through
 * `recordAttempt` results, after the learner has answered.
 */
export type PracticeSource = "due" | "mistakes" | "weak" | "lesson";

export interface PublicExercise {
  id: string;
  lessonId: string;
  lessonTitle: string;
  type: string;
  conceptId: string | null;
  vocabId: string | null;
  prompt: string;
  options: string[] | null;
  hint: string | null;
  difficulty: number;
}

export interface PracticeQueue {
  source: PracticeSource;
  lessonId: string | null;
  generatedAt: string;
  count: number;
  exercises: PublicExercise[];
}

export interface PracticeQueueOptions {
  source: PracticeSource;
  lessonId?: string;
  limit?: number;
  now?: Date;
}

interface PublicExerciseRow {
  id: string;
  lesson_id: string;
  lesson_title: string;
  type: string;
  concept_id: string | null;
  vocab_id: string | null;
  prompt: string;
  options: string | null;
  hint: string | null;
  difficulty: number;
}

function parseJsonArray(raw: string | null): string[] | null {
  if (raw == null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* fall through */
  }
  return null;
}

function toPublicExercise(r: PublicExerciseRow): PublicExercise {
  return {
    id: r.id,
    lessonId: r.lesson_id,
    lessonTitle: r.lesson_title,
    type: r.type,
    conceptId: r.concept_id,
    vocabId: r.vocab_id,
    prompt: r.prompt,
    options: parseJsonArray(r.options),
    hint: r.hint,
    difficulty: Number(r.difficulty),
  };
}

const SELECT_PUBLIC = `
  SELECT e.id, e.lesson_id, l.title AS lesson_title, e.type,
         e.concept_id, e.vocab_id, e.prompt, e.options, e.hint, e.difficulty
  FROM exercises e
  JOIN lessons l ON l.id = e.lesson_id
`;

/** Fetch specific exercises by id, preserving the given order. */
function fetchByIds(db: Db, ids: string[]): PublicExercise[] {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const placeholders = unique.map(() => "?").join(",");
  const rows = db
    .prepare(`${SELECT_PUBLIC} WHERE e.id IN (${placeholders})`)
    .all(...unique) as unknown as PublicExerciseRow[];
  const byId = new Map(rows.map((r) => [r.id, toPublicExercise(r)]));
  return ids
    .map((id) => byId.get(id))
    .filter((e): e is PublicExercise => e !== undefined);
}

/** Exercises linked to a mastery entity (concept or vocab), lesson order. */
function exerciseIdsForEntity(
  db: Db,
  entityType: "concept" | "vocab",
  entityId: string,
): string[] {
  const column = entityType === "concept" ? "concept_id" : "vocab_id";
  const rows = db
    .prepare(
      `SELECT id FROM exercises WHERE ${column} = ? ORDER BY lesson_id, ord`,
    )
    .all(entityId) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/** Build a sanitised practice queue for the UI. */
export function practiceQueue(
  db: Db,
  options: PracticeQueueOptions,
): PracticeQueue {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 10;
  const lessonId = options.lessonId ?? null;
  const ids: string[] = [];

  switch (options.source) {
    case "lesson": {
      if (!lessonId) {
        throw new Error("source=lesson requires a lessonId");
      }
      const exists = db
        .prepare("SELECT id FROM lessons WHERE id = ?")
        .get(lessonId);
      if (!exists) throw new Error(`Unknown lesson: ${lessonId}`);
      const rows = db
        .prepare(
          `${SELECT_PUBLIC} WHERE e.lesson_id = ? ORDER BY e.ord LIMIT ?`,
        )
        .all(lessonId, limit) as unknown as PublicExerciseRow[];
      const exercises = rows.map(toPublicExercise);
      return {
        source: "lesson",
        lessonId,
        generatedAt: now.toISOString(),
        count: exercises.length,
        exercises,
      };
    }
    case "due": {
      for (const item of dueItems(db, now, limit)) {
        ids.push(...exerciseIdsForEntity(db, item.entityType, item.entityId));
        if (ids.length >= limit) break;
      }
      break;
    }
    case "mistakes": {
      for (const m of listOpenMistakes(db, limit)) {
        ids.push(m.exerciseId);
      }
      break;
    }
    case "weak": {
      for (const item of weakAreas(db, limit)) {
        ids.push(...exerciseIdsForEntity(db, item.entityType, item.entityId));
        if (ids.length >= limit) break;
      }
      break;
    }
  }

  const exercises = fetchByIds(db, ids).slice(0, limit);
  return {
    source: options.source,
    lessonId,
    generatedAt: now.toISOString(),
    count: exercises.length,
    exercises,
  };
}
