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

