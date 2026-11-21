import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { openDb, closeDb, type Db } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";
import { syncCurriculum } from "../src/engine/sync.js";
import { initProfile } from "../src/engine/profile.js";
import { startServer, type RunningServer } from "../src/server/app.js";
import { TtsError, type TextToSpeech } from "../src/tts/index.js";

const fixtureRoot = fileURLToPath(
  new URL("./fixtures/curriculum", import.meta.url),
);

let tmpDir: string;
let db: Db;
let server: RunningServer;
let uiDir: string;
let wavPath: string;

function makeTts(mode: "ok" | "error"): () => TextToSpeech {
  return () => ({
    async synthesize(request) {
      if (mode === "error") {
        throw new TtsError("PIPER_MISSING", "Piper not found", "Install piper");
      }
      return { path: wavPath, cached: false, voice: "stub", text: request.text };
    },
  });
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "french-server-"));
  uiDir = path.join(tmpDir, "ui");
  fs.mkdirSync(uiDir);
  fs.writeFileSync(path.join(uiDir, "index.html"), "<html><body>ui-ok</body></html>");
  fs.writeFileSync(path.join(uiDir, "styles.css"), "body{}");
  wavPath = path.join(tmpDir, "stub.wav");
  fs.writeFileSync(
    wavPath,
    Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([36, 0, 0, 0]),
      Buffer.from("WAVEfmt "),
      Buffer.from([16, 0, 0, 0]),
      Buffer.from("fake-wav-payload"),
    ]),
  );

  db = openDb(path.join(tmpDir, "test.db"));
  migrate(db);
  syncCurriculum(db, fixtureRoot);
  initProfile(db, { name: "David" });

  server = await startServer(db, {
    port: 0,
    uiDir,
    ttsFactory: makeTts("ok"),
  });
});

afterAll(async () => {
  await server.close();
  closeDb(db);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec("DELETE FROM mistakes");
  db.exec("DELETE FROM exercise_attempts");
  db.exec("DELETE FROM sessions");
  db.exec("DELETE FROM review_history");
  db.exec("DELETE FROM mastery_history");
  db.exec("DELETE FROM mastery");
});

async function get(pathname: string): Promise<{ status: number; body: string }> {
  const res = await fetch(server.url + pathname);
  return { status: res.status, body: await res.text() };
}

async function getJson(pathname: string): Promise<{
  status: number;
  json: { ok: boolean; data?: any; error?: string };
}> {
  const res = await fetch(server.url + pathname);
  return { status: res.status, json: (await res.json()) as { ok: boolean; data?: any; error?: string } };
}

