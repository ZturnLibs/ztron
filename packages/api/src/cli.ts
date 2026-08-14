/**
 * CLI API — a port of `@tauri-apps/plugin-cli`'s JS bindings.
 */
import { invoke } from "./core.js";

export interface CliMatches {
  args: Record<string, string | boolean | number | string[]>;
  subcommand: { name: string; matches: CliMatches } | null;
}

/** The parsed CLI matches (flags, positionals under `_`, subcommand tree). */
export function getMatches(): Promise<CliMatches> {
  return invoke("plugin:cli|get_matches");
}

/** The raw argv, including the executable (`argv[0]`). */
export function getArgv(): Promise<string[]> {
  return invoke("plugin:cli|get_argv");
}
