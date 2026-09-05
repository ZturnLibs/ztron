# Ztron 性能基准（ztron bench）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ztron bench` 一条命令产出 8 项性能指标（启动/IPC/窗口/内存/体积），对照入库预算超标的门禁。

**Architecture:** `examples/bench` 基准应用在 frontend 自动执行测量序列并以 `BENCH_METRIC:name:value:unit` 行上报（复用 `ztron check` 已验证的 `frontend reported` stdout 管道）；CLI 新增 `bench` 子命令编排多轮 spawn、阶段计时（PORT→backend connected→BENCH_READY→BENCH_DONE）、ps 内存采样、中位数/P95 统计、`perf-budget.json` 门禁比对。

**Tech Stack:** TypeScript（node:test + assert/strict）、node:child_process spawnSync/通常 spawn、`ps -o rss=`（macOS-only 指标）、examples workspace 模式。

**Spec:** `docs/superpowers/specs/2026-09-05-perf-bench-design.md`

## Global Constraints

- 工作分支 `feat/perf-bench`；worktree `/Users/zyj/Zturn/Ztron/.worktrees/perf-bench`（已建好、依赖已装、基线 134 tests / 0 fail）
- **所有 pnpm/npm 命令若静默挂起，用沙箱禁用重试**（本环境已知问题）
- TAG 管道对齐现状：frontend `invoke("bench:report", { received })` → backend `console.log('[bench] frontend reported: "<received>"')` → CLI 正则 `/frontend reported: "(.*)"/` 提取
- 指标行格式：`BENCH_METRIC:<name>:<value>:<unit>`；完成行 `BENCH_DONE`；失败行 `BENCH_FAIL:<reason>`
- 预算比对系数：时间/内存类 `actual > budget × 1.25` 判 FAIL；吞吐类 `actual < budget ÷ 1.25` 判 FAIL（吞吐 higherIsBetter：`channelMBps`）
- 统计纪律：每轮 spawn 前固定 1 次预热轮（不计入）；`--runs` 默认 3（有效轮次）；报告 median + P95
- 单测从 `dist/*.js` import，跑前 `pnpm --filter @zturnlibs/ztron-cli build`
- 全仓测试基线 134/0 不得回退；bench 应用对齐 examples/hello 现行模式（workspace:* 依赖 + `ztron dev --entry` 脚本）
- 首次 GUI 真跑需本机原生链（`ZTRON_TJS`/`ZTRON_HOST_BIN`/`ZTRON_WEBVIEW_LIB` 或仓库 `native/libs/`）；无原生链的环境 GUI 指标不可测（--no-gui 子集除外）
- 提交信息用 conventional commits；每个任务独立可验证并单独提交

---

### Task 1: `examples/bench` 基准应用

**Files:**
- Create: `examples/bench/package.json`, `examples/bench/tsconfig.json`, `examples/bench/ztron.conf.json`, `examples/bench/src/main.ts`, `examples/bench/src/tjs-extra.d.ts`, `examples/bench/frontend/index.html`, `examples/bench/frontend/src/main.ts`

**Interfaces:**
- Produces: backend 命令 `bench:report { received }`（stdout 回显 TAG 管道）、`bench:ping { n } → { n }`（invoke 往返靶）、`bench:sink { bytes } → { received }`（Channel 吞吐靶）；frontend 输出 `BENCH_METRIC:`/`BENCH_READY`/`BENCH_DONE`/`BENCH_FAIL`
- frontend 依赖：`@zturnlibs/ztron-api`（invoke/listen/Channel）

- [ ] **Step 1: 脚手架配置文件**

`examples/bench/package.json`：

```json
{
  "name": "@zturnlibs/ztron-example-bench",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "dev": "ztron dev --entry src/main.ts"
  },
  "dependencies": {
    "@zturnlibs/ztron-api": "workspace:*",
    "@zturnlibs/ztron-core": "workspace:*",
    "@zturnlibs/ztron-runtime-ffi": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "typescript": "^5.7.2",
    "@zturnlibs/ztron-cli": "workspace:*"
  }
}
```

`examples/bench/tsconfig.json`：照抄 `examples/hello/tsconfig.json`（读该文件逐字段复制）。

`examples/bench/ztron.conf.json`：

