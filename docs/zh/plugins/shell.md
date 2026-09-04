---
title: 命令执行（shell）
---

# 概述

`shell` 模块提供**作用域约束的命令执行**：`execute`（跑完拿全量输出）、
`executeStream`（stdout 块到达即回调）、`open`（用默认浏览器打开 http(s)
链接），以及对齐 Tauri `Command` 类的命令构建器——`on("stdout"/"stderr"/
"status"/"terminated")` 链式监听、`spawn()`、`spawnInteractive()`（长驻
进程：返回 cid，可 `write()` 标准输入、`kill()` 终止）。输出经
`ztron://shell-output` / `ztron://shell-error` / `ztron://shell-terminated`
事件流转。全部由 `plugin:shell|*` 命令支撑（对齐 `tauri-plugin-shell`；
`Command.sidecar()` 直接抛错——Ztron 无 sidecar 打包）。

```ts
import { shell, Command } from "@zturnlibs/ztron-api/shell";
// 或从主入口：import { shell, Command } from "@zturnlibs/ztron-api";
```

# 权限与 Scope

权限：`shell:allow-execute`、`shell:allow-execute-stream`、
`shell:allow-spawn-stream`、`shell:allow-open`（及 `shell:deny-execute`），
权限集 **`shell:default`**。hello 只授 `shell:default` 一条。

Scope 来自插件构造：`shellPlugin({ scope })` 是 `ShellScopeEntry[]`——
每项 `{ program, args? }`，`program` 匹配二进制名或绝对路径（按 basename
兼容），`args` 是 glob 模式（`*` 匹配单个参数、`**` 吞掉任意个）；
**未配置 scope 时全部拒绝**。摘自 `examples/hello/src/main.ts`：

```ts
.plugin(
  shellPlugin({
    scope: [
      { program: "echo", args: ["*"] },
      { program: "pwd" },
      { program: "cat" },
      { program: "sh", args: ["**"] },
    ],
  }),
)
```

# 示例

摘自 `examples/hello/frontend/src/main.ts`（锚点 `SHELL_CWD_OK`、
`SHELL_OPEN_OK`、`SHELL_STREAM_OK`、`SHELL_CMD_CLASS_OK`、
`SHELL_INTERACTIVE_OK:echo-me-back` 为其真实运行输出，注释保留、有删节）：

```ts
// 5f2. shell cwd/env
const pwd = await shell.execute("pwd", [], { cwd: shellTmpDir });

// 5f3. shell.open validates http(s) (rejects file:// without opening)
let openRejected = false;
try {
  await shell.open("file:///etc/hosts");
} catch {
  openRejected = true;
}

// 5f4. shell executeStream (progressive stdout chunks)
const code = await shell.executeStream(
  "sh",
  ["-c", "echo one; sleep 1; echo two; sleep 1; echo three"],
  { onChunk: (c) => chunks.push(c) },
);

// 5f5. shell Command class
const cmd = new shell.Command("sh", ["-c", "echo cmd-class"]);
const cmdResult = await cmd.execute();

// 5f6. shell interactive: spawn cat, write stdin, stream stdout, kill
const lines: string[] = [];
const interactive = new shell.Command("cat", []);
interactive.on("stdout", (chunk) => {
  lines.push(String(chunk));
});
const cid = await interactive.spawnInteractive();
await interactive.write(cid, "echo-me-back\n");
// ... await interactive.kill(cid, 9).catch(() => {});
```

# 命令一览

`plugin:shell|*` 共 **6 条**，与 API 的对应关系：

| 命令 | API |
| --- | --- |
| `execute` | `execute()`（一次拿全量 `ExecResult`） |
| `execute_stream` | `executeStream()` / `Command.execute()` / `Command.spawn()` |
| `spawn_stream` | `Command.spawnInteractive()`（cid 注册表，监听先于 spawn 挂好） |
| `write_stdin` | `Command.write(cid, data)` |
| `kill` | `Command.kill(cid, signal = 15)` |
| `open` | `open(url)`（仅 http(s)） |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/shell)。

适用版本：`ztron 0.3.1`
