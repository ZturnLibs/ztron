# Ztron 新手上手旅程设计（Tauri 式 onboarding）

- 日期：2026-09-03
- 状态：设计定稿（用户委托自主推进，spec 待用户审阅）
- 分支：`feat/onboarding`
- 参照物：tauri.app/start/ 新手旅程（Try → Prerequisites → First App → 深入）

## 1. 目标与非目标

### 目标

让新用户以与 Tauri 同构的低摩擦路径上手 Ztron：**装 CLI → `ztron init` → `ztron dev` 出原生窗口 → `ztron build` 打包**，全程不要求理解 monorepo、不 clone 框架源码（除一次性原生链编译）。

三条工作流：

| 工作流 | 交付物 | 解决的摩擦 |
| --- | --- | --- |
| W1 发布基建 | `@zturnlibs/ztron-*` 发布到 npmjs.com 公共源 | 新手装 CLI 不需要 GitHub PAT |
| W2 CLI DX | `ztron doctor` 体检命令 + `init` 引导增强 | 排障成本、init 后迷路 |
| W3 文档旅程 | docs `start/` 四页重写为 Tauri 式旅程 | 无引导主线、贡献者流程当用户流程 |

### 非目标

- 不做交互式模板选择器（当前只有一个模板，YAGNI；`create-tauri-app` 级向导待多模板出现再说）
- 不做预编译原生链分发（GitHub Releases 挂二进制）——列为后续演进，本期用"一次性 clone 编译"如实呈现
- 不改 Windows/Linux 支持状态（仍是骨架，旅程文档如实声明 macOS-only）
- 不动 guide/reference 已有页面（旅程只重写 `start/`）

## 2. 现状事实（设计依据）

- `ztron dev` 的原生二进制解析已有三重机制：env `ZTRON_TJS` / `ZTRON_HOST_BIN` / `ZTRON_WEBVIEW_LIB`，或从项目目录向上 walk-up 找 `native/libs/`（`packages/cli/src/index.ts` 的 `findTjs`/`findNativeFile`）——独立项目脱离 monorepo 运行的逃生口已存在
- `ztron init` 生成的就是独立项目形态（`@zturnlibs/ztron-*: latest` 依赖，非 `workspace:*`），CLI 包有 `bin: ztron` 字段
- 包当前发布到 `npm.pkg.github.com`（新手需 PAT 配 `.npmrc`）；仓库已转 public（2026-09-03），发 npmjs 公共源的条件已具备
- docs `start/` 现状是贡献者流程（clone → `pnpm install` → `build-native.sh` → monorepo 内跑 example），`_meta.json` 顺序 `intro, install, quick-start, examples`
- Tauri 旅程参照结构：Try（一行 `create-tauri-app`）→ Prerequisites（分平台）→ First App 分步教程（结构/改 UI/调用后端命令）→ 深入区

## 3. W1 发布基建

`publish.yml` 在现有 GitHub Packages 发布 job 之后新增 npmjs job：

- `registry-url: https://registry.npmjs.org`，scope `@zturnlibs`，`NODE_AUTH_TOKEN` 用 secret `NPM_TOKEN`
- 发布命令带 `--access public`（scoped 公共包要求）；仅 `main` 上 tag `v*` 触发（沿用现有触发）
- 失败不阻塞 GitHub Packages 通道（两个 job 互相独立）
- **外部一次性操作（用户）**：npmjs.com 创建 `@zturnlibs` org/账号 + automation token → 仓库 Settings → Secrets → `NPM_TOKEN`
- **降级路径**：`NPM_TOKEN` 未配置时该 job 失败不影响既有发布；文档（W3）安装段提供 GitHub Packages PAT fallback 写法，npmjs 可用后主线切换

## 4. W2 CLI DX

### 4.1 `ztron doctor`

- 输出检查表，逐项 PASS/FAIL + 修复提示：
  1. Node ≥ 20（`process.version`）
  2. `tjs`：`ZTRON_TJS` → PATH 探测（复用 `findTjs`）；FAIL 提示"clone ztron 后跑 `scripts/build-native.sh`，并 `export ZTRON_TJS=<repo>/native/libs/tjs`"
  3. `ztron-host`：`ZTRON_HOST_BIN` → walk-up `native/libs/`（复用 `findNativeFile`）；FAIL 提示同上
  4. webview lib：`ZTRON_WEBVIEW_LIB` → walk-up；FAIL 提示同上
  5. 平台提示：非 macOS 输出 WARNING（Win/Linux 为骨架）
- 全部 PASS 输出 `doctor: OK`；任一 FAIL exit 1（可脚本化）
- 实现：`packages/cli/src/doctor.ts` 新文件，`index.ts` 挂 `doctor` 子命令（复用现有 command 分发模式）

### 4.2 `init` 增强

- 脚手架完成后打印"下一步"三步：① 若无原生链：clone 仓库 + `scripts/build-native.sh`；② `export ZTRON_TJS=… ZTRON_HOST_BIN=… ZTRON_WEBVIEW_LIB=…`（写进 shell rc 的提示）；③ `pnpm install && ztron dev`
- 在 init 的目录向上探测不到 `native/libs/` 时，额外打印 `ztron doctor` 提醒
- 生成的 `package.json` 不变（已是独立形态）

