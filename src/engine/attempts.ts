import type { Db } from "../db/connection.js";
import { gradeAnswer } from "./answers.js";
import { recordOutcome, type EntityType } from "./mastery.js";
import { nowIso } from "./profile.js";

export type AttemptSource = "tutor" | "examiner" | "self";

export interface RecordAttemptInput {
  exerciseId: string;
  answer: string;
  /** When omitted, the engine grades objective exercises itself. */
  correct?: boolean;
  source: AttemptSource;
  sessionId?: number | null;
  feedback?: string;
  note?: string;
}

interface ExerciseRow {
  id: string;
  lesson_id: string;
  concept_id: string | null;
  vocab_id: string | null;
  type: string;
  prompt: string;
  expected_answer: string;
  accepted_answers: string;
  options: string | null;
  explanation: string | null;
}

export interface MasteryUpdate {
  entityType: EntityType;
  entityId: string;
  fromState: string;
  toState: string;
  stateChanged: boolean;
  box: number;
  correctStreak: number;
  nextReviewAt: string | null;
  reason: string;
}

export interface RecordAttemptResult {
  attemptId: number;
  exerciseId: string;
  lessonId: string;
  answer: string;
  graded: "auto" | "provided";
  isCorrect: boolean;
  expectedAnswer: string;
  explanation: string | null;
  masteryUpdates: MasteryUpdate[];
  mistakeOpenedId: number | null;
  mistakesResolvedIds: number[];
  createdAt: string;
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* fall through */
  }
  return [];
}

/**
 * Record one exercise attempt (append-only), then update mastery and mistakes.
 *
 * Grading:
 *  - `correct` provided by tutor/examiner → trusted.
 *  - otherwise the engine grades against expected/accepted answers
 *    (multiple_choice accepts option letters).
 *  - production exercises cannot be auto-graded → error if correct omitted.
 */
export function recordAttempt(
  db: Db,
  input: RecordAttemptInput,
): RecordAttemptResult {
  const exercise = db
    .prepare("SELECT * FROM exercises WHERE id = ?")
    .get(input.exerciseId) as ExerciseRow | undefined;
  if (!exercise) {
    throw new Error(`Unknown exercise id: ${input.exerciseId}`);
  }
  if (input.sessionId != null) {
    const session = db
      .prepare("SELECT id FROM sessions WHERE id = ?")
      .get(input.sessionId);
    if (!session) throw new Error(`Unknown session id: ${input.sessionId}`);
  }

  let isCorrect: boolean;
  let graded: "auto" | "provided";
  if (input.correct !== undefined) {
    isCorrect = input.correct;
    graded = "provided";
  } else {
    if (exercise.type === "production") {
      throw new Error(
        `Exercise "${exercise.id}" is type production and cannot be auto-graded — supply --correct true|false`,
      );
    }
    const options = exercise.options ? parseJsonArray(exercise.options) : undefined;
    const result = gradeAnswer(
      input.answer,
      exercise.expected_answer,
      parseJsonArray(exercise.accepted_answers),
      options,
    );
    isCorrect = result.correct;
    graded = "auto";
  }

  const createdAt = nowIso();
  const attemptId = (() => {
    const res = db
      .prepare(
        `INSERT INTO exercise_attempts
           (exercise_id, session_id, learner_answer, is_correct, source, feedback, created_at)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(
        exercise.id,
        input.sessionId ?? null,
        input.answer,
        isCorrect ? 1 : 0,
        input.source,
        input.feedback ?? null,
        createdAt,
      );
    return Number(res.lastInsertRowid);
  })();

  // --- mastery updates for every linked entity ---
  const targets: EntityType[] = [];
  if (exercise.concept_id) targets.push("concept");
  if (exercise.vocab_id) targets.push("vocab");

  const masteryUpdates: MasteryUpdate[] = [];
  for (const entityType of targets) {
    const entityId =
      entityType === "concept" ? exercise.concept_id! : exercise.vocab_id!;
    const outcome = recordOutcome(db, entityType, entityId, isCorrect);
    masteryUpdates.push({
      entityType,
      entityId,
      fromState: outcome.fromState,
      toState: outcome.toState,
      stateChanged: outcome.stateChanged,
      box: outcome.box,
      correctStreak: outcome.correctStreak,
      nextReviewAt: outcome.nextReviewAt,
      reason: outcome.reason,
    });
  }

  // --- mistake tracking ---
  let mistakeOpenedId: number | null = null;
  const mistakesResolvedIds: number[] = [];

  if (!isCorrect) {
    const res = db
      .prepare(
        `INSERT INTO mistakes (exercise_id, attempt_id, concept_id, vocab_id, note)
         VALUES (?,?,?,?,?)`,
      )
      .run(
        exercise.id,
        attemptId,
        exercise.concept_id,
        exercise.vocab_id,
        input.note ?? null,
      );
    mistakeOpenedId = Number(res.lastInsertRowid);
  } else {
    const open = db
      .prepare(
        `SELECT id FROM mistakes
         WHERE exercise_id = ? AND resolved_at IS NULL`,
      )
      .all(exercise.id) as Array<{ id: number }>;
    for (const m of open) {
      db.prepare(
        `UPDATE mistakes
         SET resolved_at = ?, resolved_by_attempt_id = ?
         WHERE id = ?`,
      ).run(createdAt, attemptId, m.id);
      mistakesResolvedIds.push(Number(m.id));
    }
  }

  return {
    attemptId,
    exerciseId: exercise.id,
    lessonId: exercise.lesson_id,
    answer: input.answer,
    graded,
    isCorrect,
    expectedAnswer: exercise.expected_answer,
    explanation: exercise.explanation,
    masteryUpdates,
    mistakeOpenedId,
    mistakesResolvedIds,
    createdAt,
  };
}
