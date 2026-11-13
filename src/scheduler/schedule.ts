/**
 * Spaced-repetition scheduling: a simple Leitner ladder.
 *
 * box 0..6 maps to review intervals in days: [0, 1, 2, 4, 8, 15, 30].
 * - A correct answer moves the item up one box (max 6).
 * - An incorrect answer resets it to box 0 (review again today/soon).
 * - Mastery state is evidence-based, not teaching-based:
 *   an item only becomes "mastered" after sustained correct answers.
 *
 * This module is deliberately pure (no DB, no OpenCode) so it is trivially testable.
 */

export const LADDER_DAYS: readonly number[] = [0, 1, 2, 4, 8, 15, 30];

export type MasteryState = "new" | "learning" | "reviewing" | "mastered";

export interface MasterySnapshot {
  state: MasteryState;
  box: number;
  correctStreak: number;
  totalCorrect: number;
  totalIncorrect: number;
}

export interface Outcome {
  fromState: MasteryState;
  toState: MasteryState;
  stateChanged: boolean;
  box: number;
  correctStreak: number;
  totalCorrect: number;
  totalIncorrect: number;
  /** ISO timestamp of next due review, or null when not scheduled (box 0). */
  nextReviewAt: string | null;
  reason: string;
}

/** Promotion thresholds — deliberately conservative. */
export const MASTER_MIN_BOX = 5;
export const MASTER_MIN_STREAK = 3;
export const MASTER_MIN_TOTAL_CORRECT = 5;
export const REVIEW_MIN_BOX = 2;

function addDays(now: Date, days: number): string {
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

/**
 * Compute the next mastery snapshot after answering `correct` at time `now`.
 */
export function applyOutcome(
  current: MasterySnapshot,
  correct: boolean,
  now: Date,
): Outcome {
  const fromState = current.state;

  let box: number;
  let correctStreak: number;
  const totalCorrect = current.totalCorrect + (correct ? 1 : 0);
  const totalIncorrect = current.totalIncorrect + (correct ? 0 : 1);

  if (correct) {
    box = Math.min(current.box + 1, LADDER_DAYS.length - 1);
    correctStreak = current.correctStreak + 1;
  } else {
    box = 0;
    correctStreak = 0;
  }

  // --- state transitions ---
  let toState: MasteryState;
  let reason: string;
  if (!correct) {
    if (fromState === "mastered") {
      toState = "reviewing";
      reason = "incorrect answer from mastered state — back to reviewing";
    } else if (fromState === "new") {
      toState = "learning";
      reason = "first attempt recorded";
    } else {
      toState = "learning";
      reason = "incorrect answer — reset to learning";
    }
  } else if (fromState === "mastered") {
    toState = "mastered";
    reason = "still mastered";
  } else if (
    fromState === "reviewing" &&
    box >= MASTER_MIN_BOX &&
    correctStreak >= MASTER_MIN_STREAK &&
    totalCorrect >= MASTER_MIN_TOTAL_CORRECT
  ) {
    toState = "mastered";
    reason = `mastered: box ${box}, streak ${correctStreak}, ${totalCorrect} correct total`;
  } else if (fromState === "learning" && box >= REVIEW_MIN_BOX) {
    toState = "reviewing";
    reason = `promoted to reviewing at box ${box}`;
  } else if (fromState === "new") {
    toState = "learning";
    reason = "first attempt recorded";
  } else {
    toState = fromState;
    reason = correct ? "correct — same state" : "unchanged";
  }

  // A mastered item that dips below the threshold on a wrong answer is handled
  // above; also demote reviewing → learning if a wrong answer already reset box.
  if (correct && fromState === "reviewing" && toState === "reviewing" && box < REVIEW_MIN_BOX) {
    // box can only be < 2 with a correct answer if it was 0 and stayed 0 — impossible;
    // kept for clarity.
    toState = "learning";
    reason = "box too low to stay in reviewing";
  }

  const nextReviewAt = box >= 1 ? addDays(now, LADDER_DAYS[box]!) : null;

  return {
    fromState,
    toState,
    stateChanged: fromState !== toState,
    box,
    correctStreak,
    totalCorrect,
    totalIncorrect,
    nextReviewAt,
    reason,
  };
}

export function isDue(nextReviewAt: string | null | undefined, now: Date): boolean {
  if (!nextReviewAt) return false;
  return new Date(nextReviewAt).getTime() <= now.getTime();
}

/** Accuracy in [0,1]; 0 when no attempts. */
export function accuracy(totalCorrect: number, totalIncorrect: number): number {
  const total = totalCorrect + totalIncorrect;
  if (total === 0) return 0;
  return totalCorrect / total;
}
