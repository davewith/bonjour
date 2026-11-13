import { createHash } from "node:crypto";
import type { Db } from "../db/connection.js";
import { loadCurriculum, generatedVocabId } from "../curriculum/load.js";
import type { Lesson } from "../types/curriculum.js";
import { curriculumDir } from "../db/locations.js";

export interface SyncResult {
  lessonsInserted: number;
  lessonsUpdated: number;
  lessonsUnchanged: number;
  conceptsUpserted: number;
  vocabularyUpserted: number;
  exercisesUpserted: number;
  warnings: string[];
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Sync curriculum Markdown into the database (upsert-only).
 *
 * Content source of truth is curriculum/; attempts and mastery are never
 * deleted when curriculum changes — if an exercise id disappears from the
 * Markdown, its history stays in the database and a warning is reported.
 */
export function syncCurriculum(
  db: Db,
  root: string = curriculumDir,
): SyncResult {
  const { lessons } = loadCurriculum(root);
  const result: SyncResult = {
    lessonsInserted: 0,
    lessonsUpdated: 0,
    lessonsUnchanged: 0,
    conceptsUpserted: 0,
    vocabularyUpserted: 0,
    exercisesUpserted: 0,
    warnings: [],
  };

  const seenLessonIds = new Set<string>();
  const seenExerciseIds = new Set<string>();
  const seenVocabIds = new Set<string>();
  const seenConceptIds = new Set<string>();

  for (const lesson of lessons) {
    seenLessonIds.add(lesson.frontmatter.id);
    syncLesson(db, lesson, result);
    for (const c of lesson.frontmatter.concepts) seenConceptIds.add(c.id);
    for (const v of lesson.frontmatter.vocabulary)
      seenVocabIds.add(v.id ?? generatedVocabId(lesson.frontmatter.id, v.fr));
    for (const e of lesson.frontmatter.exercises) seenExerciseIds.add(e.id);
  }

  // Warn about orphaned curriculum rows (deleted from Markdown but still in DB).
  for (const row of db.prepare("SELECT id FROM lessons").all()) {
    const id = String((row as { id: string }).id);
    if (!seenLessonIds.has(id))
      result.warnings.push(
        `lesson "${id}" exists in database but not in curriculum (history preserved)`,
      );
  }
  for (const row of db.prepare("SELECT id FROM exercises").all()) {
    const id = String((row as { id: string }).id);
    if (!seenExerciseIds.has(id))
      result.warnings.push(
        `exercise "${id}" exists in database but not in curriculum (history preserved)`,
      );
  }
  for (const row of db.prepare("SELECT id FROM vocabulary").all()) {
    const id = String((row as { id: string }).id);
    if (!seenVocabIds.has(id))
      result.warnings.push(
        `vocabulary "${id}" exists in database but not in curriculum (history preserved)`,
      );
  }
  for (const row of db.prepare("SELECT id FROM concepts").all()) {
    const id = String((row as { id: string }).id);
    if (!seenConceptIds.has(id))
      result.warnings.push(
        `concept "${id}" exists in database but not in curriculum (history preserved)`,
      );
  }

  return result;
}

function syncLesson(db: Db, lesson: Lesson, result: SyncResult): void {
  const fm = lesson.frontmatter;
  const raw = JSON.stringify(fm) + lesson.body;
  const hash = sha256(raw);

  const existing = db
    .prepare("SELECT content_hash FROM lessons WHERE id = ?")
    .get(fm.id) as { content_hash: string } | undefined;

  if (existing && existing.content_hash === hash) {
    result.lessonsUnchanged++;
  } else if (existing) {
    db.prepare(
      `UPDATE lessons SET level=?, ord=?, title=?, source_path=?, content_hash=?,
       objectives=?, body=?, common_mistakes=?, spoken_examples=?, updated_at=? WHERE id=?`,
    ).run(
      fm.level,
      fm.order,
      fm.title,
      lesson.sourcePath,
      hash,
      JSON.stringify(fm.objectives),
      lesson.body,
      JSON.stringify(fm.commonMistakes),
      JSON.stringify(fm.spokenExamples),
      nowIso(),
      fm.id,
    );
    result.lessonsUpdated++;
  } else {
    db.prepare(
      `INSERT INTO lessons (id, level, ord, title, source_path, content_hash,
                            objectives, body, common_mistakes, spoken_examples)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      fm.id,
      fm.level,
      fm.order,
      fm.title,
      lesson.sourcePath,
      hash,
      JSON.stringify(fm.objectives),
      lesson.body,
      JSON.stringify(fm.commonMistakes),
      JSON.stringify(fm.spokenExamples),
    );
    result.lessonsInserted++;
  }

  // Concepts (upsert)
  for (const c of fm.concepts) {
    db.prepare(
      `INSERT INTO concepts (id, lesson_id, kind, title, summary, explanation, ord)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         lesson_id=excluded.lesson_id, kind=excluded.kind, title=excluded.title,
         summary=excluded.summary, explanation=excluded.explanation, ord=excluded.ord`,
    ).run(c.id, fm.id, c.kind, c.title, c.summary, c.explanation, fm.concepts.indexOf(c));
    result.conceptsUpserted++;
  }

  // Vocabulary (upsert)
  fm.vocabulary.forEach((v, i) => {
    const vid = v.id ?? generatedVocabId(fm.id, v.fr);
    db.prepare(
      `INSERT INTO vocabulary (id, lesson_id, french, english, ipa, part_of_speech,
                               example_fr, example_en, concept_id, tags, ord)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         lesson_id=excluded.lesson_id, french=excluded.french, english=excluded.english,
         ipa=excluded.ipa, part_of_speech=excluded.part_of_speech,
         example_fr=excluded.example_fr, example_en=excluded.example_en,
         concept_id=excluded.concept_id, tags=excluded.tags, ord=excluded.ord`,
    ).run(
      vid,
      fm.id,
      v.fr,
      v.en,
      v.ipa ?? null,
      v.pos ?? null,
      v.exampleFr ?? null,
      v.exampleEn ?? null,
      v.concept ?? null,
      JSON.stringify(v.tags),
      i,
    );
    result.vocabularyUpserted++;
  });

  // Exercises (upsert)
  for (const ex of fm.exercises) {
    db.prepare(
      `INSERT INTO exercises (id, lesson_id, concept_id, vocab_id, type, prompt,
                              expected_answer, accepted_answers, options, hint,
                              explanation, difficulty, ord)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         lesson_id=excluded.lesson_id, concept_id=excluded.concept_id,
         vocab_id=excluded.vocab_id, type=excluded.type, prompt=excluded.prompt,
         expected_answer=excluded.expected_answer, accepted_answers=excluded.accepted_answers,
         options=excluded.options, hint=excluded.hint, explanation=excluded.explanation,
         difficulty=excluded.difficulty, ord=excluded.ord`,
    ).run(
      ex.id,
      fm.id,
      ex.concept ?? null,
      resolveVocabId(db, fm.id, ex.vocab),
      ex.type,
      ex.prompt,
      ex.answer,
      JSON.stringify(ex.accepted),
      ex.options ? JSON.stringify(ex.options) : null,
      ex.hint ?? null,
      ex.explanation ?? null,
      ex.difficulty,
      fm.exercises.indexOf(ex),
    );
    result.exercisesUpserted++;
  }
}

/** Exercise.vocab may be an explicit id or a french word from the same lesson. */
function resolveVocabId(
  db: Db,
  lessonId: string,
  ref: string | undefined,
): string | null {
  if (!ref) return null;
  const byId = db
    .prepare("SELECT id FROM vocabulary WHERE id = ? AND lesson_id = ?")
    .get(ref, lessonId) as { id: string } | undefined;
  if (byId) return byId.id;
  const byWord = db
    .prepare("SELECT id FROM vocabulary WHERE lesson_id = ? AND french = ?")
    .get(lessonId, ref) as { id: string } | undefined;
  return byWord?.id ?? null;
}
