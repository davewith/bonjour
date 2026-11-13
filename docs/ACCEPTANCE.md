# Acceptance test — complete first lesson through OpenCode

End-to-end verification that a beginner can start learning: the OpenCode
tutor starts a lesson, introduces a phrase, plays real French audio, gives
an exercise, records the answer in SQLite, and retrieves updated progress.

**Run date:** 2026-11-13 · **Machine:** Ubuntu 20.04, CPU-only ·
**Agent:** `french-tutor` · **Model:** `opencode/deepseek-v4.1-flash-free`
(any configured OpenCode model works; the project does not depend on one)

## Preconditions

- Fresh install: empty database (`data/learning.db` absent), audio cache
  cleared, Piper + `fr_FR-siwis-medium` installed, `paplay` available.
- `pnpm test` and `pnpm typecheck` green.

## Procedure and observed results

### Turn 1 — start the lesson, introduce a phrase, play audio, present exercise

```sh
opencode run --agent french-tutor -m opencode/deepseek-v4.1-flash-free \
  --auto "…start lesson a1-01-greetings; introduce 'Bonjour, comment
  allez-vous ?' and play it; present exercise a1-01-ex-hello without the
  answer; record nothing yet; stop and wait."
```

| Step | Expected | Observed |
| --- | --- | --- |
| Curriculum sync on empty DB | 10 lessons loaded | `lessonsInserted:10, conceptsUpserted:30, vocabularyUpserted:109, exercisesUpserted:58` ✅ |
| Learner profile created | profile row | `{"id":1,"name":"Acceptance",…}` ✅ |
| Session started | lesson session | `{"id":1,"kind":"lesson","lesson_id":"a1-01-greetings"}` ✅ |
| Greeting + phrase introduced | French + English gloss | ✅ output shows both |
| Audio generated **and played** | fresh synth, played | `{"cached":false,"played":true,"player":"paplay"}` — new 84,524-byte WAV in `data/audio/` ✅ |
| Exercise presented without answer | prompt only | ✅ "Translate **"Hello"** into French" — no answer leaked |
| Nothing recorded yet | attempts = 0 | verified via engine: `attempts.total:0` ✅ |

### Turn 2 — learner answers

```sh
opencode run -s <session-id> --auto "My answer: Bonjour"
```

| Step | Expected | Observed |
| --- | --- | --- |
| Answer recorded in SQLite | append-only attempt | `{"attemptId":1,"graded":"auto","isCorrect":true,"source":"tutor","session_id":1}` ✅ |
| Mastery updated | evidence-based | concept `a1-01-greeting-forms` + vocab `a1-01-bonjour`: `new → learning`, box 1, `nextReviewAt` +1 day ✅ |
| Feedback given | correct + why | ✅ "Correct — Bonjour is the safe daytime greeting…" |

### Turn 3 — retrieve progress and close the session

| Step | Expected | Observed |
| --- | --- | --- |
| Progress from engine | real numbers | `attempts:{total:1,correct:1,accuracy:1}`, `mastery:2 learning`, lesson 1 `in_progress 1/6` ✅ |
| Session ended with notes | persisted | `ended_at` set, notes summarise the lesson ✅ |
| Independent DB check (CLI, not through the model) | matches | `pnpm french progress --json` and `pnpm french sessions --json` confirm every figure above ✅ |

### Turn 4 — tutor agent continuity

```sh
opencode run -s <session-id> --agent french-tutor … "report attempts and mastery"
```

Header confirms `> french-tutor`; correct one-line summary returned. ✅

## Verdict

**PASS** — all six required capabilities demonstrated on a fresh database
with real audio playback.

## Notes and caveats

1. **`opencode run -s <id>` does not restore the session agent** — without
   an explicit `--agent`, continuation defaults to `build`. In the
   interactive TUI the session's agent persists normally. Always pass
   `--agent french-tutor` (or `french-examiner`) when scripting runs.
2. `--auto` was used headlessly; explicit `deny` rules still applied
   (the tutor's shell allowlist: `pnpm french*`, `pnpm speak*` only).
3. Audio playback depends on a working audio sink (`paplay` exit 0 and
   audible speech confirmed on this machine). On a machine with no audio
   device, synthesis still works with `--no-play`; the tutor must report
   playback failures honestly.
4. Model quality affects lesson *delivery*; the engine's data contract
   (JSON in/out) is model-independent and covered by 97 automated tests.

## Reproduce

```sh
rm -rf data/learning.db* data/audio/*.wav     # fresh state (keep data/voices)
pnpm test && pnpm typecheck                   # green baseline
# then run the four turns above verbatim
```
