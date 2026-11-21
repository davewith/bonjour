import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { api, postJson } from "./api.js";
import { SpeakButton } from "./dashboard.js";

const SOURCE_LABELS = {
  due: "Due reviews",
  mistakes: "Open mistakes",
  weak: "Weak areas",
  lesson: "Lesson",
};

const QUEUE_LIMIT = 20;

function sessionKind(source) {
  if (source === "lesson") return "lesson";
  if (source === "due") return "review";
  return "practice";
}

function inputPlaceholder(type) {
  switch (type) {
    case "comprehension":
      return "Your answer…";
    case "production":
      return "Write your answer in French…";
    default:
      return "Type your answer in French…";
  }
}

function ExerciseView({ exercise, sessionId, onNext }) {
  const [answer, setAnswer] = useState("");
  const [submittedAnswer, setSubmittedAnswer] = useState(null);
  const [pending, setPending] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showHint, setShowHint] = useState(false);

  async function send(payload) {
    setBusy(true);
    setError(null);
    try {
      const data = await api("/api/attempt", postJson(payload));
      if (data.pending) {
        setPending(data);
      } else {
        setPending(null);
        setResult(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function submit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const value = answer.trim();
    if (value === "" || busy) return;
    setSubmittedAnswer(value);
    send({
      exerciseId: exercise.id,
      answer: value,
      ...(sessionId ? { sessionId } : {}),
    });
  }

  function judge(correct) {
    if (!pending || busy) return;
    send({
      exerciseId: exercise.id,
      answer: pending.answer,
      correct,
      ...(sessionId ? { sessionId } : {}),
    });
  }

  if (result) {
    return html`
      <div class="feedback ${result.isCorrect ? "ok" : "bad"}">
        <div class="verdict">${result.isCorrect ? "✓ Correct" : "✗ Not quite"}</div>
        <div class="expected">
          <span class="muted">Expected:</span> <b>${result.expectedAnswer}</b>
          <${SpeakButton} text=${result.expectedAnswer} label="🔊 Hear answer" />
        </div>
        ${result.explanation
          ? html`<p class="explanation">${result.explanation}</p>`
          : null}
        ${!result.isCorrect && result.mistakeOpenedId
          ? html`<p class="muted">Added to your mistakes — it will come back sooner.</p>`
          : null}
        ${result.mistakesResolvedIds.length > 0
          ? html`<p class="good-note">Mistake resolved ✓</p>`
          : null}
        ${result.masteryUpdates.length > 0
          ? html`
              <div class="mastery-updates">
                ${result.masteryUpdates.map(
                  (m) => html`
                    <span class="chip">
                      ${m.entityType}: ${m.stateChanged ? `${m.fromState} → ` : ""}${m.toState}
                      (box ${m.box})
                    </span>
                  `,
                )}
              </div>
            `
          : null}
        <button class="btn btn-primary" onClick=${() => onNext(result.isCorrect)}>
          Next →
        </button>
      </div>
    `;
  }

  if (pending) {
    return html`
      <div class="feedback pending">
        <div class="verdict">Compare with the expected answer</div>
        <div class="expected">
          <span class="muted">You wrote:</span> <b>${pending.answer}</b>
        </div>
        <div class="expected">
          <span class="muted">Expected:</span> <b>${pending.expected}</b>
          <${SpeakButton} text=${pending.expected} label="🔊 Hear answer" />
        </div>
        ${pending.accepted.length > 0
          ? html`<p class="muted">Also accepted: ${pending.accepted.join(" · ")}</p>`
          : null}
        ${pending.explanation ? html`<p class="explanation">${pending.explanation}</p>` : null}
        <div class="row">
          <button class="btn btn-primary" onClick=${() => judge(true)} disabled=${busy}>
            ✓ I got it
          </button>
          <button class="btn" onClick=${() => judge(false)} disabled=${busy}>
            ✗ I missed it
          </button>
        </div>
      </div>
    `;
  }

  const isProduction = exercise.type === "production";

  return html`
    <form class="exercise" onSubmit=${submit}>
      <div class="exercise-meta">
        <span class="chip">${exercise.type.replace("_", " ")}</span>
        <span class="muted">${exercise.lessonTitle}</span>
        <${SpeakButton} text=${exercise.prompt} label="🔊 Hear prompt" />
      </div>
      <p class="prompt">${exercise.prompt}</p>

      ${exercise.options
        ? html`
            <div class="options">
              ${exercise.options.map(
                (option, i) => html`
                  <button
                    type="button"
                    class="option"
                    disabled=${busy}
                    onClick=${() => {
                      setSubmittedAnswer(option);
                      send({
                        exerciseId: exercise.id,
                        answer: option,
                        ...(sessionId ? { sessionId } : {}),
                      });
                    }}
                  >
                    <span class="option-letter">${String.fromCharCode(97 + i)}</span>
                    ${option}
                  </button>
                `,
              )}
            </div>
          `
        : html`
            <textarea
              class="answer-input"
              rows=${isProduction ? 3 : 2}
              placeholder=${inputPlaceholder(exercise.type)}
              value=${answer}
              onInput=${(e) => setAnswer(e.target.value)}
              disabled=${busy}
            ></textarea>
          `}

      ${error ? html`<div class="banner error">${error}</div>` : null}

      <div class="row exercise-actions">
        ${exercise.options
          ? null
          : html`
              <button class="btn btn-primary" type="submit" disabled=${busy || answer.trim() === ""}>
                ${busy ? "Checking…" : "Check answer"}
              </button>
            `}
        ${exercise.hint && !showHint
          ? html`
              <button type="button" class="btn" onClick=${() => setShowHint(true)}>
                Show hint
              </button>
            `
          : null}
      </div>
      ${showHint && exercise.hint
        ? html`<p class="hint">Hint: ${exercise.hint}</p>`
        : null}
    </form>
  `;
}

function Picker({ onBegin, navigate }) {
  const [lessons, setLessons] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api("/api/lessons")
      .then((data) => setLessons(data.lessons))
      .catch((err) => setError(err.message));
  }, []);

  return html`
    <div class="stack">
      <header class="page-head">
        <h1>Practice</h1>
        <p class="muted">Pick a queue — every answer updates your mastery.</p>
      </header>
      ${error ? html`<div class="banner error">${error}</div>` : null}
      <div class="tiles tiles-3">
        ${["due", "mistakes", "weak"].map(
          (source) => html`
            <button
              key=${source}
              class="tile tile-button"
              onClick=${() => onBegin(source, null)}
            >
              <div class="tile-label">${SOURCE_LABELS[source]}</div>
              <div class="tile-sub">Start</div>
            </button>
          `,
        )}
      </div>
      <div class="card">
        <h2>By lesson</h2>
        <ul class="list lessons">
          ${lessons.map(
            (lesson) => html`
              <li>
                <span class="chip chip-level">${lesson.level}</span>
                <span class="lesson-title">${lesson.title}</span>
                <span class="muted">${lesson.exerciseCount} exercises</span>
                <button
                  class="btn btn-small"
                  onClick=${() => onBegin("lesson", lesson.id)}
                >
                  Practise
                </button>
              </li>
            `,
          )}
        </ul>
        <button class="btn" onClick=${() => navigate("#/")}>← Dashboard</button>
      </div>
    </div>
  `;
}

