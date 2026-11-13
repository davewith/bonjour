import { createTts, TtsError } from "../tts/index.js";
import { parseArgs, flagBool, flagString, flagInt } from "./args.js";

const HELP = `speak — generate and play French audio locally (Piper TTS)

Usage: pnpm speak -- "Bonjour, comment allez-vous ?" [options]

Options:
  --no-play           Generate the audio file but do not play it
  --out <path>        Write the WAV to this path (implies --no-play unless --play given)
  --play              Force playback (default when --out is not used)
  --voice <name>      Override the configured voice (e.g. fr_FR-siwis-low)
  --repeat <n>        Play the audio n times (default 1)
  --json              Single-line JSON output
  --help              Show this help

Environment: FRENCH_PIPER_BIN, FRENCH_PIPER_VOICE, FRENCH_PIPER_DATA_DIR,
FRENCH_TTS_PLAYER, FRENCH_PIPER_SERVER_URL (see docs/TTS.md)
`;

function fail(message: string, json: boolean, hint?: string): never {
  if (json) {
    process.stdout.write(
      JSON.stringify({ ok: false, error: message, hint: hint ?? null }) + "\n",
    );
  } else {
    process.stderr.write(`Error: ${message}\n`);
    if (hint) process.stderr.write(`Hint: ${hint}\n`);
  }
  process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const json = flagBool(args, "json");

  if (flagBool(args, "help") || args.positionals.length === 0) {
    process.stdout.write(HELP);
    process.exit(flagBool(args, "help") ? 0 : 1);
  }

  const text = args.positionals.join(" ").trim();
  const outPath = flagString(args, "out");
  const wantPlay = outPath
    ? flagBool(args, "play")
    : !flagBool(args, "no-play");
  const repeat = flagInt(args, "repeat") ?? 1;
  const voice = flagString(args, "voice");

  try {
    const tts = createTts();
    const result = await tts.synthesize({ text, ...(voice ? { voice } : {}) });

    let finalPath = result.path;
    if (outPath) {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const dest = path.resolve(outPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(result.path, dest);
      finalPath = dest;
    }

    const played: string[] = [];
    if (wantPlay) {
      for (let i = 0; i < Math.max(1, repeat); i++) {
        await tts.play(finalPath);
        played.push(tts.player.name);
      }
    }

    const payload = {
      ok: true,
      data: {
        text: result.text,
        voice: result.voice,
        path: finalPath,
        cached: result.cached,
        played: played.length > 0,
        player: played[0] ?? null,
        repeats: played.length,
      },
    };
    process.stdout.write(
      JSON.stringify(payload, null, json ? undefined : 2) + "\n",
    );
    process.exit(0);
  } catch (err) {
    if (err instanceof TtsError) {
      fail(err.message, json, err.hint);
    }
    fail(err instanceof Error ? err.message : String(err), json);
  }
}

main();
