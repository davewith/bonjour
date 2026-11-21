# French Learning System — project instructions

Local-first French tutor: a TypeScript learning engine + SQLite + Piper TTS,
tutored through OpenCode agents. No cloud services, no hosted LLMs, no GPU.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm test` | Run the full test suite (vitest) |
| `pnpm typecheck` | TypeScript strict type-check |
| `pnpm french <cmd> --json` | Learning-engine CLI (see `pnpm french --help`) |
| `pnpm french db backup --json` | Snapshot the database to `data/backups/` |
| `pnpm speak -- "text" [--no-play] [--json]` | Local French TTS (generate + play) |
| `pnpm french serve [--port n]` | Local web UI (blocks until Ctrl-C; human-run) |

After changing TypeScript, run `pnpm typecheck` and `pnpm test`.

## Architecture

- `src/db` — `node:sqlite` connection + forward-only SQL migrations (`migrations/`)
- `src/curriculum` — Markdown loader (YAML frontmatter → zod → cross-validation)
- `src/engine` — business logic: profile, sync, attempts, mastery, mistakes, sessions, review, progress
- `src/scheduler` — pure spaced-repetition rules (Leitner ladder, evidence-based mastery)
- `src/tts` — TTS abstraction; Piper implementation with audio cache and player detection
- `src/cli` — `french` engine CLI and `speak` TTS CLI
- `src/server` — local web UI server for `french serve` (127.0.0.1 only; wraps
  engine functions, never re-implements them)
- `ui/` — browser frontend (preact + htm via import map, no build step)
- `curriculum/` — teaching content (source of truth; editable without code changes)
- `.opencode/` — tutor/examiner agents and slash commands
- `data/` — LOCAL ONLY, gitignored: `learning.db`, `audio/` cache, `voices/` models

## Rules

- **Learner data is irreplaceable.** NEVER run `rm`, `mv`, `dd`, `truncate`,
  `shred`, or any shell redirection against `data/` or any `*.db` file — not
  even databases you believe are "stale test leftovers". Progress cannot be
  reconstructed. OpenCode permission rules in `opencode.json` also deny these
  commands; do not attempt to work around them. If you think a database must
  be deleted or reset, ASK THE USER FIRST. Resetting `data/` is a user
  decision (documented in docs/INSTALL.md).
- Tests never touch the live database: `dbPath()` and `openDb()` refuse any
  path under `data/` while `VITEST` is set — every test must pass
  `FRENCH_DB=<temp>` or an explicit `mkdtemp` path.
- Before any risky manual operation on the database, take a snapshot:
  `pnpm french db backup --json` (writes to `data/backups/`, gitignored).
- Business logic lives in `src/`, never in agent prompt files. Agents call the
  CLI; they never run SQL and never edit `data/`.
- The curriculum Markdown is the source of truth; `pnpm french sync` upserts it
  into SQLite. Attempts and mastery are never deleted when curriculum changes.
- No network calls at runtime except optional voice downloads and the optional
  local Piper HTTP server (127.0.0.1). Never add cloud APIs.
- TTS failures must be reported honestly (no claiming audio played).
- Keep dependencies minimal: engine runtime deps are `zod` and `yaml` only;
  the local UI adds just `preact` and `htm` (served unbundled, no CDN).
- Tests must not require a real voice model or audio device (stub `piper` at
  `tests/fixtures/bin/fake-piper`); real-audio checks are manual
  (`docs/MANUAL_TTS_TEST.md`).

## Conventions

- ESM TypeScript, strict mode, imports carry `.js` extensions (NodeNext).
- Timestamps: ISO-8601 UTC strings, millisecond precision.
- CLI JSON contract: `{"ok":true,"data":...}` or `{"ok":false,"error":"..."}`;
  agents always pass `--json` (single-line).
- Curriculum ids are globally unique, lowercase-with-dashes (`a1-01-greetings`).
