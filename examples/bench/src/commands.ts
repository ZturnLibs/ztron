/**
 * Bench commands — the measurement targets the frontend drives.
 *
 * Each `defineCommand` is registered via `app.commandDef` (hello pattern);
 * `ztron codegen` can emit type-safe frontend bindings from these exports.
 */
import { defineCommand } from "@zturnlibs/ztron-core";

/** TAG pipeline: echoes frontend BENCH_* lines to stdout for the bench runner. */
export const benchReport = defineCommand("bench:report", {
  args: {} as { received: string },
  result: "" as string,
  handler: (args) => {
    console.log(`[bench] frontend reported: "${args.received}"`);
    return "ok";
  },
});

/** Invoke round-trip target: echoes n back. */
export const benchPing = defineCommand("bench:ping", {
  args: {} as { n: number },
  result: 0 as number,
  handler: (args) => args.n,
});

/** Byte-count sink (kept from the brief's interface; the live throughput path is bench:stream). */
export const benchSink = defineCommand("bench:sink", {
  args: {} as { bytes: number },
  result: 0 as number,
  handler: (args) => args.bytes,
});

/**
 * Channel throughput target: echoes the payload back over the caller's
 * channel (hello `m3:stream` pattern — the wire delivers the Channel as a
 * `{ kind: "channel", id }` marker resolved through `ctx.getChannel`).
 */
export const benchStream = defineCommand("bench:stream", {
  args: {} as { ch?: { kind: "channel"; id: number }; payload?: string },
  result: 0 as number,
  handler: (args, ctx) => {
    if (!args.ch) {
      return -1;
    }
    const handle = ctx.getChannel(args.ch.id);
    if (!handle) {
      return -1;
    }
    handle.send(args.payload);
    return args.payload?.length ?? 0;
  },
});
