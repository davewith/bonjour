import { openDb, closeDb } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { syncCurriculum } from "../engine/sync.js";
import {
  initProfile,
  updateProfile,
  profileView,
  setGoals,
} from "../engine/profile.js";
import { recordAttempt } from "../engine/attempts.js";
import { sessionPlan, dueItems } from "../engine/review.js";
import { progressReport } from "../engine/progress.js";
import { listLessons, getLesson } from "../engine/lessons.js";
import { listVocabulary } from "../engine/vocab.js";
import {
  listOpenMistakes,
  listResolvedMistakes,
  mistakeStats,
} from "../engine/mistakes.js";
import { startSession, endSession, recentSessions } from "../engine/sessions.js";
import {
  parseArgs,
  flagString,
  flagBool,
  flagList,
  flagInt,
  type ParsedArgs,
} from "./args.js";

const HELP = `french — local French learning engine

Usage: pnpm french <command> [options]

Commands:
  sync                          Load curriculum Markdown into the database
  profile init --name <name>    Create the learner profile
  profile show                  Show profile and goals
  profile update [--name ...]   Update profile fields
  profile goals <g> [g...]      Replace learning goals
  lessons                       List lessons
  lesson <id>                   Full lesson detail (objectives, vocab, exercises, spoken examples)
  session plan                  Next-session plan (reviews, mistakes, next lesson)
  session start --kind <k> [--lesson <id>]   Start a session (k: lesson|practice|conversation|review|assessment)
  session end --id <n> [--notes ...]         End a session
  sessions                      Recent sessions
  attempt record --exercise <id> --answer <text> [--correct true|false] [--source tutor|examiner|self] [--session n]
  review due [--limit n]        Items due for spaced review
  mistakes [--resolved]         Open (or resolved) mistakes
  progress                      Full progress report
  vocab [--lesson id] [--search q] [--limit n]

Global options:
  --json      Single-line JSON output (default: pretty JSON)
  --help      Show this help
`;

interface Ctx {
  db: ReturnType<typeof openDb>;
  json: boolean;
}

type Handler = (args: ParsedArgs, ctx: Ctx) => unknown;

function requirePositional(args: ParsedArgs, index: number, name: string): string {
  const v = args.positionals[index];
  if (!v) throw new Error(`Missing required argument: ${name}`);
  return v;
}

function parseCorrect(args: ParsedArgs): boolean | undefined {
  const raw = flagString(args, "correct");
  if (raw === undefined) return undefined;
  if (["true", "1", "yes"].includes(raw.toLowerCase())) return true;
  if (["false", "0", "no"].includes(raw.toLowerCase())) return false;
  throw new Error(`--correct expects true|false, got "${raw}"`);
}