function Summary({ source, results, error, onAgain, navigate }) {
  const correct = results.filter((r) => r.correct).length;
  const total = results.length;
  const pct = total === 0 ? 0 : Math.round((correct / total) * 100);

  return html`
    <div class="stack">
      <div class="card summary">
        <h1>${pct}%</h1>
        <p>
          <b>${correct}</b> of <b>${total}</b> correct · ${SOURCE_LABELS[source] ?? source}
        </p>
        ${error ? html`<div class="banner error">${error}</div>` : null}
        <ul class="list">
          ${results.map(
            (r) => html`
              <li>
                <span class=${r.correct ? "mark ok" : "mark bad"}>${r.correct ? "✓" : "✗"}</span>
                <span>${r.prompt}</span>
              </li>
            `,
          )}
        </ul>
        <div class="row">
          <button class="btn btn-primary" onClick=${onAgain}>Practice again</button>
          <button class="btn" onClick=${() => navigate("#/")}>Dashboard</button>
        </div>
      </div>
    </div>
  `;
}

export function Practice({ params, navigate }) {
  const [phase, setPhase] = useState("picker");
  const [source, setSource] = useState("due");
  const [lessonId, setLessonId] = useState(null);
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const sessionRef = useRef(null);

  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (session && !session.ended) {
        session.ended = true;
        fetch(
          "/api/session/end",
          postJson({ id: session.id, notes: "UI session (auto-closed)" }),
        ).catch(() => {});
      }
    },
    [],
  );

  async function begin(nextSource, nextLessonId) {
    setPhase("loading");
    setError(null);
    setSource(nextSource);
    setLessonId(nextLessonId);
    try {
      const qs = new URLSearchParams({ source: nextSource, limit: String(QUEUE_LIMIT) });
      if (nextLessonId) qs.set("lessonId", nextLessonId);
      const queueData = await api(`/api/practice/queue?${qs}`);
      if (queueData.count === 0) {
        setPhase("empty");
        return;
      }
      const session = await api(
        "/api/session/start",
        postJson({
          kind: sessionKind(nextSource),
          ...(nextLessonId ? { lessonId: nextLessonId } : {}),
        }),
      );
      sessionRef.current = { id: session.id, ended: false };
      setQueue(queueData.exercises);
      setIndex(0);
      setResults([]);
      setPhase("quiz");
    } catch (err) {
      setError(err.message);
      setPhase("picker");
    }
  }

  async function finish(resultsOverride) {
    setPhase("summary");
    const finishedResults = resultsOverride ?? results;
    const session = sessionRef.current;
    if (session && !session.ended) {
      session.ended = true;
      const correct = finishedResults.filter((r) => r.correct).length;
      try {
        await api(
          "/api/session/end",
          postJson({
            id: session.id,
            notes: `UI ${source} session: ${correct}/${finishedResults.length}`,
          }),
        );
      } catch (err) {
        setError(`Could not save the session: ${err.message}`);
      }
    }
  }

  function next(wasCorrect) {
    const exercise = queue[index];
    const updated = [...results, { prompt: exercise.prompt, correct: wasCorrect }];
    setResults(updated);
    if (index + 1 >= queue.length) {
      void finish(updated);
    } else {
      setIndex(index + 1);
    }
  }

  if (phase === "picker") {
    return html`<${Picker} onBegin=${begin} navigate=${navigate} />`;
  }
  if (phase === "loading") {
    return html`<p class="muted">Preparing your session…</p>`;
  }
  if (phase === "empty") {
    return html`
      <div class="stack">
        <div class="card">
          <h2>Nothing to practise here</h2>
          <p class="muted">
            ${source === "due"
              ? "No reviews are due right now — try a lesson instead."
              : source === "mistakes"
                ? "No open mistakes — lovely."
                : "No weak areas yet."}
          </p>
          <button class="btn btn-primary" onClick=${() => setPhase("picker")}>
            Choose something else
          </button>
        </div>
      </div>
    `;
  }
  if (phase === "summary") {
    return html`
      <${Summary}
        source=${source}
        results=${results}
        error=${error}
        onAgain=${() => begin(source, lessonId)}
        navigate=${navigate}
      />
    `;
  }

  const exercise = queue[index];
  return html`
    <div class="stack">
      <div class="quiz-head">
        <button class="btn btn-ghost" onClick=${() => void finish()}>← End session</button>
        <div class="progress-dots">
          ${queue.map(
            (_, i) =>
              html`<span
                key=${i}
                class=${i === index ? "dot on" : i < index ? "dot done" : "dot"}
              ></span>`,
          )}
        </div>
        <span class="muted">${index + 1} / ${queue.length}</span>
      </div>
      ${error ? html`<div class="banner error">${error}</div>` : null}
      <div class="card">
        <${ExerciseView}
          key=${exercise.id}
          exercise=${exercise}
          sessionId=${sessionRef.current ? sessionRef.current.id : null}
          onNext=${next}
        />
      </div>
    </div>
  `;
}
