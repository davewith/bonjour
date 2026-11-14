import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

/** Repository root (…/bonjour), derived from src/db/locations.ts. */
export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export const migrationsDir = path.join(repoRoot, "migrations");
export const curriculumDir = path.join(repoRoot, "curriculum");
export const dataDir = path.join(repoRoot, "data");
export const audioCacheDir = path.join(dataDir, "audio");
export const voicesDir = path.join(dataDir, "voices");

/**
 * Learning database path.
 * FRENCH_DB env var overrides (used by tests); default is data/learning.db.
 *
 * Safety: under vitest the default path is REFUSED — tests must always use
 * FRENCH_DB or an explicit temp path. The learner's live database must never
 * be opened (let alone written) by automated tests.
 */
export function dbPath(): string {
  const override = process.env["FRENCH_DB"];
  if (override && override.trim() !== "") return override;
  if (process.env["VITEST"]) {
    throw new Error(
      "Refusing to open the default learning.db while running tests. " +
        "Set FRENCH_DB to a temporary path (tests must never touch data/learning.db).",
    );
  }
  return path.join(dataDir, "learning.db");
}

/** True when `p` points inside the local data/ directory. */
export function isUnderDataDir(p: string): boolean {
  const rel = path.relative(dataDir, path.resolve(p));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
