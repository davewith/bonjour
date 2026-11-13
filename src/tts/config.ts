import fs from "node:fs";
import path from "node:path";
import { repoRoot, dataDir, audioCacheDir, voicesDir } from "../db/locations.js";

export interface TtsConfig {
  /** Piper executable name or path. */
  piperBin: string;
  /** Voice name, e.g. fr_FR-siwis-medium. */
  voice: string;
  /** Directory containing <voice>.onnx and <voice>.onnx.json. */
  dataDir: string;
  /** WAV cache directory. */
  cacheDir: string;
  /** "auto" detects an installed player; or an explicit executable name. */
  player: string;
  /** Piper length scale (1.0 = normal speed). */
  lengthScale: number;
  /**
   * Optional persistent Piper HTTP server URL (keeps the voice model loaded).
   * When set, synthesis POSTs to <url>/synthesize instead of spawning piper.
   */
  serverUrl: string | null;
}

export const DEFAULT_CONFIG: TtsConfig = {
  piperBin: "piper",
  voice: "fr_FR-siwis-medium",
  dataDir: voicesDir,
  cacheDir: audioCacheDir,
  player: "auto",
  lengthScale: 1.0,
  serverUrl: null,
};

/** Committed defaults; local overrides belong in environment variables. */
const CONFIG_FILE = path.join(repoRoot, "config", "tts.json");

function readConfigFile(): Partial<TtsConfig> {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<TtsConfig>;
    return parsed;
  } catch {
    return {};
  }
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v !== undefined && v.trim() !== "" ? v : undefined;
}

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.join(repoRoot, p);
}

/**
 * Resolve TTS configuration: environment variables > config/tts.json > defaults.
 */
export function loadTtsConfig(overrides: Partial<TtsConfig> = {}): TtsConfig {
  const file = readConfigFile();
  const merged: TtsConfig = {
    piperBin: env("FRENCH_PIPER_BIN") ?? file.piperBin ?? DEFAULT_CONFIG.piperBin,
    voice: env("FRENCH_PIPER_VOICE") ?? file.voice ?? DEFAULT_CONFIG.voice,
    dataDir: resolvePath(
      env("FRENCH_PIPER_DATA_DIR") ?? file.dataDir ?? DEFAULT_CONFIG.dataDir,
    ),
    cacheDir: resolvePath(
      env("FRENCH_TTS_CACHE_DIR") ?? file.cacheDir ?? DEFAULT_CONFIG.cacheDir,
    ),
    player: env("FRENCH_TTS_PLAYER") ?? file.player ?? DEFAULT_CONFIG.player,
    lengthScale: Number(
      env("FRENCH_TTS_LENGTH_SCALE") ??
        file.lengthScale ??
        DEFAULT_CONFIG.lengthScale,
    ),
    serverUrl: env("FRENCH_PIPER_SERVER_URL") ?? file.serverUrl ?? null,
    ...overrides,
  };
  return merged;
}

export { dataDir, voicesDir, audioCacheDir };
