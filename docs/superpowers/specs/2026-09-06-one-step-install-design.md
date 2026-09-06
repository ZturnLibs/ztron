# Ztron 一次安装即用设计（预编译原生链随 npm 分发）

- 日期：2026-09-06
- 状态：设计定稿（用户已通过八节设计评审）
- 前置：2026-09-03-onboarding-journey-design.md（其"非目标"中的预编译分发在此落地）
- 参照惯例：esbuild 平台子包模式（`@esbuild/darwin-arm64`）

## 1. 目标与非目标

### 目标

在一台**只装了 Node.js ≥ 20 的干净 macOS（Apple Silicon）**上：

```bash
npm i -g @zturnlibs/ztron-cli   # 唯一一步
ztron doctor                     # 五行全 PASS
ztron init my-app && cd my-app && ztron dev   # 直接出原生窗口
```

文档 `start/install.html` 中的第 2 步（clone + `build-native.sh`）与第 3 步
（配置 `ZTRON_TJS` / `ZTRON_HOST_BIN` / `ZTRON_WEBVIEW_LIB`）对终端用户消失。

### 非目标

- 不改 Windows/Linux 支持状态（host 仍是骨架，文档如实声明）
- 不做 Intel 验证（文档维持"未验证，可尝试"）
- 不做运行时下载器（`ztron fetch-native` 类方案已评审否决）
- 不做 Developer ID 签名与公证（npm 分发无 quarantine xattr，无 Gatekeeper 阻拦；列为后续演进）

## 2. 现状事实（设计依据）

- 原生产物很小：`tjs` 5.5MB + `ztron-host` 142KB + `libwebview.dylib` 159KB，压缩后约 2MB——随 npm 分发体积可行
- `scripts/build-native.sh` 无 Node 依赖（clone txiki.js/webview 后 cmake 编译），可在 CI runner 直接跑
- `publish.yml` 已在 tag `v*` 时双通道发布全家族包（GitHub Packages + npmjs），leaf-first 顺序已建立
- `packages/cli/src/native-locate.ts` 解析链：env → PATH（仅 tjs）→ walk-up `native/libs/`（8 层）——可在其中插入"bundled 包"层
- arm64 macOS 要求可执行文件至少 ad-hoc 签名；clang/cmake 在 arm64 上自动完成，签名随 Mach-O 内容走，tarball 分发不破坏
- npm/tar 分发不设置 quarantine xattr，无 Gatekeeper 问题
- webview 库含本地补丁（scheme handler、deplete deadlock fix），必须用 Ztron 补丁版从源码编译，无现成上游产物可下

## 3. 平台子包

- 包名 **`@zturnlibs/ztron-darwin-arm64`**，新目录 `packages/native-darwin-arm64/`
- 内容镜像仓库 `native/libs/` 布局：`native/libs/{tjs, ztron-host, libwebview.dylib, libwebview.0.12.dylib, libwebview.0.12.0.dylib}`（符号链接在 npm tarball 中保留）
- `package.json` 关键字段：
  - `"os": ["darwin"], "cpu": ["arm64"]` —— 其他平台 npm 自动跳过（optionalDependencies 语义）
  - `"files": ["native"]`
  - 不含 `bin`、无 install scripts（无 postinstall，避免安装脚本安全面）
- **版本策略**：与 CLI 同版本、同 tag、精确 pin（CLI 的 optionalDependencies 写 `"0.3.x"` 死版本，不用 `^`）——原生链与 CLI 本就同仓库同节奏发布，沿用现有全家族同版本发布流程

## 4. CLI 改动

### 4.1 `native-locate.ts` 解析链扩展

新增 `findBundledNative(file)`：用 `createRequire(import.meta.url)` 从 CLI 包位置
`require.resolve('@zturnlibs/ztron-darwin-arm64/native/libs/<file>')`；
解析失败（`--no-optional`、镜像裁剪、非 darwin/arm64）返回 undefined，静默落下一层。

