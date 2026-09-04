# Ztron 新手上手旅程（Tauri 式 onboarding）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新用户按 docs `start/` 旅程走：装 CLI（无 PAT）→ `ztron init` → `ztron dev` 出原生窗口 → `ztron build` 出 .app，全程不进 monorepo。

**Architecture:** 三条工作流——W1 publish workflow 增发 npmjs 公共源；W2 CLI 新增 `ztron doctor`（复用 finder 逻辑提取的共享模块）+ `init` 下一步引导；W3 docs `start/` 四页重写为 Tauri 式旅程（Try 3 行 → 前置条件 → First App 教程）。

**Tech Stack:** TypeScript（node:test + assert/strict，CLI 测试从 `dist/*.js` import）、GitHub Actions、Rspress 双语文档（zh canonical / en mirror，`check:locales:deploy` 门禁）。

**Spec:** `docs/superpowers/specs/2026-09-03-onboarding-journey-design.md`

## Global Constraints

- 工作分支 `feat/onboarding`（自 main 拉）；PR 回 main；**不要动 `.worktrees/docs`（并行会话 P2 已完成，分支已合并，worktree 保留观察）**
- CLI 测试模式：node:test + `assert/strict`，从 `../../packages/cli/dist/*.js` import（跑前先 `pnpm --filter @zturnlibs/ztron-cli build`）
- `packages/cli/src/index.ts` 底部直接 `main()`（无守卫）——**任何新逻辑放独立模块，index.ts 只挂子命令转发**
- finder 语义不变：`ZTRON_TJS`/`ZTRON_HOST_BIN`/`ZTRON_WEBVIEW_LIB` env 优先，walk-up `native/libs/` 兜底（8 层）
- doctor 全 PASS exit 0 输出 `doctor: OK`；任一 FAIL exit 1
- publish npmjs job 失败不得阻塞 GitHub Packages job；触发仍为 tag `v*`
- docs 双语门禁 `pnpm --dir docs run check:locales:deploy` 必须绿；命令/包名/代码不翻译；zh canonical、en mirror
- 教程代码片段必须与实现一致：命令定义用 `defineCommand`（`@zturnlibs/ztron-core`），前端用 `invoke`（`@zturnlibs/ztron-api`），以 `examples/hello/src/commands.ts` 为事实源
- 全仓测试基线 126 pass / 0 fail，每个任务结束不得回退
- pnpm 卡死时用沙箱禁用重试（本环境已知问题）

---

### Task 1: 提取 native-locate 共享模块

**Files:**
- Create: `packages/cli/src/native-locate.ts`
- Modify: `packages/cli/src/index.ts`（删除 `findTjs`/`findNativeFile`/`findHostBin`/`findWebviewLib` 本地实现，改为 import）
- Test: `tests/unit/cli-native-locate.test.ts`

**Interfaces:**
- Produces: `findTjs(): string`（找不到时 throw Error）、`findNativeFile(start: string, file: string): string | undefined`、`findHostBin(appRoot: string): string`、`findWebviewLib(appRoot: string): string | undefined`——签名与 index.ts 现状逐字一致，index.ts 其余调用点不动

- [ ] **Step 1: 写失败测试**

`tests/unit/cli-native-locate.test.ts`：

