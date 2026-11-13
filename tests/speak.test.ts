import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const tsx = path.join(repoRoot, "node_modules", ".bin", "tsx");
const speakCli = path.join(repoRoot, "src", "cli", "speak.ts");
const fakePiper = path.join(repoRoot, "tests", "fixtures", "bin", "fake-piper");

let tmpDir: string;
let dataDir: string;
let cacheDir: string;
let counter: string;

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function speak(args: string[], extraEnv: Record<string, string> = {}): RunResult {
  try {
    const stdout = execFileSync(tsx, [speakCli, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        FRENCH_PIPER_BIN: fakePiper,
        FRENCH_PIPER_DATA_DIR: dataDir,
        FRENCH_TTS_CACHE_DIR: cacheDir,
        FRENCH_TTS_TEST_COUNTER: counter,
        ...extraEnv,
      },
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      status: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

function json(res: RunResult): any {
  const lines = res.stdout.trim().split("\n");
  return JSON.parse(lines[lines.length - 1]!);
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "french-speak-"));
  dataDir = path.join(tmpDir, "voices");
  cacheDir = path.join(tmpDir, "audio");
  counter = path.join(tmpDir, "counter.txt");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.chmodSync(fakePiper, 0o755);
  // Voice "model" present so the voice-missing check passes
  fs.writeFileSync(path.join(dataDir, "fr_FR-siwis-medium.onnx"), "dummy");
  fs.writeFileSync(path.join(dataDir, "fr_FR-siwis-medium.onnx.json"), "{}");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("pnpm speak (subprocess)", () => {
  it("generates audio without playing when --no-play is given", () => {
    const res = speak(["Bonjour, comment allez-vous ?", "--no-play", "--json"]);
    expect(res.status).toBe(0);
    const body = json(res);
    expect(body.ok).toBe(true);
    expect(body.data.played).toBe(false);
    expect(body.data.cached).toBe(false);
    expect(fs.existsSync(body.data.path)).toBe(true);
    expect(fs.statSync(body.data.path).size).toBeGreaterThan(0);
  });

  it("serves the second request from cache (piper runs once)", () => {
    const res = speak(["Bonjour, comment allez-vous ?", "--no-play", "--json"]);
    expect(res.status).toBe(0);
    expect(json(res).data.cached).toBe(true);
    const runs = fs.readFileSync(counter, "utf8").trim().split("\n").length;
    expect(runs).toBe(1);
  });

  it("writes to an explicit --out path", () => {
    const out = path.join(tmpDir, "sub", "greeting.wav");
    const res = speak(["Salut tout le monde", "--out", out, "--json"]);
    expect(res.status).toBe(0);
    expect(json(res).data.path).toBe(out);
    expect(fs.existsSync(out)).toBe(true);
  });

  it("reports synthesis failures with ok:false, a hint and exit 1", () => {
    const res = speak(["Bonjour", "--no-play", "--json"], {
      FRENCH_TTS_TEST_FAIL: "1",
    });
    expect(res.status).toBe(1);
    const body = json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("simulated failure");
    expect(body.hint).toBeTruthy();
  });

  it("reports a missing piper binary clearly", () => {
    const res = speak(["Bonjour", "--no-play", "--json"], {
      FRENCH_PIPER_BIN: "no-such-piper-binary",
    });
    expect(res.status).toBe(1);
    const body = json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Piper not found");
    expect(body.hint).toContain("uv tool install piper-tts");
  });

  it("shows help without arguments", () => {
    const res = speak([]);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain("Usage: pnpm speak");
  });
});
