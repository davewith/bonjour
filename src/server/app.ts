import http from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Db } from "../db/connection.js";
import { sessionPlan } from "../engine/review.js";
import { progressReport } from "../engine/progress.js";
import { listLessons } from "../engine/lessons.js";
import { practiceQueue, type PracticeSource } from "../engine/practice.js";
import { recordAttempt } from "../engine/attempts.js";
import {
  startSession,
  endSession,
  type SessionKind,
} from "../engine/sessions.js";
import {
  createTts,
  TtsError,
  type SynthesisRequest,
  type SynthesisResult,
  type TextToSpeech,
} from "../tts/index.js";
import {
  contentTypeFor,
  safeResolve,
  VENDOR_FILES,
  nodeModulesDir,
  defaultUiDir,
} from "./static.js";

const DEFAULT_PORT = 7373;
const DEFAULT_HOST = "127.0.0.1";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_TTS_CHARS = 1000;

const SESSION_KINDS: SessionKind[] = [
  "lesson",
  "practice",
  "conversation",
  "review",
  "assessment",
];

const PRACTICE_SOURCES: PracticeSource[] = ["due", "mistakes", "weak", "lesson"];

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface ServerOptions {
  /** 0 picks an ephemeral port (tests). Default 7373. */
  port?: number;
  /** Default 127.0.0.1 — the UI is local-only. */
  host?: string;
  uiDir?: string;
  ttsFactory?: () => TextToSpeech;
}

export interface RunningServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  payload: unknown,
): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(
  res: http.ServerResponse,
  status: number,
  error: string,
  hint?: string,
): void {
  sendJson(res, status, { ok: false, error, ...(hint ? { hint } : {}) });
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const contentType = String(req.headers["content-type"] ?? "");
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk as Buffer);
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, "Request body too large");
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) throw new HttpError(400, "Empty request body");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, "JSON body must be an object");
  }
  return parsed as Record<string, unknown>;
}

function requireString(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new HttpError(400, `"${key}" must be a non-empty string`);
  }
  return v;
}

function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new HttpError(400, `"${key}" must be a string`);
  return v;
}

function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") throw new HttpError(400, `"${key}" must be a boolean`);
  return v;
}

function optionalInt(body: Record<string, unknown>, key: string): number | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v)) {
    throw new HttpError(400, `"${key}" must be an integer`);
  }
  return v;
}

function parseQueueParams(url: URL): {
  source: PracticeSource;
  lessonId?: string;
  limit?: number;
} {
  const source = url.searchParams.get("source") ?? "due";
  if (!PRACTICE_SOURCES.includes(source as PracticeSource)) {
    throw new HttpError(
      400,
      `Unknown source "${source}" — expected one of: ${PRACTICE_SOURCES.join(", ")}`,
    );
  }
  const lessonId = url.searchParams.get("lessonId") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  let limit: number | undefined;
  if (limitRaw !== null) {
    limit = Number.parseInt(limitRaw, 10);
    if (Number.isNaN(limit) || limit < 1 || limit > 50) {
      throw new HttpError(400, "limit must be an integer between 1 and 50");
    }
  }
  return { source: source as PracticeSource, ...(lessonId ? { lessonId } : {}), ...(limit !== undefined ? { limit } : {}) };
}

async function sendFile(
  res: http.ServerResponse,
  absolutePath: string,
): Promise<void> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    throw new HttpError(404, "Not found");
  }
  if (!stat.isFile()) throw new HttpError(404, "Not found");
  res.writeHead(200, {
    "content-type": contentTypeFor(absolutePath),
    "content-length": stat.size,
    "cache-control": "no-cache",
  });
  await pipeline(fs.createReadStream(absolutePath), res);
}

