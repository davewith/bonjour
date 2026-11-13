import type { Db } from "../db/connection.js";

export interface MistakeView {
  id: number;
  exerciseId: string;
  lessonId: string;
  prompt: string;
  learnerAnswer: string | null;
  expectedAnswer: string;
  conceptId: string | null;
  conceptTitle: string | null;
  vocabId: string | null;
  note: string | null;
  createdAt: string;
}

interface MistakeJoinRow {
  id: number;
  exercise_id: string;
  lesson_id: string;
  prompt: string;
  expected_answer: string;
  concept_id: string | null;
  concept_title: string | null;
  vocab_id: string | null;
  note: string | null;
  created_at: string;
  learner_answer: string | null;
}

function mapRow(r: MistakeJoinRow): MistakeView {
  return {
    id: Number(r.id),
    exerciseId: r.exercise_id,
    lessonId: r.lesson_id,
    prompt: r.prompt,
    learnerAnswer: r.learner_answer,
    expectedAnswer: r.expected_answer,
    conceptId: r.concept_id,
    conceptTitle: r.concept_title,
    vocabId: r.vocab_id,
    note: r.note,
    createdAt: r.created_at,
  };
}

const BASE_SELECT = `
  SELECT m.id, m.exercise_id, e.lesson_id, e.prompt, e.expected_answer,
         m.concept_id, c.title AS concept_title, m.vocab_id, m.note, m.created_at,
         a.learner_answer
  FROM mistakes m
  JOIN exercises e ON e.id = m.exercise_id
  LEFT JOIN concepts c ON c.id = m.concept_id
  LEFT JOIN exercise_attempts a ON a.id = m.attempt_id
`;

/** Open (unresolved) mistakes, newest first. */
export function listOpenMistakes(db: Db, limit = 50): MistakeView[] {
  const rows = db
    .prepare(`${BASE_SELECT} WHERE m.resolved_at IS NULL ORDER BY m.id DESC LIMIT ?`)
    .all(limit) as unknown as MistakeJoinRow[];
  return rows.map(mapRow);
}

/** Recently resolved mistakes (evidence of improvement). */
export function listResolvedMistakes(db: Db, limit = 20): MistakeView[] {
  const rows = db
    .prepare(
      `${BASE_SELECT} WHERE m.resolved_at IS NOT NULL ORDER BY m.resolved_at DESC LIMIT ?`,
    )
    .all(limit) as unknown as MistakeJoinRow[];
  return rows.map(mapRow);
}

export interface MistakeStats {
  open: number;
  resolved: number;
}

export function mistakeStats(db: Db): MistakeStats {
  const open = db
    .prepare("SELECT COUNT(*) AS n FROM mistakes WHERE resolved_at IS NULL")
    .get() as { n: number };
  const resolved = db
    .prepare("SELECT COUNT(*) AS n FROM mistakes WHERE resolved_at IS NOT NULL")
    .get() as { n: number };
  return { open: Number(open.n), resolved: Number(resolved.n) };
}
