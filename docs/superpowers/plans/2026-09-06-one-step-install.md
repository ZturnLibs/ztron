# One-Step Install（预编译原生链随 npm 分发）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户在一台干净 macOS（Apple Silicon）上 `npm i -g @zturnlibs/ztron-cli` 后 `ztron doctor` 全绿、`ztron dev` 直接出窗口——文档中的"clone 编译原生链"与"配三个环境变量"两步对终端用户消失。

**Architecture:** 新增 npm 平台子包 `@zturnlibs/ztron-darwin-arm64` 携带预编译原生链（tjs + ztron-host + libwebview，约 2MB）；CLI 以 `optionalDependencies: workspace:*` 引用（`pnpm pack` 发布时自动重写为精确版本，仓库既有机制）；`native-locate.ts` 解析链插入 bundled 层（env → walk-up → bundled → PATH）；publish.yml 新增 macos-14 编译 job + 发布后真实安装冒烟 job。

**Tech Stack:** TypeScript (ESM, node:test), pnpm 9 workspace, GitHub Actions (macos-14 runner), cmake 原生构建（现有 `scripts/build-native.sh`）。

**Spec:** `docs/superpowers/specs/2026-09-06-one-step-install-design.md`

## Global Constraints

- Node ≥ 20；包管理器 pnpm@9.15.4（`packageManager` 字段，勿改）
- 平台范围仅 darwin-arm64：平台包 `os: ["darwin"], cpu: ["arm64"]`；Windows/Linux/Intel 文档如实声明现状
- CLI 对平台包的依赖声明必须是 `"workspace:*"`（发布时由 `pnpm pack` 重写为精确版本；写死版本号会使 CI `pnpm install --frozen-lockfile` 去 registry 拉不存在的包）
- 平台包**不得**有 `exports` 字段（深层路径 `native/libs/<file>` 解析依赖无 exports 的传统子路径解析）、**不得**有 install scripts（无 postinstall）
- 解析顺序固定：env → walk-up（host/webview）→ bundled → PATH/约定路径（walk-up 在 bundled 之前，保仓库内开发者本地新编产物不被遮蔽；tjs 无 walk-up 层：env → bundled → PATH）
- 测试跑在 dist 上：先 `pnpm --filter @zturnlibs/ztron-cli build` 再 `node --experimental-strip-types --test tests/unit/<file>.test.ts`
- 测试风格：`node:test` + `node:assert/strict`，fixture 用 `mkdtempSync` 建临时目录并清理
- 文档 zh/en 必须结构镜像（标题数量与顺序一致），`pnpm docs:check` 门禁必须绿
- 全仓库当前版本 0.3.1；新包 version 也是 0.3.1（版本随现有发布流程统一 bump）
- 禁止修改 `/Users/zyj/Zturn/tauri`（只读参考目录，见 AGENTS.md）

---

### Task 1: bundled 解析层 + 平台子包骨架

**Files:**
- Modify: `packages/cli/src/native-locate.ts`
- Modify: `packages/cli/package.json`（加 optionalDependencies）
- Create: `packages/native-darwin-arm64/package.json`
- Test: `tests/unit/cli-native-locate.test.ts`

**Interfaces:**
- Consumes: 现有 `findTjs(): string`、`findHostBin(appRoot: string): string`、`findWebviewLib(appRoot: string): string | undefined`、`findNativeFile(start: string, file: string): string | undefined`（签名全部不变）
- Produces: `findBundledNative(file: string): string | undefined`、`findBundledNativeFrom(fromDir: string, file: string): string | undefined`（Task 2 的 doctor/init 消费）；平台包名 `@zturnlibs/ztron-darwin-arm64`（Task 3 的 CI 消费）

- [ ] **Step 1: 写失败测试**

在 `tests/unit/cli-native-locate.test.ts` 中，import 行改为：

```ts
import {
  findTjs,
  findNativeFile,
  findHostBin,
  findWebviewLib,
  findBundledNativeFrom,
} from "../../packages/cli/dist/native-locate.js";
```

文件末尾追加两个测试：

