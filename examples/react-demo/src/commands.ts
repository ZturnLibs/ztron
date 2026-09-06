/**
 * React Demo 的类型化命令，`ztron codegen` 的扫描对象。
 * 与 examples/showcase 同构，命令 id 统一用 "react-demo:" 前缀。
 * 每个命令用 defineCommand 声明，生成 src/ztron-commands.ts 类型绑定。
 */
import { defineCommand } from "@zturnlibs/ztron-core";

export const greet = defineCommand("react-demo:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => `hello, ${args.name}`,
});

export const add = defineCommand("react-demo:add", {
  args: {} as { a: number; b: number },
  result: 0 as number,
  handler: (args) => args.a + args.b,
});

export const echo = defineCommand("react-demo:echo", {
  args: {} as { msg?: string },
  result: "" as string,
  handler: (args) => `echo:${args.msg ?? ""}`,
});
