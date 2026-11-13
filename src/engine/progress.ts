import type { Db } from "../db/connection.js";
import { getProfile, getGoals } from "./profile.js";
import { lessonStatuses, dueCount, weakAreas, type LessonStatus } from "./review.js";
import { mistakeStats } from "./mistakes.js";

export interface StateCounts {
  new: number;
  learning: number;
  reviewing: number;
  mastered: number;
}

export interface ProgressReport {
  generatedAt: string;
  profile: ReturnType<typeof getProfile>;
  goals: string[];
  attempts: {
    total: number;
    correct: number;
    incorrect: number;
    accuracy: number;
  };
  mastery: {
    overall: StateCounts;
    byLevel: Record<string, StateCounts>;
  };
  dueNow: number;
  mistakes: { open: number; resolved: number };
  lessons: LessonStatus[];
  weakAreas: ReturnType<typeof weakAreas>;
  recentAttempts: Array<{
    id: number;
    exerciseId: string;
    prompt: string;
    learnerAnswer: string;
    isCorrect: boolean;
    source: string;
    createdAt: string;
  }>;
}

function emptyCounts(): StateCounts {
  return { new: 0, learning: 0, reviewing: 0, mastered: 0 };
}

export function progressReport(db: Db, now: Date = new Date()): ProgressReport {
  const attemptStats = db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(is_correct), 0) AS correct
       FROM exercise_attempts`,
    )
    .get() as { total: number; correct: number };
  const total = Number(attemptStats.total);
  const correct = Number(attemptStats.correct);

  // Overall mastery by state
  const overall = emptyCounts();
  for (const row of db
    .prepare("SELECT state, COUNT(*) AS n FROM mastery GROUP BY state")
    .all() as Array<{ state: keyof StateCounts; n: number }>) {
    overall[row.state] = Number(row.n);
  }

  // Mastery by level (concepts and vocabulary join to lessons)
  const byLevel: Record<string, StateCounts> = {};
  const levelRows = db
    .prepare(
      `SELECT l.level AS level, m.state AS state, COUNT(*) AS n
       FROM mastery m
       LEFT JOIN concepts c ON m.entity_type = 'concept' AND c.id = m.entity_id
       LEFT JOIN vocabulary v ON m.entity_type = 'vocab' AND v.id = m.entity_id
       JOIN lessons l ON l.id = COALESCE(c.lesson_id, v.lesson_id)
       GROUP BY l.level, m.state`,
    )
    .all() as Array<{ level: string; state: keyof StateCounts; n: number }>;
  for (const row of levelRows) {
    byLevel[row.level] ??= emptyCounts();
    byLevel[row.level]![row.state] = Number(row.n);
  }

  const mistakes = mistakeStats(db);
  const lessons = lessonStatuses(db);

  const recentRows = db
    .prepare(
      `SELECT a.id, a.exercise_id, e.prompt, a.learner_answer, a.is_correct,
              a.source, a.created_at
       FROM exercise_attempts a
       JOIN exercises e ON e.id = a.exercise_id
       ORDER BY a.id DESC LIMIT 10`,
    )
    .all() as Array<{
    id: number;
    exercise_id: string;
    prompt: string;
    learner_answer: string;
    is_correct: number;
    source: string;
    created_at: string;
  }>;

  return {
    generatedAt: now.toISOString(),
    profile: getProfile(db),
    goals: getGoals(db),
    attempts: {
      total,
      correct,
      incorrect: total - correct,
      accuracy: total === 0 ? 0 : correct / total,
    },
    mastery: { overall, byLevel },
    dueNow: dueCount(db, now),
    mistakes,
    lessons,
    weakAreas: weakAreas(db, 5),
    recentAttempts: recentRows.map((r) => ({
      id: Number(r.id),
      exerciseId: r.exercise_id,
      prompt: r.prompt,
      learnerAnswer: r.learner_answer,
      isCorrect: Number(r.is_correct) === 1,
      source: r.source,
      createdAt: r.created_at,
    })),
  };
}