```json
{
  "entry": "src/main.ts",
  "frontend": "frontend",
  "identifier": "com.ztron.bench",
  "version": "0.3.1",
  "windows": [
    { "label": "main", "title": "Ztron Bench", "width": 640, "height": 480, "url": "frontend" }
  ]
}
```

- [ ] **Step 2: backend（src/main.ts）**

对齐 hello 的骨架（HostRuntime 连接 + AppBuilder + 命令注册），核心命令：

```ts
import { AppBuilder, fsPlugin } from "@zturnlibs/ztron-core";
import { HostRuntime } from "@zturnlibs/ztron-runtime-ffi";
import { benchReport, benchPing, benchSink } from "./commands.js";

declare const tjs: { env: Record<string, string | undefined> };

const runtime = new HostRuntime({
  host: tjs.env.ZTRON_HOST ?? "127.0.0.1",
  port: Number(tjs.env.ZTRON_HOST_PORT),
});
await runtime.connect();
console.log("[bench] backend connected");

const devUrl = tjs.env.ZTRON_DEV_URL;

new AppBuilder(runtime, "com.ztron.bench")
  .plugin(fsPlugin({ scope: { allow: ["$TMP/**"] } }))
  .setup((app) => {
    app.command(benchReport);
    app.command(benchPing);
    app.command(benchSink);
  })
  .run();
```

`src/commands.ts`（defineCommand 模式，对齐 examples/hello/src/commands.ts）：

```ts
import { defineCommand } from "@zturnlibs/ztron-core";

export const benchReport = defineCommand("bench:report", {
  args: {} as { received: string },
  result: "" as string,
  handler: (args) => {
    console.log(`[bench] frontend reported: "${args.received}"`);
    return "ok";
  },
});

export const benchPing = defineCommand("bench:ping", {
  args: {} as { n: number },
  result: 0 as number,
  handler: (args) => args.n,
});

export const benchSink = defineCommand("bench:sink", {
  args: {} as { bytes: number },
  result: 0 as number,
  handler: (args) => args.bytes,
});
```

`tjs-extra.d.ts`：照抄 `examples/hello/src/tjs-extra.d.ts`。

- [ ] **Step 3: frontend 测量序列（frontend/src/main.ts）**

```ts
import { invoke, Channel } from "@zturnlibs/ztron-api";

const report = (m: string, v: number, unit: string) =>
  invoke("bench:report", { received: `BENCH_METRIC:${m}:${v}:${unit}` });
const now = () => performance.now();

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1]! + s[mid]!) / 2;
}
function p95(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]!;
}

async function measureInvoke(): Promise<void> {
  const lat: number[] = [];
  for (let i = 0; i < 200; i++) {
    const t = now();
    await invoke("bench:ping", { n: i });
    lat.push(now() - t);
  }
  await report("invokeP50Ms", Number(median(lat).toFixed(3)), "ms");
  await report("invokeP95Ms", Number(p95(lat).toFixed(3)), "ms");
}

async function measureChannel(): Promise<void> {
  const chunk = new Uint8Array(64 * 1024).fill(65);
  const total = 16; // 16 × 64KB = 1MB
  const ch = new Channel<Uint8Array>();
  const t = now();
  const done = new Promise<void>((res) => {
    let received = 0;
    ch.onmessage = (m) => {
      received += m.byteLength;
      if (received >= total * chunk.byteLength) res();
    };
  });
  for (let i = 0; i < total; i++) {
    await invoke("bench:stream", { ch, payload: chunk }); // backend 回显到同一 channel
  }
  await done;
  const secs = (now() - t) / 1000;
  await report("channelMBps", Number((total * chunk.byteLength / 1048576 / secs).toFixed(2)), "MB/s");
}

async function measureEvents(): Promise<void> {
  const lat: number[] = [];
  for (let i = 0; i < 100; i++) {
    const t = now();
    await invoke("bench:ping", { n: i }); // 事件往返以 invoke 代理口径同链路
    lat.push(now() - t);
  }
  await report("eventRoundTripMs", Number(median(lat).toFixed(3)), "ms");
}

async function measureWindow(): Promise<void> {
  const lat: number[] = [];
  const { WebviewWindow } = await import("@zturnlibs/ztron-api/window");
  for (let i = 0; i < 10; i++) {
    const t = now();
    const w = new WebviewWindow(`bench-w${i}`, { title: `bench${i}`, width: 320, height: 240, url: "frontend" });
    await w.once("tauri://created"); // 对齐 ztron 事件名以实际为准，见 Step 4 校准
    lat.push(now() - t);
    await w.close();
  }
  await report("windowCreateMs", Number(median(lat).toFixed(1)), "ms");
}

async function main(): Promise<void> {
  await invoke("bench:report", { received: "BENCH_READY" });
  try {
    await measureInvoke();
    await measureChannel();
    await measureEvents();
    await measureWindow();
    await invoke("bench:report", { received: "BENCH_DONE" });
  } catch (e) {
    await invoke("bench:report", { received: `BENCH_FAIL:${String(e).slice(0, 120)}` });
  }
}
main();
```

