import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCurriculum,
  loadLessonFile,
  validateLessons,
  CurriculumError,
  splitFrontmatter,
  generatedVocabId,
} from "../src/curriculum/load.js";

const fixtureRoot = fileURLToPath(new URL("./fixtures/curriculum", import.meta.url));
const tmpDirs: string[] = [];

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "french-curriculum-"));
  tmpDirs.push(dir);
  return dir;
}

function writeLesson(root: string, name: string, content: string): string {
  const dir = path.join(root, "a1");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

const VALID_LESSON = `---
id: a1-01-x
level: A1
order: 1
title: X
objectives:
  - learn x
concepts:
  - id: a1-01-x-c
    kind: grammar
    title: C
    summary: S
exercises:
  - id: a1-01-x-e
    type: translation
    concept: a1-01-x-c
    prompt: p
    answer: a
---
Body.
`;

describe("splitFrontmatter", () => {
  it("splits yaml and body", () => {
    const { yaml, body } = splitFrontmatter("---\nkey: 1\n---\n\nBody here");
    expect(yaml).toContain("key: 1");
    expect(body).toBe("Body here");
  });

  it("throws when frontmatter is missing", () => {
    expect(() => splitFrontmatter("no frontmatter")).toThrow(CurriculumError);
  });
});

describe("loadCurriculum (fixtures)", () => {
  it("loads and sorts lessons from level directories", () => {
    const { lessons } = loadCurriculum(fixtureRoot);
    expect(lessons.length).toBe(2);
    expect(lessons[0]!.frontmatter.id).toBe("a1-01-test");
    expect(lessons[1]!.frontmatter.id).toBe("a1-02-test");
  });

  it("parses structured content", () => {
    const { lessons } = loadCurriculum(fixtureRoot);
    const l = lessons[0]!.frontmatter;
    expect(l.concepts.length).toBe(2);
    expect(l.vocabulary.length).toBe(3);
    expect(l.exercises.length).toBe(4);
    expect(l.commonMistakes.length).toBe(1);
    expect(l.spokenExamples.length).toBe(2);
    expect(l.exercises[1]!.options).toEqual(["Bonjour", "Bonsoir", "Merci"]);
    // vocabulary without explicit id gets a generated id
    const merci = l.vocabulary.find((v) => v.fr === "Merci")!;
    expect(merci.id).toBeUndefined();
    expect(generatedVocabId("a1-01-test", "Merci")).toBe("a1-01-test-merci");
  });

  it("keeps the markdown body", () => {
    const { lessons } = loadCurriculum(fixtureRoot);
    expect(lessons[0]!.body).toContain("Teaching notes");
  });

  it("skips non-level directories (methodology)", () => {
    const { files } = loadCurriculum(fixtureRoot);
    expect(files.every((f) => !f.includes("methodology"))).toBe(true);
  });
});

describe("curriculum validation errors", () => {
  it("rejects invalid frontmatter with a readable message", () => {
    const root = tmpRoot();
    writeLesson(root, "bad.md", "---\nid: not-valid-id!\nlevel: A1\n---\nx");
    expect(() => loadCurriculum(root)).toThrow(CurriculumError);
    expect(() => loadCurriculum(root)).toThrow(/id/);
  });

  it("rejects unknown concept references", () => {
    const root = tmpRoot();
    writeLesson(
      root,
      "bad.md",
      VALID_LESSON.replace("concept: a1-01-x-c", "concept: nope"),
    );
    expect(() => loadCurriculum(root)).toThrow(/unknown concept "nope"/);
  });

  it("rejects unknown vocabulary references", () => {
    const root = tmpRoot();
    writeLesson(
      root,
      "bad.md",
      VALID_LESSON.replace("    prompt: p", "    vocab: missing\n    prompt: p"),
    );
    expect(() => loadCurriculum(root)).toThrow(/unknown vocabulary "missing"/);
  });

  it("rejects duplicate concept ids across lessons", () => {
    const root = tmpRoot();
    writeLesson(root, "one.md", VALID_LESSON);
    writeLesson(
      root,
      "two.md",
      VALID_LESSON.replace("id: a1-01-x", "id: a1-02-y").replace(
        "order: 1",
        "order: 2",
      ),
    );
    expect(() => loadCurriculum(root)).toThrow(/duplicate concept id/);
  });

  it("rejects multiple_choice without options", () => {
    const root = tmpRoot();
    const broken = VALID_LESSON.replace(
      /    type: translation/,
      "    type: multiple_choice",
    ).replace("    answer: a", "    answer: a\n    options: [only-one]");
    // options with 1 item fails schema (min 2)
    writeLesson(root, "bad.md", broken);
    expect(() => loadCurriculum(root)).toThrow();
  });

  it("rejects a production exercise without an explanation", () => {
    const root = tmpRoot();
    const broken = VALID_LESSON.replace(
      /    type: translation/,
      "    type: production",
    );
    writeLesson(root, "bad.md", broken);
    expect(() => loadCurriculum(root)).toThrow(/needs an explanation/);
    expect(() => loadCurriculum(root)).toThrow(/grading guidance/);
  });

  it("accepts a production exercise with an explanation", () => {
    const root = tmpRoot();
    const ok = VALID_LESSON.replace(
      /    type: translation/,
      "    type: production",
    ).replace(
      "    answer: a",
      "    answer: a\n    explanation: Any correct a earns the point.",
    );
    writeLesson(root, "ok.md", ok);
    expect(() => loadCurriculum(root)).not.toThrow();
  });

  it("rejects a missing curriculum directory", () => {
    expect(() => loadCurriculum(path.join(tmpRoot(), "nope"))).toThrow(
      /curriculum directory not found/,
    );
  });
});

describe("loadLessonFile", () => {
  it("reports the file path in errors", () => {
    const root = tmpRoot();
    const file = writeLesson(root, "x.md", "no frontmatter at all");
    expect(() => loadLessonFile(file, root)).toThrow(/x\.md/);
  });
});