function makeSynthesizer(
  factory: () => TextToSpeech,
): (req: SynthesisRequest) => Promise<SynthesisResult> {
  let chain: Promise<unknown> = Promise.resolve();
  return (req: SynthesisRequest): Promise<SynthesisResult> => {
    const tts = factory();
    const run = chain.then(() => tts.synthesize(req));
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

interface HandlerContext {
  db: Db;
  uiDir: string;
}

async function handleApi(
  ctx: HandlerContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const method = req.method ?? "GET";
  const pathname = url.pathname;

  if (method === "GET") {
    switch (pathname) {
      case "/api/plan":
        return sendJson(res, 200, { ok: true, data: sessionPlan(ctx.db) });
      case "/api/progress":
        return sendJson(res, 200, { ok: true, data: progressReport(ctx.db) });
      case "/api/lessons":
        return sendJson(res, 200, { ok: true, data: { lessons: listLessons(ctx.db) } });
      case "/api/practice/queue":
        return sendJson(res, 200, {
          ok: true,
          data: practiceQueue(ctx.db, parseQueueParams(url)),
        });
      default:
        throw new HttpError(404, `Unknown API route: ${pathname}`);
    }
  }

  if (method === "POST") {
    switch (pathname) {
      case "/api/session/start": {
        const body = await readJsonBody(req);
        const kind = requireString(body, "kind");
        if (!SESSION_KINDS.includes(kind as SessionKind)) {
          throw new HttpError(
            400,
            `Unknown kind "${kind}" — expected one of: ${SESSION_KINDS.join(", ")}`,
          );
        }
        const lessonId = optionalString(body, "lessonId");
        const session = startSession(ctx.db, kind as SessionKind, lessonId ?? null);
        return sendJson(res, 200, { ok: true, data: session });
      }
      case "/api/session/end": {
        const body = await readJsonBody(req);
        const id = optionalInt(body, "id");
        if (id === undefined) throw new HttpError(400, '"id" is required');
        const notes = optionalString(body, "notes");
        const session = endSession(ctx.db, id, notes);
        return sendJson(res, 200, { ok: true, data: session });
      }
      case "/api/attempt": {
        const body = await readJsonBody(req);
        const exerciseId = requireString(body, "exerciseId");
        const answer = requireString(body, "answer");
        const correct = optionalBoolean(body, "correct");
        const sessionId = optionalInt(body, "sessionId");
        const note = optionalString(body, "note");

        const exercise = ctx.db
          .prepare("SELECT type, expected_answer, accepted_answers, explanation FROM exercises WHERE id = ?")
          .get(exerciseId) as
          | { type: string; expected_answer: string; accepted_answers: string; explanation: string | null }
          | undefined;
        if (!exercise) {
          throw new HttpError(404, `Unknown exercise id: ${exerciseId}`);
        }

        if (exercise.type === "production" && correct === undefined) {
          let accepted: string[] = [];
          try {
            const parsed: unknown = JSON.parse(exercise.accepted_answers);
            if (Array.isArray(parsed)) accepted = parsed.map(String);
          } catch {
            /* no alternatives */
          }
          return sendJson(res, 200, {
            ok: true,
            data: {
              pending: true,
              exerciseId,
              answer,
              expected: exercise.expected_answer,
              accepted,
              explanation: exercise.explanation,
            },
          });
        }

        const result = recordAttempt(ctx.db, {
          exerciseId,
          answer,
          correct,
          source: "self",
          sessionId: sessionId ?? null,
          note,
        });
        return sendJson(res, 200, { ok: true, data: result });
      }
      default:
        throw new HttpError(404, `Unknown API route: ${pathname}`);
    }
  }

  throw new HttpError(405, `Method not allowed: ${method}`);
}

async function handleTts(
  res: http.ServerResponse,
  url: URL,
  synthesize: (req: SynthesisRequest) => Promise<SynthesisResult>,
): Promise<void> {
  const text = (url.searchParams.get("text") ?? "").trim();
  if (text === "") throw new HttpError(400, 'Missing "text" query parameter');
  if (text.length > MAX_TTS_CHARS) {
    throw new HttpError(400, `text too long (max ${MAX_TTS_CHARS} characters)`);
  }
  const voice = url.searchParams.get("voice") ?? undefined;

  const result = await synthesize({ text, ...(voice ? { voice } : {}) });
  const stat = fs.statSync(result.path);
  res.writeHead(200, {
    "content-type": "audio/wav",
    "content-length": stat.size,
    "cache-control": "public, max-age=3600",
  });
  await pipeline(fs.createReadStream(result.path), res);
}

async function handleRequest(
  ctx: HandlerContext,
  synthesize: (req: SynthesisRequest) => Promise<SynthesisResult>,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const rawUrl = req.url ?? "/";
  const method = req.method ?? "GET";

  try {
    if (rawUrl.startsWith("/api/")) {
      const url = new URL(rawUrl, "http://localhost");
      if (url.pathname === "/api/tts") {
        if (method !== "GET") throw new HttpError(405, `Method not allowed: ${method}`);
        await handleTts(res, url, synthesize);
        return;
      }
      await handleApi(ctx, req, res, url);
      return;
    }
    if (method !== "GET" && method !== "HEAD") {
      throw new HttpError(405, `Method not allowed: ${method}`);
    }
    const urlPath = rawUrl.split("?")[0] ?? "/";
    if (urlPath.startsWith("/vendor/")) {
      const relative = VENDOR_FILES[urlPath];
      if (!relative) throw new HttpError(404, "Not found");
      await sendFile(res, path.join(nodeModulesDir, relative));
      return;
    }
    const requested = safeResolve(
      ctx.uiDir,
      urlPath === "/" ? "/index.html" : urlPath,
    );
    if (!requested) throw new HttpError(400, "Invalid path");
    let target = requested;
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, "index.html");
    }
    await sendFile(res, target);
  } catch (err) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (err instanceof HttpError) {
      sendError(res, err.status, err.message, err.hint);
    } else if (err instanceof TtsError) {
      sendError(res, 503, err.message, err.hint);
    } else {
      sendError(res, 400, err instanceof Error ? err.message : String(err));
    }
  }
}

export async function startServer(
  db: Db,
  options: ServerOptions = {},
): Promise<RunningServer> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const uiDir = options.uiDir ?? defaultUiDir;
  const ttsFactory = options.ttsFactory ?? (() => createTts());
  const synthesize = makeSynthesizer(ttsFactory);

  const ctx: HandlerContext = { db, uiDir };
  const server = http.createServer((req, res) => {
    void handleRequest(ctx, synthesize, req, res);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => reject(err);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://${host}:${address.port}`,
    port: address.port,
    async close(): Promise<void> {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

/** Run until SIGINT/SIGTERM, then shut down cleanly. Used by `french serve`. */
export async function runServer(
  db: Db,
  options: ServerOptions = {},
): Promise<{ url: string }> {
  const running = await startServer(db, options);
  process.stderr.write(
    `French UI: ${running.url}  (Ctrl-C to stop)\n`,
  );
  await new Promise<void>((resolve) => {
    const done = (): void => resolve();
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
  });
  await running.close();
  return { url: running.url };
}
