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
