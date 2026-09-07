/**
 * Usage text, command table and help/suggestion helpers — split out of
 * index.ts so tests (and completions) can import them without triggering
 * the CLI's main() side effect.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/* Version lives in package.json (single source of truth) — never hardcode it here. */
export const CLI_VERSION: string = (require("../package.json") as { version: string }).version;

export const COMMAND_HELP: Record<string, string> = {
  init: "ztron init [dir] [--template <name>]   Scaffold a new project (templates: vanilla | react-ts | vue-ts | svelte)",
  doctor: "ztron doctor [--json]                 Check node/cli-bin/native chain health (exit 1 on fail)",
  dev: "ztron dev [--entry <file>]              Bundle + run under the native host + tjs backend",
  build: "ztron build [--entry <file>]            Produce a standalone executable (.app/dmg on macOS)",
  check: "ztron check [--entry <file>] [--timeout <ms>] [--expect TAGS]  Regression run; exit 0 only on FULL_OK",
  bench: "ztron bench [--runs n] [--record] [--no-gui] [--json <path>]  Perf bench gated by perf-budget.json",
  codegen: "ztron codegen                        Typed invoke bindings for your commands",
  icon: "ztron icon [png] [-o outdir]           Generate iconset/icns from a PNG",
  info: "ztron info                              Print project/environment info",
  add: "ztron add <plugin>                      Register a plugin in ztron.conf.json",
  migrate: "ztron migrate                        Migrate ztron.conf.json to the current schema",
  signer: "ztron signer ...                     Minisign key utilities for the updater",
  version: "ztron version                        Print version",
  completions: "ztron completions <bash|zsh|fish|powershell>  Print shell completion scripts (stdout)",
};

export const USAGE = `ztron — Tauri-style desktop framework on txiki.js + system WebView

Usage:
  ztron init [dir] [--template <name>]
                                   Scaffold a new project in [dir] (default .)
                                   (templates: vanilla | react-ts | vue-ts | svelte)
  ztron doctor [--json]            Check node/cli-bin/native chain (exit 1 on fail)
  ztron dev [--entry <file>]       Bundle + run under the native host + tjs backend
  ztron build [--entry <file>]     Produce a standalone executable (.app/dmg on macOS)
  ztron check [--entry <file>] [--timeout <ms>] [--expect TAGS]
                                   Regression run: parse the app's reported
                                   checks; exit 0 only on FULL_OK + no FAILs
                                   (--expect pins required tags, comma-sep)
  ztron bench [--runs n] [--record] [--no-gui] [--json <path>]
                                   Perf bench: multi-round spawn of the
                                   examples/bench app (phase timing, ps RSS
                                   sampling) gated by perf-budget.json
  ztron codegen                    Typed invoke bindings for your commands
  ztron icon [png] [-o outdir]     Generate iconset/icns from a PNG
  ztron info                       Print project/environment info
  ztron add <plugin>               Register a plugin in ztron.conf.json
  ztron migrate                    Migrate ztron.conf.json to the current schema
  ztron signer ...                 Minisign key utilities for the updater
  ztron completions <shell>        Print completion scripts (bash|zsh|fish|powershell)
  ztron version                    Print version
`;

export function printHelp(command: string): void {
  if (command && COMMAND_HELP[command]) {
    console.log(COMMAND_HELP[command]);
    return;
  }
  console.log(`ztron ${CLI_VERSION}`);
  console.log(USAGE);
  console.log("Documentation: https://zturnlibs.github.io/ztron/docs/");
}

export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur: number[] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** Nearest known command within edit distance 2, else undefined. */
export function suggestCommand(input: string): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const c of Object.keys(COMMAND_HELP)) {
    const d = levenshtein(input, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return bestDist <= 2 ? best : undefined;
}
