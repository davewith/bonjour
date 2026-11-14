import { describe, it, expect, afterEach, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openDb, closeDb, type Db } from "../src/db/connection.js";
import { dbPath, dataDir, isUnderDataDir, repoRoot } from "../src/db/locations.js";
import { migrate } from "../src/db/migrate.js";
import { backupDb, defaultBackupPath } from "../src/db/backup.js";

const repoRootFromTest = fileURLToPath(new URL("..", import.meta.url));

let tmpDir: string;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "french-guards-"));
  savedEnv = { FRENCH_DB: process.env["FRENCH_DB"] };
  delete process.env["FRENCH_DB"];
});

afterEach(() => {
  if (savedEnv["FRENCH_DB"] === undefined) delete process.env["FRENCH_DB"];
  else process.env["FRENCH_DB"] = savedEnv["FRENCH_DB"];
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("guard: tests can never open the live database", () => {
  it("dbPath() refuses the default path while VITEST is set", () => {
    expect(process.env["VITEST"]).toBeTruthy();
    expect(() => dbPath()).toThrow(/Refusing to open the default learning\.db/);
  });

  it("dbPath() returns the override when FRENCH_DB is set", () => {
    const override = path.join(tmpDir, "override.db");
    process.env["FRENCH_DB"] = override;
    expect(dbPath()).toBe(override);
  });

  it("openDb() refuses explicit paths under data/ during tests", () => {
    expect(() => openDb(path.join(dataDir, "learning.db"))).toThrow(
      /under data\/ during tests/,
    );
    expect(() => openDb(path.join(dataDir, "backups", "x.db"))).toThrow(
      /under data\/ during tests/,
    );
  });

  it("openDb() still works with temp paths", () => {
    const db = openDb(path.join(tmpDir, "ok.db"));
    migrate(db);
    closeDb(db);
    expect(fs.existsSync(path.join(tmpDir, "ok.db"))).toBe(true);
  });

  it("isUnderDataDir detects data/ paths only", () => {
    expect(isUnderDataDir(path.join(dataDir, "learning.db"))).toBe(true);
    expect(isUnderDataDir(dataDir)).toBe(true);
    expect(isUnderDataDir(path.join(tmpDir, "x.db"))).toBe(false);
    expect(isUnderDataDir("/tmp/data-not/x.db")).toBe(false);
  });
});

describe("guard: opencode permission rules block destructive commands", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(repoRootFromTest, "opencode.json"), "utf8"),
  ) as { permission: { bash: Record<string, string> } };
  const bash = config.permission.bash;

  it("denies any command naming learning.db", () => {
    expect(bash["*learning.db*"]).toBe("deny");
  });

  it("denies rm/mv against the data directory", () => {
    expect(bash["rm *data*"]).toBe("deny");
    expect(bash["mv *data*"]).toBe("deny");
  });

  it("keeps regenerable caches removable (allow listed after deny)", () => {
    // last-match-wins: the audio/voice carve-outs must come AFTER the denies
    const keys = Object.keys(bash);
    expect(keys.indexOf("rm *data/audio*")).toBeGreaterThan(keys.indexOf("rm *data*"));
    expect(bash["rm *data/audio*"]).toBe("allow");
    expect(bash["rm *data/voices*"]).toBe("allow");
  });

  it("does not allow-list anything that matches *learning.db*", () => {
    for (const [pattern, action] of Object.entries(bash)) {
      if (action === "allow" && pattern.includes("learning.db")) {
        throw new Error(`allow rule ${pattern} would defeat the db deny`);
      }
    }
  });
});

describe("guard: database backups", () => {
  let db: Db;

  beforeEach(() => {
    db = openDb(path.join(tmpDir, "source.db"));
    migrate(db);
    db.prepare("INSERT INTO learner_profile (id, name) VALUES (1, ?)").run("Backup Test");
  });

  afterEach(() => {
    closeDb(db);
  });

  it("VACUUM INTO produces a readable, consistent copy", () => {
    const dest = path.join(tmpDir, "copy.db");
    const result = backupDb(db, dest);
    expect(result.path).toBe(path.resolve(dest));
    expect(result.bytes).toBeGreaterThan(0);

    const copy = openDb(dest);
    try {
      const row = copy.prepare("SELECT name FROM learner_profile WHERE id = 1").get() as {
        name: string;
      };
      expect(row.name).toBe("Backup Test");
      const migrations = copy
        .prepare("SELECT COUNT(*) AS n FROM schema_migrations")
        .get() as { n: number };
      expect(Number(migrations.n)).toBeGreaterThan(0);
    } finally {
      closeDb(copy);
    }
  });

  it("refuses to overwrite an existing backup", () => {
    const dest = path.join(tmpDir, "copy.db");
    backupDb(db, dest);
    expect(() => backupDb(db, dest)).toThrow(/already exists/);
  });

  it("default backup path lands under data/backups with a timestamp name", () => {
    const p = defaultBackupPath(new Date("2026-11-14T10:00:00.000Z"));
    expect(p).toContain(path.join("data", "backups"));
    expect(path.basename(p)).toMatch(/^learning-2026-11-14T10-00-00-000Z\.db$/);
  });

  it("CLI `db backup` works against a temp database", () => {
    const tsx = path.join(repoRootFromTest, "node_modules", ".bin", "tsx");
    const cli = path.join(repoRootFromTest, "src", "cli", "index.ts");
    const cliDb = path.join(tmpDir, "cli-backup.db");
    const dest = path.join(tmpDir, "cli-copy.db");
    const out = execFileSync(
      tsx,
      [cli, "db", "backup", "--out", dest, "--json"],
      {
        encoding: "utf8",
        env: { ...process.env, FRENCH_DB: cliDb },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const body = JSON.parse(out.trim().split("\n").pop()!);
    expect(body.ok).toBe(true);
    expect(body.data.path).toBe(dest);
    expect(fs.existsSync(dest)).toBe(true);
  });
});
