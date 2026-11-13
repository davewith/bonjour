import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, closeDb, type Db } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";
import { syncCurriculum } from "../src/engine/sync.js";
import { initProfile, profileView, setGoals, updateProfile } from "../src/engine/profile.js";
import { recordAttempt } from "../src/engine/attempts.js";
import { sessionPlan, dueItems, weakAreas } from "../src/engine/review.js";
import { progressReport } from "../src/engine/progress.js";
import { listLessons, getLesson } from "../src/engine/lessons.js";
import { listVocabulary } from "../src/engine/vocab.js";
import { listOpenMistakes, mistakeStats } from "../src/engine/mistakes.js";
import { startSession, endSession } from "../src/engine/sessions.js";
import { gradeAnswer, normalizeAnswer } from "../src/engine/answers.js";
import { getMastery } from "../src/engine/mastery.js";

const fixtureRoot = fileURLToPath(
  new URL("./fixtures/curriculum", import.meta.url),
);

let db: Db;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "french-engine-"));
  db = openDb(path.join(tmpDir, "test.db"));
  migrate(db);
});

afterEach(() => {
  closeDb(db);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("sync", () => {
  it("loads fixture curriculum into the database", () => {
    const result = syncCurriculum(db, fixtureRoot);
    expect(result.lessonsInserted).toBe(2);
    expect(result.conceptsUpserted).toBe(3);
    expect(result.exercisesUpserted).toBe(6);
    expect(result.warnings).toEqual([]);

    const lessons = listLessons(db);
    expect(lessons.map((l) => l.id)).toEqual(["a1-01-test", "a1-02-test"]);
    expect(lessons[0]!.exerciseCount).toBe(4);
    expect(lessons[0]!.vocabularyCount).toBe(3);
  });

  it("is idempotent (second sync sees unchanged lessons)", () => {
    syncCurriculum(db, fixtureRoot);
    const second = syncCurriculum(db, fixtureRoot);
    expect(second.lessonsInserted).toBe(0);
    expect(second.lessonsUpdated).toBe(0);
    expect(second.lessonsUnchanged).toBe(2);
  });

  it("returns lesson detail with spoken examples and exercises", () => {
    syncCurriculum(db, fixtureRoot);
    const lesson = getLesson(db, "a1-01-test");
    expect(lesson).not.toBeNull();
    expect(lesson!.spokenExamples[0]!.fr).toContain("Bonjour");
    expect(lesson!.exercises.length).toBe(4);
    expect(lesson!.commonMistakes[0]!.wrong).toBe("Bonjur");
    expect(lesson!.body).toContain("Teaching notes");
  });

  it("does not delete history when curriculum content disappears", () => {
    syncCurriculum(db, fixtureRoot);
    // simulate an exercise removed from markdown by deleting the row's source:
    // create a stale exercise row directly
    db.prepare(
      `INSERT INTO exercises (id, lesson_id, type, prompt, expected_answer)
       VALUES ('stale-ex', 'a1-01-test', 'translation', 'p', 'a')`,
    ).run();
    const result = syncCurriculum(db, fixtureRoot);
    expect(result.warnings.some((w) => w.includes("stale-ex"))).toBe(true);
    const still = db.prepare("SELECT id FROM exercises WHERE id='stale-ex'").get();
    expect(still).toBeTruthy();
  });
});

describe("profile", () => {
  it("initialises once and rejects duplicates", () => {
    initProfile(db, { name: "David", goals: ["travel"] });
    expect(() => initProfile(db, { name: "Other" })).toThrow(/already exists/);
    const view = profileView(db)!;
    expect(view.profile.name).toBe("David");
    expect(view.goals).toEqual(["travel"]);
  });

  it("updates fields and replaces goals", () => {
    initProfile(db, { name: "David", goals: ["a"] });
    updateProfile(db, { minutesPerDay: 30, cefrTarget: "B1" });
    setGoals(db, ["x", "y"]);
    const view = profileView(db)!;
    expect(view.profile.minutes_per_day).toBe(30);
    expect(view.profile.cefr_target).toBe("B1");
    expect(view.goals).toEqual(["x", "y"]);
  });
});

describe("answer grading", () => {
  it("normalizes accents, case and punctuation", () => {
    expect(normalizeAnswer("  Bonjour! ")).toBe("bonjour");
    expect(normalizeAnswer("S'il vous plaît.")).toBe("s il vous plait");
  });

  it("grades exact and accepted answers", () => {
    expect(gradeAnswer("Bonjour", "Bonjour", []).correct).toBe(true);
    expect(gradeAnswer("bonjour!", "Bonjour", []).correct).toBe(true);
    expect(gradeAnswer("Salut", "Bonjour", ["Salut"]).matched).toBe("accepted");
    expect(gradeAnswer("Au revoir", "Bonjour", ["Salut"]).correct).toBe(false);
  });

  it("maps multiple choice letters to options", () => {
    const opts = ["Bonjour", "Bonsoir", "Merci"];
    expect(gradeAnswer("b", "Bonsoir", [], opts)).toEqual({
      correct: true,
      matched: "option",
    });
    expect(gradeAnswer("2", "Bonsoir", [], opts).correct).toBe(true);
    expect(gradeAnswer("a", "Bonsoir", [], opts).correct).toBe(false);
  });
});

describe("attempt recording and mastery", () => {
  beforeEach(() => {
    syncCurriculum(db, fixtureRoot);
    initProfile(db, { name: "David" });
  });

  it("auto-grades and updates mastery on first correct answer", () => {
    const result = recordAttempt(db, {
      exerciseId: "a1-01-ex-translate-hello",
      answer: "bonjour",
      source: "tutor",
    });
    expect(result.isCorrect).toBe(true);
    expect(result.graded).toBe("auto");
    expect(result.attemptId).toBeGreaterThan(0);

    // concept + vocab both linked → two mastery updates
    expect(result.masteryUpdates.length).toBe(2);
    const conceptMastery = getMastery(db, "concept", "a1-01-hello")!;
    expect(conceptMastery.state).toBe("learning");
    expect(conceptMastery.box).toBe(1);
    expect(conceptMastery.next_review_at).toBeTruthy();
  });

  it("records a mistake on a wrong answer and resolves it on a later correct one", () => {
    const wrong = recordAttempt(db, {
      exerciseId: "a1-01-ex-translate-hello",
      answer: "bonjur",
      source: "tutor",
    });
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.mistakeOpenedId).not.toBeNull();
    expect(mistakeStats(db).open).toBe(1);
    expect(listOpenMistakes(db)[0]!.exerciseId).toBe("a1-01-ex-translate-hello");

    const right = recordAttempt(db, {
      exerciseId: "a1-01-ex-translate-hello",
      answer: "Bonjour",
      source: "tutor",
    });
    expect(right.isCorrect).toBe(true);
    expect(right.mistakesResolvedIds).toEqual([wrong.mistakeOpenedId]);
    expect(mistakeStats(db)).toEqual({ open: 0, resolved: 1 });
  });

  it("refuses to auto-grade production exercises", () => {
    expect(() =>
      recordAttempt(db, {
        exerciseId: "a1-01-ex-introduce",
        answer: "Bonjour",
        source: "tutor",
      }),
    ).toThrow(/cannot be auto-graded/);

    // but accepts an explicit judgement from the tutor/examiner
    const res = recordAttempt(db, {
      exerciseId: "a1-01-ex-introduce",
      answer: "Bonjour, je m'appelle David",
      correct: true,
      source: "examiner",
    });
    expect(res.isCorrect).toBe(true);
    expect(res.graded).toBe("provided");
  });

  it("grades multiple choice by letter", () => {
    const res = recordAttempt(db, {
      exerciseId: "a1-01-ex-choice-evening",
      answer: "b",
      source: "tutor",
    });
    expect(res.isCorrect).toBe(true);
  });

  it("rejects unknown exercise and session ids", () => {
    expect(() =>
      recordAttempt(db, { exerciseId: "nope", answer: "x", source: "tutor" }),
    ).toThrow(/Unknown exercise/);
    expect(() =>
      recordAttempt(db, {
        exerciseId: "a1-01-ex-translate-hello",
        answer: "x",
        source: "tutor",
        sessionId: 999,
      }),
    ).toThrow(/Unknown session/);
  });

  it("keeps append-only attempt history", () => {
    recordAttempt(db, {
      exerciseId: "a1-01-ex-translate-hello",
      answer: "a",
      source: "tutor",
    });
    recordAttempt(db, {
      exerciseId: "a1-01-ex-translate-hello",
      answer: "b",
      source: "examiner",
    });
    const rows = db
      .prepare("SELECT * FROM exercise_attempts ORDER BY id")
      .all() as unknown[];
    expect(rows.length).toBe(2);
  });

  it("logs mastery history on state change", () => {
    recordAttempt(db, {
      exerciseId: "a1-01-ex-translate-hello",
      answer: "x",
      source: "tutor",
    });
    const history = db
      .prepare("SELECT * FROM mastery_history ORDER BY id")
      .all() as Array<{ entity_type: string; from_state: string; to_state: string }>;
    // exercise links a concept and a vocab item → one transition each
    expect(history.length).toBe(2);
    expect(history.every((h) => h.from_state === "new" && h.to_state === "learning")).toBe(
      true,
    );
    expect(history.map((h) => h.entity_type).sort()).toEqual(["concept", "vocab"]);
  });
});

describe("review scheduling", () => {
  beforeEach(() => {
    syncCurriculum(db, fixtureRoot);
    initProfile(db, { name: "David" });
  });

  it("nothing is due immediately after a fresh answer", () => {
    recordAttempt(db, {
      exerciseId: "a1-01-ex-translate-hello",
      answer: "Bonjour",
      source: "tutor",
    });
    expect(dueItems(db, new Date()).length).toBe(0);
  });

  it("items become due once next_review_at passes", () => {
    recordAttempt(db, {
      exerciseId: "a1-01-ex-translate-hello",
      answer: "Bonjour",
      source: "tutor",
    });
    db.prepare(
      "UPDATE mastery SET next_review_at = ? WHERE entity_id = 'a1-01-hello'",
    ).run(new Date(Date.now() - 1000).toISOString());
    const due = dueItems(db, new Date());
    expect(due.length).toBe(1);
    expect(due[0]!.entityId).toBe("a1-01-hello");
  });

  it("identifies weak areas (>=3 attempts, <70% accuracy)", () => {
    // 1 correct + 3 wrong on the same exercise → concept accuracy 25%
    recordAttempt(db, {
      exerciseId: "a1-01-ex-translate-hello",
      answer: "ok",
      source: "tutor",
    });
    for (let i = 0; i < 3; i++) {
      recordAttempt(db, {
        exerciseId: "a1-01-ex-translate-hello",
        answer: "wrong",
        source: "tutor",
      });
    }
    const weak = weakAreas(db);
    expect(weak.length).toBeGreaterThanOrEqual(1);
    expect(weak[0]!.entityId).toBe("a1-01-hello");
    expect(weak[0]!.accuracy).toBeLessThan(0.7);
  });
});

describe("sessions and session plan", () => {
  beforeEach(() => {
    syncCurriculum(db, fixtureRoot);
    initProfile(db, { name: "David" });
  });

  it("starts and ends sessions", () => {
    const s = startSession(db, "lesson", "a1-01-test");
    expect(s.kind).toBe("lesson");
    const ended = endSession(db, s.id, "good session");
    expect(ended.ended_at).toBeTruthy();
    expect(ended.notes).toBe("good session");
    expect(() => startSession(db, "lesson", "missing")).toThrow(/Unknown lesson/);
  });

  it("produces a plan with the next lesson", () => {
    const plan = sessionPlan(db);
    expect(plan.nextLesson?.id).toBe("a1-01-test");
    expect(plan.stats.lessonsTotal).toBe(2);
    expect(plan.stats.lessonsStarted).toBe(0);
    expect(plan.dueReviews).toEqual([]);
    expect(plan.openMistakes).toEqual([]);
  });

  it("advances nextLesson as lessons are covered", () => {
    // answer every exercise of lesson 1 correctly → lesson 1 complete
    const lesson = getLesson(db, "a1-01-test")!;
    for (const ex of lesson.exercises) {
      recordAttempt(db, {
        exerciseId: ex.id,
        answer: ex.answer,
        correct: true,
        source: "tutor",
      });
    }
    const plan = sessionPlan(db);
    expect(plan.nextLesson?.id).toBe("a1-02-test");
    expect(plan.stats.lessonsStarted).toBe(1);
  });
});

describe("progress report", () => {
  beforeEach(() => {
    syncCurriculum(db, fixtureRoot);
    initProfile(db, { name: "David", goals: ["order coffee"] });
  });

  it("reports empty state on a fresh database", () => {
    const report = progressReport(db);
    expect(report.attempts.total).toBe(0);
    expect(report.mastery.overall).toEqual({
      new: 0,
      learning: 0,
      reviewing: 0,
      mastered: 0,
    });
    expect(report.lessons.length).toBe(2);
    expect(report.lessons[0]!.status).toBe("not_started");
    expect(report.goals).toEqual(["order coffee"]);
  });

  it("reflects recorded attempts", () => {
    recordAttempt(db, {
      exerciseId: "a1-01-ex-translate-hello",
      answer: "Bonjour",
      source: "tutor",
    });
    recordAttempt(db, {
      exerciseId: "a1-01-ex-fill-merci",
      answer: "wrong",
      source: "tutor",
    });
    const report = progressReport(db);
    expect(report.attempts.total).toBe(2);
    expect(report.attempts.correct).toBe(1);
    expect(report.attempts.accuracy).toBe(0.5);
    expect(report.mastery.overall.learning).toBeGreaterThanOrEqual(1);
    expect(report.recentAttempts.length).toBe(2);
    expect(report.mistakes.open).toBe(1);
  });
});

describe("vocabulary", () => {
  it("lists vocabulary with lesson titles and search", () => {
    syncCurriculum(db, fixtureRoot);
    const all = listVocabulary(db);
    expect(all.length).toBe(5);
    const found = listVocabulary(db, { search: "Merci" });
    expect(found.length).toBe(1);
    expect(found[0]!.french).toBe("Merci");
    expect(found[0]!.lessonTitle).toBe("Test greetings");
    const byLesson = listVocabulary(db, { lessonId: "a1-02-test" });
    expect(byLesson.length).toBe(2);
  });
});
