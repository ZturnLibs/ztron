/**
 * Ztron bench — backend.
 *
 * Minimal window app hosting the perf-bench measurement commands. The main
 * window loads the Vite frontend (`ztron dev`), which auto-runs the
 * measurement sequence and reports each metric through `bench:report`
 * (echoed to stdout as `[bench] frontend reported: "BENCH_*"` — the same
 * TAG pipeline hello uses, parsed by the CLI bench runner in a later task).
 */
import { AppBuilder, fsPlugin } from "@zturnlibs/ztron-core";
import { HostRuntime } from "@zturnlibs/ztron-runtime-ffi";
import {
  benchReport,
  benchPing,
  benchSink,
  benchStream,
} from "./commands.js";

declare const tjs: {
  env: Record<string, string | undefined>;
};

const runtime = new HostRuntime({
  host: tjs.env.ZTRON_HOST ?? "127.0.0.1",
  port: Number(tjs.env.ZTRON_HOST_PORT),
});
await runtime.connect();
console.log("[bench] backend connected");

const devUrl = tjs.env.ZTRON_DEV_URL;
const invokeKey =
  tjs.env.ZTRON_INVOKE_KEY ?? Math.random().toString(36).slice(2);
const confJson = tjs.env.ZTRON_CONF;
const conf = confJson
  ? (JSON.parse(confJson) as Parameters<AppBuilder["fromConfig"]>[0])
  : {};

new AppBuilder(runtime, "com.ztron.bench")
  .configure({ invokeKey })
  .fromConfig(conf, { frontendUrl: devUrl ?? undefined })
  .plugin(fsPlugin({ scope: { allow: ["$TMP/**"] } }))
  .setup((app) => {
    app.commandDef(benchReport);
    app.commandDef(benchPing);
    app.commandDef(benchSink);
    app.commandDef(benchStream);
  })
  .build()
  .run();
