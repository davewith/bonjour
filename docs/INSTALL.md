# Installation

Target: Linux (tested on Ubuntu 20.04, x86_64, CPU-only). Everything runs
offline after these steps.

## 1. Node.js + pnpm

Requires **Node.js ≥ 24** (the engine uses the built-in `node:sqlite`).

```sh
nvm install 24 && nvm use 24     # or your preferred Node install
corepack enable                  # or: npm install -g pnpm
pnpm install
```

Verify:

```sh
pnpm typecheck && pnpm test      # all tests must pass
```

## 2. Piper TTS (local speech)

```sh
uv tool install piper-tts
```

This installs the `piper` command (bundled espeak-ng phonemizer,
onnxruntime CPU backend). Check: `piper --help`.

### French voice

```sh
mkdir -p data/voices
python3 -m piper.download_voices fr_FR-siwis-medium --download-dir data/voices
```

If `python3 -m piper.download_voices` is not found (module lives in the
uv tool venv), use the interpreter that owns `piper`:

```sh
"$(head -n1 "$(command -v piper)" | sed 's/^#!//')" -m piper.download_voices \
  fr_FR-siwis-medium --download-dir data/voices
```

Expected files:

```
data/voices/fr_FR-siwis-medium.onnx        (~63 MB)
data/voices/fr_FR-siwis-medium.onnx.json
```

`data/` is gitignored — voice models never enter the repository.

**Voice choice** (all verified against the Piper voice catalogue):

| Voice | Size | Quality | Notes |
| --- | --- | --- | --- |
| `fr_FR-siwis-medium` | 63 MB | medium | Default; CC-BY-4.0 dataset; on Piper's commercial-use list |
| `fr_FR-siwis-low` | 28 MB | low | Lighter CPU option — set in `config/tts.json` or `FRENCH_PIPER_VOICE` |
| `fr_FR-gilles-low` | 63 MB | low | CC0 dataset alternative |

Licensing: the Piper engine is GPL-3.0; voice rights come from each
voice's training data (see its MODEL_CARD; siwis = CC-BY-4.0 dataset).
Piper is intended for personal use and research — see
https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/LICENSING.md.

### Audio output

Auto-detected in order: `paplay` → `ffplay` → `aplay` → `mpg123` → `play`.
On a typical desktop, install one of:

```sh
sudo apt install pulseaudio-utils   # paplay (recommended on PulseAudio)
# or
sudo apt install ffmpeg             # ffplay
```

## 3. First run

```sh
pnpm french sync --json             # load curriculum → data/learning.db
pnpm speak -- "Bonjour"             # synthesize + play (needs Piper + player)
pnpm french profile init --name "You" --goal "order coffee in Paris" --json
pnpm french session plan --json     # engine says what to teach first
```

## 4. OpenCode

This repo ships `.opencode/agents/`, `.opencode/commands/` and
`opencode.json` — they load automatically when you run `opencode` in the
project. Configure your own model provider in OpenCode (see
`opencode providers`); this project does not ship or require one.

```sh
opencode
/lesson        # start the first lesson
```

### Web UI (optional)

```sh
pnpm french serve
# → French UI: http://127.0.0.1:7373  (Ctrl-C to stop)
```

Opens a local dashboard (due reviews, mastery, mistakes, lessons) and
interactive practice — answer exercises in the browser, hear pronunciation,
self-grade production tasks. It uses the same `data/learning.db` as the
agents, so both stay in sync. Bound to 127.0.0.1 only; nothing is exposed
to the network.

## 5. Verify (manual)

- **Automated:** `pnpm test` (includes a full CLI subprocess test; Piper is
  stubbed — no audio device needed).
- **Real audio:** follow [MANUAL_TTS_TEST.md](MANUAL_TTS_TEST.md).
- **Web UI:** follow [MANUAL_UI_TEST.md](MANUAL_UI_TEST.md).
- **End-to-end:** follow [ACCEPTANCE.md](ACCEPTANCE.md).

## Uninstall / reset

```sh
rm -rf data/            # database, cached audio, voices — all local state
uv tool uninstall piper-tts
```
