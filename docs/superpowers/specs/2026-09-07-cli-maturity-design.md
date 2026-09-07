# Ztron CLI 成熟度对齐设计（shell 补全 / info 重写 / 更新提醒 / 输出体验）

- 日期：2026-09-07
- 状态：设计定稿（P0+P1 全做，用户已确认）
- 基准：@tauri-apps/cli（completions/info/add/migrate，源码核实）+ cargo/gh/pnpm/rustup 通行标准

## 1. 目标与非目标

### 目标

P0：`ztron completions <shell>`；`ztron info` 重写（native-locate 感知 + 分组输出）；更新提醒（npm registry 比对）。
P1：TTY 感知着色（NO_COLOR 退化）；`doctor --json`；全局 help 尾部文档链接。

### 非目标

- 不引入 commander/yargs/clack 等依赖（保持零依赖）
- 不做 self-update（npm/volta 分发下的反模式，通知替代）
- 不做 man pages、mobile 子命令（YAGNI，框架未支持）
- 不改各子命令既有功能行为

## 2. 设计

### 2.1 shell 补全（P0）

- `packages/cli/src/completions.ts`：`renderCompletions(shell, spec)` 纯函数 + `COMPLETION_SPEC`（命令 → flags 表）
- 支持 `bash|zsh|fish|powershell`；脚本输出到 stdout，用户自行 source/安装（help 附提示）
- 同步守卫测试：`COMMAND_HELP` 的每个键必须在 `COMPLETION_SPEC` 中（新增命令忘加补全 → 测试红）
- 新命令 `ztron completions <shell>`：无效 shell → 用法错误 exit 2

### 2.2 `ztron info` 重写（P0）

`tools.ts` 的 `printInfo(cwd)` 重写（删掉硬编码 monorepo 路径与 `tjsPath` 参数），三段分组、TTY 着色标题：

- **Environment**：node / platform / cli 版本与路径
- **Native chain**：tjs / ztron-host / webview——复用 `findTjs`/`findHostBin`/`findWebviewLib`（env→walk-up→bundled 全感知），标注来源（bundled/路径）
- **Project**：ztron.conf.json、capabilities/ 存在性

`index.ts` 的 `info` 调用点同步（不再传 `ZTRON_TJS`）。

### 2.3 更新提醒（P0）

`packages/cli/src/update-notifier.ts`：

- `checkForUpdate(opts)`：守卫（非 TTY / `CI` 环境变量 / `ZTRON_NO_UPDATE_NOTIFIER=1` → 静默）
- 缓存 `~/.ztron/update-check.json`（`cachePath` 可注入）：24h TTL；**提示读缓存（零延迟），后台刷新用 unref 定时器**（不阻塞进程退出）
- `fetch https://registry.npmjs.org/@zturnlibs/ztron-cli/latest`，`AbortSignal.timeout(2500)`，任何错误静默
- 发现新版：`↟ ztron <new> 可用 — npm i -g @zturnlibs/ztron-cli`（着色 dim）
- 接入点：`main()` 末尾对非 version/help/completions 的成功命令触发

### 2.4 TTY 着色（P1）

`packages/cli/src/ui.ts`：`green/red/yellow/dim` 包装器；`NO_COLOR` 或非 TTY → 原样返回。doctor/info/notifier 输出接入。

### 2.5 `doctor --json`（P1）

`doctor` case 解析 `--json`：`console.log(JSON.stringify(report, null, 2))`；退出码语义不变（ok=false → 1）。

### 2.6 help 尾部（P1）

全局 help 末尾：`Documentation: https://zturnlibs.github.io/ztron/docs/`。

## 3. 测试

- completions：四种 shell 各含全部命令名；未知 shell exit 2；COMMAND_HELP↔COMPLETION_SPEC 同步守卫
- info：tmp 目录 spawn → 含 "Native chain" 分组与 tjs 解析结果、exit 0
- doctor --json：spawn 解析 stdout JSON → 7 项 checks
- notifier：注入 fetchImpl + cachePath——缓存新鲜且新版 → 返回版本；守卫分支 → null；fetch 失败 → null
- 既有 183 项不回归

## 4. 验证

- 本地 `ztron completions zsh` 生成后 source，验证 `ztron <TAB>` 出命令
- `ztron info` 本机输出三分组
- `ztron doctor --json | node -e 'JSON.parse(...)'` 通过
