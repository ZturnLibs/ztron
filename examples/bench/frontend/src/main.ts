/**
 * Ztron bench frontend — auto-runs the measurement sequence and reports each
 * metric as a `BENCH_METRIC:name:value:unit` line through `bench:report`
 * (the backend echoes it to stdout where the CLI bench runner parses it).
 *
 * Sequence: invoke ×200 → Channel 1MB → events ×100 → window create ×10.
 */
import { invoke, Channel } from "@zturnlibs/ztron-api";
import { WebviewWindow } from "@zturnlibs/ztron-api/webviewWindow";
import { listen } from "@zturnlibs/ztron-api/event";

const report = (m: string, v: number, unit: string) =>
  invoke("bench:report", { received: `BENCH_METRIC:${m}:${v}:${unit}` });
const now = () => performance.now();

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
function p95(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]!;
}

/**
 * The IPC wire serializes args as JSON, so raw Uint8Array payloads do not
 * survive as binary (ztron convention: fs.writeFile also base64-encodes
 * before invoke). Encode the chunk once; the metric still counts the 1MB of
 * application bytes round-tripped through the Channel.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    bin += String.fromCharCode(...bytes.subarray(i, i + STEP));
  }
  return btoa(bin);
}

/**
 * WKWebView clamps performance.now() to 1ms granularity (a single invoke
 * round trip quantizes to 0/1ms), so latency samples time a BATCH of
 * invokes and average it — 20 invokes per sample gives ~50µs resolution.
 */
async function measureInvoke(): Promise<void> {
  const BATCH = 20;
  const lat: number[] = [];
  for (let s = 0; s < 10; s++) {
    const t = now();
    for (let i = 0; i < BATCH; i++) {
      await invoke("bench:ping", { n: s * BATCH + i });
    }
    lat.push((now() - t) / BATCH);
  }
  await report("invokeP50Ms", Number(median(lat).toFixed(3)), "ms");
  await report("invokeP95Ms", Number(p95(lat).toFixed(3)), "ms");
}

async function measureChannel(): Promise<void> {
  const chunk = new Uint8Array(64 * 1024).fill(65);
  const payload = bytesToBase64(chunk);
  const chunkBytes = chunk.byteLength;
  const total = 16; // 16 × 64KB = 1MB
  let received = 0;
  let finish = () => {};
  const done = new Promise<void>((res) => {
    finish = res;
  });
  const onChunk = (msg: string) => {
    received += Math.round((msg.length * 3) / 4); // decoded size of the base64 chunk
    if (received >= total * chunkBytes) finish();
  };
  const t = now();
  for (let i = 0; i < total; i++) {
    // A fresh Channel per chunk: the backend resolves each invoke's channel
    // marker to a NEW ChannelHandle whose message index starts at 0, so one
    // Channel reused across invokes would park every message after the first
    // in its out-of-order queue (hello's m3:stream instead sends all
    // messages from a single handler call, where the index advances).
    await invoke("bench:stream", { ch: new Channel<string>(onChunk), payload }); // backend echoes the payload onto the channel
  }
  await done;
  const secs = (now() - t) / 1000;
  await report(
    "channelMBps",
    Number((total * chunkBytes / 1048576 / secs).toFixed(2)),
    "MB/s",
  );
}

async function measureEvents(): Promise<void> {
  // Event round trip proxied by invoke (same link — brief口径), with the
  // same clock-granularity batching as measureInvoke (10 × 10).
  const BATCH = 10;
  const lat: number[] = [];
  for (let s = 0; s < 10; s++) {
    const t = now();
    for (let i = 0; i < BATCH; i++) {
      await invoke("bench:ping", { n: i });
    }
    lat.push((now() - t) / BATCH);
  }
  await report("eventRoundTripMs", Number(median(lat).toFixed(3)), "ms");
}

async function measureWindow(): Promise<void> {
  const lat: number[] = [];
  for (let i = 0; i < 10; i++) {
    const label = `bench-w${i}`;
    // ztron event family has no `tauri://created`; the backend broadcasts
    // `ztron://window-created` from createWindow — await it as the creation
    // signal (armed BEFORE create so the delivery is always captured).
    let fireCreated: (l: string) => void = () => {};
    const created = new Promise<void>((res) => {
      fireCreated = (l) => {
        if (l === label) res();
      };
    });
    const unlisten = await listen<{ label: string }>(
      "ztron://window-created",
      (e) => fireCreated(e.payload.label),
    );
    // Inline html: `url: "frontend"` is only resolved by fromConfig (conf
    // windows), not by runtime create — and loading the bench page itself
    // would re-run this sequence in every spawned window.
    const w = new WebviewWindow(label, {
      title: `bench${i}`,
      width: 320,
      height: 240,
      html: `<!doctype html><html><body style="font-family:system-ui"><p>bench ${i}</p></body></html>`,
    });
    const t = now();
    await w.create();
    await created;
    lat.push(now() - t);
    void unlisten();
    await w.destroy();
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
