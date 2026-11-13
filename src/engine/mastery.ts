import type { Db } from "../db/connection.js";
import {
  applyOutcome,
  type MasterySnapshot,
  type MasteryState,
  type Outcome,
} from "../scheduler/schedule.js";
import { nowIso } from "./profile.js";

export type EntityType = "concept" | "vocab";

export interface MasteryRow {
  entity_type: EntityType;
  entity_id: string;
  state: MasteryState;
  box: number;
  correct_streak: number;
  total_correct: number;
  total_incorrect: number;
  next_review_at: string | null;
  last_attempt_at: string | null;
  updated_at: string;
}

export function getMastery(
  db: Db,
  entityType: EntityType,
  entityId: string,
): MasteryRow | null {
  const row = db
    .prepare("SELECT * FROM mastery WHERE entity_type = ? AND entity_id = ?")
    .get(entityType, entityId);
  return (row as MasteryRow | undefined) ?? null;
}

export function snapshotOf(row: MasteryRow | null): MasterySnapshot {
  if (!row) {
    return {
      state: "new",
      box: 0,
      correctStreak: 0,
      totalCorrect: 0,
      totalIncorrect: 0,
    };
  }
  return {
    state: row.state,
    box: row.box,
    correctStreak: row.correct_streak,
    totalCorrect: row.total_correct,
    totalIncorrect: row.total_incorrect,
  };
}

/**
 * Apply an answer outcome to one mastery entity.
 * Creates the row on first use, appends mastery_history on state change,
 * and logs review_history when the entity had a schedule.
 */
export function recordOutcome(
  db: Db,
  entityType: EntityType,
  entityId: string,
  correct: boolean,
  now: Date = new Date(),
): Outcome {
  const row = getMastery(db, entityType, entityId);
  const snapshot = snapshotOf(row);
  const outcome = applyOutcome(snapshot, correct, now);
  const iso = now.toISOString();

  // Log review history if this entity was scheduled.
  if (row?.next_review_at) {
    db.prepare(
      `INSERT INTO review_history (entity_type, entity_id, due_at, result, box_before, box_after)
       VALUES (?,?,?,?,?,?)`,
    ).run(entityType, entityId, row.next_review_at, correct ? "correct" : "incorrect", row.box, outcome.box);
  }

  db.prepare(
    `INSERT INTO mastery (entity_type, entity_id, state, box, correct_streak,
                          total_correct, total_incorrect, next_review_at,
                          last_attempt_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(entity_type, entity_id) DO UPDATE SET
       state=excluded.state, box=excluded.box,
       correct_streak=excluded.correct_streak,
       total_correct=excluded.total_correct,
       total_incorrect=excluded.total_incorrect,
       next_review_at=excluded.next_review_at,
       last_attempt_at=excluded.last_attempt_at,
       updated_at=excluded.updated_at`,
  ).run(
    entityType,
    entityId,
    outcome.toState,
    outcome.box,
    outcome.correctStreak,
    outcome.totalCorrect,
    outcome.totalIncorrect,
    outcome.nextReviewAt,
    iso,
    iso,
  );

  if (outcome.stateChanged) {
    db.prepare(
      `INSERT INTO mastery_history (entity_type, entity_id, from_state, to_state, reason)
       VALUES (?,?,?,?,?)`,
    ).run(entityType, entityId, outcome.fromState, outcome.toState, outcome.reason);
  }

  return outcome;
}

export interface MasteryEntityView extends MasteryRow {
  title: string;
  level: string | null;
}

/**
 * Mastery rows joined with a human title (concept title or french word).
 */
export function masteryWithTitle(
  db: Db,
  entityType: EntityType,
  entityId: string,
): MasteryEntityView | null {
  const row = getMastery(db, entityType, entityId);
  if (!row) return null;
  const title = entityTitle(db, entityType, entityId);
  const level = entityLevel(db, entityType, entityId);
  return { ...row, title, level };
}

export function entityTitle(
  db: Db,
  entityType: EntityType,
  entityId: string,
): string {
  if (entityType === "concept") {
    const r = db
      .prepare("SELECT title FROM concepts WHERE id = ?")
      .get(entityId) as { title: string } | undefined;
    return r?.title ?? entityId;
  }
  const r = db
    .prepare("SELECT french FROM vocabulary WHERE id = ?")
    .get(entityId) as { french: string } | undefined;
  return r?.french ?? entityId;
}

export function entityLevel(
  db: Db,
  entityType: EntityType,
  entityId: string,
): string | null {
  const sql =
    entityType === "concept"
      ? "SELECT l.level AS level FROM concepts c JOIN lessons l ON l.id = c.lesson_id WHERE c.id = ?"
      : "SELECT l.level AS level FROM vocabulary v JOIN lessons l ON l.id = v.lesson_id WHERE v.id = ?";
  const r = db.prepare(sql).get(entityId) as { level: string } | undefined;
  return r?.level ?? null;
}

/** Timestamp helper re-export for engine modules. */
export { nowIso };