```ts
/** native-locate: env overrides + walk-up resolution (shared by dev/build/doctor). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findTjs,
  findNativeFile,
  findHostBin,
  findWebviewLib,
} from "../../packages/cli/dist/native-locate.js";

function tmpProject(): string {
  return mkdtempSync(join(tmpdir(), "ztron-nl-"));
}

test("findNativeFile walks up to native/libs", () => {
  const root = tmpProject();
  const deep = join(root, "a", "b", "proj");
  mkdirSync(join(root, "native", "libs"), { recursive: true });
  mkdirSync(deep, { recursive: true });
  writeFileSync(join(root, "native", "libs", "ztron-host"), "#!/bin/sh\n");
  assert.equal(findNativeFile(deep, "ztron-host"), join(root, "native", "libs", "ztron-host"));
  assert.equal(findNativeFile(root, "missing"), undefined);
  rmSync(root, { recursive: true, force: true });
});

test("findTjs prefers ZTRON_TJS, then PATH probe, else throws", () => {
  const fake = join(tmpProject(), "tjs-fake");
  writeFileSync(fake, "#!/bin/sh\n");
  process.env.ZTRON_TJS = fake;
  assert.equal(findTjs(), fake);
  const saved = process.env.ZTRON_TJS;
  delete process.env.ZTRON_TJS;
  // PATH probe of a non-existent name fails -> throws with install hint.
  const savedPath = process.env.PATH;
  process.env.PATH = "/nonexistent-ztron-path";
  assert.throws(() => findTjs(), /txiki\.js runtime/);
  process.env.PATH = savedPath;
  process.env.ZTRON_TJS = saved;
});

test("findHostBin: env wins over walk-up; findWebviewLib picks platform name", () => {
  const root = tmpProject();
  const deep = join(root, "proj");
  mkdirSync(join(root, "native", "libs"), { recursive: true });
  mkdirSync(deep, { recursive: true });
  writeFileSync(join(root, "native", "libs", "ztron-host"), "x");
  const libName = process.platform === "darwin" ? "libwebview.dylib" : "libwebview.so";
  writeFileSync(join(root, "native", "libs", libName), "x");
  const envHost = join(tmpProject(), "elsewhere-host");
  writeFileSync(envHost, "x");
  process.env.ZTRON_HOST_BIN = envHost;
  assert.equal(findHostBin(deep), envHost);
  delete process.env.ZTRON_HOST_BIN;
  assert.equal(findHostBin(deep), join(root, "native", "libs", "ztron-host"));
  assert.equal(findWebviewLib(deep), join(root, "native", "libs", libName));
  rmSync(root, { recursive: true, force: true });
  rmSync(envHost, { recursive: true, force: true });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @zturnlibs/ztron-cli build 2>&1 | head -3; pnpm test:unit 2>&1 | grep "cli-native-locate"`
Expected: FAIL（`Cannot find module .../dist/native-locate.js`）

- [ ] **Step 3: 写 `native-locate.ts`（从 index.ts 原样搬移四个函数）**

```ts
/**
 * Native-chain locators shared by dev/build/check and doctor.
 * Resolution order per artifact: explicit env var, then walk-up
 * `native/libs/<file>` from the starting directory (8 levels).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Locate the txiki `tjs` binary (env ZTRON_TJS or on PATH). */
export function findTjs(): string {
  const configured = process.env.ZTRON_TJS;
  if (configured) {
    return configured;
  }
  const probe = spawnSync("tjs", ["-v"], { encoding: "utf8" });
  if (probe.status === 0) {
    return "tjs";
  }
  throw new Error(
    "txiki.js runtime (`tjs`) not found on PATH. Install it or set ZTRON_TJS=/path/to/tjs",
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
  return findNativeFile(appRoot, name);
}
```

然后 `packages/cli/src/index.ts`：删除本地 `findTjs`/`findNativeFile`/`findHostBin`/`findWebviewLib` 四个函数体，顶部加：

```ts
import {
  findTjs,
  findNativeFile,
  findHostBin,
  findWebviewLib,
} from "./native-locate.js";
```

（若 `findNativeFile` 在 index.ts 有其他调用点，保持不动——import 已覆盖。）

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @zturnlibs/ztron-cli build && pnpm test:unit 2>&1 | tail -5`
Expected: `pass 129+ / fail 0`（基线 126 + 新 3），全绿

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/native-locate.ts packages/cli/src/index.ts tests/unit/cli-native-locate.test.ts
git commit -m "refactor(cli): extract native-locate shared module (finders for dev/build/doctor)"
```

---

### Task 2: `ztron doctor` 体检命令

