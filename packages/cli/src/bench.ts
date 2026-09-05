/**
 * `ztron bench` — orchestration for the perf benchmark.
 *
 * Drives the examples/bench app through runApp(bench mode) in multiple
 * rounds (cold = fresh .ztron build dir, warm = reused), derives per-round
 * phase timings from stdout markers (PORT= -> backend connected ->
 * BENCH_READY -> BENCH_DONE), samples host/backend RSS via `ps -o rss=`,
 * measures the packaged .app size and applies the perf-budget.json gate
 * (--record rewrites the baseline instead of comparing).
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { cpus } from "node:os";
import { join, resolve } from "node:path";
import { buildApp, runApp } from "./index.js";
import {
  compareBudgets,
  median,
  parseBenchMetric,
  percentile,
  type BudgetCheck,
  type Budgets,
} from "./bench-core.js";

const BENCH_ENTRY = "src/main.ts";
const ROUND_TIMEOUT_MS = 120_000;
const PS_INTERVAL_MS = 500;

/** Metric rows the gate knows about (table order). */
const GATE_METRICS = [
  "coldStartMs",
  "warmStartMs",
  "invokeP50Ms",
  "invokeP95Ms",
  "channelMBps",
  "eventRoundTripMs",
  "windowCreateMs",
  "appSizeMb",
] as const;

export interface BenchRound {
  label: string;
  kind: "cold" | "warm";
  discarded: boolean;
  /** ms from spawn start to each stdout marker (0 = marker never seen). */
  phases: { portMs: number; connectMs: number; readyMs: number; doneMs: number };
  metrics: Record<string, number>;
  hostPeakKb: number;
  backendPeakKb: number;
}

export interface BenchSummary {
  /** coldStartMs / warmStartMs medians (+ per-phase diagnostic medians). */
  phases: Record<string, number>;
  /** Runtime metrics reported by the app (median across valid rounds). */
  metrics: Record<string, number>;
  /** Per-metric P95 across valid rounds. */
  p95: Record<string, number>;
  memory: { hostPeakKb: number; backendPeakKb: number };
  appSizeMb: number;
}

export interface RunBenchResult {
  summary: BenchSummary;
  comparison: BudgetCheck[] | null;
  budgets: Budgets | null;
  rounds: BenchRound[];
  recorded: boolean;
  jsonPath: string;
}

export interface RunBenchOptions {
  cwd: string;
  runs: number;
  noGui: boolean;
  record: boolean;
  jsonPath: string;
  timeoutMs?: number;
}

/** One `ps -o rss=` sample (KB); null once the pid is gone. */
function readRssKb(pid: number): number | null {
  const r = spawnSync("ps", ["-o", "rss=", "-p", String(pid)], {
    encoding: "utf8",
  });
  if (r.status !== 0 || r.error) return null;
  const kb = Number.parseInt(r.stdout.trim(), 10);
  return Number.isFinite(kb) ? kb : null;
}

/** Recursive on-disk size of a directory (symlinks not followed). */
function dirSizeBytes(dir: string): number {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      total += dirSizeBytes(p);
    } else {
      total += statSync(p).size;
    }
  }
  return total;
}

/**
 * Packs the bench app (`ztron build` pipeline) and measures the .app bundle
 * in dist/ (equivalent of `du -sk <app>`). The DMG step is suppressed for
 * speed; on build failure an existing dist/*.app is still measured.
 */
async function measureAppSizeMb(appRoot: string): Promise<number> {
  const dist = join(appRoot, "dist");
  const findAppBundle = (): string | undefined => {
    if (!existsSync(dist)) return undefined;
    return readdirSync(dist)
      .filter((d) => d.endsWith(".app"))
      .map((d) => join(dist, d))
      .find((p) => existsSync(p));
  };
  const prevNoDmg = process.env.ZTRON_NO_DMG;
  process.env.ZTRON_NO_DMG = "1";
  try {
    await buildApp(appRoot, BENCH_ENTRY);
  } catch (err) {
    console.warn(`[ztron] bench: app build failed (${String(err).slice(0, 160)})`);
  } finally {
    if (prevNoDmg === undefined) {
      delete process.env.ZTRON_NO_DMG;
    } else {
      process.env.ZTRON_NO_DMG = prevNoDmg;
    }
  }
  const bundle = findAppBundle();
  if (!bundle) return 0;
  return Math.round((dirSizeBytes(bundle) / 1048576) * 100) / 100;
}