`frontend/index.html`：最小壳（`<script type="module" src="/src/main.ts">`，对齐 hello）。

- [ ] **Step 4: 事件 API 校准（实现即事实源）**

hello frontend 的事件/窗口 API 用法（`listen`、`WebviewWindow` 导入路径、`tauri://created` 是否存在于 ztron 事件族）以 `examples/hello/frontend/src/main.ts` 与 `packages/api/src/` 为准逐一对齐；Channel 的 backend 回显命令 `bench:stream` 在 commands.ts 补一个 `defineCommand`（args 含 Channel，照抄 hello 的 `m3:stream` 模式）。教程口径与实现不一致处以实现为准并记录偏差。

- [ ] **Step 5: 构建与 GUI 冒烟**

Run: `pnpm install && pnpm --filter @zturnlibs/ztron-example-bench build && pnpm --filter @zturnlibs/ztron-example-bench exec ztron dev`（本机需原生链）
Expected: 窗口出现；stdout 依次出现 `[bench] backend connected`、多条 `[bench] frontend reported: "BENCH_METRIC:…"`、`BENCH_DONE`。

- [ ] **Step 6: Commit**

```bash
git add examples/bench pnpm-lock.yaml
git commit -m "feat(examples): bench app - automated perf measurement sequence (invoke/channel/window)"
```

---

### Task 2: bench-core 纯函数模块 + 单测

**Files:**
- Create: `packages/cli/src/bench-core.ts`
- Test: `tests/unit/cli-bench-core.test.ts`

**Interfaces:**
- Produces:
  - `parseBenchMetric(line: string): BenchMetric | null`（`BenchMetric = { name: string; value: number; unit: string }`；匹配 `[bench] frontend reported: "BENCH_METRIC:name:value:unit"` 与裸 `BENCH_METRIC:…` 两种行）
  - `median(xs: number[]): number`、`percentile(xs: number[], p: number): number`（最近秩法）
  - `type Budgets = Record<string, number>`
  - `HIGHER_IS_BETTER: ReadonlySet<string>`（含 `'channelMBps'`）
  - `compareBudgets(actual: Record<string, number>, budgets: Budgets, coef = 1.25): Array<{ name: string; actual: number; budget: number; pass: boolean }>`——higherIsBetter 的项 `pass = actual >= budget / coef`，其余 `pass = actual <= budget * coef`；budgets 缺项不比对

- [ ] **Step 1: 写失败测试**

`tests/unit/cli-bench-core.test.ts`：

```ts
/** bench-core: metric line parsing, stats, budget comparison. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseBenchMetric,
  median,
  percentile,
  compareBudgets,
} from "../../packages/cli/dist/bench-core.js";

test("parseBenchMetric: prefixed + bare forms, rejects junk", () => {
  const a = parseBenchMetric('[bench] frontend reported: "BENCH_METRIC:invokeP50Ms:1.5:ms"');
  assert.deepEqual(a, { name: "invokeP50Ms", value: 1.5, unit: "ms" });
  const b = parseBenchMetric("BENCH_METRIC:channelMBps:12.3:MB/s");
  assert.deepEqual(b, { name: "channelMBps", value: 12.3, unit: "MB/s" });
  assert.equal(parseBenchMetric("BENCH_DONE"), null);
  assert.equal(parseBenchMetric("random stdout noise"), null);
});

test("median + percentile", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 95), 19);
});

test("compareBudgets: time over-budget fails, throughput under-budget fails", () => {
  const r = compareBudgets(
    { invokeP50Ms: 3, channelMBps: 2, extraIgnored: 1 },
    { invokeP50Ms: 2, channelMBps: 4 },
  );
  const byName = Object.fromEntries(r.map((x) => [x.name, x]));
  assert.equal(byName.invokeP50Ms.pass, false); // 3 > 2 * 1.25? no -> 3 <= 2.5 is false? 3 > 2.5 -> fail
  assert.equal(byName.channelMBps.pass, false); // 2 < 4 / 1.25 = 3.2 -> fail
});
```

