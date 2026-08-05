/**
 * Typed command definitions — the compile-time replacement for Tauri's
 * `#[tauri::command]` macro.
 *
 * Usage:
 * ```ts
 * export const greet = defineCommand("greet", {
 *   args: {} as { name: string },
 *   result: "" as string,
 *   handler: (args) => `hello ${args.name}`,
 * });
 * ```
 *
 * `ztron codegen` scans files exporting `defineCommand` results and generates
 * a `ztron:commands` module with type-safe `invoke` overloads.
 */

/** A command name (string literal, e.g. "my:greet"). */
export type CommandName = string;

/** Extracts the args type from a CommandDef. */
export type CommandArgs<T> =
  T extends CommandDef<string, infer A, unknown> ? A : never;

/** Extracts the result type from a CommandDef. */
export type CommandResult<T> =
  T extends CommandDef<string, unknown, infer R> ? R : never;

/** Extracts the name from a CommandDef (literal). */
export type CommandNameOf<T> =
  T extends CommandDef<infer N, unknown, unknown> ? N : never;

/** A typed command definition (runtime handler + type-level metadata). */
export interface CommandDef<
  Name extends CommandName = CommandName,
  Args = unknown,
  Result = unknown,
> {
  readonly __ztron_command: true;
  readonly name: Name;
  readonly argsType: Args;
  readonly resultType: Result;
  readonly handler: (
    args: Args,
    ctx: import("../commands/index.js").CommandContext,
  ) => Result | Promise<Result>;
}

/**
 * Defines a typed command. The generic args/result phantom fields enable
 * `ztron codegen` to emit accurate TypeScript bindings.
 */
export function defineCommand<Name extends CommandName, Args, Result>(
  name: Name,
  spec: {
    args: Args;
    result: Result;
    handler: (
      args: Args,
      ctx: import("../commands/index.js").CommandContext,
    ) => Result | Promise<Result>;
  },
): CommandDef<Name, Args, Result> {
  return {
    __ztron_command: true,
    name,
    argsType: spec.args,
    resultType: spec.result,
    handler: spec.handler,
  };
}

/** Type guard: is this value a CommandDef? */
export function isCommandDef(v: unknown): v is CommandDef {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as Record<string, unknown>).__ztron_command === true
  );
}
