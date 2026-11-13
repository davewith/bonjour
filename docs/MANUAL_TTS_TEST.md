# Manual TTS test (real audio)

Automated tests stub Piper. This procedure verifies real French synthesis
and playback **on the target machine**. Run it after installation or when
changing voices/players.

**Prerequisites:** `piper` installed, `fr_FR-siwis-medium` in
`data/voices/`, at least one player (`paplay` or `ffplay`), an audible
output device.

## Procedure

| # | Step | Expected |
| --- | --- | --- |
| 1 | `command -v piper` | Path printed (e.g. `~/.local/bin/piper`) |
| 2 | `ls data/voices/` | `fr_FR-siwis-medium.onnx` + `.onnx.json` present |
| 3 | `pnpm speak -- "Bonjour" --no-play --json` | `ok:true`, `cached:false`, file exists, size > 0 |
| 4 | Repeat step 3 | `cached:true`, same path (cache works) |
| 5 | `pnpm speak -- "Bonjour, comment allez-vous ?"` | **You hear a woman say the phrase clearly in French**; `played:true`, `player` = installed player |
| 6 | `pnpm speak -- "Merci beaucoup" --repeat 2` | Phrase plays twice |
| 7 | `pnpm speak -- "Où est la gare ?" --no-play --json` then `ffprobe <path>` (or `aplay <path>`) | Valid WAV, duration ≈ 1–3 s, 22050 Hz mono |
| 8 | `FRENCH_PIPER_VOICE=fr_FR-siwis-low pnpm speak -- "Bonjour" --no-play --json` after downloading that voice | Different voice synthesizes (or `VOICE_MISSING` if not downloaded — expected) |
| 9 | `pnpm speak -- "Bonjour" --json` with `piper` temporarily renamed off PATH | `ok:false`, `error` contains "Piper not found", `hint` mentions `uv tool install` |
| 10 | Disconnect/blank audio (optional): `FRENCH_TTS_PLAYER=nope pnpm speak -- "Bonjour" --json` | `ok:false`, clear player error — **never** a success claim |

## Recording results

| Step | Result | Notes |
| --- | --- | --- |
| 1–4 | | |
| 5 | | |
| 6–7 | | |
| 8–10 | | |

**Honesty rule:** the tutor and this project must never claim audio played
unless the command returned `played:true` (or the human heard it).
