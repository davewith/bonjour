import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../db/locations.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wav": "audio/wav",
};

export function contentTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Resolve a URL path inside `root`. Returns null when the (percent-decoded)
 * path escapes root — path traversal defence for the static handlers.
 */
export function safeResolve(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const rel = decoded.replace(/^[/\\]+/, "");
  const abs = path.resolve(root, rel);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) return null;
  return abs;
}

/**
 * Browser modules for the UI, served from node_modules (local-only — the
 * no-network rule forbids CDNs). Keys are exact URL paths.
 */
export const VENDOR_FILES: Record<string, string> = {
  "/vendor/preact.mjs": "preact/dist/preact.mjs",
  "/vendor/preact-hooks.mjs": "preact/hooks/dist/hooks.mjs",
  "/vendor/htm.mjs": "htm/dist/htm.mjs",
  "/vendor/htm-preact.mjs": "htm/preact/index.mjs",
};

export const nodeModulesDir = path.join(repoRoot, "node_modules");

export const defaultUiDir = path.join(repoRoot, "ui");
