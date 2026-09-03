---
title: 调用后端命令
---

命令（command）是前端与后端之间的核心调用方式：前端 `invoke` 一个命令名，
backend 中注册的 handler 执行并返回结果。Ztron 的协议与 Tauri v2 桌面端
对齐（JSON + callback/error id + Channel）。

## 声明类型化命令

在 `src/commands.ts` 中用 `defineCommand` 声明（可被 `ztron codegen`
识别，自动生成前端类型绑定）：

```ts
// src/commands.ts —— 类型化命令（可被 ztron codegen 识别）
import { defineCommand } from "@zturnlibs/ztron-core";

export const greet = defineCommand("my:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => `hello, ${args.name}`,
});
```

## 注册命令

在 `src/main.ts` 的 `AppBuilder` setup 回调内注册。类型化命令用
`commandDef`，无需类型时可内联注册：

```ts
// src/main.ts —— 注册（setup 回调内）
app.commandDef(greet);            // 类型化
app.command("m3:echo-port", () => echoPort);  // 内联
```

## 前端调用

前端直接 `invoke`，泛型参数即返回值类型：

```ts
// frontend/src/main.ts —— 前端调用
import { invoke } from "@zturnlibs/ztron-api";
const echoed = await invoke<string>("my:echo", { msg: "hello-m3" });
```

## codegen：类型安全的 invoke

`ztron codegen` 扫描源码中的 `defineCommand`，在 `src/` 下生成
`ztron-commands.ts` 类型绑定。之后前端可以以完全类型化的方式调用：

```ts
// frontend/src/main.ts —— codegen 之后（摘自 hello 示例第 103–110 行）
const g = await import("../../src/ztron-commands.js");
const greetRes = await g.invoke("my:greet", { name: "codegen" });
// greetRes 的类型由命令声明推导为 string
```

类型真源在 TS 侧（与 Tauri 的 Rust 真源相反），靠 codegen 防止前后端
类型漂移（`CODEGEN_OK` 已在 hello 示例中验证）。

## 命令与安全

命令并非「注册即所有人可调」：每个命令归属某个插件或 core，能否被前端
调用由 capability 中的权限串（如 `fs:allow-read-file`）与 scope 共同
决定——越权调用会在后端被拒绝（验证锚点 `ACL_DENY_OK`）。详见
[安全模型](/guide/security)。

适用版本：`ztron 0.3.0`
