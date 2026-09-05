/**
 * Showcase typed commands —— `ztron codegen` 的扫描对象。
 * 每个命令用 defineCommand 声明，生成 src/ztron-commands.ts 类型绑定。
 */
import { defineCommand } from "@zturnlibs/ztron-core";

export const greet = defineCommand("showcase:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => `hello, ${args.name}`,
});

export const add = defineCommand("showcase:add", {
  args: {} as { a: number; b: number },
  result: 0 as number,
  handler: (args) => args.a + args.b,
});

export const echo = defineCommand("showcase:echo", {
  args: {} as { msg?: string },
  result: "" as string,
  handler: (args) => `echo:${args.msg ?? ""}`,
});