```ts
test("findBundledNativeFrom resolves artifacts from a fake platform package", () => {
  const root = tmpProject();
  const pkg = join(root, "node_modules", "@zturnlibs", "ztron-darwin-arm64");
  mkdirSync(join(pkg, "native", "libs"), { recursive: true });
  writeFileSync(
    join(pkg, "package.json"),
    JSON.stringify({ name: "@zturnlibs/ztron-darwin-arm64", version: "0.0.0-test" }),
  );
  writeFileSync(join(pkg, "native", "libs", "ztron-host"), "x");
  assert.equal(
    findBundledNativeFrom(root, "ztron-host"),
    join(pkg, "native", "libs", "ztron-host"),
  );
  rmSync(root, { recursive: true, force: true });
});

test("findBundledNativeFrom returns undefined when package or artifact is absent", () => {
  const root = tmpProject();
  assert.equal(findBundledNativeFrom(root, "ztron-host"), undefined);
  // package present but artifact missing (in-repo workspace link ships empty)
  const pkg = join(root, "node_modules", "@zturnlibs", "ztron-darwin-arm64");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(
    join(pkg, "package.json"),
    JSON.stringify({ name: "@zturnlibs/ztron-darwin-arm64", version: "0.0.0-test" }),
  );
  assert.equal(findBundledNativeFrom(root, "tjs"), undefined);
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/zyj/Zturn/Ztron && pnpm --filter @zturnlibs/ztron-cli build && node --experimental-strip-types --test tests/unit/cli-native-locate.test.ts
```

预期：FAIL——`findBundledNativeFrom` 未导出（SyntaxError: The requested module does not provide an export）。

- [ ] **Step 3: 实现 native-locate.ts**

整文件替换为：

```ts
/**
 * Native-chain locators shared by dev/build/check and doctor.
 * Resolution order per artifact:
 *   tjs:            env ZTRON_TJS -> bundled npm package -> PATH probe
 *   host / webview: env -> walk-up `native/libs/<file>` (8 levels) -> bundled
 * The bundled layer is the prebuilt chain shipped as
 * `@zturnlibs/ztron-darwin-arm64` (installed automatically next to the CLI);
 * walk-up stays ahead of it so in-repo freshly built artifacts win.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** npm platform package carrying the prebuilt native chain. */
const BUNDLED_PKG = "@zturnlibs/ztron-darwin-arm64";

/**
 * Resolve `BUNDLED_PKG/native/libs/<file>` starting Node's resolution at
 * `fromDir`. Returns undefined when the package is absent (--no-optional,
 * trimmed mirror, other platform) or the artifact is missing (the in-repo
 * workspace link ships without native/).
 */
export function findBundledNativeFrom(
  fromDir: string,
  file: string,
): string | undefined {
  try {
    const req = createRequire(join(fromDir, "package.json"));
    const p = req.resolve(`${BUNDLED_PKG}/native/libs/${file}`);
    return existsSync(p) ? p : undefined;
  } catch {
    return undefined;
  }
}

/** findBundledNativeFrom starting at this CLI package's own directory. */
export function findBundledNative(file: string): string | undefined {
  return findBundledNativeFrom(
    fileURLToPath(new URL(".", import.meta.url)),
    file,
  );
}

/** Locate the txiki `tjs` binary (env ZTRON_TJS, bundled package, or PATH). */
export function findTjs(): string {
  const configured = process.env.ZTRON_TJS;
  if (configured) {
    return configured;
  }
  const bundled = findBundledNative("tjs");
  if (bundled) {
    return bundled;
  }
  const probe = spawnSync("tjs", ["-v"], { encoding: "utf8" });
  if (probe.status === 0) {
    return "tjs";
  }
  throw new Error(
    "txiki.js runtime (`tjs`) not found. Reinstall the CLI (`npm i -g @zturnlibs/ztron-cli`) or set ZTRON_TJS=/path/to/tjs",
  );
}

/** Walks up from `start` looking for `native/libs/<file>`. */
export function findNativeFile(start: string, file: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    const candidate = resolve(dir, "native", "libs", file);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

export function findHostBin(appRoot: string): string {
  const env = process.env.ZTRON_HOST_BIN;
  if (env) {
    return resolve(env);
  }
  return (
    findNativeFile(appRoot, "ztron-host") ??
    findBundledNative("ztron-host") ??
    resolve(appRoot, "native/libs/ztron-host")
  );
}

/** Locates the platform webview shared library (next to the host). */
export function findWebviewLib(appRoot: string): string | undefined {
  const env = process.env.ZTRON_WEBVIEW_LIB;
  if (env) {
    return resolve(env);
  }
  const name =
    process.platform === "darwin"
      ? "libwebview.dylib"
      : process.platform === "win32"
        ? "webview.dll"
        : "libwebview.so";
  return findNativeFile(appRoot, name) ?? findBundledNative(name);
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /Users/zyj/Zturn/Ztron && pnpm --filter @zturnlibs/ztron-cli build && node --experimental-strip-types --test tests/unit/cli-native-locate.test.ts
```

