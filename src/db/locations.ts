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
 */
export function dbPath(): string {
  const override = process.env["FRENCH_DB"];
  if (override && override.trim() !== "") return override;
  return path.join(dataDir, "learning.db");
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
