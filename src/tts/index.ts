import { AudioCache } from "./cache.js";
import { loadTtsConfig, type TtsConfig } from "./config.js";
import { PiperTts } from "./piper.js";
import { detectPlayer } from "./player.js";
import type {
  AudioPlayer,
  SynthesisRequest,
  SynthesisResult,
  TextToSpeech,
} from "./types.js";

export * from "./types.js";
export { loadTtsConfig, type TtsConfig } from "./config.js";
export { AudioCache } from "./cache.js";
export { detectPlayer, findExecutable } from "./player.js";
export { PiperTts } from "./piper.js";

export interface FrenchTts {
  engine: TextToSpeech;
  player: AudioPlayer;
  config: TtsConfig;
  cache: AudioCache;
  /** Synthesize (cached) then play. */
  speak(request: SynthesisRequest): Promise<SynthesisResult>;
  /** Synthesize only (cached). */
  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;
  /** Play an existing WAV file. */
  play(filePath: string): Promise<void>;
}

/**
 * Build the TTS service. `playerName` overrides the configured player
 * (use "none" to skip playback detection when only synthesizing).
 */
export function createTts(overrides: Partial<TtsConfig> = {}): FrenchTts {
  const config = loadTtsConfig(overrides);
  const engine = new PiperTts(config);
  const cache = new AudioCache(config.cacheDir);
  return {
    engine,
    config,
    cache,
    /** Lazily detected so synthesize-only usage never requires a player. */
    get player(): AudioPlayer {
      return detectPlayer(config.player);
    },
    async synthesize(request) {
      return engine.synthesize(request);
    },
    async speak(request) {
      const result = await engine.synthesize(request);
      await detectPlayer(config.player).play(result.path);
      return result;
    },
    async play(filePath) {
      await detectPlayer(config.player).play(filePath);
    },
  };
}
