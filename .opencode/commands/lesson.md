---
description: Start a structured lesson session (warm-up, revision, one new concept, exercises, conversation, recap)
agent: french-tutor
---

Run a full lesson session. Start with the engine's plan below; if
`lessonsTotal` is 0, first run `pnpm french sync --json` and re-plan.
Open a session with `pnpm french session start --kind lesson --lesson <id> --json`
and close it with `pnpm french session end` when finished.
Teach ONE concept, ask ONE question at a time, record every exercise answer
with `attempt record` — for `production` exercises pass
`--correct true|false` yourself (the engine never auto-grades those) — and
use `pnpm speak` for key pronunciation moments.

Session plan:
!`pnpm french session plan --json`
