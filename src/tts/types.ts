/**
 * TTS abstraction — the learning engine and OpenCode agents depend only on
 * these interfaces, so the underlying engine (Piper today) can be swapped.
 */

export interface SynthesisRequest {
  text: string;
  /** Voice name override (defaults to configured voice). */
  voice?: string;
}

export interface SynthesisResult {
  /** Absolute path of the WAV file (in the audio cache or an explicit out path). */
  path: string;
  /** True when the audio was already cached (no synthesis ran). */
  cached: boolean;
  voice: string;
  text: string;
}

export interface TextToSpeech {
  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;
}

export interface AudioPlayer {
  /** Human-readable player name (e.g. "paplay"). */
  readonly name: string;
  /** Play a WAV file; resolves when playback finishes. */
  play(path: string): Promise<void>;
}

export type TtsErrorCode =
  | "PIPER_MISSING"
  | "VOICE_MISSING"
  | "SYNTHESIS_FAILED"
  | "NO_PLAYER"
  | "PLAYBACK_FAILED"
  | "INVALID_TEXT";

export class TtsError extends Error {
  constructor(
    readonly code: TtsErrorCode,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "TtsError";
  }
}
