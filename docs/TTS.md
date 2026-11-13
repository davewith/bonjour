# Text-to-speech (local Piper)

The TTS layer lives in `src/tts/` behind a small interface so the engine
and agents never depend on Piper directly:

```ts
interface TextToSpeech {
  synthesize(request: { text: string; voice?: string }): Promise<SynthesisResult>;
}
```

Current implementation: `PiperTts` (`src/tts/piper.ts`).

## Configuration

Defaults live in [`config/tts.json`](../config/tts.json); environment
variables override them:

| Env var | Default | Meaning |
| --- | --- | --- |
| `FRENCH_PIPER_BIN` | `piper` | Piper executable |
| `FRENCH_PIPER_VOICE` | `fr_FR-siwis-medium` | Voice name |
| `FRENCH_PIPER_DATA_DIR` | `data/voices` | Directory with `.onnx` + `.onnx.json` |
| `FRENCH_TTS_CACHE_DIR` | `data/audio` | WAV cache directory |
| `FRENCH_TTS_PLAYER` | `auto` | `auto` or an explicit player executable |
| `FRENCH_TTS_LENGTH_SCALE` | `1.0` | Speaking speed (higher = slower) |
| `FRENCH_PIPER_SERVER_URL` | *(unset)* | Use a persistent Piper HTTP server |

## CLI

```sh
pnpm speak -- "Bonjour, comment allez-vous ?"          # generate + play
pnpm speak -- "Merci" --no-play --json                 # generate only
pnpm speak -- "Salut" --out /tmp/s.wav --json          # write a WAV
pnpm speak -- "Bonjour" --repeat 2                     # play twice (replay drill)
pnpm speak -- "Bonjour" --voice fr_FR-siwis-low        # voice override
```

JSON result: `{"ok":true,"data":{"text","voice","path","cached","played","player","repeats"}}`.
Failures return `{"ok":false,"error":...,"hint":...}` with exit code 1 —
**always check `played` before claiming audio was heard.**

## Caching

Audio is content-addressed: `sha256(voice + text + length_scale).wav` in
`data/audio/`. Identical requests never re-run the model (verified by
test: one piper invocation serves N requests). Deleting `data/audio/`
is always safe.

## Latency & the persistent server

Spawning `piper` loads the voice model each call (~1.2–1.6 s on this
machine for siwis-medium, plus synthesis time). Cached repeats are
instant. For lesson-heavy sessions you can run a persistent server that
keeps the model in memory:

```sh
scripts/start-piper-server.sh                      # voice=fr_FR-siwis-medium port=5000
export FRENCH_PIPER_SERVER_URL=http://127.0.0.1:5000
pnpm speak -- "Bonjour"                            # now ~50–200 ms + playback
```

Requires the flask extra: `uv tool install --reinstall "piper-tts[http]"`.
The server binds 127.0.0.1 only; unset the variable to return to CLI mode.
This is optional — caching alone is enough for normal lessons.

## Player detection

`src/tts/player.ts` scans `PATH` in order: `paplay`, `ffplay`, `aplay`,
`mpg123`, `play`. Explicit selection: `FRENCH_TTS_PLAYER=ffplay`.
If none exist, `NO_PLAYER` is reported with an install hint; synthesis
(`--no-play`) still works without any player.

## Error codes

| Code | Meaning | Typical fix |
| --- | --- | --- |
| `PIPER_MISSING` | `piper` not on PATH | `uv tool install piper-tts` |
| `VOICE_MISSING` | `.onnx` not in data dir | download voice (INSTALL.md §2) |
| `SYNTHESIS_FAILED` | piper exited non-zero / server unreachable | run piper manually, check stderr |
| `NO_PLAYER` | no playback binary | install `pulseaudio-utils` or `ffmpeg` |
| `PLAYBACK_FAILED` | player exited non-zero | check audio device/sink |
| `INVALID_TEXT` | empty text | — |

## Swapping engines

Implement `TextToSpeech` and construct it in `src/tts/index.ts`
(`createTts`). Nothing outside `src/tts/` knows about Piper.

## Tests

`tests/tts.test.ts` + `tests/speak.test.ts` use a stub executable
(`tests/fixtures/bin/fake-piper`) — no voice model, no audio device.
Real-audio verification is manual: [MANUAL_TTS_TEST.md](MANUAL_TTS_TEST.md).
