# French Learning System

A local-first French tutor for a complete beginner: a TypeScript learning
engine + SQLite + Piper text-to-speech, taught through OpenCode agents.
No cloud services, no hosted LLMs, no GPU, no network needed after setup.

## What you get

- **Structured A1 curriculum** (10 lessons) in editable Markdown —
  greetings through everyday conversation, with vocabulary, grammar,
  exercises, common mistakes and spoken examples.
- **Persistent progress tracking** — every answer recorded in SQLite;
  evidence-based mastery (a concept is "mastered" only after repeated
  correct answers), mistake tracking, spaced-repetition review (Leitner
  ladder: 1/2/4/8/15/30 days).
- **Local French pronunciation** — Piper TTS with the `fr_FR-siwis-medium`
  voice; audio cached on disk; player auto-detection (paplay/ffplay/…).
- **Two OpenCode agents**: `french-tutor` (teaches, practises, records) and
  `french-examiner` (tests without hints, reports strengths/weaknesses) —
  both driven by a structured JSON CLI, never by raw SQL.

## Quick start

```sh
# 1. Dependencies (once)
pnpm install
uv tool install piper-tts                    # Piper TTS engine
python3 -m piper.download_voices fr_FR-siwis-medium --download-dir data/voices
#    (or: ~/.local/share/uv/tools/piper-tts/bin/python -m piper.download_voices ...)

# 2. Load the curriculum into SQLite
pnpm french sync

# 3. Try the TTS (generates + plays audio)
pnpm speak -- "Bonjour, comment allez-vous ?"

# 4. Start learning
opencode
#    then: /lesson      (or /practice /conversation /review /assessment /progress)
```

Full setup details: [docs/INSTALL.md](docs/INSTALL.md).

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm test` | Test suite (97 tests) |
| `pnpm typecheck` | Strict TypeScript check |
| `pnpm french --help` | Learning-engine CLI |
| `pnpm speak -- "text" [--no-play] [--json]` | French TTS |
| `opencode` | Interactive tutor (`/lesson`, `/assessment`, …) |

Engine CLI essentials (always pass `--json` for machine-readable output):

```sh
pnpm french sync --json                      # curriculum → SQLite
pnpm french session plan --json              # what to teach next
pnpm french lesson a1-01-greetings --json    # full lesson detail
pnpm french attempt record --exercise a1-01-ex-hello --answer "Bonjour" --source tutor --json
pnpm french progress --json                  # full progress report
pnpm french review due --json                # spaced-repetition queue
pnpm french mistakes --json                  # open mistakes
```

## Architecture

```
curriculum/*.md  ──sync──►  SQLite (data/learning.db)  ◄── engine CLI (src/)
     ▲                                                    ▲
     │ source of truth                                    │ structured JSON
     │                                                    │
OpenCode agents (french-tutor / french-examiner) ─────────┘
     │
     └── pnpm speak ──► src/tts ──► Piper (local) ──► data/audio/*.wav ──► player
```

| Layer | Location | Depends on |
| --- | --- | --- |
| Learning engine | `src/engine`, `src/scheduler`, `src/curriculum` | `node:sqlite`, zod, yaml |
| TTS service | `src/tts` | Piper binary + voice model (external) |
| CLIs | `src/cli` | the two above |
| OpenCode layer | `.opencode/agents`, `.opencode/commands`, `opencode.json` | CLIs only |
| Curriculum | `curriculum/` | nothing (pure Markdown) |

Business logic never lives in agent prompts; agents never touch SQL or
`data/`. See [AGENTS.md](AGENTS.md) for conventions.

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/INSTALL.md](docs/INSTALL.md) | Full installation & verification |
| [docs/TTS.md](docs/TTS.md) | Voices, licensing, config, persistent server, troubleshooting |
| [docs/MANUAL_TTS_TEST.md](docs/MANUAL_TTS_TEST.md) | Manual real-audio test procedure |
| [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) | End-to-end first-lesson acceptance test |
| [curriculum/methodology/](curriculum/methodology/) | Teaching principles, session structure, CEFR roadmap |

## Local model for OpenCode

This project does not configure any LLM. OpenCode reads your own provider
configuration (`~/.config/opencode/opencode.jsonc` or `opencode providers`).
To run fully locally, point OpenCode at a local server, e.g. Ollama or
llama.cpp with an OpenAI-compatible endpoint, via a custom provider —
nothing in this repo requires a specific provider or model.

## Git hygiene

Tracked: source, curriculum, OpenCode config, docs, tests.
Ignored: `data/` (SQLite DB, generated audio, downloaded voice models),
`node_modules/`, `*.db*`.
