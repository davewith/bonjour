import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { dbPath, ensureDir, isUnderDataDir } from "./locations.js";

export type Db = DatabaseSync;

/**
 * Open (and create if needed) the learning database.
 * Applies pragmas required for integrity and concurrency.
 *
 * Guard: while tests run (VITEST set), any path under data/ is refused —
 * the live learner database is off-limits to the test suite entirely.
 */
export function openDb(file?: string): Db {
  const resolved = file ?? dbPath();
  if (process.env["VITEST"] && isUnderDataDir(resolved)) {
    throw new Error(
      `Refusing to open a database under data/ during tests: ${resolved}. ` +
        "Use a temporary path (FRENCH_DB or mkdtemp) instead.",
    );
  }
  ensureDir(path.dirname(resolved));
  const db = new DatabaseSync(resolved);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

/** Close helper for tests and long-running processes. */
export function closeDb(db: Db): void {
  db.close();
}
