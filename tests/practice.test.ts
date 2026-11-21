import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, closeDb, type Db } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";
import { syncCurriculum } from "../src/engine/sync.js";
import { initProfile } from "../src/engine/profile.js";
import { recordAttempt } from "../src/engine/attempts.js";
import { practiceQueue, type PublicExercise } from "../src/engine/practice.js";

const fixtureRoot = fileURLToPath(
  new URL("./fixtures/curriculum", import.meta.url),
);

let db: Db;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "french-practice-"));
  db = openDb(path.join(tmpDir, "test.db"));
  migrate(db);
  syncCurriculum(db, fixtureRoot);
  initProfile(db, { name: "David" });
});

afterEach(() => {
  closeDb(db);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const LEAK_KEYS = ["answer", "accepted", "explanation", "expectedAnswer", "expected_answer"];

function expectSanitised(exercises: PublicExercise[]): void {
  for (const ex of exercises) {
    for (const key of LEAK_KEYS) {
      expect(ex).not.toHaveProperty(key);
    }
  }
}

describe("practiceQueue", () => {
  it("returns lesson exercises in order, without answers", () => {
    const queue = practiceQueue(db, { source: "lesson", lessonId: "a1-01-test" });
    expect(queue.source).toBe("lesson");
    expect(queue.lessonId).toBe("a1-01-test");
    expect(queue.count).toBe(4);
    expect(queue.exercises.map((e) => e.id)).toEqual([
      "a1-01-ex-translate-hello",
      "a1-01-ex-choice-evening",
      "a1-01-ex-fill-merci",
      "a1-01-ex-introduce",
    ]);
    expectSanitised(queue.exercises);
  });

  it("keeps multiple choice options and hints, but never the answer", () => {
    const queue = practiceQueue(db, { source: "lesson", lessonId: "a1-01-test" });
    const mc = queue.exercises.find((e) => e.type === "multiple_choice")!;
    expect(mc.options).toContain("Bonsoir");
    expect(mc).toHaveProperty("hint");
    expect(JSON.stringify(mc)).not.toContain("expected");
  });

  it("rejects unknown lessons and missing lessonId", () => {
    expect(() =>
      practiceQueue(db, { source: "lesson", lessonId: "nope" }),
    ).toThrow(/Unknown lesson/);
    expect(() => practiceQueue(db, { source: "lesson" })).toThrow(/lessonId/);
  });

  it("respects the limit for lesson source", () => {
    const queue = practiceQueue(db, {
      source: "lesson",
      lessonId: "a1-01-test",
      limit: 2,
    });
    expect(queue.count).toBe(2);
  });

  it("returns an empty queue for due/mistakes/weak on a fresh database", () => {
    expect(practiceQueue(db, { source: "due" }).count).toBe(0);
    expect(practiceQueue(db, { source: "mistakes" }).count).toBe(0);
    expect(practiceQueue(db, { source: "weak" }).count).toBe(0);
  });

  it("builds the due queue once review items are overdue", () => {
    recordAttempt(db, {
      exerciseId: "a1-01-ex-translate-hello",
      answer: "Bonjour",
      source: "self",
    });
    expect(practiceQueue(db, { source: "due" }).count).toBe(0);

    db.prepare(
      "UPDATE mastery SET next_review_at = ? WHERE entity_id = 'a1-01-hello'",
    ).run(new Date(Date.now() - 1000).toISOString());

    const queue = practiceQueue(db, { source: "due" });
    expect(queue.count).toBeGreaterThan(0);
    const ids = queue.exercises.map((e) => e.id);
    // concept a1-01-hello links three exercises
    expect(ids).toContain("a1-01-ex-translate-hello");
    expect(ids).toContain("a1-01-ex-choice-evening");
    expect(ids).toContain("a1-01-ex-introduce");
    expectSanitised(queue.exercises);
  });

  it("builds the mistakes queue from open mistakes", () => {
    recordAttempt(db, {
      exerciseId: "a1-01-ex-fill-merci",
      answer: "wrong",
      source: "self",
    });
    const queue = practiceQueue(db, { source: "mistakes" });
    expect(queue.exercises.map((e) => e.id)).toEqual(["a1-01-ex-fill-merci"]);
    expectSanitised(queue.exercises);
  });

  it("drops resolved mistakes from the queue", () => {
    recordAttempt(db, {
      exerciseId: "a1-01-ex-fill-merci",
      answer: "wrong",
      source: "self",
    });
    recordAttempt(db, {
      exerciseId: "a1-01-ex-fill-merci",
      answer: "Merci",
      source: "self",
    });
    expect(practiceQueue(db, { source: "mistakes" }).count).toBe(0);
  });

  it("builds the weak queue from low-accuracy entities", () => {
    recordAttempt(db, {
      exerciseId: "a1-01-ex-translate-hello",
      answer: "ok",
      source: "self",
    });
    for (let i = 0; i < 3; i++) {
      recordAttempt(db, {
        exerciseId: "a1-01-ex-translate-hello",
        answer: "wrong",
        source: "self",
      });
    }
    const queue = practiceQueue(db, { source: "weak" });
    expect(queue.count).toBeGreaterThan(0);
    expect(queue.exercises.map((e) => e.id)).toContain(
      "a1-01-ex-translate-hello",
    );
    expectSanitised(queue.exercises);
  });
});
