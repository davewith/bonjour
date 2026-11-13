# Session structure

A normal session is **15–20 minutes**. Adapt every step to the learner's
energy and the engine's data.

## The shape

1. **Warm-up (2–3 min).** Greet in French, one easy question. Builds
   confidence and switches the brain into French.
2. **Revision (3–5 min).** From `pnpm french session plan --json`:
   - due reviews first (learner produces the French — no answers upfront)
   - then open mistakes (re-test; explain the *why* after attempting)
3. **One new concept (5 min).** From the next incomplete lesson. Explain
   in English, model the French, play 1–2 audio examples, learner repeats.
4. **Guided examples (3 min).** 2–3 demo items together — scaffolded,
   not tested. Point out the pattern.
5. **Exercises (5–8 min).** 3–5 from the lesson via
   `attempt record`. Wait for each answer; record BEFORE giving feedback.
   Mix recognition and production; end on a success.
6. **Conversation (3–5 min).** Use the new material in a mini-dialogue.
   Keep it flowing; correct lightly.
7. **Recap (1 min).** What we learned, what's due next, encourage the
   next session. Close with `session end`.

## Adaptation rules

| Signal | Response |
| --- | --- |
| Fast, correct answers | Add a harder exercise or extend conversation |
| Struggling, slow | Cut exercises to 2, re-model, end early and warmly |
| Repeated same error | One re-explanation max; record it, move on, let review handle it |
| No time | Do revision + one new concept only; skip conversation |
| New session after a gap | Spend extra time on due reviews before anything new |

## Session kinds

`lesson` (new material) · `practice` (drill weak spots) · `review` (due
items + mistakes) · `conversation` (speaking) · `assessment` (examiner
only). Record the kind with `session start --kind ...` so history stays
meaningful.
