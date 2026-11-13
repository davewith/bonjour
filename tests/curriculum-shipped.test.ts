import { describe, it, expect } from "vitest";
import { loadCurriculum, CurriculumError } from "../src/curriculum/load.js";

/**
 * The shipped curriculum must always load and validate.
 * If this fails, a lesson file was edited incorrectly — fix the Markdown,
 * not the test.
 */
describe("shipped curriculum", () => {
  const { lessons } = loadCurriculum();

  it("loads all 10 A1 lessons", () => {
    expect(lessons.length).toBe(10);
    expect(lessons.map((l) => l.frontmatter.id)).toEqual([
      "a1-01-greetings",
      "a1-02-introducing-yourself",
      "a1-03-name-and-origin",
      "a1-04-numbers",
      "a1-05-ordering",
      "a1-06-living",
      "a1-07-routines",
      "a1-08-directions",
      "a1-09-shopping",
      "a1-10-conversation",
    ]);
  });

  it("every lesson has objectives, exercises, mistakes and spoken examples", () => {
    for (const lesson of lessons) {
      const fm = lesson.frontmatter;
      expect(fm.objectives.length, `${fm.id} objectives`).toBeGreaterThanOrEqual(1);
      expect(fm.exercises.length, `${fm.id} exercises`).toBeGreaterThanOrEqual(4);
      expect(fm.commonMistakes.length, `${fm.id} mistakes`).toBeGreaterThanOrEqual(1);
      expect(fm.spokenExamples.length, `${fm.id} spoken examples`).toBeGreaterThanOrEqual(
        3,
      );
      expect(fm.concepts.length, `${fm.id} concepts`).toBeGreaterThanOrEqual(2);
      expect(fm.vocabulary.length, `${fm.id} vocabulary`).toBeGreaterThanOrEqual(6);
      expect(lesson.body.length, `${fm.id} body`).toBeGreaterThan(200);
    }
  });

  it("ids are globally unique within each namespace", () => {
    // Namespaces are separate (concept vs vocab vs exercise vs lesson);
    // the DB distinguishes them, e.g. mastery(entity_type, entity_id).
    const lessonIds: string[] = [];
    const conceptIds: string[] = [];
    const vocabIds: string[] = [];
    const exerciseIds: string[] = [];
    for (const lesson of lessons) {
      const fm = lesson.frontmatter;
      lessonIds.push(fm.id);
      conceptIds.push(...fm.concepts.map((c) => c.id));
      vocabIds.push(
        ...fm.vocabulary.map((v) => v.id ?? `${fm.id}-${v.fr.toLowerCase()}`),
      );
      exerciseIds.push(...fm.exercises.map((e) => e.id));
    }
    for (const [name, list] of Object.entries({
      lesson: lessonIds,
      concept: conceptIds,
      vocab: vocabIds,
      exercise: exerciseIds,
    })) {
      expect(new Set(list).size, `${name} ids unique`).toBe(list.length);
    }
  });

  it("spoken examples contain French text", () => {
    for (const lesson of lessons) {
      for (const s of lesson.frontmatter.spokenExamples) {
        expect(s.fr.length, `${lesson.frontmatter.id} spoken fr`).toBeGreaterThan(0);
        expect(s.en, `${lesson.frontmatter.id} spoken en`).toBeTruthy();
      }
    }
  });

  it("does not throw CurriculumError", () => {
    expect(() => loadCurriculum()).not.toThrow(CurriculumError);
  });
});
