import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const tsx = path.join(repoRoot, "node_modules", ".bin", "tsx");
const cli = path.join(repoRoot, "src", "cli", "index.ts");
const fixtureRoot = path.join(repoRoot, "tests", "fixtures", "curriculum");

let tmpDir: string;
let dbFile: string;

interface RunResult {
  status: number;
  stdout: string;
}

function run(...args: string[]): RunResult {
  try {
    const stdout = execFileSync(tsx, [cli, ...args], {
      env: { ...process.env, FRENCH_DB: dbFile },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

function json(result: RunResult): { ok: boolean; data?: any; error?: string } {
  return JSON.parse(result.stdout.trim().split("\n").pop()!);
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "french-cli-"));
  dbFile = path.join(tmpDir, "cli.db");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("french CLI (subprocess)", () => {
  it("prints help", () => {
    const res = run("--help");
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Usage: pnpm french");
  });

  it("rejects unknown commands with ok:false and exit 1", () => {
    const res = run("frobnicate", "--json");
    expect(res.status).toBe(1);
    const body = json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Unknown command/);
  });

  it("initialises a profile and reports structured JSON", () => {
    const res = run(
      "profile", "init",
      "--name", "Test Learner",
      "--goal", "order coffee",
      "--json",
    );
    expect(res.status).toBe(0);
    const body = json(res);
    expect(body.ok).toBe(true);
    expect(body.data.name).toBe("Test Learner");

    const show = json(run("profile", "show", "--json"));
    expect(show.data.goals).toEqual(["order coffee"]);
  });

  it("refuses a second profile init", () => {
    const res = run("profile", "init", "--name", "Again", "--json");
    expect(res.status).toBe(1);
    expect(json(res).error).toMatch(/already exists/);
  });

  it("syncs curriculum from a custom root", () => {
    const res = run("sync", "--root", fixtureRoot, "--json");
    expect(res.status).toBe(0);
    const body = json(res);
    expect(body.ok).toBe(true);
    expect(body.data.lessonsInserted).toBe(2);

    const lessons = json(run("lessons", "--json"));
    expect(lessons.data.lessons.length).toBe(2);
  });

  it("records an attempt and reflects it in progress", () => {
    const res = run(
      "attempt", "record",
      "--exercise", "a1-01-ex-translate-hello",
      "--answer", "Bonjour",
      "--source", "tutor",
      "--json",
    );
    expect(res.status).toBe(0);
    const body = json(res);
    expect(body.data.isCorrect).toBe(true);
    expect(body.data.attemptId).toBeGreaterThan(0);

    const progress = json(run("progress", "--json"));
    expect(progress.data.attempts.total).toBe(1);
    expect(progress.data.attempts.correct).toBe(1);
    expect(progress.data.mastery.overall.learning).toBeGreaterThanOrEqual(1);
  });

  it("returns session plan and lesson detail", () => {
    const plan = json(run("session", "plan", "--json"));
    expect(plan.ok).toBe(true);
    expect(plan.data.nextLesson.id).toBe("a1-01-test");

    const lesson = json(run("lesson", "a1-01-test", "--json"));
    expect(lesson.data.exercises.length).toBe(4);
    expect(lesson.data.spokenExamples.length).toBe(2);
  });

  it("reports validation errors as ok:false", () => {
    const res = run(
      "attempt", "record",
      "--exercise", "missing-exercise",
      "--answer", "x",
      "--json",
    );
    expect(res.status).toBe(1);
    expect(json(res).error).toMatch(/Unknown exercise/);
  });

  it("is idempotent on a fresh database (migrations auto-run)", () => {
    const freshDb = path.join(tmpDir, "fresh.db");
    const res = execFileSync(tsx, [cli, "progress", "--json"], {
      env: { ...process.env, FRENCH_DB: freshDb },
      encoding: "utf8",
    });
    const body = JSON.parse(res.trim());
    expect(body.ok).toBe(true);
    expect(body.data.attempts.total).toBe(0);
    expect(fs.existsSync(freshDb)).toBe(true);
  });
});
