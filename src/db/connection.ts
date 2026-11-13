import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { dbPath, ensureDir } from "./locations.js";

export type Db = DatabaseSync;

/**
 * Open (and create if needed) the learning database.
 * Applies pragmas required for integrity and concurrency.
 */
export function openDb(file?: string): Db {
  const resolved = file ?? dbPath();
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
