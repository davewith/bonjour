import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { api, speak } from "./api.js";

export function SpeakButton({ text, label = "🔊 Hear" }) {
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);

  const onClick = async () => {
    setState("playing");
    setError(null);
    try {
      await speak(text);
      setState("idle");
    } catch (err) {
      setState("error");
      setError(err.message);
    }
  };

  return html`
    <span class="speak">
      <button class="btn btn-audio" onClick=${onClick} disabled=${state === "playing"}>
        ${state === "playing" ? "…" : label}
      </button>
      ${error ? html`<span class="audio-error">${error}</span>` : null}
    </span>
  `;
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function MasteryBar({ overall }) {
  const total = overall.new + overall.learning + overall.reviewing + overall.mastered;
  if (total === 0) {
    return html`<p class="muted">No mastery data yet — answer a few exercises.</p>`;
  }
  const segments = [
    ["new", overall.new],
    ["learning", overall.learning],
    ["reviewing", overall.reviewing],
    ["mastered", overall.mastered],
  ];
  return html`
    <div>
      <div class="mastery-bar">
        ${segments.map(
          ([name, count]) =>
            count > 0
              ? html`<div
                  class=${`mastery-seg state-${name}`}
                  style=${{ width: `${(count / total) * 100}%` }}
                  title=${`${name}: ${count}`}
                ></div>`
              : null,
        )}
      </div>
      <div class="mastery-legend">
        ${segments.map(
          ([name, count]) => html`
            <span class=${`legend-item state-${name}`}><b>${count}</b> ${name}</span>
          `,
        )}
      </div>
    </div>
  `;
}

function StatTile({ label, value, sub }) {
  return html`
    <div class="tile">
      <div class="tile-value">${value}</div>
      <div class="tile-label">${label}</div>
      ${sub ? html`<div class="tile-sub">${sub}</div>` : null}
    </div>
  `;
}

export function Dashboard({ navigate }) {
  const [state, setState] = useState({ phase: "loading" });

  useEffect(() => {
    let alive = true;
    Promise.all([api("/api/plan"), api("/api/progress")])
      .then(([plan, progress]) => {
        if (alive) setState({ phase: "ready", plan, progress });
      })
      .catch((err) => {
        if (alive) setState({ phase: "error", error: err.message });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state.phase === "loading") {
    return html`<p class="muted">Loading your progress…</p>`;
  }
  if (state.phase === "error") {
    return html`<div class="banner error">Could not load progress: ${state.error}</div>`;
  }

  const { plan, progress } = state;
  const name = progress.profile ? progress.profile.name : "there";

  return html`
    <div class="stack">
      <header class="page-head">
        <h1>Bonjour, ${name} 👋</h1>
        <p class="muted">
          ${plan.stats.lessonsComplete} of ${plan.stats.lessonsTotal} lessons complete ·
          overall accuracy ${percent(progress.attempts.accuracy)}
        </p>
      </header>

      <div class="tiles">
        <${StatTile} label="Reviews due" value=${plan.stats.dueCount} />
        <${StatTile} label="Open mistakes" value=${plan.stats.openMistakeCount} />
        <${StatTile} label="Lessons done" value=${plan.stats.lessonsComplete} />
        <${StatTile}
          label="Attempts"
          value=${progress.attempts.total}
          sub=${`${percent(progress.attempts.accuracy)} correct`}
        />
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Today</h2>
          <div class="row">
            <button class="btn" onClick=${() => navigate("#/practice?source=due")}>
              Practice due reviews
            </button>
            <button class="btn" onClick=${() => navigate("#/practice?source=mistakes")}>
              Fix mistakes
            </button>
            <button class="btn" onClick=${() => navigate("#/practice?source=weak")}>
              Weak spots
            </button>
          </div>
        </div>
        ${plan.nextLesson
          ? html`
              <div class="next-lesson">
                <div>
                  <span class="muted">Next lesson</span>
                  <div>
                    <b>${plan.nextLesson.title}</b>
                    <span class="chip">${plan.nextLesson.id}</span>
                  </div>
                  <span class="muted">
                    ${plan.nextLesson.attemptedExercises}/${plan.nextLesson.totalExercises} exercises attempted
                  </span>
                </div>
                <button
                  class="btn btn-primary"
                  onClick=${() =>
                    navigate(`#/practice?source=lesson&lessonId=${plan.nextLesson.id}`)}
                >
                  Start lesson
                </button>
              </div>
            `
          : html`<p class="muted">All lessons complete — nice work.</p>`}
      </div>

      <div class="card">
        <h2>Mastery</h2>
        <${MasteryBar} overall=${progress.mastery.overall} />
      </div>

      <div class="two-col">
        <div class="card">
          <h2>Due for review</h2>
          ${plan.dueReviews.length === 0
            ? html`<p class="muted">Nothing due right now.</p>`
            : html`
                <ul class="list">
                  ${plan.dueReviews.map(
                    (item) => html`
                      <li>
                        <span>${item.title}</span>
                        <span class=${`chip state-${item.state}`}>${item.state}</span>
                        <span class="muted">${percent(item.accuracy)}</span>
                      </li>
                    `,
                  )}
                </ul>
              `}
        </div>

        <div class="card">
          <h2>Weak areas</h2>
          ${plan.weakAreas.length === 0
            ? html`<p class="muted">No weak areas yet — keep practising.</p>`
            : html`
                <ul class="list">
                  ${plan.weakAreas.map(
                    (item) => html`
                      <li>
                        <span>${item.title}</span>
                        <span class="muted">
                          ${percent(item.accuracy)} over ${item.totalAttempts} attempts
                        </span>
                      </li>
                    `,
                  )}
                </ul>
              `}
        </div>
      </div>

      <div class="card">
        <h2>Open mistakes</h2>
        ${plan.openMistakes.length === 0
          ? html`<p class="muted">No open mistakes.</p>`
          : html`
              <ul class="list mistakes">
                ${plan.openMistakes.map(
                  (m) => html`
                    <li>
                      <div class="mistake-prompt">${m.prompt}</div>
                      <div class="mistake-answers">
                        <span class="wrong">you: ${m.learnerAnswer ?? "—"}</span>
                        <span class="right">expected: ${m.expectedAnswer}</span>
                      </div>
                    </li>
                  `,
                )}
              </ul>
              <button class="btn" onClick=${() => navigate("#/practice?source=mistakes")}>
                Practise these
              </button>
            `}
      </div>

      <div class="card">
        <h2>Lessons</h2>
        <ul class="list lessons">
          ${progress.lessons.map(
            (lesson) => html`
              <li>
                <span class="chip chip-level">${lesson.level}</span>
                <span class="lesson-title">${lesson.title}</span>
                <span class=${`chip status-${lesson.status}`}>${lesson.status.replace("_", " ")}</span>
                <span class="muted">${lesson.correctExercises}/${lesson.totalExercises}</span>
                <button
                  class="btn btn-small"
                  onClick=${() =>
                    navigate(`#/practice?source=lesson&lessonId=${lesson.id}`)}
                >
                  Practise
                </button>
              </li>
            `,
          )}
        </ul>
      </div>
    </div>
  `;
}
