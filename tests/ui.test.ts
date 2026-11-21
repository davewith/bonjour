import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, closeDb, type Db } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";
import { startServer, type RunningServer } from "../src/server/app.js";
import { type TextToSpeech } from "../src/tts/index.js";

let tmpDir: string;
let db: Db;
let server: RunningServer;

const silentTts: () => TextToSpeech = () => ({
  async synthesize() {
    throw new Error("not used in this test");
  },
});

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "french-ui-"));
  db = openDb(path.join(tmpDir, "test.db"));
  migrate(db);
  // default uiDir: the real ui/ shipped with the repo
  server = await startServer(db, { port: 0, ttsFactory: silentTts });
});

afterAll(async () => {
  await server.close();
  closeDb(db);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function fetchStatus(pathname: string): Promise<{
  status: number;
  type: string;
  body: string;
}> {
  const res = await fetch(server.url + pathname);
  return {
    status: res.status,
    type: res.headers.get("content-type") ?? "",
    body: await res.text(),
  };
}

const UI_FILES = [
  "/app.js",
  "/api.js",
  "/dashboard.js",
  "/practice.js",
  "/styles.css",
];

describe("shipped UI", () => {
  it("serves the shell with an import map wired to local vendor files", async () => {
    const index = await fetchStatus("/");
    expect(index.status).toBe(200);
    expect(index.type).toContain("text/html");
    expect(index.body).toContain('src="/app.js"');

    const match = index.body.match(
      /<script type="importmap">([\s\S]*?)<\/script>/,
    );
    expect(match).not.toBeNull();
    const importmap = JSON.parse(match![1]!) as { imports: Record<string, string> };

    const expected = {
      preact: "/vendor/preact.mjs",
      "preact/hooks": "/vendor/preact-hooks.mjs",
      htm: "/vendor/htm.mjs",
      "htm/preact": "/vendor/htm-preact.mjs",
    };
    for (const [specifier, target] of Object.entries(expected)) {
      expect(importmap.imports[specifier]).toBe(target);
      const vendor = await fetchStatus(target);
      expect(vendor.status).toBe(200);
      expect(vendor.type).toContain("text/javascript");
    }
  });

  it("serves every UI module and the stylesheet", async () => {
    for (const pathname of UI_FILES) {
      const res = await fetchStatus(pathname);
      expect(res.status, pathname).toBe(200);
    }
    const css = await fetchStatus("/styles.css");
    expect(css.type).toContain("text/css");
  });

  it("only imports bare specifiers covered by the import map", async () => {
    const index = await fetchStatus("/");
    const importmap = JSON.parse(
      index.body.match(/<script type="importmap">([\s\S]*?)<\/script>/)![1]!,
    ) as { imports: Record<string, string> };
    const mapped = new Set(Object.keys(importmap.imports));

    for (const pathname of UI_FILES.filter((f) => f.endsWith(".js"))) {
      const res = await fetchStatus(pathname);
      const bare = [...res.body.matchAll(/from\s+"([^".][^"]*)"/g)].map(
        (m) => m[1]!,
      );
      for (const specifier of bare) {
        expect(mapped, `${pathname} imports ${specifier}`).toContain(specifier);
      }
      const relative = [...res.body.matchAll(/from\s+"(\.[^"]*)"/g)].map(
        (m) => m[1]!,
      );
      for (const rel of relative) {
        const target = path.posix.join(
          path.posix.dirname(pathname),
          rel.replace(/^\.\//, ""),
        );
        const file = await fetchStatus(`/${target}`);
        expect(file.status, `${pathname} → ${rel}`).toBe(200);
      }
    }
  });
});
