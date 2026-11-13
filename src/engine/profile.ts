import type { Db } from "../db/connection.js";

export function nowIso(): string {
  return new Date().toISOString();
}

export interface ProfileRow {
  id: number;
  name: string;
  native_language: string;
  cefr_target: string;
  minutes_per_day: number;
  created_at: string;
  updated_at: string;
}

export function getProfile(db: Db): ProfileRow | null {
  const row = db.prepare("SELECT * FROM learner_profile WHERE id = 1").get();
  return (row as ProfileRow | undefined) ?? null;
}

export interface InitProfileInput {
  name: string;
  nativeLanguage?: string;
  cefrTarget?: string;
  minutesPerDay?: number;
  goals?: string[];
}

export function initProfile(db: Db, input: InitProfileInput): ProfileRow {
  const existing = getProfile(db);
  if (existing) {
    throw new Error(
      "Learner profile already exists — use `profile update` to change it",
    );
  }
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO learner_profile (id, name, native_language, cefr_target, minutes_per_day)
       VALUES (1, ?, ?, ?, ?)`,
    ).run(
      input.name,
      input.nativeLanguage ?? "en",
      input.cefrTarget ?? "A2",
      input.minutesPerDay ?? 20,
    );
    for (const goal of input.goals ?? []) {
      db.prepare(
        "INSERT INTO learner_goals (profile_id, goal) VALUES (1, ?)",
      ).run(goal);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return getProfile(db)!;
}

export interface UpdateProfileInput {
  name?: string;
  cefrTarget?: string;
  minutesPerDay?: number;
}

export function updateProfile(db: Db, input: UpdateProfileInput): ProfileRow {
  const current = getProfile(db);
  if (!current) throw new Error("No learner profile — run `profile init` first");
  db.prepare(
    `UPDATE learner_profile SET
       name = COALESCE(?, name),
       cefr_target = COALESCE(?, cefr_target),
       minutes_per_day = COALESCE(?, minutes_per_day),
       updated_at = ?
     WHERE id = 1`,
  ).run(
    input.name ?? null,
    input.cefrTarget ?? null,
    input.minutesPerDay ?? null,
    nowIso(),
  );
  return getProfile(db)!;
}

export function setGoals(db: Db, goals: string[]): void {
  getProfileOrThrow(db);
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM learner_goals WHERE profile_id = 1").run();
    for (const goal of goals) {
      db.prepare(
        "INSERT INTO learner_goals (profile_id, goal) VALUES (1, ?)",
      ).run(goal);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getGoals(db: Db): string[] {
  return db
    .prepare("SELECT goal FROM learner_goals WHERE profile_id = 1 ORDER BY id")
    .all()
    .map((r) => String((r as { goal: string }).goal));
}

export function getProfileOrThrow(db: Db): ProfileRow {
  const p = getProfile(db);
  if (!p) throw new Error("No learner profile — run `profile init` first");
  return p;
}

export interface ProfileView {
  profile: ProfileRow;
  goals: string[];
}

export function profileView(db: Db): ProfileView | null {
  const profile = getProfile(db);
  if (!profile) return null;
  return { profile, goals: getGoals(db) };
}
