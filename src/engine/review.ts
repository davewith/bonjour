import type { Db } from "../db/connection.js";
import { mistakeStats, listOpenMistakes } from "./mistakes.js";

export interface DueItem {
  entityType: "concept" | "vocab";
  entityId: string;
  title: string;
  level: string | null;
  state: string;
  nextReviewAt: string;
  accuracy: number;
  totalAttempts: number;
}

/**
 * Items due for review now, weakest first.
 * Priority: overdue longest + lowest accuracy (weak areas float up).
 */
export function dueItems(db: Db, now: Date, limit = 10): DueItem[] {
  const rows = db
    .prepare(
      `SELECT m.entity_type, m.entity_id, m.state, m.next_review_at,
              m.total_correct, m.total_incorrect,
              CASE m.entity_type
                WHEN 'concept' THEN (SELECT c.title FROM concepts c WHERE c.id = m.entity_id)
                ELSE (SELECT v.french FROM vocabulary v WHERE v.id = m.entity_id)
              END AS title,
              CASE m.entity_type
                WHEN 'concept' THEN (SELECT l.level FROM concepts c JOIN lessons l ON l.id = c.lesson_id WHERE c.id = m.entity_id)
                ELSE (SELECT l.level FROM vocabulary v JOIN lessons l ON l.id = v.lesson_id WHERE v.id = m.entity_id)
              END AS level
       FROM mastery m
       WHERE m.next_review_at IS NOT NULL AND m.next_review_at <= ?
       ORDER BY CAST(m.total_correct AS REAL) / (m.total_correct + m.total_incorrect) ASC,
                m.next_review_at ASC
       LIMIT ?`,
    )
    .all(now.toISOString(), limit) as Array<{
    entity_type: "concept" | "vocab";
    entity_id: string;
    state: string;
    next_review_at: string;
    total_correct: number;
    total_incorrect: number;
    title: string | null;
    level: string | null;
  }>;

  return rows.map((r) => {
    const total = Number(r.total_correct) + Number(r.total_incorrect);
    return {
      entityType: r.entity_type,
      entityId: r.entity_id,
      title: r.title ?? r.entity_id,
      level: r.level,
      state: r.state,
      nextReviewAt: r.next_review_at,
      accuracy: total === 0 ? 0 : Number(r.total_correct) / total,
      totalAttempts: total,
    };
  });
}

export function dueCount(db: Db, now: Date): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM mastery WHERE next_review_at IS NOT NULL AND next_review_at <= ?",
    )
    .get(now.toISOString()) as { n: number };
  return Number(row.n);
}

export interface WeakArea {
  entityType: "concept" | "vocab";
  entityId: string;
  title: string;
  level: string | null;
  state: string;
  accuracy: number;
  totalAttempts: number;
}

/**
 * Weak areas: at least 3 attempts and accuracy below 70%.
 * These are prioritised for practice even when not yet due.
 */
export function weakAreas(db: Db, limit = 10): WeakArea[] {
  const rows = db
    .prepare(
      `SELECT m.entity_type, m.entity_id, m.state,
              m.total_correct, m.total_incorrect,
              CASE m.entity_type
                WHEN 'concept' THEN (SELECT c.title FROM concepts c WHERE c.id = m.entity_id)
                ELSE (SELECT v.french FROM vocabulary v WHERE v.id = m.entity_id)
              END AS title,
              CASE m.entity_type
                WHEN 'concept' THEN (SELECT l.level FROM concepts c JOIN lessons l ON l.id = c.lesson_id WHERE c.id = m.entity_id)
                ELSE (SELECT l.level FROM vocabulary v JOIN lessons l ON l.id = v.lesson_id WHERE v.id = m.entity_id)
              END AS level
       FROM mastery m
       WHERE (m.total_correct + m.total_incorrect) >= 3
         AND CAST(m.total_correct AS REAL) / (m.total_correct + m.total_incorrect) < 0.7
       ORDER BY CAST(m.total_correct AS REAL) / (m.total_correct + m.total_incorrect) ASC,
                (m.total_correct + m.total_incorrect) DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    entity_type: "concept" | "vocab";
    entity_id: string;
    state: string;
    total_correct: number;
    total_incorrect: number;
    title: string | null;
    level: string | null;
  }>;

  return rows.map((r) => {
    const total = Number(r.total_correct) + Number(r.total_incorrect);
    return {
      entityType: r.entity_type,
      entityId: r.entity_id,
      title: r.title ?? r.entity_id,
      level: r.level,
      state: r.state,
      accuracy: Number(r.total_correct) / total,
      totalAttempts: total,
    };
  });
}

export interface LessonStatus {
  id: string;
  level: string;
  order: number;
  title: string;
  totalExercises: number;
  attemptedExercises: number;
  correctExercises: number;
  status: "not_started" | "in_progress" | "complete";
}

export function lessonStatuses(db: Db): LessonStatus[] {
  const rows = db
    .prepare(
      `SELECT l.id, l.level, l.ord, l.title,
              COUNT(e.id) AS total,
              COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN e.id END) AS attempted,
              COUNT(DISTINCT CASE WHEN a.is_correct = 1 THEN e.id END) AS correct
       FROM lessons l
       LEFT JOIN exercises e ON e.lesson_id = l.id
       LEFT JOIN exercise_attempts a ON a.exercise_id = e.id
       GROUP BY l.id
       ORDER BY l.level, l.ord`,
    )
    .all() as Array<{
    id: string;
    level: string;
    ord: number;
    title: string;
    total: number;
    attempted: number;
    correct: number;
  }>;

  return rows.map((r) => {
    const total = Number(r.total);
    const attempted = Number(r.attempted);
    const correct = Number(r.correct);
    const status: LessonStatus["status"] =
      attempted === 0
        ? "not_started"
        : attempted < total
          ? "in_progress"
          : correct === total
            ? "complete"
            : "in_progress";
    return {
      id: r.id,
      level: r.level,
      order: Number(r.ord),
      title: r.title,
      totalExercises: total,
      attemptedExercises: attempted,
      correctExercises: correct,
      status,
    };
  });
}

export interface SessionPlan {
  generatedAt: string;
  dueReviews: DueItem[];
  openMistakes: ReturnType<typeof listOpenMistakes>;
  weakAreas: WeakArea[];
  nextLesson: LessonStatus | null;
  stats: {
    dueCount: number;
    openMistakeCount: number;
    resolvedMistakeCount: number;
    lessonsTotal: number;
    lessonsStarted: number;
    lessonsComplete: number;
  };
}

/**
 * Build the plan for the next tutoring session:
 * warm-up (due reviews) + revision (open mistakes) + weak spots + next lesson.
 */
export function sessionPlan(db: Db, now: Date = new Date()): SessionPlan {
  const statuses = lessonStatuses(db);
  const nextLesson = statuses.find((s) => s.status !== "complete") ?? null;
  const mistakes = mistakeStats(db);

  return {
    generatedAt: now.toISOString(),
    dueReviews: dueItems(db, now, 5),
    openMistakes: listOpenMistakes(db, 3),
    weakAreas: weakAreas(db, 3),
    nextLesson,
    stats: {
      dueCount: dueCount(db, now),
      openMistakeCount: mistakes.open,
      resolvedMistakeCount: mistakes.resolved,
      lessonsTotal: statuses.length,
      lessonsStarted: statuses.filter((s) => s.status !== "not_started").length,
      lessonsComplete: statuses.filter((s) => s.status === "complete").length,
    },
  };
}