/** Spawns the bench app once and collects its phases/metrics/RSS peaks. */
async function spawnRound(
  appRoot: string,
  kind: "cold" | "warm",
  timeoutMs: number,
): Promise<BenchRound> {
  if (kind === "cold") {
    rmSync(join(appRoot, ".ztron"), { recursive: true, force: true });
  }
  const t0 = Date.now();
  const stamps = { port: 0, connect: 0, ready: 0, done: 0 };
  const metrics: Array<{ name: string; value: number; unit: string }> = [];
  let hostPid = -1;
  let backendPid = -1;
  let hostPeakKb = 0;
  let backendPeakKb = 0;
  let sampler: ReturnType<typeof setInterval> | null = null;

  const sampleOnce = () => {
    if (hostPid > 0) hostPeakKb = Math.max(hostPeakKb, readRssKb(hostPid) ?? 0);
    if (backendPid > 0) {
      backendPeakKb = Math.max(backendPeakKb, readRssKb(backendPid) ?? 0);
    }
  };

  const onLine = (line: string) => {
    const t = line.trim();
    if (!stamps.port && /^PORT=\d+$/.test(t)) {
      stamps.port = Date.now();
      console.log(`  [app] ${t}`);
      return;
    }
    const metric = parseBenchMetric(t);
    if (metric) {
      metrics.push(metric);
      console.log(`  [app] ${t}`);
      return;
    }
    if (!stamps.connect && t.includes("backend connected")) {
      stamps.connect = Date.now();
      console.log(`  [app] ${t}`);
      return;
    }
    if (t.includes("BENCH_READY")) {
      stamps.ready = Date.now();
      console.log(`  [app] ${t}`);
      return;
    }
    if (t.includes("BENCH_DONE")) {
      stamps.done = Date.now();
      console.log(`  [app] ${t}`);
    }
  };

  try {
    await runApp(appRoot, BENCH_ENTRY, "bench", {
      timeoutMs,
      required: [],
      bench: {
        onLine,
        onPids: (p) => {
          hostPid = p.host;
          backendPid = p.backend;
          sampleOnce();
          sampler = setInterval(sampleOnce, PS_INTERVAL_MS);
        },
      },
    });
  } finally {
    if (sampler) clearInterval(sampler);
  }

  const at = (t: number) => (t > 0 ? t : Date.now()) - t0;
  return {
    label: kind,
    kind,
    discarded: false,
    phases: {
      portMs: at(stamps.port),
      connectMs: at(stamps.connect),
      readyMs: at(stamps.ready),
      doneMs: at(stamps.done),
    },
    metrics: Object.fromEntries(metrics.map((m) => [m.name, m.value])),
    hostPeakKb,
    backendPeakKb,
  };
}

