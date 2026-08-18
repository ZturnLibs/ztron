/**
 * Example typed commands — used to verify `ztron codegen`.
 * Each command is declared with `defineCommand` so the generator can emit
 * type-safe frontend bindings.
 */
import { defineCommand } from "@ztronlib/core";

export const greet = defineCommand("my:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => `hello, ${args.name}`,
});

export const add = defineCommand("my:add", {
  args: {} as { a: number; b: number },
  result: 0 as number,
  handler: (args) => args.a + args.b,
});

export const echo = defineCommand("my:echo", {
  args: {} as { msg?: string },
  result: "" as string,
  handler: (args) => `echo:${args.msg ?? ""}`,
});
