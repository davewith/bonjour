import fs from "node:fs";
import path from "node:path";
import { repoRoot, ensureDir } from "./locations.js";
import type { Db } from "./connection.js";

/**
 * Consistent, collision-free default location for manual backups:
 * data/backups/learning-<timestamp>.db  (gitignored — lives under data/).
 */
export function defaultBackupPath(now: Date = new Date()): string {
  const ts = now.toISOString().replace(/[:.]/g, "-");
  return path.join(repoRoot, "data", "backups", `learning-${ts}.db`);
}

/**
 * Snapshot the live database with SQLite's VACUUM INTO (consistent copy,
 * safe to run while the CLI/agents are connected). Refuses to overwrite.
 */
export function backupDb(db: Db, dest: string): { path: string; bytes: number } {
  const resolved = path.resolve(dest);
  if (fs.existsSync(resolved)) {
    throw new Error(`Backup target already exists: ${resolved}`);
  }
  ensureDir(path.dirname(resolved));
  const quoted = resolved.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${quoted}'`);
  const bytes = fs.statSync(resolved).size;
  if (bytes === 0) {
    throw new Error(`Backup produced an empty file: ${resolved}`);
  }
  return { path: resolved, bytes };
}
