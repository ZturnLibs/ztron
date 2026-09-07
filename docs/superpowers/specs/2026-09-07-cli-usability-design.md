# Ztron CLI 可用性与稳定性设计（Volta ENOEXEC 根因修复 + 加固）

- 日期：2026-09-07
- 状态：设计定稿（方案 A；用户委托自主推进，非响应式会话模式）
- 触发：用户 Volta 环境下 `ztron version` 报 ENOEXEC 类 shell 垃圾错误

## 1. 根因（已取证）

`packages/cli/src/index.ts` 首行**缺少 `#!/usr/bin/env node` shebang**（tsc 原样保留到 dist）。
`bin: {ztron: ./dist/index.js}` 安装后是符号链接；内核无 shebang → ENOEXEC → shell 回退把 JS
当 shell 脚本逐行解释：`/**` 被 glob 展开为 `/Applications /Users /bin …`（"`/Applications: is
a directory`"）、`*` 展开命中用户目录中文文件名（"command not found"）、注释反引号 `` `dev` ``
触发命令替换（"syntax error near unexpected token `('"）——三条报错逐字吻合。

**为何未被发现**：npm 官方 bin-links 安装时自动补 shebang（自愈），CI 冒烟全绿；Volta 的
链接器不做该补丁、直接放符号链接，故仅在 Volta（及潜在 pnpm/bun 自有链接路径）下暴露。

## 2. 目标与非目标

### 目标

P0 稳定性：shebang 修复 + 防回归；版本单一来源；help/版本 flag；未知命令友好报错；裸命令
安全默认；统一退出码。P1 诊断：doctor bin 完整性 + 链版本一致性检查；统一错误输出。

### 非目标

- 不引入 commander/yargs（命令面小，手写解析可控）
- 不做交互式向导、命令别名、彩色 logger 库
- 不改各子命令的既有功能行为（dev/build/check/bench 等签名不变）

## 3. 设计（方案 A：现有 parseArgs 增量加固，零新依赖）

### 3.1 Shebang（P0）

- `src/index.ts` 首行加 `#!/usr/bin/env node`（dist 随 tsc 保留）
- 回归单测：断言 `packages/cli/dist/index.js` 首行 === `#!/usr/bin/env node`

### 3.2 版本单一来源（P0）

- 删除 `console.log("ztron 0.3.1")` 硬编码；改为 `createRequire(import.meta.url)("../package.json").version`
- `ztron version`、`ztron --version`、`ztron -v` 等价，输出 `ztron <version>`，exit 0

### 3.3 参数解析与帮助（P0）

parseArgs 重构：首个非 flag 词为命令；`--help`/`-h`、`--version`/`-v` 任意位置可出现。

- `ztron`（裸命令）：**显示 help，exit 0**（废除"默认跑 dev"的危险默认）
- `ztron --help` / `-h`：全局 usage；`ztron <cmd> --help`：该命令一行说明 + 用法
- 未知命令：stderr `✗ 未知命令 "xxx"` + did-you-mean（Levenshtein ≤ 2 的建议，无则列出全部命令）+ `ztron --help` 提示，**exit 2**

### 3.4 退出码约定（P0）

`0` 成功；`1` 运行时失败（doctor FAIL、dev/build 出错）；`2` 用法错误（未知命令、缺参）。全命令统一。

### 3.5 错误输出统一（P1）

`main().catch` → stderr `✗ <err.message>`；`ZTRON_DEBUG=1` 时附加 stack；exit 1。

### 3.6 doctor 增强（P1）

- 检查数 5 → 7：
  6. **cli bin integrity**：入口文件（默认 `dist/index.js`，可注入）首行 shebang 存在 → PASS；缺失 → FAIL + "重装 CLI"
  7. **chain version**：bundled 平台包可解析时对比其 version 与 CLI version（一致 PASS，不一致 FAIL + 重装提示）；平台包不存在（源码/开发模式）→ PASS + 信息性 detail
- `runDoctor` 增加可注入参数：`entryPath?`、`cliVersion?`、`bundledVersion?`（默认从真实环境推导），保持纯函数可测
- 现有断言 5 项 check 的测试同步改为 7 项

## 4. 测试

新增 `tests/unit/cli-usage.test.ts`（spawn 真实 dist）：

1. version/--version/-v 输出 `ztron <pkg.version>` 且 exit 0
2. 裸命令 → exit 0 + "Usage"
3. --help → exit 0；`ztron dev --help` → exit 0 + dev 行说明
4. 未知命令（如 `doctr`）→ exit 2 + stderr 含 `未知命令` 与 `doctor` 建议
5. dist 首行 shebang 断言
6. doctor：entryPath 无 shebang → FAIL；cliVersion≠bundledVersion → FAIL；bundled 缺失 → PASS

现有 doctor/init-hints/native-locate 测试同步更新。全量 `pnpm test` 绿。

## 5. 真机验证

- 本地：`node dist/index.js` 各路径 + `/tmp` 符号链接直执验证内核 shebang 生效
- 发布后（下一版）：用户 `volta install @zturnlibs/ztron-cli@<next>` 重装真机复核
