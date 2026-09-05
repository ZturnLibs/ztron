/**
 * bench-core: pure helpers for `ztron bench` — metric line parsing,
 * order-statistics (median/percentile) and budget comparison.
 * No IO lives here; orchestration (spawn/timeout) stays in the command layer.
 */

/** One parsed performance metric reported by the bench frontend. */
export interface BenchMetric {
  name: string;
  value: number;
  unit: string;
}

/**
 * Parses a bench metric line. Accepts both the embedded form
 * `[bench] frontend reported: "BENCH_METRIC:name:value:unit"` (as emitted by
 * the console log bridge) and the bare `BENCH_METRIC:name:value:unit` form.
 * Returns `null` for any other line.
 */
export function parseBenchMetric(line: string): BenchMetric | null {
  const match = line.match(/BENCH_METRIC:([A-Za-z0-9_]+):(-?\d+(?:\.\d+)?):([^:\s"]+)/);
  if (!match) {
    return null;
  }
  return { name: match[1]!, value: Number(match[2]), unit: match[3]! };
}

/** Median of `xs` (average of the two middle values for even lengths). */
export function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Nearest-rank percentile: `sorted[min(n-1, ceil(p/100*n)-1)]`. */
export function percentile(xs: number[], p: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const n = sorted.length;
  const rank = Math.min(n - 1, Math.ceil((p / 100) * n) - 1);
  return sorted[rank]!;
}

/** Named budget values (same keys as reported metrics), in metric units. */
export type Budgets = Record<string, number>;

/** Metrics where a larger value is better (e.g. throughput). */
export const HIGHER_IS_BETTER: ReadonlySet<string> = new Set(["channelMBps"]);

export interface BudgetCheck {
  name: string;
  actual: number;
  budget: number;
  pass: boolean;
}

/**
 * Compares measured values against budgets with tolerance `coef`
 * (default 1.25). Metrics in `HIGHER_IS_BETTER` pass when
 * `actual >= budget / coef`; everything else passes when
 * `actual <= budget * coef`. Actuals without a budget (or budgets without
 * an actual) are skipped.
 */
export function compareBudgets(
  actual: Record<string, number>,
  budgets: Budgets,
  coef = 1.25,
): BudgetCheck[] {
  const checks: BudgetCheck[] = [];
  for (const [name, budget] of Object.entries(budgets)) {
    if (!(name in actual)) {
      continue;
    }
    const value = actual[name]!;
    const pass = HIGHER_IS_BETTER.has(name)
      ? value >= budget / coef
      : value <= budget * coef;
    checks.push({ name, actual: value, budget, pass });
  }
  return checks;
}
