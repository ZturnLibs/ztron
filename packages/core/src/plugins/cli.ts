/**
 * `plugin:cli|*` — command-line argument parsing.
 * Translated from Tauri's `tauri-plugin-cli` (simplified: clap config is
 * replaced by plain argv parsing — long/short flags, `--` separator,
 * optional subcommands — matching the `getMatches` shape the frontend sees).
 */
import type { Plugin } from "../plugin.js";

export interface CliPluginOptions {
  /** Known subcommand names; the first bare token matching one switches the
   * parser into subcommand mode. */
  subcommands?: string[];
  /** Flags that never consume a value (`--verbose` → `true`). */
  booleans?: string[];
}

/** The `getMatches` return shape (mirrors tauri-plugin-cli's `CliMatches`). */
export interface CliMatches {
  args: Record<string, string | boolean | number | string[]>;
  /** Bare positionals under the `_` key. */
  subcommand: { name: string; matches: CliMatches } | null;
}

function camel(key: string): string {
  return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function coerce(raw: string): string | number {
  const n = Number(raw);
  return raw !== "" && Number.isFinite(n) ? n : raw;
}

/** Parses an argv tail (executable stripped by the caller). */
export function parseArgv(
  argv: readonly string[],
  options: CliPluginOptions = {},
): CliMatches {
  const booleans = new Set(options.booleans ?? []);
  const subcommands = new Set(options.subcommands ?? []);

  const matches: CliMatches = { args: {}, subcommand: null };

  let subMatches: CliMatches | null = null;
  let target: Record<string, string | boolean | number | string[]> =
    matches.args;

  let i = 0;
  for (; i < argv.length; i++) {
    const tok = argv[i]!;

    if (tok === "--") {
      for (const rest of argv.slice(i + 1)) {
        target._ = [...(target._ as string[] ?? []), rest];
      }
      break;
    }

    const isFlag = tok.startsWith("--") || (tok.startsWith("-") && tok.length > 1);
    if (isFlag) {
      let key: string;
      let inline: string | undefined;
      const body = tok.startsWith("--") ? tok.slice(2) : tok.slice(1);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        key = body.slice(0, eq);
        inline = body.slice(eq + 1);
      } else {
        key = body;
      }
      const name = camel(key);
      if (inline !== undefined) {
        target[name] = coerce(inline);
      } else if (booleans.has(key) || booleans.has(name)) {
        target[name] = true;
      } else if (
        i + 1 < argv.length &&
        !argv[i + 1]!.startsWith("-")
      ) {
        target[name] = coerce(argv[++i]!);
      } else {
        target[name] = true;
      }
      continue;
    }

    if (!matches.subcommand && subcommands.has(tok)) {
      subMatches = { args: {}, subcommand: null };
      matches.subcommand = { name: tok, matches: subMatches };
      target = subMatches.args;
      continue;
    }

    target._ = [...((target._ as string[]) ?? []), tok];
  }

  return matches;
}

export function cliPlugin(options: CliPluginOptions = {}): Plugin {
  return {
    name: "cli",
    commands: {
      /** Raw argv including the executable (clap's `env::args`). */
      get_argv: () => tjs.args,
      /** Parsed matches: flags → values, bare tokens → `_`, subcommand tree. */
      get_matches: (): CliMatches => parseArgv(tjs.args.slice(1), options),
    },
    permissions: [
      {
        identifier: "cli:allow-get-argv",
        commands: ["plugin:cli|get_argv"],
      },
      {
        identifier: "cli:allow-get-matches",
        commands: ["plugin:cli|get_matches"],
      },
    ],
    permissionSets: [
      {
        name: "cli:default",
        description: "Allows reading argv and parsed CLI matches.",
        permissions: ["cli:allow-get-argv", "cli:allow-get-matches"],
      },
    ],
  };
}
