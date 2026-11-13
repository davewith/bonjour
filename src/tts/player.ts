import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { TtsError, type AudioPlayer } from "./types.js";

/** Find an executable on PATH (no subprocess needed). */
export function findExecutable(name: string, pathEnv = process.env["PATH"]): string | null {
  if (name.includes(path.sep)) {
    try {
      fs.accessSync(name, fs.constants.X_OK);
      return name;
    } catch {
      return null;
    }
  }
  if (!pathEnv) return null;
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

interface PlayerSpec {
  name: string;
  args: (file: string) => string[];
}

/**
 * Player candidates in preference order. paplay (PulseAudio) and ffplay
 * (ffmpeg) are the most reliable on desktop Linux; aplay needs an ALSA
 * device and mpg123/sox are common fallbacks.
 */
const CANDIDATES: PlayerSpec[] = [
  { name: "paplay", args: (f) => [f] },
  { name: "ffplay", args: (f) => ["-nodisp", "-autoexit", "-loglevel", "error", f] },
  { name: "aplay", args: (f) => ["-q", f] },
  { name: "mpg123", args: (f) => ["-q", f] },
  { name: "play", args: (f) => ["-q", f] },
];

function spawnPlayer(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      reject(
        new TtsError("PLAYBACK_FAILED", `Failed to start player "${bin}": ${err.message}`),
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new TtsError(
            "PLAYBACK_FAILED",
            `Player "${bin}" exited with code ${code}: ${stderr.trim()}`,
            "Check that an audio output device is available.",
          ),
        );
    });
  });
}

class ExecutablePlayer implements AudioPlayer {
  constructor(
    readonly name: string,
    private readonly bin: string,
    private readonly makeArgs: (file: string) => string[],
  ) {}

  async play(file: string): Promise<void> {
    await spawnPlayer(this.bin, this.makeArgs(file));
  }
}

/**
 * Detect an available audio player.
 * `preferred` may be an explicit executable name or "auto".
 */
export function detectPlayer(preferred = "auto"): AudioPlayer {
  if (preferred !== "auto") {
    const bin = findExecutable(preferred);
    if (!bin) {
      throw new TtsError(
        "NO_PLAYER",
        `Configured audio player "${preferred}" not found on PATH`,
        "Install it or set FRENCH_TTS_PLAYER to an installed player (paplay, ffplay, aplay...).",
      );
    }
    const spec = CANDIDATES.find((c) => c.name === preferred);
    return new ExecutablePlayer(preferred, bin, spec?.args ?? ((f) => [f]));
  }

  for (const spec of CANDIDATES) {
    const bin = findExecutable(spec.name);
    if (bin) return new ExecutablePlayer(spec.name, bin, spec.args);
  }

  throw new TtsError(
    "NO_PLAYER",
    "No audio player found (tried paplay, ffplay, aplay, mpg123, play)",
    "Install ffmpeg (ffplay) or pulseaudio-utils (paplay).",
  );
}