**新解析顺序**（关键决策：walk-up 优先于 bundled，保仓库内开发者本地新编的链不被内置包遮蔽）：

| 构件 | 顺序 |
| --- | --- |
| `tjs` | env `ZTRON_TJS` → bundled 包 → PATH |
| `ztron-host` / webview lib | env → walk-up `native/libs/` → bundled 包 |

- env 保持最高优先级 → 存量用户零破坏
- monorepo 示例继续走 walk-up → 开发流程零破坏
- 外部项目（`ztron init` 产物）落到 bundled → 新用户体验目标达成

### 4.2 `doctor.ts` / `init` 提示更新

- `CHAIN_HINT` 改为：「重装 CLI（`npm i -g @zturnlibs/ztron-cli`）；或参考文档『从源码构建原生链』」
- FAIL 详情展示实际探测过的各层（env 值、walk-up 结果、bundled 是否存在）
- 同步更新 `cli-doctor.test.ts`、`cli-native-locate.test.ts`、`cli-init-hints.test.ts`

## 5. CI / 发布（publish.yml）

新增 `native-darwin-arm64` job（`runs-on: macos-14`，public repo 免费）：

1. checkout → `bash scripts/build-native.sh`
2. 产物拷入 `packages/native-darwin-arm64/native/libs/` → `npm pack` → upload artifact
3. 现有两个 publish job（GitHub Packages / npmjs）`needs` 该 native job、下载其 artifact，并在发布 CLI **之前**发布该 tarball（沿用 leaf-first：optionalDependencies 指向的包须先存在）

触发条件不变（tag `v*` + workflow_dispatch）。构建时长预期几分钟（txiki.js cmake 编译为主）。

## 6. 文档改动（zh/en 同步过 `check:locales` 门禁）

- **`start/install.md` 瘦身**：
  - 前置条件表只剩 macOS（Apple Silicon）+ Node ≥ 20（pnpm、Xcode CLT 移出用户前置——仅编译原生链需要）
  - 步骤缩为：装 CLI → `ztron doctor` 全绿 → 下一步（快速开始）
- **源码编译路径降级不删除**：迁至 install.md 底部折叠小节「从源码构建原生链（贡献者/备用）」（不新建页面，保持逃生口在同一文档内可见），作为 bundled 不可用时的逃生口
- quick-start 不变（本就是 init → dev）

## 7. 错误处理与边界

| 场景 | 行为 |
| --- | --- |
| `--no-optional` / 镜像裁剪致平台包缺失 | locate 静默落空 → doctor FAIL + 新 CHAIN_HINT（源码构建逃生口） |
| env 指向不存在的文件 | 维持现状：doctor 单独报「env 指向缺失」，与「整链未找到」区分 |
| 非 darwin/arm64 平台 | npm 跳过平台包；doctor 平台检查维持 WARNING 不 FAIL |
| CLI 升级 | optionalDependencies 精确版本随 tag 更新，重装 CLI 即换新链 |
| 符号链接在 tarball 中丢失（防御） | locate/doctor 对 `libwebview.dylib` 缺失给出指向版本化文件名的提示；打包时校验产物清单 |

## 8. 测试策略

- **单元**（vitest，沿用现有 fixture 风格）：
  - locate 四层各自可达、优先级正确（伪造 bundled 包目录 fixture）
  - bundled 缺失时落回 walk-up / PATH / 报错
  - doctor 新 CHAIN_HINT、init 新提示
- **集成冒烟（CI）**：publish 后 macos-14 runner：`npm i -g @zturnlibs/ztron-cli` 真实安装 → `ztron doctor` 全绿 → `ztron init` + `ztron build` 走通（build 不开窗口，适合无头环境）

## 9. 里程碑拆分建议（供 writing-plans 参考）

1. 平台包目录 + locate 链扩展 + 单测（本地可用 fake fixture 全绿）
2. publish.yml native job + 发布顺序调整（tag 触发端到端验证）
3. 文档瘦身 + 源码编译路径迁移（check:locales 绿）
4. 发布后冒烟验证 + install.md 终态复核
