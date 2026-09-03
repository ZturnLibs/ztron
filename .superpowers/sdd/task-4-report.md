# Task 4 Report — 中文「指南」7 页 + CLI 参考

Commit: `2aaead3 docs(zh): guide section (7 pages) + CLI reference`（10 files, 617 insertions，scoped `git add docs/zh/guide docs/zh/reference`）

## 交付文件

- docs/zh/guide/_meta.json、docs/zh/reference/_meta.json（按 brief 原文）
- guide/architecture.md、ipc.md、events.md、window.md、config.md、security.md、tauri-migration.md
- reference/cli.md

## 逐页 fact-check

| 页 | 事实来源 | 校验结果 |
| --- | --- | --- |
| architecture | README 四框图/Packages 表 | 五包职责表逐行照 README；图改为文字描述（框图含制表符不宜复制的部分已转述，内容一致） |
| ipc | commands.ts / main.ts / frontend main.ts | `defineCommand` greet 块、`app.commandDef(greet)`、`app.command("m3:echo-port", …)`、`invoke<string>("my:echo", { msg: "hello-m3" })`、`g.invoke("my:greet", { name: "codegen" })` 全部程序化 diff 通过（verbatim in source = True）；codegen 输出 `src/ztron-commands.ts` 与 codegen.ts:177 一致 |
| events | api/src/event.ts、window.ts | listen/once/emit/emitTo 签名、`UnlistenFn = () => Promise<void>`、TauriEvent 常量与源一致；**WindowEventName 按 window.ts 实际内容原样摘录 13 项**（brief 说 11 项并漏列 `suspended`/`resumed`，以源码为准，并注明二者为移动端生命周期保留、桌面不触发） |
| window | hello ztron.conf.json | 双窗 JSON 块 `json.loads` 结构与源完全相等（verbatim-equal: True）；锚点 SECOND_WINDOW_OK / MULTI_WINDOW_OK / CONF_WINDOW_OK 均见 README 状态表；DESIGN.md §75 注记保留 |
| config | hello ztron.conf.json、core/app.ts ProjectConfigFile | 全文 JSON 与源文件 json 相等（equal: True）；字段表逐项对照 ProjectConfigFile（~L1533）与 KNOWN_TOP_LEVEL；校验行为（未知键 warn、违规 throw）按 validateProjectConfig 描述；含 P2 自动生成预告与不承诺跨平台时间 |
| security | capabilities/main.json、hello main.ts | capability JSON 块逐字节相等（True）；scope 示例 `fsPlugin({ scope: psScope })`、`{ allow: ["$TMP/**"] }`（persisted 基线/store）、`{ url: "https://api.github.com/*" }` 均为源中真实字符串；锚点 ACL_DENY_OK / HTTP_SCOPE_DENY_OK |
| tauri-migration | DESIGN.md §9 | 8 行对照表**逐字符替换为 DESIGN.md 原始行**（含原全角标点与对齐空格），程序化比对 8/8 present |
| cli | cli/index.ts switch（1296–1357）、codegen.ts、signer.ts | 7 个主命令按 switch 分支覆盖；check 语义（FULL_OK + 0 FAIL、--expect/--timeout）按 index.ts USAGE 与 P30 行；signer generate 默认 `minisign.pub`/`minisign.key`、`--pk-file/--sk-file/--password`/ZTRON_SIGNER_PASSWORD 按 signer.ts L53–68；**发现 switch 另有 icon/info/add/migrate 四个辅助命令**（brief 称「共 7 个」不准确），已在文末以一小节如实列出，未展开 |

## 修正记录（自查发现并已修复）

1. 包名笔误：初稿多处把 scope 拼错（ztronlibs，应为 zturnlibs）——实际包名以 packages/*/package.json 为证——已 sed 全量修正并复查 0 残留。（后续历经多轮改名，终态：全库统一 `@zturnlibs/ztron-*`，源码名=发布名、零映射。）
2. WindowEventName 按源码补全 13 项（含 suspended/resumed）。
3. tauri-migration 表格由「语义等价转写」改为 DESIGN.md 原始行逐字符照抄。
4. 路由链接去掉 `/zh` 前缀（rspress.config：zh 为默认语言无前缀）。

## check:locales 输出（验证 1）

exit 1，missing in en/ 共 15 条 = 本任务新增 10 条（7 guide .md + guide/_meta.json + reference/_meta.json + reference/cli.md）+ Task 3 遗留 5 条 start/*。新增列表与所加文件完全一致，无多余项。en 翻译属后续任务。

## 其他验证

- 每页 frontmatter 仅 `title` + 末行 `` 适用版本：`ztron 0.1.0` ``（脚本 8/8 OK）。
- 未运行 pnpm build / rspress（按指示，本机 macOS 26 会死锁）。
- 未触碰 /Users/zyj/Zturn/tauri（只读参考）。

## 遗留 / 建议

- USAGE 字符串缺 codegen/signer（源码自身问题），CLI 页已注明「以 switch 为准」；上游可考虑补全 USAGE。
- en locale 的 guide/reference 翻译待后续任务。
