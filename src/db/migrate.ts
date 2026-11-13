import fs from "node:fs";
import path from "node:path";
import { migrationsDir } from "./locations.js";
import type { Db } from "./connection.js";

/**
 * Minimal forward-only SQL migration runner.
 * - Migrations are *.sql files in migrations/, applied in filename order.
 * - Each file runs inside a transaction and is recorded in schema_migrations.
 * - Migration files must not contain BEGIN/COMMIT (the runner owns transactions).
 */
export function migrate(db: Db, dir: string = migrationsDir): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);

  const applied = new Set(
    db
      .prepare("SELECT name FROM schema_migrations")
      .all()
      .map((row) => String((row as { name: string }).name)),
  );

  if (!fs.existsSync(dir)) {
    throw new Error(`Migrations directory not found: ${dir}`);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(file);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(
        `Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    newlyApplied.push(file);
  }
  return newlyApplied;
}

/** Names of migrations already applied (for tests/inspection). */
export function appliedMigrations(db: Db): string[] {
  const exists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
    )
    .all();
  if (exists.length === 0) return [];
  return db
    .prepare("SELECT name FROM schema_migrations ORDER BY name")
    .all()
    .map((row) => String((row as { name: string }).name));
}