## 5. W3 docs `start/` 旅程重写

文件与顺序不变（`_meta.json`: intro, install, quick-start, examples），重写内容，zh/en 同步（`check:locales` 门禁必须绿）：

### 5.1 `intro.md`（导语重写）

30 秒讲清：Ztron 是什么（Tauri 式桌面框架、纯 TypeScript、~2MB tjs + 系统 WebView）、双进程架构一句话、与 Tauri 的关系（API 兼容移植，熟悉 Tauri 的可直接看 tauri-migration）；结尾"下一步 → 前置条件"。

### 5.2 `install.md`（= Prerequisites）

- 分平台前置表：macOS（Apple Silicon 已验证）/ Node ≥ 20 / pnpm 9 / Xcode CLT；Windows、Linux 如实标注"host 骨架，暂不可用"
- **一次性获取原生链**：`git clone` → `scripts/build-native.sh` → 产出 `native/libs/{tjs,ztron-host,webview dylib}`；建议把三个 `ZTRON_*` export 写入 shell rc
- **安装 CLI**：主线 `npm i -g @zturnlibs/ztron-cli`（npmjs，W1 通后启用）；fallback：GitHub Packages + PAT 的 `.npmrc` 写法
- 收尾跑 `ztron doctor` 全绿即为装好；结尾"下一步 → 快速开始"

### 5.3 `quick-start.md`（= Try + First App，核心页）

- **Try Ztron（3 行）**：`ztron init my-app && cd my-app && ztron dev` → 原生窗口出现即成功；此处插入 `ztron doctor` 自检点
- **First App 分步教程**：
  1. 项目结构导览（`src/main.ts` 后端 / `frontend/` 前端 / `ztron.conf.json` 窗口与入口声明）
  2. 改前端：改标题、加一个按钮（热重载说明）
  3. **加第一个 TypeScript 命令**（对应 Tauri "Call Rust from JS"）：后端 `registerCommand("greet", …)` → `ztron codegen` → 前端 `invoke("greet", …)` 显示返回值——完整可复制的最小代码
  4. 打包：`ztron build` → `dist/` 出 ad-hoc 签名 `.app`
- 每步配预期输出；结尾"下一步 → 示例与深入"（链 examples 与 guide）

### 5.4 `examples.md`（微调）

保留现有内容；开头补一句定位（ hello 示例是 86 项检查的载体，monorepo 内开发见各示例 README），结尾链 guide/architecture 与 reference。

### 5.5 口径约束

- 所有命令必须与实现一致（`ztron init/dev/build/check/codegen/doctor`）；文档中的代码片段以 examples/hello 实际用法为事实源
- monorepo 流程从新手主线移除，保留在 examples 页与 README（贡献者视角）
- 双语结构门禁 + 全仓测试必须绿

## 6. 分支与实施顺序

- 分支 `feat/onboarding`（自 main 拉），PR 回 main
- 顺序：W1（publish.yml + 提示用户配 `NPM_TOKEN`，外部依赖早触发）→ W2（doctor → init 增强，各带单测）→ W3（四页重写，门禁绿）→ 端到端验收 → PR
- 实施采用 subagent-driven-development（沿用既有流程：每任务实现 + 审查双门禁）

## 7. 验收标准

1. 干净目录端到端：按旅程文档逐步执行（npmjs 或 fallback 安装 CLI → init → dev）出原生窗口；`ztron build` 出 .app；全程不需要进 monorepo
2. `ztron doctor` 三态正确：全绿（OK，exit 0）/ 缺 tjs / 缺 host（逐项 FAIL + 修复提示，exit 1）；单测覆盖
3. npmjs 发布成功（`NPM_TOKEN` 配置后），`npm view @zturnlibs/ztron-cli` 可见；未配置期间 fallback 文档生效
4. `start/` 四页 zh/en 上线，双语门禁绿；quick-start 教程代码片段与实现一致（逐条实测）
5. 全仓测试 126+ pass / 0 fail；website.yml 部署成功后线上 start/ 为新旅程

## 8. 风险与对策

| 风险 | 对策 |
| --- | --- |
| `NPM_TOKEN` 未配置阻塞 W1 | 文档 fallback 路径先上，发布打通后主线切换；publish job 失败不影响 GitHub Packages |
| init 独立项目 `latest` 依赖引入破坏性变更 | 文档建议固定版本号写法；后续考虑 init 默认锁 CLI 同版本 |
| 教程代码与实现漂移 | 验收标准 4 的逐条实测；后续可考虑 CI 抽取示例片段 |
| 与并行会话的 docs 领域冲突 | `start/` 四页并行会话未在动；README 徽章等可选项等其 WIP 提交后再做 |
| ZTRON_* 三个环境变量对新手的认知负担 | doctor + init 双处引导；install 页给出可直接粘贴的 export 块 |