预期：全部 PASS（原有 3 个测试 + 新增 2 个）。原有测试不受影响的原因：仓库内平台包 workspace 链接不带 `native/` 产物，`findBundledNative` 返回 undefined，行为落回原路径。

- [ ] **Step 5: 创建平台包骨架**

创建 `packages/native-darwin-arm64/package.json`：

```json
{
  "name": "@zturnlibs/ztron-darwin-arm64",
  "version": "0.3.1",
  "description": "Ztron prebuilt native chain for macOS Apple Silicon (tjs runtime + ztron-host + libwebview)",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "files": ["native"],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ZturnLibs/ztron.git"
  },
  "bugs": {
    "url": "https://github.com/ZturnLibs/ztron/issues"
  },
  "homepage": "https://github.com/ZturnLibs/ztron#readme",
  "license": "MIT",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

注意：**没有** `exports`、**没有** `scripts`、**没有** `type`（无 JS 内容）。仓库根 `.gitignore` 的 `native/libs/` 模式（无前导斜杠，任意层级匹配）已覆盖 `packages/native-darwin-arm64/native/libs/`，编译产物不会误入 git。

- [ ] **Step 6: CLI 挂 optionalDependencies**

`packages/cli/package.json` 在 `"dependencies"` 之后加：

```json
  "optionalDependencies": {
    "@zturnlibs/ztron-darwin-arm64": "workspace:*"
  },
```

（workspace 链接仅本地/CI 生效；`pnpm pack` 发布 CLI 时自动重写为 `"0.3.1"` 精确版本——publish.yml 注释中已记载的既有机制。）

- [ ] **Step 7: 刷新 lockfile 并全量验证**

```bash
cd /Users/zyj/Zturn/Ztron && pnpm install && pnpm build && pnpm test:unit
```

预期：lockfile 新增 native-darwin-arm64 importer；全部测试 PASS。

- [ ] **Step 8: Commit**

```bash
cd /Users/zyj/Zturn/Ztron && git add packages/cli/src/native-locate.ts packages/cli/package.json packages/native-darwin-arm64/package.json tests/unit/cli-native-locate.test.ts pnpm-lock.yaml && git commit -m "feat(cli): bundled native-chain resolution via @zturnlibs/ztron-darwin-arm64 platform package"
```

---

### Task 2: doctor 与 init 提示切换到 bundled 语境

**Files:**
- Modify: `packages/cli/src/doctor.ts`
- Modify: `packages/cli/src/index.ts`（`initProject`，约 786-826 行）
- Test: `tests/unit/cli-doctor.test.ts`、`tests/unit/cli-init-hints.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `findBundledNative(file: string): string | undefined`
- Produces: `runDoctor` 返回形状不变（5 项 check）；`CHAIN_HINT` 文案更新（仍包含 `build-native.sh`，供源码构建兜底指引）；init 输出的 next steps 语义变化（不再引导 clone 编译，改为 doctor 优先 + 无链时 fallback note）

- [ ] **Step 1: 更新 doctor 测试（含 bundled 层断言）**

`tests/unit/cli-doctor.test.ts` 末尾追加（import 行不动，已有 `runDoctor`）：

```ts
test("doctor: walk-up chain alone satisfies checks without env (bundled layer is unit-tested in cli-native-locate)", () => {
  const repo = nativeRepo();
  const deep = join(repo, "anywhere", "proj");
  const r = runDoctor({
    cwd: deep, // walk-up finds repo's native/libs without env
    env: CLEAN_ENV,
    platform: "darwin",
  });
  assert.equal(r.ok, true);
  const byName = Object.fromEntries(r.checks.map((c) => [c.name, c]));
  assert.equal(byName["ztron-host"].pass, true);
  assert.equal(byName["webview library"].pass, true);
  rmSync(repo, { recursive: true, force: true });
});
```

