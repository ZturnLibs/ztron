/**
 * `plugin:cli|*` — command-line argument parsing.
 * Translated from `tauri-plugin-cli` v2. G18/D5 adds the declarative
 * clap-shaped schema (args/subcommands with takesValue/multiple/required/
 * conflicts/index/default); the legacy flat {subcommands, booleans} shape
 * keeps working (auto-synthesized into a schema).
 */
import type { Plugin } from "../plugin.js";

/** Upstream ArgConfig shape (clap). */
export interface CliArgDef {
  name: string;
  short?: string;
  long?: string;
  valueName?: string;
  takesValue?: boolean;
  multiple?: boolean;
  required?: boolean;
  conflicts?: string[];
  /** 1-based positional slot. */
  index?: number;
  description?: string;
  default?: string | number | boolean | string[];
}

export interface CliSubcommandDef {
  name: string;
  description?: string;
  args?: CliArgDef[];
  subcommands?: CliSubcommandDef[];
}

export interface CliSchema {
  description?: string;
  args?: CliArgDef[];
  subcommands?: CliSubcommandDef[];
}

export interface CliPluginOptions {
  /** Declarative schema (upstream clap form; drives strict features). */
  schema?: CliSchema;
  /** Legacy flat form: known subcommand names. */
  subcommands?: string[];
  /** Legacy flat form: value-less flags. */
  booleans?: string[];
}

/** The `getMatches` return shape (mirrors tauri-plugin-cli's `CliMatches`). */
export interface CliMatches {
  args: Record<string, string | boolean | number | string[]>;
  subcommand: { name: string; matches: CliMatches } | null;
}

