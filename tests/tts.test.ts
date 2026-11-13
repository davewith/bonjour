import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { AudioCache } from "../src/tts/cache.js";
import { loadTtsConfig } from "../src/tts/config.js";
import { detectPlayer, findExecutable } from "../src/tts/player.js";
import { PiperTts } from "../src/tts/piper.js";
import { createTts } from "../src/tts/index.js";
import { TtsError } from "../src/tts/types.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fakePiper = path.join(repoRoot, "tests", "fixtures", "bin", "fake-piper");

let tmpDir: string;
const envKeys = [
  "FRENCH_PIPER_BIN",
  "FRENCH_PIPER_DATA_DIR",
  "FRENCH_TTS_CACHE_DIR",
  "FRENCH_TTS_PLAYER",
  "FRENCH_PIPER_SERVER_URL",
  "FRENCH_PIPER_VOICE",
  "FRENCH_TTS_LENGTH_SCALE",
  "FRENCH_TTS_TEST_COUNTER",
  "FRENCH_TTS_TEST_FAIL",
];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "french-tts-"));
  for (const k of envKeys) savedEnv[k] = process.env[k];
  fs.chmodSync(fakePiper, 0o755);
});

afterEach(() => {
  for (const k of envKeys) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function setupVoice(dir: string, voice = "fr_FR-siwis-medium"): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${voice}.onnx`), "dummy-model");
  fs.writeFileSync(path.join(dir, `${voice}.onnx.json`), "{}");
}

function makeConfig(overrides: Record<string, string> = {}) {
  process.env["FRENCH_PIPER_BIN"] = fakePiper;
  process.env["FRENCH_PIPER_DATA_DIR"] = path.join(tmpDir, "voices");
  process.env["FRENCH_TTS_CACHE_DIR"] = path.join(tmpDir, "audio");
  process.env["FRENCH_TTS_PLAYER"] = "false"; // non-existent player unless overridden
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
  setupVoice(path.join(tmpDir, "voices"));
  return loadTtsConfig();
}

describe("AudioCache", () => {
  it("produces stable keys for identical input", () => {
    const cache = new AudioCache(path.join(tmpDir, "c"));
    const k1 = cache.key("v", "Bonjour", 1);
    const k2 = cache.key("v", "Bonjour", 1);
    expect(k1).toBe(k2);
    expect(cache.key("v", "Bonjour", 1.1)).not.toBe(k1);
    expect(cache.key("v", "Bonsoir", 1)).not.toBe(k1);
    expect(cache.key("w", "Bonjour", 1)).not.toBe(k1);
  });

  it("put then get returns the file; empty files are ignored", () => {
    const cache = new AudioCache(path.join(tmpDir, "c"));
    const src = path.join(tmpDir, "src.wav");
    fs.writeFileSync(src, "audio-bytes");
    const target = cache.put(src, "v", "Bonjour", 1);
    expect(fs.existsSync(target)).toBe(true);
    expect(cache.get("v", "Bonjour", 1)).toBe(target);
    expect(cache.get("v", "Autre", 1)).toBeNull();

    // zero-size file is treated as missing
    fs.writeFileSync(target, "");
    expect(cache.get("v", "Bonjour", 1)).toBeNull();
  });
});

describe("loadTtsConfig", () => {
  it("reads committed defaults", () => {
    delete process.env["FRENCH_PIPER_VOICE"];
    const cfg = loadTtsConfig();
    expect(cfg.voice).toBe("fr_FR-siwis-medium");
    expect(cfg.player).toBe("auto");
    expect(path.isAbsolute(cfg.dataDir)).toBe(true);
  });

  it("environment overrides config file", () => {
    process.env["FRENCH_PIPER_VOICE"] = "fr_FR-gilles-low";
    process.env["FRENCH_TTS_LENGTH_SCALE"] = "1.2";
    process.env["FRENCH_PIPER_SERVER_URL"] = "http://127.0.0.1:5000";
    const cfg = loadTtsConfig();
    expect(cfg.voice).toBe("fr_FR-gilles-low");
    expect(cfg.lengthScale).toBe(1.2);
    expect(cfg.serverUrl).toBe("http://127.0.0.1:5000");
  });

  it("explicit overrides win over everything", () => {
    process.env["FRENCH_PIPER_VOICE"] = "from-env";
    const cfg = loadTtsConfig({ voice: "explicit" });
    expect(cfg.voice).toBe("explicit");
  });
});

describe("findExecutable / detectPlayer", () => {
  it("finds executables on PATH", () => {
    const binDir = path.join(tmpDir, "bin");
    fs.mkdirSync(binDir);
    fs.writeFileSync(path.join(binDir, "myplayer"), "#!/bin/sh\n", { mode: 0o755 });
    expect(findExecutable("myplayer", binDir)).toBe(path.join(binDir, "myplayer"));
    expect(findExecutable("definitely-missing-xyz", binDir)).toBeNull();
  });

  it("returns the first available candidate in auto mode", () => {
    const binDir = path.join(tmpDir, "bin");
    fs.mkdirSync(binDir);
    fs.writeFileSync(path.join(binDir, "aplay"), "#!/bin/sh\n", { mode: 0o755 });
    fs.writeFileSync(path.join(binDir, "ffplay"), "#!/bin/sh\n", { mode: 0o755 });
    const orig = process.env["PATH"];
    process.env["PATH"] = binDir;
    try {
      const player = detectPlayer("auto");
      expect(player.name).toBe("ffplay"); // ffplay ranks above aplay
    } finally {
      process.env["PATH"] = orig;
    }
  });

  it("throws NO_PLAYER when nothing is available", () => {
    const emptyDir = path.join(tmpDir, "empty");
    fs.mkdirSync(emptyDir);
    const orig = process.env["PATH"];
    process.env["PATH"] = emptyDir;
    try {
      expect(() => detectPlayer("auto")).toThrow(TtsError);
      try {
        detectPlayer("auto");
      } catch (err) {
        expect((err as TtsError).code).toBe("NO_PLAYER");
      }
    } finally {
      process.env["PATH"] = orig;
    }
  });

  it("throws NO_PLAYER for a configured player that does not exist", () => {
    expect(() => detectPlayer("no-such-player-xyz")).toThrow(/not found/);
  });
});

describe("PiperTts (stub piper)", () => {
  it("synthesizes and caches — second call does not re-run piper", async () => {
    const counter = path.join(tmpDir, "counter.txt");
    const cfg = makeConfig({ FRENCH_TTS_TEST_COUNTER: counter });
    const tts = new PiperTts(cfg);

    const first = await tts.synthesize({ text: "Bonjour" });
    expect(first.cached).toBe(false);
    expect(fs.existsSync(first.path)).toBe(true);
    expect(fs.statSync(first.path).size).toBeGreaterThan(0);

    const second = await tts.synthesize({ text: "Bonjour" });
    expect(second.cached).toBe(true);
    expect(second.path).toBe(first.path);

    const runs = fs.readFileSync(counter, "utf8").trim().split("\n").length;
    expect(runs).toBe(1);
  });

  it("different texts produce different cache entries", async () => {
    const cfg = makeConfig();
    const tts = new PiperTts(cfg);
    const a = await tts.synthesize({ text: "Bonjour" });
    const b = await tts.synthesize({ text: "Bonsoir" });
    expect(a.path).not.toBe(b.path);
  });

  it("reports PIPER_MISSING when the binary is absent", async () => {
    const cfg = makeConfig({ FRENCH_PIPER_BIN: "no-such-piper-binary" });
    const tts = new PiperTts(cfg);
    await expect(tts.synthesize({ text: "Bonjour" })).rejects.toThrow(
      /Piper not found/,
    );
    try {
      await tts.synthesize({ text: "Bonjour" });
    } catch (err) {
      expect((err as TtsError).code).toBe("PIPER_MISSING");
      expect((err as TtsError).hint).toMatch(/uv tool install/);
    }
  });

  it("reports VOICE_MISSING when the model file is absent", async () => {
    const cfg = makeConfig({ FRENCH_PIPER_VOICE: "xx_YY-missing-low" });
    const tts = new PiperTts(cfg);
    try {
      await tts.synthesize({ text: "Bonjour" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as TtsError).code).toBe("VOICE_MISSING");
      expect((err as TtsError).message).toContain("xx_YY-missing-low");
    }
  });

  it("reports SYNTHESIS_FAILED with stderr when piper exits non-zero", async () => {
    const cfg = makeConfig({ FRENCH_TTS_TEST_FAIL: "1" });
    const tts = new PiperTts(cfg);
    try {
      await tts.synthesize({ text: "Bonjour" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as TtsError).code).toBe("SYNTHESIS_FAILED");
      expect((err as TtsError).message).toContain("simulated failure");
    }
  });

  it("rejects empty text", async () => {
    const cfg = makeConfig();
    const tts = new PiperTts(cfg);
    await expect(tts.synthesize({ text: "   " })).rejects.toThrow(/empty/);
  });

  it("uses the persistent HTTP server when configured", async () => {
    let hits = 0;
    const server = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/synthesize") {
        hits++;
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => {
          const parsed = JSON.parse(body) as { text: string };
          expect(parsed.text).toBe("Bonjour du serveur");
          res.writeHead(200, { "Content-Type": "audio/wav" });
          res.end(Buffer.from("RIFF-stub-server-audio"));
        });
      } else {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    const port = (server.address() as { port: number }).port;
    try {
      const cfg = makeConfig({
        FRENCH_PIPER_SERVER_URL: `http://127.0.0.1:${port}`,
      });
      const tts = new PiperTts(cfg);
      const result = await tts.synthesize({ text: "Bonjour du serveur" });
      expect(result.cached).toBe(false);
      expect(fs.readFileSync(result.path, "utf8")).toContain("stub-server-audio");
      expect(hits).toBe(1);

      // cached — no second HTTP hit
      const again = await tts.synthesize({ text: "Bonjour du serveur" });
      expect(again.cached).toBe(true);
      expect(hits).toBe(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("reports a clear error when the server is unreachable", async () => {
    const cfg = makeConfig({ FRENCH_PIPER_SERVER_URL: "http://127.0.0.1:1" });
    const tts = new PiperTts(cfg);
    try {
      await tts.synthesize({ text: "Bonjour" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as TtsError).code).toBe("SYNTHESIS_FAILED");
      expect((err as TtsError).message).toContain("Cannot reach Piper server");
    }
  });
});

describe("createTts", () => {
  it("exposes config, engine and cache without requiring a player", () => {
    const cfg = makeConfig({ FRENCH_TTS_PLAYER: "no-such-player" });
    const tts = createTts(cfg);
    expect(tts.config.voice).toBe(cfg.voice);
    expect(tts.engine).toBeDefined();
    expect(tts.cache.size()).toBe(0);
    // player is lazy — accessing it throws only now
    expect(() => tts.player).toThrow(/not found/);
  });
});
