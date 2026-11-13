import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { AudioCache } from "./cache.js";
import { loadTtsConfig, type TtsConfig } from "./config.js";
import { findExecutable } from "./player.js";
import {
  TtsError,
  type SynthesisRequest,
  type SynthesisResult,
  type TextToSpeech,
} from "./types.js";

function runPiper(
  bin: string,
  args: string[],
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      reject(
        new TtsError("SYNTHESIS_FAILED", `Failed to start piper: ${err.message}`),
      );
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr });
    });
  });
}

/**
 * Piper-backed TTS.
 *
 * Two modes:
 *  - CLI (default): spawn `piper -m <voice> --data-dir <dir> -f out.wav -- text`
 *    — simple, offline; the voice model reloads per call (~1-2s on this machine).
 *  - HTTP (config serverUrl): POST to a persistent `piper.http_server`
 *    that keeps the model loaded — lower latency for lesson playback.
 *
 * Results are cached in cacheDir keyed by (voice, text, lengthScale).
 */
export class PiperTts implements TextToSpeech {
  private readonly cache: AudioCache;

  constructor(private readonly config: TtsConfig = loadTtsConfig()) {
    this.cache = new AudioCache(config.cacheDir);
  }

  /** Absolute path to the voice model, or null when missing. */
  voiceModelPath(voice: string): string | null {
    const p = path.join(this.config.dataDir, `${voice}.onnx`);
    return fs.existsSync(p) ? p : null;
  }

  async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    const text = request.text.trim();
    if (text === "") {
      throw new TtsError("INVALID_TEXT", "Cannot synthesize empty text");
    }
    const voice = request.voice ?? this.config.voice;

    const cachedPath = this.cache.get(voice, text, this.config.lengthScale);
    if (cachedPath) {
      return { path: cachedPath, cached: true, voice, text };
    }

    if (this.config.serverUrl) {
      return this.synthesizeViaServer(text, voice);
    }
    return this.synthesizeViaCli(text, voice);
  }

  private async synthesizeViaCli(
    text: string,
    voice: string,
  ): Promise<SynthesisResult> {
    const bin = findExecutable(this.config.piperBin);
    if (!bin) {
      throw new TtsError(
        "PIPER_MISSING",
        `Piper not found ("${this.config.piperBin}" is not on PATH)`,
        'Install with: uv tool install piper-tts  (see docs/TTS.md)',
      );
    }
    if (!this.voiceModelPath(voice)) {
      throw new TtsError(
        "VOICE_MISSING",
        `Voice model not found: ${path.join(this.config.dataDir, voice)}.onnx`,
        `Download it with: piper-download ${voice}  (see docs/TTS.md)`,
      );
    }

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "french-tts-"));
    const outFile = path.join(outDir, "out.wav");
    try {
      const args = [
        "-m",
        voice,
        "--data-dir",
        this.config.dataDir,
        "-f",
        outFile,
        "--length-scale",
        String(this.config.lengthScale),
        "--",
        text,
      ];
      const { code, stderr } = await runPiper(bin, args);
      if (code !== 0 || !fs.existsSync(outFile)) {
        throw new TtsError(
          "SYNTHESIS_FAILED",
          `Piper failed (exit ${code}): ${stderr.trim() || "no output file"}`,
          "Check the voice model and that piper runs manually (docs/TTS.md).",
        );
      }
      const cached = this.cache.put(
        outFile,
        voice,
        text,
        this.config.lengthScale,
      );
      return { path: cached, cached: false, voice, text };
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }

  private async synthesizeViaServer(
    text: string,
    voice: string,
  ): Promise<SynthesisResult> {
    const base = this.config.serverUrl!.replace(/\/$/, "");
    let res: Response;
    try {
      res = await fetch(`${base}/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, length_scale: this.config.lengthScale }),
      });
    } catch (err) {
      throw new TtsError(
        "SYNTHESIS_FAILED",
        `Cannot reach Piper server at ${base}: ${err instanceof Error ? err.message : String(err)}`,
        "Start it with scripts/start-piper-server.sh (see docs/TTS.md), or unset FRENCH_PIPER_SERVER_URL to use the CLI.",
      );
    }
    if (!res.ok) {
      throw new TtsError(
        "SYNTHESIS_FAILED",
        `Piper server returned ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      throw new TtsError("SYNTHESIS_FAILED", "Piper server returned empty audio");
    }
    // Write via cache: copy to temp then put()
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "french-tts-"));
    const tmpFile = path.join(tmpDir, "out.wav");
    try {
      fs.writeFileSync(tmpFile, buf);
      const cached = this.cache.put(tmpFile, voice, text, this.config.lengthScale);
      return { path: cached, cached: false, voice, text };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
