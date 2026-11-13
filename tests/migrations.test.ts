import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, closeDb, type Db } from "../src/db/connection.js";
import { migrate, appliedMigrations } from "../src/db/migrate.js";
import { migrationsDir } from "../src/db/locations.js";

/** All migration files currently on disk (keeps tests in sync with the repo). */
const ALL_MIGRATIONS = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const tmpDirs: string[] = [];
const dbs: Db[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "french-db-"));
  tmpDirs.push(dir);
  return dir;
}

function freshDb(): { db: Db; file: string } {
  const dir = tmpDir();
  const file = path.join(dir, "test.db");
  const db = openDb(file);
  dbs.push(db);
  return { db, file };
}

afterEach(() => {
  while (dbs.length > 0) {
    const db = dbs.pop();
    if (db) {
      try {
        closeDb(db);
      } catch {
        /* already closed */
      }
    }
  }
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

const EXPECTED_TABLES = [
  "learner_profile",
  "learner_goals",
  "lessons",
  "concepts",
  "vocabulary",
  "exercises",
  "sessions",
  "exercise_attempts",
  "mistakes",
  "mastery",
  "mastery_history",
  "review_history",
  "schema_migrations",
];

describe("migrations", () => {
  it("creates the full schema on an empty database", () => {
    const { db } = freshDb();
    const applied = migrate(db);
    expect(applied).toEqual(ALL_MIGRATIONS);

    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => String((r as { name: string }).name)),
    );
    for (const t of EXPECTED_TABLES) {
      expect(tables.has(t), `missing table ${t}`).toBe(true);
    }
  });

  it("is idempotent — running twice applies nothing new", () => {
    const { db } = freshDb();
    expect(migrate(db)).toEqual(ALL_MIGRATIONS);
    expect(migrate(db)).toEqual([]);
    expect(appliedMigrations(db)).toEqual(ALL_MIGRATIONS);
  });

  it("enables foreign keys", () => {
    const { db } = freshDb();
    migrate(db);
    const row = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(Number(row.foreign_keys)).toBe(1);
  });

  it("enforces referential integrity (attempt requires existing exercise)", () => {
    const { db } = freshDb();
    migrate(db);
    expect(() =>
      db
        .prepare(
          "INSERT INTO exercise_attempts (exercise_id, learner_answer, is_correct, source) VALUES (?,?,?,?)",
        )
        .run("nope", "x", 1, "tutor"),
    ).toThrow();
  });

  it("stores sortable ISO timestamps", () => {
    const { db } = freshDb();
    migrate(db);
    db.prepare("INSERT INTO learner_profile (id, name) VALUES (1, ?)").run("Test");
    const row = db
      .prepare("SELECT created_at FROM learner_profile WHERE id = 1")
      .get() as { created_at: string };
    expect(row.created_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(new Date(row.created_at).toISOString()).toBe(row.created_at);
  });

  it("rolls back a failing migration and records nothing", () => {
    const dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, "001_ok.sql"),
      "CREATE TABLE ok_table (id INTEGER PRIMARY KEY);",
    );
    fs.writeFileSync(path.join(dir, "002_bad.sql"), "THIS IS NOT SQL;");
    const { db } = freshDb();
    expect(() => migrate(db, dir)).toThrow(/002_bad\.sql/);
    expect(appliedMigrations(db)).toEqual(["001_ok.sql"]);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ok_table'")
      .all();
    expect(tables.length).toBe(1);
  });

  it("throws a clear error when the migrations directory is missing", () => {
    const { db } = freshDb();
    expect(() => migrate(db, path.join(tmpDir(), "nope"))).toThrow(
      /Migrations directory not found/,
    );
  });
});
