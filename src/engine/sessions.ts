import type { Db } from "../db/connection.js";
import { nowIso } from "./profile.js";

export type SessionKind = "lesson" | "practice" | "conversation" | "review" | "assessment";

export interface SessionRow {
  id: number;
  kind: SessionKind;
  lesson_id: string | null;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
}

export function startSession(
  db: Db,
  kind: SessionKind,
  lessonId?: string | null,
): SessionRow {
  if (lessonId) {
    const lesson = db.prepare("SELECT id FROM lessons WHERE id = ?").get(lessonId);
    if (!lesson) throw new Error(`Unknown lesson id: ${lessonId}`);
  }
  const res = db
    .prepare("INSERT INTO sessions (kind, lesson_id) VALUES (?,?)")
    .run(kind, lessonId ?? null);
  return db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(Number(res.lastInsertRowid)) as unknown as SessionRow;
}

export function endSession(db: Db, id: number, notes?: string): SessionRow {
  const exists = db.prepare("SELECT id FROM sessions WHERE id = ?").get(id);
  if (!exists) throw new Error(`Unknown session id: ${id}`);
  db.prepare(
    "UPDATE sessions SET ended_at = ?, notes = COALESCE(?, notes) WHERE id = ?",
  ).run(nowIso(), notes ?? null, id);
  return db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(id) as unknown as SessionRow;
}

export function recentSessions(db: Db, limit = 10): SessionRow[] {
  return db
    .prepare("SELECT * FROM sessions ORDER BY id DESC LIMIT ?")
    .all(limit) as unknown as SessionRow[];
}
