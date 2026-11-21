# Manual UI test

Automated coverage: `tests/server.test.ts` (API), `tests/ui.test.ts` (static
files + import map). This checklist covers what only a real browser can —
rendering, interaction and audio playback. Piper + a real voice model
required; no OpenCode session needed.

Setup:

```sh
pnpm french sync --json
pnpm french serve            # → http://127.0.0.1:7373
```

## Dashboard

1. Open `http://127.0.0.1:7373` — page loads with no console errors
   (DevTools → Console).
2. Stat tiles show due reviews / open mistakes / lessons / attempts.
3. Mastery bar renders with a legend; "Lessons" list shows status chips.

## Practice flow

4. Click **Practice → Due reviews** (or **Start lesson** on the dashboard).
   The quiz shows one exercise with a progress-dot strip.
5. Answer a multiple-choice question by clicking an option → immediate
   ✓/✗ feedback with the expected answer, explanation and a
   **Next →** button.
6. Answer a translation with the text box → Enter or **Check answer**.
7. Use **🔊 Hear answer** — audio plays (or an honest error message if
   Piper/voice is missing; never a silent failure).
8. On a production exercise, submit an answer → the self-grade panel shows
   the expected answer → pick ✓/✗ → feedback, then Next.
9. Finish the queue → summary shows the score and **Practice again** /
   **Dashboard**.

## Shared state

10. Run `pnpm french progress --json` — the browser attempts appear, and
    `pnpm french sessions --json` shows the UI session with its notes.

## Security spot-checks

11. `curl -i http://127.0.0.1:7373/api/plan` — no `access-control-allow-origin`
    header (cross-origin pages cannot read your data).
12. `curl -s "http://127.0.0.1:7373/api/practice/queue?source=lesson&lessonId=a1-01-greetings"`
    — JSON contains no `answer` / `expected_answer` fields.
13. Ctrl-C stops the server; the URL no longer responds.
