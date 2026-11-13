-- 001_init.sql — core schema for the French learning engine.
-- Conventions:
--   * Timestamps are ISO-8601 UTC strings with milliseconds (sortable).
--   * *_history and exercise_attempts are append-only audit/evidence tables.
--   * JSON columns are stored as TEXT and validated by the application (zod).

-- ---------------------------------------------------------------------------
-- Learner profile and goals
-- ---------------------------------------------------------------------------
CREATE TABLE learner_profile (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  name           TEXT NOT NULL,
  native_language TEXT NOT NULL DEFAULT 'en',
  cefr_target    TEXT NOT NULL DEFAULT 'A2' CHECK (cefr_target IN ('A1','A2','B1','B2','C1','C2')),
  minutes_per_day INTEGER NOT NULL DEFAULT 20 CHECK (minutes_per_day > 0),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE learner_goals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id  INTEGER NOT NULL REFERENCES learner_profile(id) ON DELETE CASCADE,
  goal        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ---------------------------------------------------------------------------
-- Curriculum content (synced from Markdown files; source of truth is curriculum/)
-- ---------------------------------------------------------------------------
CREATE TABLE lessons (
  id           TEXT PRIMARY KEY,          -- e.g. a1-01-greetings
  level        TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2')),
  ord          INTEGER NOT NULL,
  title        TEXT NOT NULL,
  source_path  TEXT NOT NULL,             -- repo-relative path to the markdown file
  content_hash TEXT NOT NULL,             -- sha256 of the raw file (change detection)
  objectives   TEXT NOT NULL,             -- JSON array of strings
  body         TEXT NOT NULL,             -- markdown body (teaching notes)
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE concepts (
  id          TEXT PRIMARY KEY,           -- globally unique, e.g. a1-01-bonjour-greetings
  lesson_id   TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('grammar','vocabulary','pronunciation','usage')),
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL,              -- one-line english summary
  explanation TEXT NOT NULL DEFAULT '',   -- english explanation (may grow over time)
  ord         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE vocabulary (
  id            TEXT PRIMARY KEY,         -- stable id from curriculum or generated
  lesson_id     TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  french        TEXT NOT NULL,
  english       TEXT NOT NULL,
  ipa           TEXT,
  part_of_speech TEXT,
  example_fr    TEXT,
  example_en    TEXT,
  concept_id    TEXT REFERENCES concepts(id) ON DELETE SET NULL,
  tags          TEXT NOT NULL DEFAULT '[]',  -- JSON array
  ord           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE exercises (
  id               TEXT PRIMARY KEY,      -- stable id from curriculum
  lesson_id        TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  concept_id       TEXT REFERENCES concepts(id) ON DELETE SET NULL,
  vocab_id         TEXT REFERENCES vocabulary(id) ON DELETE SET NULL,
  type             TEXT NOT NULL CHECK (type IN
                     ('translation','fill_blank','multiple_choice','production',
                      'matching','listening','comprehension')),
  prompt           TEXT NOT NULL,         -- may contain French or English
  expected_answer  TEXT NOT NULL,
  accepted_answers TEXT NOT NULL DEFAULT '[]',  -- JSON array of alternative acceptable answers
  options          TEXT,                  -- JSON array for multiple_choice (nullable)
  hint             TEXT,
  explanation      TEXT,                  -- shown after answering
  difficulty       INTEGER NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  ord              INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Learning activity
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('lesson','practice','conversation','review','assessment')),
  lesson_id  TEXT REFERENCES lessons(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ended_at   TEXT,
  notes      TEXT
);

-- Append-only record of every answer.
CREATE TABLE exercise_attempts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id    TEXT NOT NULL REFERENCES exercises(id),
  session_id     INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  learner_answer TEXT NOT NULL,
  is_correct     INTEGER NOT NULL CHECK (is_correct IN (0,1)),
  source         TEXT NOT NULL CHECK (source IN ('tutor','examiner','self')),
  feedback       TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Mistakes that are open until a later correct answer resolves them.
CREATE TABLE mistakes (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id           TEXT NOT NULL REFERENCES exercises(id),
  attempt_id            INTEGER NOT NULL REFERENCES exercise_attempts(id),
  concept_id            TEXT REFERENCES concepts(id) ON DELETE SET NULL,
  vocab_id              TEXT REFERENCES vocabulary(id) ON DELETE SET NULL,
  note                  TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at           TEXT,
  resolved_by_attempt_id INTEGER REFERENCES exercise_attempts(id)
);

-- Mastery per concept or vocabulary item (current state).
CREATE TABLE mastery (
  entity_type    TEXT NOT NULL CHECK (entity_type IN ('concept','vocab')),
  entity_id      TEXT NOT NULL,
  state          TEXT NOT NULL DEFAULT 'new'
                   CHECK (state IN ('new','learning','reviewing','mastered')),
  box            INTEGER NOT NULL DEFAULT 0 CHECK (box BETWEEN 0 AND 6),
  correct_streak INTEGER NOT NULL DEFAULT 0,
  total_correct  INTEGER NOT NULL DEFAULT 0,
  total_incorrect INTEGER NOT NULL DEFAULT 0,
  next_review_at TEXT,
  last_attempt_at TEXT,
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (entity_type, entity_id)
);

-- Append-only state transitions.
CREATE TABLE mastery_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  from_state  TEXT NOT NULL,
  to_state    TEXT NOT NULL,
  reason      TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Append-only spaced-repetition review log.
CREATE TABLE review_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  due_at      TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  result      TEXT NOT NULL CHECK (result IN ('correct','incorrect')),
  box_before  INTEGER NOT NULL,
  box_after   INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_lessons_level_ord ON lessons(level, ord);
CREATE INDEX idx_concepts_lesson ON concepts(lesson_id);
CREATE INDEX idx_vocab_lesson ON vocabulary(lesson_id);
CREATE INDEX idx_exercises_lesson ON exercises(lesson_id);
CREATE INDEX idx_exercises_concept ON exercises(concept_id);
CREATE INDEX idx_attempts_exercise ON exercise_attempts(exercise_id);
CREATE INDEX idx_attempts_created ON exercise_attempts(created_at);
CREATE INDEX idx_attempts_session ON exercise_attempts(session_id);
CREATE INDEX idx_mistakes_open ON mistakes(resolved_at);
CREATE INDEX idx_mastery_next_review ON mastery(next_review_at);
CREATE INDEX idx_review_history_entity ON review_history(entity_type, entity_id);