const commands: Record<string, Handler> = {
  sync: (args, _ctx) =>
    syncCurriculum(
      _ctx.db,
      flagString(args, "root") ?? undefined,
    ),

  profile: (args, ctx) => {
    const sub = args.positionals[0];
    if (sub === "init") {
      const name = flagString(args, "name") ?? requirePositional(args, 1, "--name <name>");
      return initProfile(ctx.db, {
        name,
        nativeLanguage: flagString(args, "native"),
        cefrTarget: flagString(args, "target"),
        minutesPerDay: flagInt(args, "minutes"),
        goals: flagList(args, "goal"),
      });
    }
    if (sub === "show") {
      const view = profileView(ctx.db);
      if (!view) throw new Error("No learner profile — run `profile init` first");
      return view;
    }
    if (sub === "update") {
      return updateProfile(ctx.db, {
        name: flagString(args, "name"),
        cefrTarget: flagString(args, "target"),
        minutesPerDay: flagInt(args, "minutes"),
      });
    }
    if (sub === "goals") {
      const goals = args.positionals.slice(1);
      if (goals.length === 0) throw new Error("Provide at least one goal");
      setGoals(ctx.db, goals);
      return { goals };
    }
    throw new Error("Usage: profile <init|show|update|goals>");
  },

  lessons: (_args, ctx) => ({ lessons: listLessons(ctx.db) }),

  lesson: (args, ctx) => {
    const id = requirePositional(args, 0, "<lesson-id>");
    const lesson = getLesson(ctx.db, id);
    if (!lesson) throw new Error(`Unknown lesson: ${id}`);
    return lesson;
  },

  session: (args, ctx) => {
    const sub = args.positionals[0];
    if (sub === "plan") return sessionPlan(ctx.db);
    if (sub === "start") {
      const kind = flagString(args, "kind") ?? "lesson";
      return startSession(
        ctx.db,
        kind as "lesson" | "practice" | "conversation" | "review" | "assessment",
        flagString(args, "lesson"),
      );
    }
    if (sub === "end") {
      const id = flagInt(args, "id");
      if (id === undefined) throw new Error("Missing --id");
      return endSession(ctx.db, id, flagString(args, "notes"));
    }
    throw new Error("Usage: session <plan|start|end>");
  },

  sessions: (_args, ctx) => ({ sessions: recentSessions(ctx.db) }),

  attempt: (args, ctx) => {
    const sub = args.positionals[0];
    if (sub !== "record") throw new Error("Usage: attempt record ...");
    const exerciseId = flagString(args, "exercise");
    if (!exerciseId) throw new Error("Missing --exercise <id>");
    const answer = flagString(args, "answer");
    if (answer === undefined) throw new Error("Missing --answer <text>");
    const source = flagString(args, "source") ?? "tutor";
    if (!["tutor", "examiner", "self"].includes(source))
      throw new Error(`--source must be tutor|examiner|self, got "${source}"`);
    const sessionId = flagInt(args, "session");
    return recordAttempt(ctx.db, {
      exerciseId,
      answer,
      correct: parseCorrect(args),
      source: source as "tutor" | "examiner" | "self",
      sessionId: sessionId ?? null,
      feedback: flagString(args, "feedback"),
      note: flagString(args, "note"),
    });
  },

  review: (args, ctx) => {
    const sub = args.positionals[0];
    if (sub === "due") {
      const limit = flagInt(args, "limit") ?? 10;
      const items = dueItems(ctx.db, new Date(), limit);
      return { count: items.length, items };
    }
    throw new Error("Usage: review due [--limit n]");
  },

  mistakes: (args, ctx) => {
    if (flagBool(args, "resolved")) {
      return { mistakes: listResolvedMistakes(ctx.db) };
    }
    const stats = mistakeStats(ctx.db);
    return { stats, mistakes: listOpenMistakes(ctx.db) };
  },

  progress: (_args, ctx) => progressReport(ctx.db),

  vocab: (args, ctx) => ({
    vocabulary: listVocabulary(ctx.db, {
      lessonId: flagString(args, "lesson"),
      search: flagString(args, "search"),
      limit: flagInt(args, "limit"),
    }),
  }),

  help: () => HELP,
};

function main(): void {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const json = flagBool(args, "json");
  const command = args.positionals[0];

  if (!command || command === "help" || flagBool(args, "help")) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const handler = commands[command];
  if (!handler) {
    emitError(`Unknown command: ${command}\n\n${HELP}`, json);
  }

  const db = openDb();
  try {
    migrate(db); // ensure schema is current before any operation
    const rest: ParsedArgs = { ...args, positionals: args.positionals.slice(1) };
    const result = handler(rest, { db, json });
    emitOk(result, json);
  } catch (err) {
    emitError(err instanceof Error ? err.message : String(err), json);
  } finally {
    closeDb(db);
  }
}

function emitOk(result: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify({ ok: true, data: result }) + "\n");
  } else {
    process.stdout.write(JSON.stringify({ ok: true, data: result }, null, 2) + "\n");
  }
  process.exit(0);
}

function emitError(message: string, json: boolean): never {
  if (json) {
    process.stdout.write(JSON.stringify({ ok: false, error: message }) + "\n");
  } else {
    process.stderr.write(`Error: ${message}\n`);
  }
  process.exit(1);
}

main();