注意：bundled 层由 `findBundledNative` 从真实 CLI dist 解析，单测无法注入伪造包；该测试验证的是 walk-up 层在无 env 时独立满足 doctor（bundled 层本身已在 Task 1 单测覆盖）。同时把现有 `missing host+tjs` 测试的断言补充 bundled 探测信息：

```ts
test("doctor: missing host+tjs fails with hints, ok=false", () => {
  const empty = mkdtempSync(join(tmpdir(), "ztron-doc0-"));
  const r = runDoctor({ cwd: empty, env: CLEAN_ENV, platform: "darwin" });
  assert.equal(r.ok, false);
  const byName = Object.fromEntries(r.checks.map((c) => [c.name, c]));
  assert.equal(byName["tjs runtime"].pass, false);
  assert.match(byName["tjs runtime"].hint, /build-native\.sh/);
  assert.match(byName["tjs runtime"].hint, /ztron-cli/);
  assert.equal(byName["ztron-host"].pass, false);
  assert.equal(byName["webview library"].pass, false);
  assert.equal(byName["node >= 20"].pass, true);
  rmSync(empty, { recursive: true, force: true });
});
```

（整段替换原 `missing host+tjs` 测试——新增 `assert.match(..., /ztron-cli/)` 一行。）

- [ ] **Step 2: 跑测试确认失败**

```bash
cd /Users/zyj/Zturn/Ztron && pnpm --filter @zturnlibs/ztron-cli build && node --experimental-strip-types --test tests/unit/cli-doctor.test.ts
```

预期：FAIL——新断言 `hint` 匹配 `/ztron-cli/` 失败（现 hint 只讲 clone+build-native）。

- [ ] **Step 3: 更新 doctor.ts**

`packages/cli/src/doctor.ts` 改动三处（其余不动）：

import 行：

```ts
import { findTjs, findHostBin, findWebviewLib, findBundledNative } from "./native-locate.js";
```

`CHAIN_HINT` 替换为：

```ts
const CHAIN_HINT =
  "reinstall the CLI (`npm i -g @zturnlibs/ztron-cli`) for the bundled native chain; or build from source: clone https://github.com/ZturnLibs/ztron && `scripts/build-native.sh`, then export ZTRON_TJS / ZTRON_HOST_BIN / ZTRON_WEBVIEW_LIB";
```

`ztron-host` 与 `webview library` 两项 check 替换为（detail 追加 bundled 层探测结果，满足 spec「FAIL 详情展示实际探测过的各层」）：

```ts
  const host = env.ZTRON_HOST_BIN
    ? resolve(env.ZTRON_HOST_BIN)
    : findHostBin(cwd);
  const hostBundled = findBundledNative("ztron-host");
  checks.push({
    name: "ztron-host",
    pass: existsSync(host),
    detail: hostBundled ? `${host} (bundled: ${hostBundled})` : host,
    hint: CHAIN_HINT,
  });

  const lib = findWebviewLib(cwd);
  const libBundled = findBundledNative(
    platform === "win32" ? "webview.dll" : platform === "linux" ? "libwebview.so" : "libwebview.dylib",
  );
  checks.push({
    name: "webview library",
    pass: Boolean(lib && existsSync(lib)),
    detail: libBundled ? `${lib ?? "not found"} (bundled: ${libBundled})` : (lib ?? "not found"),
    hint: CHAIN_HINT,
  });
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd /Users/zyj/Zturn/Ztron && pnpm --filter @zturnlibs/ztron-cli build && node --experimental-strip-types --test tests/unit/cli-doctor.test.ts tests/unit/cli-native-locate.test.ts
```

预期：全部 PASS。

- [ ] **Step 5: 更新 init 提示（index.ts）**

`packages/cli/src/index.ts` 顶部 import 块（第 38-43 行）改为：

```ts
import {
  findTjs,
  findNativeFile,
  findHostBin,
  findWebviewLib,
  findBundledNative,
} from "./native-locate.js";
```

`initProject` 中的提示段（现 818-825 行）整段替换：