function camel(key: string): string {
  return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function coerce(raw: string): string | number {
  const n = Number(raw);
  return raw !== "" && Number.isFinite(n) ? n : raw;
}

interface Compiled {
  byName: Map<string, CliArgDef>;
  byLong: Map<string, CliArgDef>;
  byShort: Map<string, CliArgDef>;
  positional: CliArgDef[];
  subcommands: Map<string, Compiled>;
}

function compileArgs(args: CliArgDef[] | undefined): Omit<Compiled, "subcommands"> {
  const c = {
    byName: new Map<string, CliArgDef>(),
    byLong: new Map<string, CliArgDef>(),
    byShort: new Map<string, CliArgDef>(),
    positional: [] as CliArgDef[],
  };
  for (const a of args ?? []) {
    c.byName.set(camel(a.name), a);
    c.byLong.set(a.long ?? a.name, a);
    if (a.short) c.byShort.set(a.short, a);
    if (a.index) c.positional.push(a);
  }
  return c;
}

function compile(schema: CliSchema): Compiled {
  const base = compileArgs(schema.args);
  const subs = new Map<string, Compiled>();
  for (const sc of schema.subcommands ?? []) {
    const subBase = compileArgs(sc.args);
    const sub: Compiled = {
      ...subBase,
      subcommands: sc.subcommands
        ? compile({ args: [], subcommands: sc.subcommands }).subcommands
        : new Map(),
    };
    subs.set(sc.name, sub);
  }
  return { ...base, subcommands: subs };
}

function legacySchema(options: CliPluginOptions): CliSchema | null {
  if (options.schema) return options.schema;
  if (!options.subcommands && !options.booleans) return null;
  return {
    args: (options.booleans ?? []).map((b) => ({
      name: camel(b),
      long: b,
      takesValue: false,
    })),
    subcommands: (options.subcommands ?? []).map((s) => ({ name: s })),
  };
}

/** Parses one argv scope against its compiled arg table. */
function parseScope(
  argv: readonly string[],
  compiled: Compiled,
  strict: boolean,
): { matches: CliMatches; rest: readonly string[] } {
  const args: Record<string, string | boolean | number | string[]> = {};
  const positional: string[] = [];

  const store = (def: CliArgDef | undefined, key: string, value: string | boolean | number) => {
    const name = def ? camel(def.name) : camel(key);
    if (def?.multiple) {
      const prev = args[name];
      args[name] = Array.isArray(prev)
        ? [...prev, value as string]
        : [value as string];
    } else {
      args[name] = value;
    }
  };

  let i = 0;
  for (; i < argv.length; i++) {
    const tok = argv[i]!;

    if (tok === "--") {
      positional.push(...argv.slice(i + 1));
      i = argv.length;
      break;
    }

    if (tok.startsWith("-") && tok.length > 1) {
      const isLong = tok.startsWith("--");
      const body = isLong ? tok.slice(2) : tok.slice(1);
      const eq = body.indexOf("=");
      const keyRaw = eq >= 0 ? body.slice(0, eq) : body;
      const inline = eq >= 0 ? body.slice(eq + 1) : undefined;

      const def = isLong
        ? compiled.byLong.get(keyRaw)
        : compiled.byShort.get(keyRaw);
      const effDef: CliArgDef | undefined = def;

      if (inline !== undefined) {
        store(effDef, keyRaw, coerce(inline));
        continue;
      }
      if (effDef?.takesValue) {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          store(effDef, keyRaw, coerce(next));
          i++;
        } else {
          store(effDef, keyRaw, "");
        }
        continue;
      }
      /* No declared def: legacy auto-flag semantics (consume next bare
         token as the value when present). Declared-schema strictness
         applies only to required/conflicts, never to unknown flags. */
      if (!effDef) {
        void strict;
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          store(undefined, keyRaw, coerce(next));
          i++;
        } else {
          store(undefined, keyRaw, true);
        }
        continue;
      }
      store(effDef, keyRaw, true);
      continue;
    }

    /* Bare token: subcommand handoff handled by the caller; here it is a
       positional (assigned to indexed defs when declared). */
    positional.push(tok);
  }

  /* Positional assignment: 1-based index per def. */
  for (const def of compiled.positional) {
    const idx = (def.index ?? 1) - 1;
    if (positional[idx] !== undefined) {
      store(def, def.name, coerce(positional[idx]));
    }
  }
  if (positional.length) args._ = positional;

  /* Defaults for declared-but-absent args. */
  for (const def of compiled.byName.values()) {
    const name = camel(def.name);
    if (args[name] === undefined && def.default !== undefined) {
      args[name] = def.default;
    }
  }

  /* required / conflicts validation (declared schema only). */
  const errors: string[] = [];
  for (const def of compiled.byName.values()) {
    const name = camel(def.name);
    if (def.required && args[name] === undefined) {
      errors.push(`missing required argument --${def.long ?? def.name}`);
    }
    if (args[name] !== undefined) {
      for (const c of def.conflicts ?? []) {
        if (args[camel(c)] !== undefined) {
          errors.push(`--${def.long ?? def.name} conflicts with --${c}`);
        }
      }
    }
  }
  if (errors.length) {
    throw new Error("cli: " + errors.join("; "));
  }

  return { matches: { args, subcommand: null }, rest: [] };
}

/** Parses an argv tail (executable stripped by the caller). */
export function parseArgv(
  argv: readonly string[],
  options: CliPluginOptions = {},
): CliMatches {
  const schema = legacySchema(options);
  if (!schema) {
    /* No schema at all: fully lenient legacy parse. */
    return parseScope(argv, compile({}), false).matches;
  }
  const root = compile(schema);

  const walk = (
    tokens: readonly string[],
    compiled: Compiled,
  ): CliMatches => {
    const head = tokens[0];
    const subDef = head !== undefined ? compiled.subcommands.get(head) : undefined;
    if (subDef !== undefined) {
      const sub = walk(tokens.slice(1), subDef);
      return { args: {}, subcommand: { name: head!, matches: sub } };
    }
    /* Split leading bare subcommand token inside the scope: scan for the
       first token that names a subcommand. */
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.startsWith("-")) continue;
      const sub = compiled.subcommands.get(t);
      if (sub !== undefined) {
        const head2 = tokens.slice(0, i);
        const mine = parseScope(head2, compiled, true).matches;
        const nested = walk(tokens.slice(i + 1), sub);
        mine.subcommand = { name: t, matches: nested };
        return mine;
      }
    }
    return parseScope(tokens, compiled, true).matches;
  };

  return walk(argv, root);
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
        description: "Read raw argv and parsed matches.",
        permissions: ["cli:allow-get-argv", "cli:allow-get-matches"],
      },
    ],
  };
}
