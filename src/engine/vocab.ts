import type { Db } from "../db/connection.js";

export interface VocabView {
  id: string;
  lessonId: string;
  lessonTitle: string;
  french: string;
  english: string;
  ipa: string | null;
  partOfSpeech: string | null;
  exampleFr: string | null;
  exampleEn: string | null;
  tags: string[];
  masteryState: string | null;
  nextReviewAt: string | null;
}

interface VocabJoinRow {
  id: string;
  lesson_id: string;
  lesson_title: string;
  french: string;
  english: string;
  ipa: string | null;
  part_of_speech: string | null;
  example_fr: string | null;
  example_en: string | null;
  tags: string;
  mastery_state: string | null;
  next_review_at: string | null;
}

function mapVocab(r: VocabJoinRow): VocabView {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(r.tags);
    if (Array.isArray(parsed)) tags = parsed.map(String);
  } catch {
    /* ignore malformed tags */
  }
  return {
    id: r.id,
    lessonId: r.lesson_id,
    lessonTitle: r.lesson_title,
    french: r.french,
    english: r.english,
    ipa: r.ipa,
    partOfSpeech: r.part_of_speech,
    exampleFr: r.example_fr,
    exampleEn: r.example_en,
    tags,
    masteryState: r.mastery_state,
    nextReviewAt: r.next_review_at,
  };
}

const SELECT = `
  SELECT v.id, v.lesson_id, l.title AS lesson_title, v.french, v.english, v.ipa,
         v.part_of_speech, v.example_fr, v.example_en, v.tags,
         m.state AS mastery_state, m.next_review_at
  FROM vocabulary v
  JOIN lessons l ON l.id = v.lesson_id
  LEFT JOIN mastery m ON m.entity_type = 'vocab' AND m.entity_id = v.id
`;

export interface ListVocabOptions {
  lessonId?: string;
  search?: string;
  limit?: number;
}

export function listVocabulary(
  db: Db,
  opts: ListVocabOptions = {},
): VocabView[] {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (opts.lessonId) {
    clauses.push("v.lesson_id = ?");
    params.push(opts.lessonId);
  }
  if (opts.search) {
    clauses.push("(v.french LIKE ? OR v.english LIKE ?)");
    params.push(`%${opts.search}%`, `%${opts.search}%`);
  }
  let sql = SELECT;
  if (clauses.length > 0) sql += ` WHERE ${clauses.join(" AND ")}`;
  sql += " ORDER BY l.level, l.ord, v.ord LIMIT ?";
  params.push(opts.limit ?? 200);

  const rows = db.prepare(sql).all(...params) as unknown as VocabJoinRow[];
  return rows.map(mapVocab);
}

export function getVocabulary(db: Db, id: string): VocabView | null {
  const row = db.prepare(`${SELECT} WHERE v.id = ?`).get(id) as
    | VocabJoinRow
    | undefined;
  return row ? mapVocab(row) : null;
}
