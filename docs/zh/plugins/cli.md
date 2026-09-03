---
title: 命令行参数（cli）
---

# 概述

`cli` 模块解析应用启动时的命令行参数（对齐 `@tauri-apps/plugin-cli` 的
JS 绑定）：`getArgv()` 返回原始 argv（含 `argv[0]` 可执行文件），
`getMatches()` 返回按 schema 解析出的 `CliMatches`——旗标到值（`-` 连写
转 camelCase，数字自动强转）、裸位置参数收在 `_`、子命令构成递归树
（`{ name, matches }`）。由 `plugin:cli|*` 两条命令支撑。

```ts
import { getMatches, getArgv } from "@zturnlibs/ztron-api/cli";
// 或从主入口：import { getMatches, getArgv } from "@zturnlibs/ztron-api";
```

# 权限与 Scope

权限：`cli:allow-get-argv`、`cli:allow-get-matches`，权限集
**`cli:default`** 一并授予。无 scope 约束。

解析行为由插件构造参数决定：`cliPlugin({ schema? | subcommands?,
booleans? })`——`schema` 是上游 clap 形态的声明式描述
（`{ description?, args?, subcommands? }`），未给 schema 时按完全宽松的
legacy 规则解析。hello 示例未注册此插件；注册方式（摘自
`packages/core/src/plugins/cli.ts` 的插件形态）：

```ts
import { cliPlugin } from "@zturnlibs/ztron-core";

const cli = cliPlugin({
  schema: {
    description: "my app",
    args: [{ name: "verbose", short: "v", takesValue: false }],
    subcommands: [{ name: "serve", args: [{ name: "port", takesValue: true }] }],
  },
});
```

# 示例

hello 前端未使用该模块——以下为基于 API 签名与上方 schema 的最小用法
（非示例工程运行代码）：

```ts
// 进程参数：myapp --verbose serve --port 8080
const argv = await getArgv();
// ["myapp", "--verbose", "serve", "--port", "8080"]（含 argv[0]）

const m = await getMatches();    // 解析时剥离 argv[0]
m.args.verbose;                  // true —— 根旗标落在根 matches
m.subcommand;
// { name: "serve", matches: { args: { port: 8080 }, subcommand: null } }
m.subcommand!.matches.args.port; // 8080 —— 数字自动强转
// 未被旗标/子命令消费的裸位置参数收进 args._（字符串数组；
// `--` 之后的参数全部计入）
```

# 命令一览

`plugin:cli|*` 共 **2 条**：

| 命令 | API |
| --- | --- |
| `get_argv` | `getArgv()` |
| `get_matches` | `getMatches()` |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/cli)。

适用版本：`ztron 0.3.0`