（注：invokeP50Ms 实际 3 vs 预算 2×1.25=2.5 → FAIL 为预期断言；如需 PASS 用例可在同一测试补 `{ invokeP50Ms: 2.4 }`。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @zturnlibs/ztron-cli build 2>&1 | head -3; pnpm test:unit 2>&1 | grep "cli-bench-core"`
Expected: FAIL（`Cannot find module .../dist/bench-core.js`）

- [ ] **Step 3: 实现 `bench-core.ts`**（纯函数，无 IO；median/percentile/parse 按测试语义；`percentile` 用最近秩：`sorted[min(n-1, ceil(p/100*n)-1)]`）

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @zturnlibs/ztron-cli build && pnpm test:unit 2>&1 | tail -3`
Expected: 全绿（121 基线 + 3）

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/bench-core.ts tests/unit/cli-bench-core.test.ts
git commit -m "feat(cli): bench-core - metric parsing, stats, budget comparison"
```

---

### Task 3: `ztron bench` 子命令（编排 + 门禁）

**Files:**
- Modify: `packages/cli/src/index.ts`（help 文本、switch case、`runApp` 的 CheckOptions 扩展）
- Modify: `packages/cli/src/native-locate.ts` —— 不改；内存采样直接 `spawnSync("ps", ["-o rss=", "-p", pid])`
- Create: `packages/cli/src/bench.ts`（编排：多轮 runApp、阶段计时、ps 采样、表格、--record/--json/--no-gui）

**Interfaces:**
- Consumes: Task 1 的 bench 应用（examples/bench 固定 entry）；Task 2 全部导出
- Produces: `runBench(opts: { cwd: string; runs: number; noGui: boolean; record: boolean; jsonPath: string }): Promise<BenchSummary>`——CLI case 渲染；`runApp` 的 options 增加可选 `bench?: { onLine?: (line: string) => void; onPids?: (p: { host: number; backend: number }) => void }`，bench 模式在 `BENCH_DONE` 后 resolve（对齐 check 的 resolve 语义）

- [ ] **Step 1: runApp 扩展（最小侵入）**

`packages/cli/src/index.ts` 的 `CheckOptions` 增加可选字段 `bench?: { onLine?: (line: string) => void; onPids?: (p: { host: number; backend: number }) => void }`；`mode: "dev" | "check" | "bench"`；`onLine` 处把每行转发给回调（在既有正则之后）；spawn host/backend 处调用 `onPids`；bench 模式遇 `BENCH_DONE` resolve、`BENCH_FAIL` reject、超时沿用 timeoutMs。**dev/check 现行为不变**（既有 86 项 check 与 hello dev 不回归）。

- [ ] **Step 2: bench.ts 编排**

结构（要点，实现按此展开）：

```ts
export interface BenchSummary {
  phases: Record<string, number>;   // coldStartMs, warmStartMs (median of runs)
  metrics: Record<string, number>;  // 各指标 median（channelMBps、windowCreateMs 同）
  p95: Record<string, number>;      // invokeP95Ms
  memory: { hostPeakKb: number; backendPeakKb: number };
  appSizeMb: number;
}
export async function runBench(opts: {
  cwd: string; runs: number; noGui: boolean; record: boolean; jsonPath: string;
}): Promise<{ summary: BenchSummary; comparison: ReturnType<typeof compareBudgets> | null }>
```

流程：
1. 冷启动轮（1 次预热 + runs 次有效）：`rmSync(join(appRoot, ".ztron"), { recursive: true, force: true })` 后 runApp(bench)，阶段计时由 `onLine` 打点（首个 `PORT=` 行、`backend connected` 行、`BENCH_READY`、`BENCH_DONE`）
2. 热启动轮：不删 `.ztron`，同样 runs 次
3. 每轮 onPids 触发 500ms 间隔 `ps -o rss=` 采样至进程退出，取峰值
4. `--no-gui`：跳过 1-3 的 spawn（或仅 backend 内存冒烟），仅计算 appSizeMb（`ztron build` 产物目录 du）
5. 汇总 median/P95 → compareBudgets（budgets 从 `<cwd>/perf-budget.json` 读，无文件则 comparison=null）
6. `--record`：将中位数写入 perf-budget.json（recordedAt/env 字段按 spec §3.3）
7. appSizeMb：`ztron build` 后对 `dist/` 内 `.app` 目录 `du -sk` 换算 MB——build 已由冷启动轮的构建步骤覆盖（冷启动即构建），直接对产物测

- [ ] **Step 3: CLI 接线**

help 加 `ztron bench [--runs n] [--record] [--no-gui] [--json <path>]`；switch case `bench` 调 runBench 并渲染表格（列：metric / median / p95 / budget / PASS-FAIL）；失败 exit 1。完成标记：全绿打印 `bench: OK`（对齐 doctor 风格）。

- [ ] **Step 4: 本地端到端**

Run: `node packages/cli/dist/index.js bench --runs 3`（worktree 根，需原生链）
Expected: 真实窗口闪现（多轮）、8 项指标有数值、无预算文件时提示 `--record`。

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/ website/../.. 
git add packages/cli/src/bench.ts packages/cli/src/index.ts
git commit -m "feat(cli): ztron bench - multi-run orchestration, phase timing, ps sampling, budget gate"
```

