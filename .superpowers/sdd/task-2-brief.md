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