**Files:**
- Create: `packages/cli/src/doctor.ts`
- Modify: `packages/cli/src/index.ts`（help 文本 + switch case）
- Test: `tests/unit/cli-doctor.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `findTjs/findNativeFile/findHostBin/findWebviewLib`（import 自 `./native-locate.js`）
- Produces: `runDoctor(opts: { cwd: string; env: NodeJS.ProcessEnv; platform: string }): DoctorReport`，其中 `DoctorReport = { checks: Array<{ name: string; pass: boolean; detail: string; hint: string }>, ok: boolean }`——纯函数可测；index.ts 的 case 负责渲染与 exit code

- [ ] **Step 1: 写失败测试**

`tests/unit/cli-doctor.test.ts`：

```ts
/** `ztron doctor` — environment check for newcomers (all-pass / missing chains). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctor } from "../../packages/cli/dist/doctor.js";

function nativeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "ztron-doc-"));
  mkdirSync(join(root, "native", "libs"), { recursive: true });
  for (const f of ["tjs", "ztron-host", "libwebview.dylib", "webview.dll", "libwebview.so"]) {
    writeFileSync(join(root, "native", "libs", f), "x");
  }
  return root;
}

const CLEAN_ENV = { PATH: "/nonexistent-ztron-path" } as NodeJS.ProcessEnv;

test("doctor: all pass when chain is discoverable", () => {
  const repo = nativeRepo();
  const r = runDoctor({ cwd: repo, env: { ...CLEAN_ENV, ZTRON_TJS: join(repo, "native/libs/tjs") }, platform: "darwin" });
  assert.equal(r.ok, true);
  assert.equal(r.checks.length, 5);
  for (const c of r.checks) assert.equal(c.pass, true, `${c.name}: ${c.detail}`);
  rmSync(repo, { recursive: true, force: true });
});

test("doctor: missing host+tjs fails with hints, ok=false", () => {
  const empty = mkdtempSync(join(tmpdir(), "ztron-doc0-"));
  const r = runDoctor({ cwd: empty, env: CLEAN_ENV, platform: "darwin" });
  assert.equal(r.ok, false);
  const byName = Object.fromEntries(r.checks.map((c) => [c.name, c]));
  assert.equal(byName["tjs runtime"].pass, false);
  assert.match(byName["tjs runtime"].hint, /build-native\.sh/);
  assert.equal(byName["ztron-host"].pass, false);
  assert.equal(byName["webview library"].pass, false);
  assert.equal(byName["node >= 20"].pass, true);
  rmSync(empty, { recursive: true, force: true });
});

test("doctor: non-macOS platform yields a warning check", () => {
  const repo = nativeRepo();
  const r = runDoctor({ cwd: repo, env: { ...CLEAN_ENV, ZTRON_TJS: join(repo, "native/libs/tjs") }, platform: "linux" });
  const platform = r.checks.find((c) => c.name === "platform");
  assert.ok(platform);
  assert.equal(platform.pass, true); // warning, not failure
  assert.match(platform.detail, /skeleton|骨架/);
  rmSync(repo, { recursive: true, force: true });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @zturnlibs/ztron-cli build; pnpm test:unit 2>&1 | grep "cli-doctor"`
Expected: FAIL（`Cannot find module .../dist/doctor.js`）

- [ ] **Step 3: 写 `doctor.ts`**

```ts
/**
 * `ztron doctor` — one-shot environment check for newcomers.
 * Pure logic here (returns a report); index.ts renders and sets exit code.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { findTjs, findHostBin, findWebviewLib } from "./native-locate.js";

export interface DoctorCheck {
  name: string;
  pass: boolean;
  detail: string;
  hint: string;
}
export interface DoctorReport {
  checks: DoctorCheck[];
  ok: boolean;
}

const CHAIN_HINT =
  "clone https://github.com/ZturnLibs/ztron and run `scripts/build-native.sh`, then export ZTRON_TJS / ZTRON_HOST_BIN / ZTRON_WEBVIEW_LIB to native/libs/*";

export function runDoctor(opts: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  platform: string;
}): DoctorReport {
  const { cwd, env, platform } = opts;
  const checks: DoctorCheck[] = [];

  const nodeOk = Number.parseInt(process.versions.node, 10) >= 20;
  checks.push({
    name: "node >= 20",
    pass: nodeOk,
    detail: process.versions.node,
    hint: "install Node.js 20+ from https://nodejs.org",
  });

  try {
    const p = env.ZTRON_TJS ?? findTjs();
    checks.push({ name: "tjs runtime", pass: existsSync(resolve(p)) || p === "tjs", detail: p, hint: CHAIN_HINT });
  } catch (e) {
    checks.push({ name: "tjs runtime", pass: false, detail: String((e as Error).message), hint: CHAIN_HINT });
  }

  const host = env.ZTRON_HOST_BIN
    ? resolve(env.ZTRON_HOST_BIN)
    : findHostBin(cwd);
  checks.push({
    name: "ztron-host",
    pass: existsSync(host),
    detail: host,
    hint: CHAIN_HINT,
  });

  const lib = findWebviewLib(cwd);
  checks.push({
    name: "webview library",
    pass: Boolean(lib && existsSync(lib)),
    detail: lib ?? "not found",
    hint: CHAIN_HINT,
  });

  if (platform !== "darwin") {
    checks.push({
      name: "platform",
      pass: true, // warning only
      detail: `${platform} — host is a skeleton; macOS is the supported dev platform`,
      hint: "see ROADMAP.md for Windows/Linux status",
    });
  }

  return { checks, ok: checks.every((c) => c.pass) };
}
```

- [ ] **Step 4: index.ts 挂子命令**

help 文本（`index.ts` 的 usage 区，`ztron init` 行后）加：

```
 *   2b. ztron doctor                Check node/tjs/host/webview chain (exit 1 on fail)
```

switch 内（`case "init"` 后）加：

```ts
    case "doctor": {
      const { runDoctor } = await import("./doctor.js");
      const report = runDoctor({ cwd, env: process.env, platform: process.platform });
      for (const c of report.checks) {
        console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`);
        if (!c.pass) console.log(`      hint: ${c.hint}`);
      }
      console.log(report.ok ? "doctor: OK" : "doctor: FAILED");
      if (!report.ok) process.exitCode = 1;
      break;
    }
```

（顶部静态 import 亦可，避免动态 import 也行——用静态 `import { runDoctor } from "./doctor.js";` 与其他 import 并列，case 内直接调用。）

- [ ] **Step 5: 跑测试 + 手验**

Run: `pnpm --filter @zturnlibs/ztron-cli build && pnpm test:unit 2>&1 | tail -4 && node packages/cli/dist/index.js doctor; echo "exit=$?"`
Expected: 单测全绿；本机（worktree 无 native/libs 时）tjs 可能 PASS（PATH 有 tjs）而 host FAIL → `doctor: FAILED` exit 1；在仓库根跑则全绿 `doctor: OK` exit 0

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/doctor.ts packages/cli/src/index.ts tests/unit/cli-doctor.test.ts
git commit -m "feat(cli): ztron doctor - one-shot native-chain environment check"
```

---

### Task 3: `init` 下一步引导增强

**Files:**
- Modify: `packages/cli/src/index.ts`（`initProject` 函数尾部，约 686-731 行区域）
- Test: `tests/unit/cli-doctor.test.ts` 追加（或新建 `cli-init-hints.test.ts`）

**Interfaces:**
- Consumes: `runDoctor`（Task 2）、`findNativeFile`（Task 1）
- Produces: `nextSteps(target: string): string[]`（从 index.ts 导出不可行——index.ts 无守卫；改为在 `initProject` 内联调用 doctor 逻辑：向上探测 `native/libs/ztron-host`，探测不到则打印额外提醒。本任务产出为 `initProject` 的行为变化，验证以单测跑 CLI 进程 + 输出断言）

- [ ] **Step 1: 写失败测试**

`tests/unit/cli-init-hints.test.ts`：

```ts
/** `ztron init` prints next-step guidance incl. native-chain reminder. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = new URL("../../packages/cli/dist/index.js", import.meta.url).pathname;

test("init prints next steps with ZTRON_* hint outside a native repo", () => {
  const dir = mkdtempSync(join(tmpdir(), "ztron-init-"));
  const r = spawnSync(process.execPath, [CLI, "init", join(dir, "my-app")], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /next steps/i);
  assert.match(r.stdout, /ZTRON_TJS/);
  assert.match(r.stdout, /ztron dev/);
  assert.match(r.stdout, /ztron doctor/);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @zturnlibs/ztron-cli build; node --experimental-strip-types --test tests/unit/cli-init-hints.test.ts 2>&1 | tail -3`
Expected: FAIL（stdout 无 `next steps`）

- [ ] **Step 3: 修改 `initProject` 尾部**

`initProject` 末尾（现有两行 console.log 之后）追加：

```ts
  const hasChain = findNativeFile(target, "ztron-host") !== undefined;
  console.log(`[ztron] next steps:`);
  console.log(`  1. native chain (once): clone https://github.com/ZturnLibs/ztron && scripts/build-native.sh`);
  console.log(`  2. export ZTRON_TJS=<repo>/native/libs/tjs ZTRON_HOST_BIN=<repo>/native/libs/ztron-host ZTRON_WEBVIEW_LIB=<repo>/native/libs/libwebview.dylib`);
  console.log(`  3. pnpm install && npx ztron doctor && npx ztron dev`);
  if (!hasChain) {
    console.log(`[ztron] note: no native/libs found above ${target} — run \`ztron doctor\` after step 2.`);
  }
```

（`findNativeFile` 已由 Task 1 的 import 提供；若 index.ts 中该 import 仅此用，保留。）

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @zturnlibs/ztron-cli build && node --experimental-strip-types --test tests/unit/cli-init-hints.test.ts 2>&1 | tail -3 && pnpm test:unit 2>&1 | tail -3`
Expected: 新测试 PASS；全仓单测绿（基线 +4：locate 3 + doctor 3 + init 1 - 上一任务计数连续累计）

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/index.ts tests/unit/cli-init-hints.test.ts
git commit -m "feat(cli): init prints next-step guidance + native-chain reminder"
```

---

### Task 4: publish workflow 增发 npmjs 公共源

**Files:**
- Modify: `.github/workflows/publish.yml`

**Interfaces:**
- Produces: `publish-npm` job（与现有 `publish` job 并列，独立失败互不影响）；发布顺序沿用 leaf-first：`inject core runtime-ffi api cli driver`

- [ ] **Step 1: 追加 job（文件末尾）**

```yaml
  publish-npm:
    name: publish @zturnlibs/ztron-* to npmjs (public)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org
          scope: "@zturnlibs"
      - name: install
        run: pnpm install --frozen-lockfile
      - name: build (workspace)
        run: pnpm run build
      - name: publish (leaf-first, public scoped)
        run: |
          for d in packages/inject packages/core packages/runtime-ffi packages/api packages/cli packages/driver; do
            echo "--- publishing $d"
            (cd "$d" && pnpm publish --no-git-checks --access public) || exit 1
          done
```

（与 GitHub Packages job 的差异仅：registry-url、不设 NODE_AUTH_TOKEN 之外的额外 token——setup-node 的 `scope` + `registry-url` 会写入 .npmrc，token 来自 secret `NPM_TOKEN`，由 setup-node 自动读取环境变量 `NODE_AUTH_TOKEN`——需在 publish 步骤注入：把 publish 步骤改为 `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` 前缀，即：

```yaml
      - name: publish (leaf-first, public scoped)
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          for d in packages/inject packages/core packages/runtime-ffi packages/api packages/cli packages/driver; do
            echo "--- publishing $d"
            (cd "$d" && pnpm publish --no-git-checks --access public) || exit 1
          done
```

）

- [ ] **Step 2: YAML 校验**

Run: `ruby -ryaml -e "YAML.safe_load(File.read('.github/workflows/publish.yml')); puts 'yaml ok'"`
Expected: `yaml ok`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci(publish): npmjs public registry channel (NPM_TOKEN; independent of GitHub Packages)"
```

- [ ] **Step 4: 提醒用户（控制器职责，非提交）**

控制器在任务完成报告里提醒用户：到 npmjs.com 创建 `@zturnlibs` scope + automation token，配到仓库 Settings → Secrets → Actions → `NPM_TOKEN`；下个 `v*` tag 起双通道发布。

---

### Task 5: docs start/ — `intro.md` 与 `install.md` 重写（zh/en）

**Files:**
- Modify: `docs/zh/start/intro.md`, `docs/en/start/intro.md`, `docs/zh/start/install.md`, `docs/en/start/install.md`

**Interfaces:**
- Produces: 页面结构（intro 链向 install；install 链向 quick-start）；install 提供的 export 块与 quick-start 教程引用的路径写法一致（`<repo>/native/libs/…`）
- 事实源：命令与包名以 packages/cli 实际为准（`ztron init/dev/build/check/codegen/doctor`；`@zturnlibs/ztron-cli`）

- [ ] **Step 1: 重写 `docs/zh/start/intro.md`**

````markdown
---
title: 简介
---

# Ztron 是什么

Ztron 是一个 **Tauri 式跨平台桌面框架，用纯 TypeScript 重写**：~2MB 的
[txiki.js](https://txikijs.org) 运行时 + 系统 WebView。原生窗口、托盘、菜单、
对话框与 25 个官方插件，全部通过你熟悉的 Tauri 兼容 API 使用。

架构一句话：极小的原生 host（C，负责 WebView 与 GUI）+ 异步 TypeScript 后端
（txiki.js，负责 IPC / 插件 / ACL），前端就是普通 Vite 页面。

熟悉 Tauri？API 直接对齐——`invoke` / `listen` / `fs` / `window` 全在
[`@zturnlibs/ztron-api`](/start/quick-start)，差异清单见
[从 Tauri 迁移](/guide/tauri-migration)。

**下一步：[前置条件与安装](/start/install)**
````

- [ ] **Step 2: 重写 `docs/zh/start/install.md`**

````markdown
---
title: 前置条件与安装
---

# 前置条件

| 依赖 | 要求 | 说明 |
| --- | --- | --- |
| macOS | Apple Silicon（已验证） | Intel 未验证，可尝试；Windows/Linux 仅有 host 骨架，暂不可用 |
| Node.js | ≥ 20 | |
| pnpm | 9 | 构建原生链与示例使用 |
| Xcode Command Line Tools | 需要 | 编译原生链（txiki.js + ztron-host + webview 库） |

# 第 1 步：安装 CLI

```bash
npm i -g @zturnlibs/ztron-cli
```

> 包同时发布在 GitHub Packages。若 npmjs 不可用，可在 `~/.npmrc` 写入
> `@zturnlibs:registry=https://npm.pkg.github.com` 与
> `//npm.pkg.github.com/:_authToken=<你的 GitHub PAT>` 后再安装。

# 第 2 步：获取原生链（一次性）

原生链 = `tjs` 运行时 + `ztron-host`（原生窗口宿主）+ webview 动态库，
当前需从源码编译一次（约几分钟，仅首次与上游变更后需要）：

```bash
git clone https://github.com/ZturnLibs/ztron.git ~/ztron
cd ~/ztron
pnpm install
scripts/build-native.sh                 # 产出 native/libs/{tjs,ztron-host,libwebview.dylib}
```

# 第 3 步：指向原生链

把下面三行写进 `~/.zshrc`（路径按你的 clone 位置调整）：

```bash
export ZTRON_TJS=~/ztron/native/libs/tjs
export ZTRON_HOST_BIN=~/ztron/native/libs/ztron-host
export ZTRON_WEBVIEW_LIB=~/ztron/native/libs/libwebview.dylib
```

# 第 4 步：体检

```bash
ztron doctor
```

五行全 PASS、输出 `doctor: OK` 即装好。任何 FAIL 都带修复提示。

**下一步：[快速开始](/start/quick-start)**
````

- [ ] **Step 3: 写 `docs/en/start/intro.md` 与 `docs/en/start/install.md`（英文镜像）**

结构、标题层级、代码块与 zh 逐段对应（文案英译；命令/包名/路径不译）。en intro 结尾链接 `/start/install`，install 结尾链接 `/start/quick-start`；表内平台行：`macOS | Apple Silicon (verified)`；doctor 输出示例写 `doctor: OK`。

- [ ] **Step 4: 双语门禁 + 构建**

Run: `pnpm --dir docs run check:locales:deploy && pnpm --dir docs run build 2>&1 | tail -2`
Expected: `OK — zh/en trees match`；构建成功

- [ ] **Step 5: Commit**

```bash
git add docs/zh/start/intro.md docs/zh/start/install.md docs/en/start/intro.md docs/en/start/install.md
git commit -m "docs(start): tauri-style intro + prerequisites/install journey (zh/en)"
```

---

### Task 6: docs start/ — `quick-start.md` 重写（zh/en，核心教程页）

**Files:**
- Modify: `docs/zh/start/quick-start.md`, `docs/en/start/quick-start.md`

**Interfaces:**
- Consumes: install 页的环境变量与 CLI（`ztron init/dev/codegen/build/doctor`）；`defineCommand`/`invoke` 事实源（`examples/hello/src/commands.ts` 的 `defineCommand("my:greet", { args: {} as { name: string }, result: "" as string, handler })` 模式）
- Produces: 教程代码片段——Task 7 验收时逐条实测

- [ ] **Step 1: 重写 `docs/zh/start/quick-start.md`**

`````markdown
---
title: 快速开始
---

# Try Ztron（3 行）

前置：完成[前置条件与安装](/start/install)（`ztron doctor` 全绿）。

```bash
ztron init my-app && cd my-app
pnpm install
ztron dev
```

原生窗口出现「Hello Ztron」即成功。`dev` = Vite 构建前端 → 拉起原生窗口 →
启动 tjs 后端；前端改动即时热重载。

# 第一个应用

## 项目结构

```
my-app/
├── ztron.conf.json      # 窗口声明 + 入口（entry: src/main.ts）
├── src/main.ts          # 后端：连接 host、注册命令
└── frontend/            # 前端：普通 Vite 页面
    ├── index.html
    └── src/main.ts
```

## 改前端

编辑 `frontend/index.html`，把 `<h1>Hello Ztron</h1>` 改成
`<h1>我的第一个 Ztron 应用</h1>` 并加一个按钮：

```html
<h1>我的第一个 Ztron 应用</h1>
<button id="greet">打招呼</button>
<p id="out"></p>
```

保存后窗口内即时生效（Vite HMR）。

## 加一个 TypeScript 命令（后端 → 前端）

命令定义在后端（`src/main.ts` 旁新建 `src/commands.ts`）：

```ts
import { defineCommand } from "@zturnlibs/ztron-core";

export const greet = defineCommand("my:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => `你好, ${args.name}`,
});
```

在 `src/main.ts` 注册（AppBuilder 链上，`init` 模板已内置 registerCommand
调用处——把 `greet` 加入其 imports 与注册列表即可）：

```ts
import { greet } from "./commands.js";
```

生成类型化前端绑定并安装 API 包：

```bash
ztron codegen
pnpm i @zturnlibs/ztron-api
```

前端调用（`frontend/src/main.ts`）：

```ts
import { invoke } from "@zturnlibs/ztron-api";

document.getElementById("greet")!.onclick = async () => {
  document.getElementById("out")!.textContent = await invoke("my:greet", { name: "Ztron" });
};
```

点按钮 → 显示「你好, Ztron」。这条链（后端命令 → codegen → 前端 invoke）
就是 Ztron 应用的全部骨架。

## 打包

```bash
ztron build
```

产出独立 `.app`（ad-hoc 签名）。分发前可在
`ztron.conf.json` 修改 `identifier` 与窗口声明。

**下一步：[示例](/start/examples) · [架构](/guide/architecture) · [命令参考](/reference/commands)**
`````

- [ ] **Step 2: 写 `docs/en/start/quick-start.md`（英文镜像）**

结构与 zh 逐段对应；代码块逐字相同；链接同样指向 `/start/examples`、`/guide/architecture`、`/reference/commands`。

- [ ] **Step 3: 教程片段逐条实测（本任务核心步骤）**

在干净 tmpdir 按教程执行（worktree 仓库根提供原生链 + env 指向 worktree 的 `native/libs`；若 worktree 无原生链，用主仓库路径）：

Run: `cd $(mktemp -d) && ztron init my-app && cd my-app && pnpm install && ZTRON_DEV_URL= node ../../… `（实际以 `ztron dev --entry src/main.ts` 冒烟；无 GUI 断言窗口则以 `ztron build` exit 0 + `ztron check` 于 hello 为替代验证）
Expected: init/codegen/build 全部 exit 0；教程中代码片段与脚手架实际内容一致（若 `init` 模板与教程有出入——如模板未内置 registerCommand 调用处——**以实现为准修正教程文本**，并在报告记录）

- [ ] **Step 4: 双语门禁 + 构建**

Run: `pnpm --dir docs run check:locales:deploy && pnpm --dir docs run build 2>&1 | tail -2`
Expected: 门禁 OK、构建成功

- [ ] **Step 5: Commit**

```bash
git add docs/zh/start/quick-start.md docs/en/start/quick-start.md
git commit -m "docs(start): first-app tutorial (try 3-liner, structure, first TS command, package)"
```

---

### Task 7: `examples.md` 微调 + 端到端验收 + PR

**Files:**
- Modify: `docs/zh/start/examples.md`, `docs/en/start/examples.md`（仅开头定位句 + 结尾链接）

**Interfaces:**
- Consumes: Task 2 doctor、Task 6 教程页

- [ ] **Step 1: 微调 examples（zh/en）**

`docs/zh/start/examples.md` 顶部加一句：

```markdown
> `examples/` 属于框架仓库（贡献者/开发者视角）。普通应用开发请从[快速开始](/start/quick-start)的 `ztron init` 路径进入。
```

结尾追加：

```markdown
**深入：[架构](/guide/architecture) · [IPC](/guide/ipc) · [安全 ACL](/guide/security) · [API 参考](/en/reference/api/) · [命令参考](/reference/commands)**
```

en 版对应英译。

- [ ] **Step 2: 端到端验收（spec §7）**

1. 干净目录 init → dev → build（Task 6 Step 3 已覆盖，复核 exit 0）
2. `ztron doctor` 三态：仓库根全绿 exit 0；`PATH=/nonexistent cd /tmp && node <cli>/index.js doctor` → tjs/host/webview FAIL + hint + exit 1
3. 门禁 + 全仓：`pnpm --dir docs run check:locales:deploy && pnpm test 2>&1 | tail -3` → 门禁 OK、126+ pass / 0 fail
4. 检查 `npm view @zturnlibs/ztron-cli` ——若用户已配 `NPM_TOKEN` 并打 tag 发布则可见；未发布则在 PR 描述标注"npmjs 通道待 token"

- [ ] **Step 3: 双语门禁 + 构建最终复核**

Run: `pnpm --dir docs run check:locales:deploy && pnpm --dir docs run build 2>&1 | tail -1`
Expected: OK + 构建成功

- [ ] **Step 4: Commit + 推分支 + PR**

```bash
git add docs/zh/start/examples.md docs/en/start/examples.md
git commit -m "docs(start): examples positioning + deep-dive links (zh/en)"
git push -u origin feat/onboarding
gh pr create --base main --head feat/onboarding --title "feat: tauri-style onboarding (npmjs channel, ztron doctor, start/ journey)" --body "Spec: docs/superpowers/specs/2026-09-03-onboarding-journey-design.md. W1 publish-npm job (needs NPM_TOKEN secret), W2 ztron doctor + init guidance, W3 start/ journey rewrite (zh/en). Acceptance: clean-dir init->dev->build, doctor 3-state, locale gate, full tests."
```

- [ ] **Step 5: 合并后线上验证**

合并 main 后等 website.yml 绿，验证 `https://zturnlibs.github.io/ztron/docs/start/quick-start.html` 与 `/zh/` 对应页 200 且为新内容（grep `ztron init my-app`）。

---

## Self-Review 记录

- **Spec 覆盖**：W1 → Task 4；W2 doctor → Task 1+2，init 增强 → Task 3；W3 四页 → Task 5（intro/install）、Task 6（quick-start）、Task 7（examples）；验收 §7 → Task 6 Step 3 + Task 7 Step 2-5；风险表 → NPM_TOKEN 降级（Task 4 Step 4 + Task 5 fallback 写法）、教程漂移（Task 6 Step 3 以实现为准修正）。无缺口。
- **占位符扫描**：Task 6 教程中「把 greet 加入其 imports 与注册列表」依赖 init 模板实际形态——Task 6 Step 3 的实测步骤就是为此设计（以实现为准修正文本），非占位符。
- **类型一致性**：`runDoctor({cwd, env, platform})` 在 Task 2 定义、Task 3 消费；`findNativeFile` 签名 Task 1 定义、Task 3 initProject 使用；测试从 `dist/*.js` import 的模式与 cli-tools.test.ts 一致。