/** Aggregates valid (non-discarded) rounds into the summary. */
function summarize(rounds: BenchRound[], appSizeMb: number): BenchSummary {
  const valid = rounds.filter((r) => !r.discarded);
  const cold = valid.filter((r) => r.kind === "cold");
  const warm = valid.filter((r) => r.kind === "warm");

  const phases: Record<string, number> = {};
  const phaseSources: Array<[string, number[]]> = [
    ["coldStartMs", cold.map((r) => r.phases.readyMs)],
    ["warmStartMs", warm.map((r) => r.phases.readyMs)],
    ["coldPortMs", cold.map((r) => r.phases.portMs)],
    ["coldConnectMs", cold.map((r) => r.phases.connectMs)],
    ["coldDoneMs", cold.map((r) => r.phases.doneMs)],
    ["warmPortMs", warm.map((r) => r.phases.portMs)],
    ["warmConnectMs", warm.map((r) => r.phases.connectMs)],
    ["warmDoneMs", warm.map((r) => r.phases.doneMs)],
  ];
  for (const [key, xs] of phaseSources) {
    const seen = xs.filter((n) => n > 0);
    if (seen.length > 0) phases[key] = median(seen); // guard: median([]) is NaN
  }

  const byName = new Map<string, number[]>();
  for (const r of valid) {
    for (const [name, v] of Object.entries(r.metrics)) {
      const xs = byName.get(name) ?? [];
      xs.push(v);
      byName.set(name, xs);
    }
  }
  const metrics: Record<string, number> = {};
  const p95: Record<string, number> = {};
  for (const [name, xs] of byName) {
    if (xs.length === 0) continue; // empty-sample guard
    metrics[name] = median(xs);
    p95[name] = percentile(xs, 95);
  }
  for (const [key, src] of [
    ["coldStartMs", cold],
    ["warmStartMs", warm],
  ] as const) {
    const xs = src.map((r) => r.phases.readyMs).filter((n) => n > 0);
    if (xs.length > 0) p95[key] = percentile(xs, 95);
  }

  return {
    phases,
    metrics,
    p95,
    memory: {
      hostPeakKb: Math.max(0, ...valid.map((r) => r.hostPeakKb)),
      backendPeakKb: Math.max(0, ...valid.map((r) => r.backendPeakKb)),
    },
    appSizeMb,
  };
}

/** The gate's view of the summary: canonical metrics that were measured. */
function canonicalActual(s: BenchSummary): Record<string, number> {
  const all: Record<string, number> = {
    ...s.phases,
    ...s.metrics,
    appSizeMb: s.appSizeMb,
  };
  const out: Record<string, number> = {};
  for (const k of GATE_METRICS) {
    const v = all[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      // 4 decimals: keeps the recorded budget file diff-friendly.
      out[k] = Math.round(v * 10000) / 10000;
    }
  }
  return out;
}

interface BudgetFile {
  _comment?: string;
  recordedAt?: string;
  env?: Record<string, unknown>;
  budgets?: Budgets;
}

function readBudgetFile(path: string): BudgetFile | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as BudgetFile;
  } catch {
    console.warn(`[ztron] bench: ignoring malformed ${path}`);
    return null;
  }
}

