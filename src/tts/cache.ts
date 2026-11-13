import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ensureDir } from "../db/locations.js";

/**
 * Content-addressed WAV cache: identical (voice, text, speed) requests
 * never regenerate audio.
 */
export class AudioCache {
  constructor(readonly dir: string) {}

  key(voice: string, text: string, lengthScale: number): string {
    return createHash("sha256")
      .update(JSON.stringify({ voice, text, lengthScale }))
      .digest("hex");
  }

  pathFor(voice: string, text: string, lengthScale: number): string {
    return path.join(this.dir, `${this.key(voice, text, lengthScale)}.wav`);
  }

  get(voice: string, text: string, lengthScale: number): string | null {
    const p = this.pathFor(voice, text, lengthScale);
    try {
      const stat = fs.statSync(p);
      return stat.size > 0 ? p : null;
    } catch {
      return null;
    }
  }

  /** Atomically place a freshly generated file into the cache. */
  put(sourcePath: string, voice: string, text: string, lengthScale: number): string {
    ensureDir(this.dir);
    const target = this.pathFor(voice, text, lengthScale);
    const tmp = `${target}.tmp-${process.pid}`;
    fs.copyFileSync(sourcePath, tmp);
    fs.renameSync(tmp, target);
    return target;
  }

  size(): number {
    try {
      return fs.readdirSync(this.dir).filter((f) => f.endsWith(".wav")).length;
    } catch {
      return 0;
    }
  }
}
