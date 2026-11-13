import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import {
  LessonFrontmatterSchema,
  type Lesson,
  type LessonLevel,
} from "../types/curriculum.js";
import { curriculumDir } from "../db/locations.js";

export class CurriculumError extends Error {
  constructor(
    message: string,
    readonly file?: string,
  ) {
    super(file ? `${file}: ${message}` : message);
    this.name = "CurriculumError";
  }
}

/** Split markdown into YAML frontmatter and body. */
export function splitFrontmatter(raw: string): { yaml: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) {
    throw new CurriculumError("missing YAML frontmatter delimited by --- lines");
  }
  return { yaml: match[1] ?? "", body: (match[2] ?? "").trim() };
}

/** Level directories are named a1/a2/b1/b2 (case-insensitive). */
function levelFromDir(dirName: string): LessonLevel | null {
  const m = /^([ab][12])$/i.exec(dirName);
  if (!m) return null;
  const code = m[1]!.toUpperCase();
  return code as LessonLevel;
}

function listLessonFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    throw new CurriculumError(`curriculum directory not found: ${root}`);
  }
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const level = levelFromDir(entry.name);
    if (!level) continue; // methodology/ and other non-level dirs are skipped
    const dir = path.join(root, entry.name);
    for (const f of fs.readdirSync(dir).sort()) {
      if (f.endsWith(".md")) files.push(path.join(dir, f));
    }
  }
  return files.sort();
}

/** Parse one markdown file into a Lesson (schema validation only). */
export function loadLessonFile(filePath: string, root: string): Lesson {
  const raw = fs.readFileSync(filePath, "utf8");
  const rel = path.relative(root, filePath);
  let parsed: unknown;
  try {
    const { yaml, body } = splitFrontmatter(raw);
    parsed = parse(yaml);
    const frontmatter = LessonFrontmatterSchema.parse(parsed);
    return { frontmatter, body, sourcePath: rel };
  } catch (err) {
    const msg =
      err instanceof CurriculumError
        ? err.message
        : formatZodLikeError(err);
    throw new CurriculumError(msg, rel);
  }
}

function formatZodLikeError(err: unknown): string {
  if (err && typeof err === "object" && "issues" in err) {
    const issues = (err as { issues: Array<{ path: PropertyKey[]; message: string }> })
      .issues;
    return issues
      .map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
      .join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Cross-lesson validation:
 * - lesson ids, concept ids, vocabulary ids and exercise ids are globally unique
 * - exercise.concept / exercise.vocab / vocabulary.concept reference existing ids
 * - multiple_choice exercises have options
 * - lesson ids are unique; (level, order) pairs are unique
 */
export function validateLessons(lessons: Lesson[]): void {
  const lessonIds = new Set<string>();
  const seenOrder = new Set<string>();
  const conceptIds = new Set<string>();
  const vocabIds = new Set<string>();
  const exerciseIds = new Set<string>();
  const errors: string[] = [];

  for (const lesson of lessons) {
    const fm = lesson.frontmatter;
    if (lessonIds.has(fm.id)) errors.push(`duplicate lesson id "${fm.id}"`);
    lessonIds.add(fm.id);
    const orderKey = `${fm.level}:${fm.order}`;
    if (seenOrder.has(orderKey))
      errors.push(`duplicate (level, order) pair ${fm.level}/${fm.order}`);
    seenOrder.add(orderKey);

    const lessonConcepts = new Set(fm.concepts.map((c) => c.id));
    // Vocabulary may be referenced by explicit/generated id OR by french text.
    const lessonVocabRefs = new Set<string>();

    for (const c of fm.concepts) {
      if (conceptIds.has(c.id))
        errors.push(`duplicate concept id "${c.id}" (lesson ${fm.id})`);
      conceptIds.add(c.id);
    }
    for (const v of fm.vocabulary) {
      const vid = v.id ?? generatedVocabId(fm.id, v.fr);
      if (vocabIds.has(vid))
        errors.push(`duplicate vocabulary id "${vid}" (lesson ${fm.id})`);
      vocabIds.add(vid);
      lessonVocabRefs.add(vid);
      lessonVocabRefs.add(v.fr);
      if (v.concept && !lessonConcepts.has(v.concept))
        errors.push(
          `vocabulary "${vid}" references unknown concept "${v.concept}" (lesson ${fm.id})`,
        );
    }
    for (const ex of fm.exercises) {
      if (exerciseIds.has(ex.id))
        errors.push(`duplicate exercise id "${ex.id}" (lesson ${fm.id})`);
      exerciseIds.add(ex.id);
      if (ex.concept && !lessonConcepts.has(ex.concept))
        errors.push(
          `exercise "${ex.id}" references unknown concept "${ex.concept}" (lesson ${fm.id})`,
        );
      if (ex.vocab && !lessonVocabRefs.has(ex.vocab))
        errors.push(
          `exercise "${ex.id}" references unknown vocabulary "${ex.vocab}" (lesson ${fm.id})`,
        );
      if (ex.type === "multiple_choice" && (!ex.options || ex.options.length < 2))
        errors.push(
          `multiple_choice exercise "${ex.id}" needs at least 2 options (lesson ${fm.id})`,
        );
      if (ex.type === "multiple_choice" && ex.options && !ex.options.includes(ex.answer))
        errors.push(
          `multiple_choice exercise "${ex.id}" answer must be one of its options (lesson ${fm.id})`,
        );
    }
    if (fm.exercises.length === 0)
      errors.push(`lesson "${fm.id}" has no exercises`);
  }

  if (errors.length > 0) {
    throw new CurriculumError(
      `curriculum validation failed:\n  - ${errors.join("\n  - ")}`,
    );
  }
}

/** Stable vocabulary id when the author did not provide one. */
export function generatedVocabId(lessonId: string, french: string): string {
  const slug = french
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${lessonId}-${slug || "word"}`;
}

export interface LoadResult {
  lessons: Lesson[];
  files: string[];
}

/** Load and validate every lesson under curriculum/<level>/*.md. */
export function loadCurriculum(root: string = curriculumDir): LoadResult {
  const files = listLessonFiles(root);
  const lessons = files.map((f) => loadLessonFile(f, root));
  validateLessons(lessons);
  lessons.sort(
    (a, b) =>
      a.frontmatter.level.localeCompare(b.frontmatter.level) ||
      a.frontmatter.order - b.frontmatter.order,
  );
  return { lessons, files };
}