export async function runBench(opts: RunBenchOptions): Promise<RunBenchResult> {
  const appRoot = resolve(opts.cwd, "examples", "bench");
  if (!existsSync(join(appRoot, BENCH_ENTRY))) {
    throw new Error(
      `bench app not found: ${join(appRoot, BENCH_ENTRY)} (run ztron bench from the repo root)`,
    );
  }
  const runs = Math.max(1, Math.floor(opts.runs) || 3);
  const timeoutMs = opts.timeoutMs ?? ROUND_TIMEOUT_MS;
  console.log(
    `[ztron] bench: ${appRoot} (runs=${runs}${opts.noGui ? ", --no-gui" : ""})`,
  );

  const rounds: BenchRound[] = [];
  const runRound = async (kind: "cold" | "warm", warmup: boolean, i = 0) => {
    const label = warmup ? `${kind} warmup (discarded)` : `${kind} ${i}/${runs}`;
    console.log(`[ztron] round: ${label}`);
    const r = await spawnRound(appRoot, kind, timeoutMs);
    r.label = label;
    r.discarded = warmup;
    rounds.push(r);
  };

  const appSizeMb = await measureAppSizeMb(appRoot);
  console.log(`[ztron] app size: ${appSizeMb.toFixed(2)} MB`);

  if (!opts.noGui) {
    console.log("[ztron] cold phase (fresh .ztron build dir every spawn):");
    await runRound("cold", true); // fixed warmup, not counted in --runs
    for (let i = 1; i <= runs; i++) await runRound("cold", false, i);
    console.log("[ztron] warm phase (build reused):");
    await runRound("warm", true);
    for (let i = 1; i <= runs; i++) await runRound("warm", false, i);
  }

  const summary = summarize(rounds, appSizeMb);
  const budgetPath = join(opts.cwd, "perf-budget.json");
  const budgetFile = readBudgetFile(budgetPath);
  const budgets = budgetFile?.budgets ?? null;
  const actual = canonicalActual(summary);
  const comparison =
    !opts.record && budgets ? compareBudgets(actual, budgets) : null;

  let recorded = false;
  if (opts.record) {
    const doc = {
      _comment:
        "预算基线；ztron bench --record 重写。比对：时间/内存 ×1.25、吞吐 ÷1.25 内为 PASS",
      recordedAt: new Date().toISOString(),
      env: {
        platform: process.platform,
        arch: process.arch,
        note: `${cpus()[0]?.model?.trim() ?? "unknown cpu"} — machine-local baseline`,
      },
      budgets: { ...(budgetFile?.budgets ?? {}), ...actual },
    };
    writeFileSync(budgetPath, JSON.stringify(doc, null, 2) + "\n");
    recorded = true;
    console.log(`[ztron] baseline recorded: ${budgetPath}`);
  }

  const doc = {
    recordedAt: new Date().toISOString(),
    cwd: opts.cwd,
    runs,
    noGui: opts.noGui,
    record: opts.record,
    budgetFile: budgetPath,
    summary,
    rounds,
    comparison,
  };
  writeFileSync(opts.jsonPath, JSON.stringify(doc, null, 2) + "\n");
  console.log(`[ztron] results: ${opts.jsonPath}`);

  return {
    summary,
    comparison,
    budgets,
    rounds,
    recorded,
    jsonPath: opts.jsonPath,
  };
}

/** Terminal table (metric / median / p95 / budget / PASS-FAIL) + verdict. */
export function renderBenchReport(r: RunBenchResult): void {
  const { summary } = r;
  const actual = canonicalActual(summary);
  const checkByName = new Map((r.comparison ?? []).map((c) => [c.name, c]));
  const fmt = (n: number | undefined): string => {
    if (n === undefined || !Number.isFinite(n)) return "-";
    return n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  };
  const cols = (name: string, med: string, p95: string, budget: string, verdict: string) =>
    `${name.padEnd(20)}${med.padStart(11)}  ${p95.padStart(11)}  ${budget.padStart(11)}  ${verdict}`;

  console.log("");
  console.log(cols("metric", "median", "p95", "budget", "verdict"));
  console.log("-".repeat(64));
  for (const name of GATE_METRICS) {
    const med = actual[name];
    const budget = r.budgets?.[name];
    const check = checkByName.get(name);
    const verdict = check
      ? check.pass
        ? "PASS"
        : "FAIL"
      : med === undefined
        ? "skipped"
        : "-";
    console.log(cols(name, fmt(med), fmt(summary.p95[name]), fmt(budget), verdict));
  }
  console.log(
    cols(
      "memory.hostPeakKb",
      fmt(summary.memory.hostPeakKb),
      "-",
      "-",
      "smoke",
    ),
  );
  console.log(
    cols(
      "memory.backendPeakKb",
      fmt(summary.memory.backendPeakKb),
      "-",
      "-",
      "smoke",
    ),
  );
  console.log("-".repeat(64));

  if (r.recorded) {
    console.log("bench: OK (baseline recorded — re-run without --record to gate)");
    return;
  }
  if (r.comparison) {
    const failed = r.comparison.filter((c) => !c.pass);
    for (const c of failed) {
      console.log(
        `FAIL ${c.name}: actual=${c.actual} budget=${c.budget} (tolerance x1.25)`,
      );
    }
    console.log(failed.length === 0 ? "bench: OK" : "bench: FAILED");
    if (failed.length > 0) process.exitCode = 1;
    return;
  }
  console.log("hint: no perf-budget.json found — run with --record first");
}
