import { describe, it, expect } from "vitest";
import {
  applyOutcome,
  isDue,
  accuracy,
  LADDER_DAYS,
  type MasterySnapshot,
} from "../src/scheduler/schedule.js";

const NOW = new Date("2026-01-10T12:00:00.000Z");

function snap(partial: Partial<MasterySnapshot> = {}): MasterySnapshot {
  return {
    state: "new",
    box: 0,
    correctStreak: 0,
    totalCorrect: 0,
    totalIncorrect: 0,
    ...partial,
  };
}

describe("applyOutcome", () => {
  it("first correct answer: new → learning, box 1, review in 1 day", () => {
    const out = applyOutcome(snap(), true, NOW);
    expect(out.toState).toBe("learning");
    expect(out.box).toBe(1);
    expect(out.correctStreak).toBe(1);
    expect(out.nextReviewAt).toBe("2026-01-11T12:00:00.000Z");
    expect(out.stateChanged).toBe(true);
  });

  it("first incorrect answer: stays/becomes learning, box 0, unscheduled", () => {
    const out = applyOutcome(snap(), false, NOW);
    expect(out.toState).toBe("learning");
    expect(out.box).toBe(0);
    expect(out.nextReviewAt).toBeNull();
    expect(out.totalIncorrect).toBe(1);
  });

  it("consecutive correct answers climb the ladder with growing intervals", () => {
    let cur = snap();
    const intervals: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const out = applyOutcome(cur, true, NOW);
      cur = {
        state: out.toState,
        box: out.box,
        correctStreak: out.correctStreak,
        totalCorrect: out.totalCorrect,
        totalIncorrect: out.totalIncorrect,
      };
      intervals.push(out.nextReviewAt);
    }
    expect(cur.box).toBe(6);
    // intervals: +1, +2, +4, +8, +15, +30, +30 (capped)
    const days = intervals.map((iso) =>
      iso ? (new Date(iso).getTime() - NOW.getTime()) / 86_400_000 : null,
    );
    expect(days).toEqual([1, 2, 4, 8, 15, 30, 30]);
  });

  it("learning promotes to reviewing at box 2", () => {
    const out = applyOutcome(snap({ state: "learning", box: 1 }), true, NOW);
    expect(out.toState).toBe("reviewing");
    expect(out.box).toBe(2);
  });

  it("does not reach mastered without enough evidence", () => {
    // box reaches 5 but streak/totals are too low
    const out = applyOutcome(
      snap({ state: "reviewing", box: 4, correctStreak: 2, totalCorrect: 2 }),
      true,
      NOW,
    );
    expect(out.toState).toBe("reviewing");
    expect(out.box).toBe(5);
    expect(out.correctStreak).toBe(3);
    expect(out.totalCorrect).toBe(3);
  });

  it("reaches mastered with box >= 5, streak >= 3 and totalCorrect >= 5", () => {
    const out = applyOutcome(
      snap({ state: "reviewing", box: 4, correctStreak: 3, totalCorrect: 5 }),
      true,
      NOW,
    );
    expect(out.toState).toBe("mastered");
    expect(out.stateChanged).toBe(true);
    expect(out.reason).toMatch(/mastered/);
  });

  it("incorrect answer demotes mastered → reviewing and resets box", () => {
    const out = applyOutcome(
      snap({ state: "mastered", box: 6, correctStreak: 8, totalCorrect: 20 }),
      false,
      NOW,
    );
    expect(out.toState).toBe("reviewing");
    expect(out.box).toBe(0);
    expect(out.nextReviewAt).toBeNull();
    expect(out.totalIncorrect).toBe(1);
  });

  it("incorrect answer demotes reviewing → learning", () => {
    const out = applyOutcome(
      snap({ state: "reviewing", box: 3, correctStreak: 2, totalCorrect: 6 }),
      false,
      NOW,
    );
    expect(out.toState).toBe("learning");
    expect(out.box).toBe(0);
  });

  it("mastered stays mastered on continued correct answers", () => {
    const out = applyOutcome(
      snap({ state: "mastered", box: 5, correctStreak: 5, totalCorrect: 12 }),
      true,
      NOW,
    );
    expect(out.toState).toBe("mastered");
    expect(out.box).toBe(6);
  });
});

describe("ladder", () => {
  it("is monotonically increasing and starts at 0", () => {
    expect(LADDER_DAYS[0]).toBe(0);
    for (let i = 1; i < LADDER_DAYS.length; i++) {
      expect(LADDER_DAYS[i]!).toBeGreaterThan(LADDER_DAYS[i - 1]!);
    }
  });
});

describe("isDue", () => {
  it("null is never due", () => {
    expect(isDue(null, NOW)).toBe(false);
  });
  it("past and present are due", () => {
    expect(isDue("2026-01-09T12:00:00.000Z", NOW)).toBe(true);
    expect(isDue("2026-01-10T12:00:00.000Z", NOW)).toBe(true);
    expect(isDue("2026-01-11T12:00:00.000Z", NOW)).toBe(false);
  });
});

describe("accuracy", () => {
  it("handles zero attempts", () => {
    expect(accuracy(0, 0)).toBe(0);
  });
  it("computes ratio", () => {
    expect(accuracy(3, 1)).toBe(0.75);
  });
});
