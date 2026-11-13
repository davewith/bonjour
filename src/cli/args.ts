/**
 * Minimal argument parser for the learning-engine CLI.
 * Supports: subcommand positionals, --flag value, --flag=value, boolean flags,
 * repeated flags (collected into arrays), and `--` to stop flag parsing.
 */

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean | string[]>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};
  let stopped = false;

  const setFlag = (name: string, value: string | boolean): void => {
    const key = name.replace(/^--?/, "");
    const existing = flags[key];
    if (existing === undefined) {
      flags[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(String(value));
    } else {
      flags[key] = [String(existing), String(value)];
    }
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (stopped) {
      positionals.push(arg);
      continue;
    }
    if (arg === "--") {
      stopped = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        setFlag(arg.slice(2, eq), arg.slice(eq + 1));
      } else {
        const name = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          setFlag(name, next);
          i++;
        } else {
          setFlag(name, true);
        }
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        setFlag(arg.slice(1, eq), arg.slice(eq + 1));
      } else {
        const name = arg.slice(1);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          setFlag(name, next);
          i++;
        } else {
          setFlag(name, true);
        }
      }
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, flags };
}

export function flagString(
  args: ParsedArgs,
  name: string,
): string | undefined {
  const v = args.flags[name];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[v.length - 1];
  return undefined;
}

export function flagBool(args: ParsedArgs, name: string): boolean {
  const v = args.flags[name];
  if (v === undefined) return false;
  if (v === true) return true;
  return v === "true" || v === "1" || v === "yes";
}

export function flagList(args: ParsedArgs, name: string): string[] {
  const v = args.flags[name];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v;
  return [];
}

export function flagInt(args: ParsedArgs, name: string): number | undefined {
  const s = flagString(args, name);
  if (s === undefined) return undefined;
  const n = Number.parseInt(s, 10);
  if (Number.isNaN(n)) throw new Error(`--${name} expects an integer, got "${s}"`);
  return n;
}
