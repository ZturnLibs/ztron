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