async function post(
  pathname: string,
  payload: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
): Promise<{
  status: number;
  json: { ok: boolean; data?: any; error?: string };
}> {
  const res = await fetch(server.url + pathname, {
    method: "POST",
    headers,
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
  return {
    status: res.status,
    json: (await res.json()) as { ok: boolean; data?: any; error?: string },
  };
}

function rawGet(pathname: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: server.port,
        path: pathname,
        method: "GET",
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("API endpoints", () => {
  it("serves the session plan", async () => {
    const res = await getJson("/api/plan");
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.data.stats.lessonsTotal).toBe(2);
  });

  it("serves the progress report", async () => {
    const res = await getJson("/api/progress");
    expect(res.status).toBe(200);
    expect(res.json.data.attempts.total).toBe(0);
  });

  it("serves the lesson list", async () => {
    const res = await getJson("/api/lessons");
    expect(res.status).toBe(200);
    const lessons = res.json.data.lessons as Array<{ id: string }>;
    expect(lessons.map((l) => l.id)).toEqual(["a1-01-test", "a1-02-test"]);
  });

  it("serves a sanitised practice queue", async () => {
    const res = await getJson("/api/practice/queue?source=lesson&lessonId=a1-01-test");
    expect(res.status).toBe(200);
    expect(res.json.data.count).toBe(4);
    const body = JSON.stringify(res.json.data.exercises);
    expect(body).not.toContain("expected_answer");
    expect(body).not.toContain("explanation");
  });

  it("rejects unknown queue sources and missing lessons", async () => {
    expect((await getJson("/api/practice/queue?source=evil")).status).toBe(400);
    const res = await getJson("/api/practice/queue?source=lesson&lessonId=nope");
    expect(res.status).toBe(400);
    expect(res.json.ok).toBe(false);
    expect(res.json.error).toMatch(/Unknown lesson/);
  });

  it("starts and ends a session", async () => {
    const started = await post("/api/session/start", { kind: "practice" });
    expect(started.status).toBe(200);
    const id = started.json.data.id as number;
    expect(id).toBeGreaterThan(0);

    const ended = await post("/api/session/end", { id, notes: "browser run" });
    expect(ended.status).toBe(200);
    expect(ended.json.data.ended_at).toBeTruthy();
  });

  it("rejects invalid session kinds", async () => {
    const res = await post("/api/session/start", { kind: "party" });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/Unknown kind/);
  });

  it("records an auto-graded attempt from the browser", async () => {
    const session = await post("/api/session/start", { kind: "review" });
    const sessionId = session.json.data.id as number;

    const res = await post("/api/attempt", {
      exerciseId: "a1-01-ex-translate-hello",
      answer: "bonjour",
      sessionId,
    });
    expect(res.status).toBe(200);
    expect(res.json.data.isCorrect).toBe(true);
    expect(res.json.data.graded).toBe("auto");

    const rows = db
      .prepare("SELECT session_id, source FROM exercise_attempts")
      .all() as Array<{ session_id: number; source: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0]!.session_id).toBe(sessionId);
    expect(rows[0]!.source).toBe("self");
  });

  it("records a mistake for a wrong answer", async () => {
    const res = await post("/api/attempt", {
      exerciseId: "a1-01-ex-fill-merci",
      answer: "nope",
    });
    expect(res.json.data.isCorrect).toBe(false);
    const progress = await getJson("/api/progress");
    expect(progress.json.data.mistakes.open).toBe(1);
  });

  it("asks for a judgement on production exercises, then records it", async () => {
    const pending = await post("/api/attempt", {
      exerciseId: "a1-01-ex-introduce",
      answer: "Bonjour, je m'appelle David",
    });
    expect(pending.status).toBe(200);
    expect(pending.json.data.pending).toBe(true);
    expect(pending.json.data.expected).toBeTruthy();
    expect(pending.json.data.explanation).toBeTruthy();

    const judged = await post("/api/attempt", {
      exerciseId: "a1-01-ex-introduce",
      answer: "Bonjour, je m'appelle David",
      correct: true,
    });
    expect(judged.status).toBe(200);
    expect(judged.json.data.isCorrect).toBe(true);
    expect(judged.json.data.graded).toBe("provided");

    const rows = db.prepare("SELECT COUNT(*) AS n FROM exercise_attempts").get() as {
      n: number;
    };
    expect(Number(rows.n)).toBe(1);
  });

  it("rejects malformed requests", async () => {
    const noType = await post("/api/attempt", { exerciseId: "x" }, {});
    expect(noType.status).toBe(415);

    const badJson = await post("/api/attempt", "{not json");
    expect(badJson.status).toBe(400);

    const missing = await post("/api/attempt", { exerciseId: "nope", answer: "x" });
    expect(missing.status).toBe(404);
    expect(missing.json.ok).toBe(false);

    const unknown = await getJson("/api/nope");
    expect(unknown.status).toBe(404);
  });
});

describe("TTS endpoint", () => {
  it("streams WAV audio", async () => {
    const res = await fetch(`${server.url}/api/tts?text=${encodeURIComponent("Bonjour")}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 4).toString()).toBe("RIFF");
  });

  it("requires non-empty text", async () => {
    const res = await fetch(`${server.url}/api/tts`);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/text/);
  });

  it("reports TTS failures honestly with 503", async () => {
    const failing = await startServer(db, {
      port: 0,
      uiDir,
      ttsFactory: makeTts("error"),
    });
    try {
      const res = await fetch(`${failing.url}/api/tts?text=Bonjour`);
      expect(res.status).toBe(503);
      const json = (await res.json()) as { ok: boolean; error: string; hint?: string };
      expect(json.ok).toBe(false);
      expect(json.error).toMatch(/Piper not found/);
      expect(json.hint).toMatch(/Install piper/);
    } finally {
      await failing.close();
    }
  });
});

describe("static files and security", () => {
  it("serves the UI shell and assets", async () => {
    const index = await get("/");
    expect(index.status).toBe(200);
    expect(index.body).toContain("ui-ok");

    const css = await get("/styles.css");
    expect(css.status).toBe(200);
  });

  it("404s missing files", async () => {
    expect((await get("/missing.js")).status).toBe(404);
  });

  it("serves vendor browser modules from node_modules", async () => {
    const res = await fetch(`${server.url}/vendor/preact.mjs`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
  });

  it("blocks path traversal in raw request paths", async () => {
    const direct = await rawGet("/../package.json");
    expect(direct.status).toBe(400);
    expect(direct.body).not.toContain("french-learning");

    const encoded = await rawGet("/%2e%2e/package.json");
    expect(encoded.status).toBe(400);
    expect(encoded.body).not.toContain("french-learning");

    const viaVendor = await rawGet("/vendor/../package.json");
    expect(viaVendor.status).toBe(404);
    expect(viaVendor.body).not.toContain("french-learning");
  });
});