---

### Task 4: 基线记录 + 门禁实证 + 文档 + PR

**Files:**
- Create: `perf-budget.json`（仓库根）
- Modify: `.gitignore`（追加 `bench-results.json`）
- Modify: `README.md`（Quick start 后加 Bench 小节）、`docs/zh/start/examples.md` + `docs/en/start/examples.md`（链接 bench）

- [ ] **Step 1: --record 建基线**

Run: `node packages/cli/dist/index.js bench --runs 3 --record`
Expected: `perf-budget.json` 生成、8 项均为实测非零值（除 --no-gui 项）；复跑 `node packages/cli/dist/index.js bench --runs 3` → `bench: OK` exit 0。

- [ ] **Step 2: 门禁双向实证**

临时在 `examples/bench/src/commands.ts` 的 `benchPing` handler 加 `const s = Date.now(); while (Date.now() - s < 50);`（忙等 50ms）→ 复跑 → `invokeP95Ms` 项 FAIL 且 exit 1 → 移除忙等 → 复跑 OK。把两次 run 的 JSON 关键行贴进报告。

- [ ] **Step 3: 入库与文档**

- `perf-budget.json` 提交（本机 Apple Silicon 基线）；`.gitignore` 追加 `bench-results.json`
- README Quick start 后加：

```markdown
## Bench

```bash
node packages/cli/dist/index.js bench --runs 3            # measure vs budget
node packages/cli/dist/index.js bench --record --runs 3   # re-record baseline
```

Cold/warm start, invoke P50/P95, channel throughput, window create, RSS, app size.
Budgets are machine-local (Apple Silicon baseline); see perf-budget.json.
```

- docs examples 页尾链接加 Bench 说明一句（zh/en）。

- [ ] **Step 4: 全量回归 + PR**

Run: `pnpm test 2>&1 | grep -E "ℹ (pass|fail)"`（≥134/0）
Push 分支 → PR（body 含：8 项指标实测表、门禁双向实证证据、perf-budget.json 内容、已知限制 en nav 文本）→ 合并 main。

---

## Self-Review 记录

- **Spec 覆盖**：§2 八项指标 → Task 1（frontend 测量 invoke/channel/event/window）+ Task 3（启动阶段、体积、内存）+ Task 4（budget 落库）；§3 三组件 → Task 1/3/4；§4 门禁语义与 CI 策略 → Task 3 compareBudgets + Task 4 Step 2；§5 验收 6 条 → Task 3 Step 4、Task 4 Step 1-4。无缺口。
- **占位符扫描**：Task 1 Step 3 的 `tauri://created` 与 `bench:stream` 回显命令标注了"以实现为准校准"（Step 4 是显式校准步骤），非占位符。
- **类型一致性**：`parseBenchMetric/median/percentile/compareBudgets` Task 2 定义、Task 3 消费；`BenchMetric` 形状与 `BENCH_METRIC:` 行格式一致；`runBench` opts 与 CLI case 对齐。