```ts
  const hasChain =
    findNativeFile(target, "ztron-host") !== undefined ||
    findBundledNative("ztron-host") !== undefined;
  console.log(`[ztron] next steps:`);
  console.log(`  1. pnpm install && npx ztron doctor`);
  console.log(`  2. npx ztron dev`);
  if (!hasChain) {
    console.log(
      `[ztron] note: no native chain bundled or found above ${target} — reinstall the CLI (\`npm i -g @zturnlibs/ztron-cli\`), or build from source (docs: start/install) and export ZTRON_TJS / ZTRON_HOST_BIN / ZTRON_WEBVIEW_LIB.`,
    );
  }
```

- [ ] **Step 6: 更新 init 提示测试**

`tests/unit/cli-init-hints.test.ts` 整文件替换为：

```ts
/** `ztron init` prints next-step guidance incl. bundled-chain fallback note. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath (not .pathname): .pathname yields "/D:/..." on Windows.
const CLI = fileURLToPath(new URL("../../packages/cli/dist/index.js", import.meta.url));

test("init prints doctor-first next steps and a fallback note outside a native repo", () => {
  const dir = mkdtempSync(join(tmpdir(), "ztron-init-"));
  const r = spawnSync(process.execPath, [CLI, "init", join(dir, "my-app")], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /next steps/i);
  assert.match(r.stdout, /ztron doctor/);
  assert.match(r.stdout, /ztron dev/);
  // In-repo the workspace-linked platform package ships without native/, so
  // the fallback note is expected even where the bundled layer is linkable.
  assert.match(r.stdout, /no native chain/);
  assert.match(r.stdout, /ZTRON_TJS/);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 7: 全量验证并提交**

```bash
cd /Users/zyj/Zturn/Ztron && pnpm build && pnpm test:unit
```

预期：全部 PASS。

```bash
cd /Users/zyj/Zturn/Ztron && git add packages/cli/src/doctor.ts packages/cli/src/index.ts tests/unit/cli-doctor.test.ts tests/unit/cli-init-hints.test.ts && git commit -m "feat(cli): doctor/init speak bundled-chain-first with source-build fallback"
```

---

### Task 3: publish.yml 原生编译 job + 平台包发布 + npm 冒烟

**Files:**
- Modify: `.github/workflows/publish.yml`

**Interfaces:**
- Consumes: Task 1 的 `packages/native-darwin-arm64/package.json`（包名/版本）；现有 `scripts/build-native.sh`（产物 `native/libs/{tjs,ztron-host,libwebview.dylib}`）
- Produces: workflow job 名 `native-darwin-arm64`（发布 job `needs` 它）、artifact 名 `ztron-darwin-arm64-tgz`、冒烟 job `smoke-npm`

- [ ] **Step 1: 新增 native 编译 job**

在 `.github/workflows/publish.yml` 的 `jobs:` 下、`publish:` 之前插入（两级缩进对齐现有 job 键）：

```yaml
  native-darwin-arm64:
    name: build prebuilt native chain (macOS arm64)
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - name: build native chain (txiki.js + webview, cmake)
        run: bash scripts/build-native.sh
      # cp follows symlinks: the three libwebview names arrive as three real
      # copies of the dylib — no symlink preservation concerns in tarballs.
      - name: stage artifacts into the platform package
        run: |
          mkdir -p packages/native-darwin-arm64/native/libs
          for f in tjs ztron-host libwebview.dylib libwebview.0.12.dylib libwebview.0.12.0.dylib; do
            cp "native/libs/$f" "packages/native-darwin-arm64/native/libs/$f"
          done
      - name: verify artifact manifest
        run: |
          test -x packages/native-darwin-arm64/native/libs/tjs
          test -x packages/native-darwin-arm64/native/libs/ztron-host
          test -f packages/native-darwin-arm64/native/libs/libwebview.dylib
      - name: pack platform package
        run: |
          cd packages/native-darwin-arm64
          tgz="$(npm pack --pack-destination /tmp | tail -1)"
          echo "TGZ=/tmp/$tgz" >> "$GITHUB_ENV"
      - uses: actions/upload-artifact@v4
        with:
          name: ztron-darwin-arm64-tgz
          path: /tmp/ztron-darwin-arm64-*.tgz
          if-no-files-found: error
```

- [ ] **Step 2: 两个 publish job 挂依赖并先发平台包**

`publish:` job 加 `needs` 并在「publish tarballs to GitHub Packages」步骤**之前**插入（与 `runs-on: ubuntu-latest` 同级缩进写 `needs`）：

```yaml
  publish:
    name: publish @zturnlibs/ztron-* to GitHub Packages
    needs: native-darwin-arm64
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: ztron-darwin-arm64-tgz
          path: /tmp/native-tgz
      # leaf-first: the CLI's optionalDependencies point at this package.
      - name: publish native platform package
        run: npm publish /tmp/native-tgz/ztron-darwin-arm64-*.tgz --access restricted --tag latest
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

（`publish:` 原有的其余 steps 原样保留、顺序不变。）

`publish-npm:` job 同样处理：

```yaml
  publish-npm:
    name: publish @zturnlibs/ztron-* to npmjs (public)
    needs: native-darwin-arm64
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: ztron-darwin-arm64-tgz
          path: /tmp/native-tgz
      - name: publish native platform package
        run: npm publish /tmp/native-tgz/ztron-darwin-arm64-*.tgz --access public --tag latest
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

（其余 steps 原样保留。）

- [ ] **Step 3: 新增 npm 安装冒烟 job**

文件末尾追加：

```yaml
  smoke-npm:
    name: smoke — real npm install, doctor, init, build
    needs: publish-npm
    runs-on: macos-14
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: install CLI (retry for registry propagation)
        run: |
          for i in 1 2 3 4 5; do
            if npm i -g @zturnlibs/ztron-cli; then exit 0; fi
            echo "retry $i"; sleep 20
          done
          exit 1
      - name: doctor must be all green on the bundled chain alone
        run: ztron doctor
      - name: init + build a scaffolded app
        run: |
          cd "$(mktemp -d)"
          ztron init smoke-app
          cd smoke-app
          npm install --no-fund --no-audit
          ztron build
          test -d dist
```

（`ztron doctor` 失败即 exit 1，无需额外 grep；`npm install` 为脚手架的 `@zturnlibs/*` 依赖所必需——模板 src/main.ts import 了 ztron-core/runtime-ffi，esbuild 需要从项目 node_modules 解析。）

- [ ] **Step 4: YAML 语法自检（macOS 自带 ruby 的 YAML 标准库，零依赖）**

```bash
cd /Users/zyj/Zturn/Ztron && ruby -ryaml -e "
d = YAML.load_file('.github/workflows/publish.yml')
jobs = d['jobs'].keys
puts jobs.join(', ')
abort 'native-darwin-arm64 job missing' unless d['jobs'].key?('native-darwin-arm64')
abort 'smoke-npm job missing' unless d['jobs'].key?('smoke-npm')
abort 'publish needs missing' unless d['jobs']['publish']['needs'] == 'native-darwin-arm64'
abort 'publish-npm needs missing' unless d['jobs']['publish-npm']['needs'] == 'native-darwin-arm64'
puts 'workflow yaml OK'
"
```

预期：打印包含 `native-darwin-arm64`、`publish`、`publish-npm`、`smoke-npm` 的 job 列表与 `workflow yaml OK`。

- [ ] **Step 5: 验证 workspace 内 pnpm 流程不受影响**

```bash
cd /Users/zyj/Zturn/Ztron && pnpm install --frozen-lockfile && pnpm build && pnpm test:unit
```

预期：PASS（锁文件已含平台包 importer，`--frozen-lockfile` 不需要网络拉取 workspace 链接包）。

- [ ] **Step 6: Commit**

```bash
cd /Users/zyj/Zturn/Ztron && git add .github/workflows/publish.yml && git commit -m "feat(ci): build+publish darwin-arm64 native chain package, smoke real npm install"
```

> 端到端验证只能在下次 tag 推送时发生（发布工作流有真实副作用）。发版时的观察清单：① `native-darwin-arm64` job 绿且 artifact 含 3 个产物；② 两个 publish job 先发平台包再发 JS 家族；③ `smoke-npm` 全绿。任何一步红，修复后重新打 tag。

---

### Task 4: install.md 瘦身（zh/en）+ locales 门禁

**Files:**
- Modify: `docs/zh/start/install.md`（整文件替换）
- Modify: `docs/en/start/install.md`（整文件替换）

**Interfaces:**
- Consumes: 无（纯文档；引用的命令/包名来自 Task 1-3）
- Produces: 用户安装旅程两步化（装 CLI → doctor）；源码构建降级为底部附录；`pnpm docs:check` 门禁绿

- [ ] **Step 1: 重写中文版**

`docs/zh/start/install.md` 整文件替换为：

````markdown
---
title: 前置条件与安装
---

# 前置条件

| 依赖 | 要求 | 说明 |
| --- | --- | --- |
| macOS | Apple Silicon（已验证） | Intel 未验证，可尝试；Windows/Linux 仅有 host 骨架，暂不可用 |
| Node.js | ≥ 20 | |

# 第 1 步：安装 CLI

```bash
npm i -g @zturnlibs/ztron-cli
```

安装时会自动带上与你的平台匹配的**预编译原生链**（`tjs` 运行时 + `ztron-host`
原生窗口宿主 + webview 动态库，约 2MB）——无需 clone 仓库，无需编译，无需配置
环境变量。

> 包同时发布在 GitHub Packages。若 npmjs 不可用，可在 `~/.npmrc` 写入
> `@zturnlibs:registry=https://npm.pkg.github.com` 与
> `//npm.pkg.github.com/:_authToken=<你的 GitHub PAT>` 后再安装。

# 第 2 步：体检

```bash
ztron doctor
```

五行全 PASS、输出 `doctor: OK` 即装好。任何 FAIL 都带修复提示。

**下一步：[快速开始](/start/quick-start)**

# 附：从源码构建原生链（贡献者 / 备用）

仅当你要修改原生层，或预编译包不可用时才需要。额外前置：pnpm 9、
Xcode Command Line Tools（编译 txiki.js + ztron-host + webview 库）。

```bash
git clone https://github.com/ZturnLibs/ztron.git ~/ztron
cd ~/ztron
pnpm install
scripts/build-native.sh                 # 产出 native/libs/{tjs,ztron-host,libwebview.dylib}
```

让 CLI 使用它，二选一：

- 项目放在 ztron clone 目录之内（CLI 会向上自动找到 `native/libs/`）；或
- 把下面三行写进 `~/.zshrc`（路径按你的 clone 位置调整）：

```bash
export ZTRON_TJS=~/ztron/native/libs/tjs
export ZTRON_HOST_BIN=~/ztron/native/libs/ztron-host
export ZTRON_WEBVIEW_LIB=~/ztron/native/libs/libwebview.dylib
```
````

- [ ] **Step 2: 重写英文版（结构逐节镜像中文版）**

`docs/en/start/install.md` 整文件替换为：

````markdown
---
title: Prerequisites & Installation
---

# Prerequisites

| Dependency | Requirement | Notes |
| --- | --- | --- |
| macOS | Apple Silicon (verified) | Intel unverified, you can try it; Windows/Linux only have a host skeleton, not yet usable |
| Node.js | ≥ 20 | |

# Step 1: Install the CLI

```bash
npm i -g @zturnlibs/ztron-cli
```

The install automatically brings the **prebuilt native chain** matching your
platform (the `tjs` runtime + the `ztron-host` native window host + the
webview dynamic library, ~2MB) — no repo clone, no compilation, no
environment variables.

> The package is also published on GitHub Packages. If npmjs is unavailable,
> write `@zturnlibs:registry=https://npm.pkg.github.com` and
> `//npm.pkg.github.com/:_authToken=<your GitHub PAT>` into `~/.npmrc`,
> then install again.

# Step 2: Health Check

```bash
ztron doctor
```

When all five lines PASS and it prints `doctor: OK`, installation is done.
Every FAIL comes with a fix hint.

**Next: [Quick Start](/start/quick-start)**

# Appendix: Build the Native Chain from Source (contributors / fallback)

Only needed when you want to modify the native layer, or when the prebuilt
package is unavailable. Extra prerequisites: pnpm 9 and Xcode Command Line
Tools (they compile txiki.js + ztron-host + the webview library).

```bash
git clone https://github.com/ZturnLibs/ztron.git ~/ztron
cd ~/ztron
pnpm install
scripts/build-native.sh                 # produces native/libs/{tjs,ztron-host,libwebview.dylib}
```

Point the CLI at it — either of:

- keep your project inside the ztron clone (the CLI walks up and finds
  `native/libs/` automatically); or
- put the following three lines into `~/.zshrc` (adjust the paths to where
  you cloned):

```bash
export ZTRON_TJS=~/ztron/native/libs/tjs
export ZTRON_HOST_BIN=~/ztron/native/libs/ztron-host
export ZTRON_WEBVIEW_LIB=~/ztron/native/libs/libwebview.dylib
```
````

- [ ] **Step 3: 跑 locales 门禁**

```bash
cd /Users/zyj/Zturn/Ztron && pnpm docs:check
```

预期：PASS。若报结构差异，按报错把 zh/en 的标题数量与顺序对齐后重跑。

- [ ] **Step 4: Commit**

```bash
cd /Users/zyj/Zturn/Ztron && git add docs/zh/start/install.md docs/en/start/install.md && git commit -m "docs(start): install is now one command - prebuilt chain via npm, source build demoted to appendix"
```

---

### Task 5: 本地端到端验证 + 收尾

**Files:**
- 无新增/修改（验证任务；发现问题则回到对应 Task 修复）

**Interfaces:**
- Consumes: Task 1-4 的全部产物
- Produces: 本机可复核的验证记录；发版观察清单（Task 3 注）

- [ ] **Step 1: 全量构建 + 类型检查 + 单测**

```bash
cd /Users/zyj/Zturn/Ztron && pnpm build && pnpm typecheck && pnpm test
```

预期：全部 PASS（`pnpm test` 含 core 测试与全部单测）。

- [ ] **Step 2: 真实 doctor 冒烟（本机已有源码链 → 应全绿）**

```bash
cd /Users/zyj/Zturn/Ztron/examples/hello 2>/dev/null || cd /Users/zyj/Zturn/Ztron; node packages/cli/dist/index.js doctor
```

预期：`doctor: OK`（本机 walk-up 命中 `native/libs/`，host check detail 可能带 `(bundled: ...)` 标注——bundled 在仓库内无产物时应显示原路径）。

- [ ] **Step 3: init 冒烟（无链目录 → fallback note + doctor FAIL 提示文案）**

```bash
d=$(mktemp -d) && cd "$d" \
  && node /Users/zyj/Zturn/Ztron/packages/cli/dist/index.js init smoke | tee /tmp/ztron-init-out.txt \
  && grep -q "no native chain" /tmp/ztron-init-out.txt \
  ; cd "$d/smoke" && node /Users/zyj/Zturn/Ztron/packages/cli/dist/index.js doctor; c=$?; cd /Users/zyj/Zturn/Ztron && rm -rf "$d"; test "$c" -eq 1
```

预期：init 输出含 `next steps`、`ztron doctor`、`ztron dev`、`no native chain`；doctor exit code 为 1（临时目录无链，属预期失败——验证的是 FAIL 路径的提示文案，hint 含 `ztron-cli` 与 `build-native.sh`），整条命令最终退出 0。

- [ ] **Step 4: 平台包 pack 预演（空产物包）**

```bash
cd /Users/zyj/Zturn/Ztron/packages/native-darwin-arm64 && npm pack --dry-run
```

预期：列出 `package.json`，警告 native/ 缺失可接受（真实产物仅在 CI macos job 内拷入后再 pack）。确认 tarball 内**没有**把仓库 `native/libs` 误打进来。

- [ ] **Step 5: 收尾提交（如 Task 1-4 中有修复性改动）**

```bash
cd /Users/zyj/Zturn/Ztron && git status --short && git log --oneline -6
```

预期：工作区干净（`.superpowers/sdd/` 与 `.playwright-mcp/` 的既有改动不属于本计划，不要提交）。

## 发版日手动清单（一次性，不属于代码任务）

1. 确认 npmjs `@zturnlibs` org 可用（onboarding W1 已配置 `NPM_TOKEN` secret）。
2. 统一 bump 全家族版本（含 `packages/native-darwin-arm64/package.json`）→ 提交 → 打 `v*` tag 推送。
3. 观察 Actions：`native-darwin-arm64` → `publish` / `publish-npm` → `smoke-npm` 全绿。
4. 发布后本机复核：`npm i -g @zturnlibs/ztron-cli@latest && ztron doctor`（先 `unset ZTRON_TJS ZTRON_HOST_BIN ZTRON_WEBVIEW_LIB` 并离开 ztron 目录）→ 预期 `doctor: OK`，native 路径位于 npm 全局目录内。
5. 线上文档 install.html 复核渲染（折叠附录正常显示）。
