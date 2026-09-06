import { http, fetchStream, websocket, invoke } from "@zturnlibs/ztron-api";
import { act, extractError, type Demo } from "../demo-ui";
import type { Lang } from "../i18n";

/** 每个模块一个双语字典：可见文案（标题/描述/按钮/输出/代码注释）全覆盖 */
const STR = {
  zh: {
    category: "网络",
    fetch: {
      title: "HTTP 请求 fetch",
      description:
        "经后端代理的 fetch，受 scope 白名单约束（已放行 api.github.com 与 localhost）；越界域名直接被拒。",
      code: `import { http } from "@zturnlibs/ztron-api";

const resp = await http.fetch("https://api.github.com/zen");
console.log(resp.status, resp.ok, resp.body);

// scope 未放行的域名会抛错（见本卡片第二个按钮）
await http.fetch("https://evil.example.com/steal");`,
      getZen: "GET api.github.com/zen",
      outOfScope: "越界域名（scope 拒绝演示）",
      allowed: "竟然放行了？请检查 http scope 配置",
      rejected: (detail: string) => `符合预期被拒绝：${detail}`,
    },
    stream: {
      title: "流式下载 fetchStream",
      description: "响应头先返回，body 以 chunk 持续推送（ReadableStream），适合大文件与进度条。",
      code: `import { fetchStream } from "@zturnlibs/ztron-api";

const resp = await fetchStream(url);   // 头部先到
const reader = resp.body.getReader();
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  console.log("收到 chunk", value.length, "字节");
}`,
      read: "流式读取本地 /stream",
      done: (headMs: number, chunks: number, totalMs: number, text: string) =>
        `头部 ${headMs}ms 到达，body 分 ${chunks} 段、共 ${totalMs}ms 读尽：\n${text}`,
    },
    ws: {
      title: "WebSocket",
      description: "经后端托管的 WebSocket（连接/发消息/收消息/断开）；用公共回声服务器演示往返，需外网。",
      code: `import { websocket } from "@zturnlibs/ztron-api";

const { id } = await websocket.connect("wss://ws.postman-echo.com/raw");
websocket.onMessage((e) => console.log("收到：", e.message));
await websocket.sendMessage(id, "hello ztron");
await websocket.disconnect(id);`,
      run: "连接回声服务器并收发",
      ok: (msg: string) => `往返成功：${msg}`,
      timeout: (msg: string | null) => `8 秒内未收到回声（需外网）：${msg}`,
    },
  },
  en: {
    category: "Network",
    fetch: {
      title: "HTTP requests with fetch",
      description:
        "fetch proxied through the backend, restricted by the scope allowlist (api.github.com and localhost are allowed); out-of-scope hosts are rejected outright.",
      code: `import { http } from "@zturnlibs/ztron-api";

const resp = await http.fetch("https://api.github.com/zen");
console.log(resp.status, resp.ok, resp.body);

// Hosts not allowed by scope throw (see the second button on this card)
await http.fetch("https://evil.example.com/steal");`,
      getZen: "GET api.github.com/zen",
      outOfScope: "Out-of-scope host (scope rejection demo)",
      allowed: "The request went through? Please check the http scope configuration",
      rejected: (detail: string) => `Rejected as expected: ${detail}`,
    },
    stream: {
      title: "Streaming download with fetchStream",
      description:
        "Response headers arrive first while the body keeps streaming in as chunks (ReadableStream); great for large files and progress bars.",
      code: `import { fetchStream } from "@zturnlibs/ztron-api";

const resp = await fetchStream(url);   // headers arrive first
const reader = resp.body.getReader();
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  console.log("received chunk", value.length, "bytes");
}`,
      read: "Stream the local /stream endpoint",
      done: (headMs: number, chunks: number, totalMs: number, text: string) =>
        `Headers arrived in ${headMs}ms; body fully read in ${totalMs}ms across ${chunks} chunks:\n${text}`,
    },
    ws: {
      title: "WebSocket",
      description:
        "A backend-hosted WebSocket (connect / send / receive / disconnect); demonstrates a round trip against a public echo server, internet access required.",
      code: `import { websocket } from "@zturnlibs/ztron-api";

const { id } = await websocket.connect("wss://ws.postman-echo.com/raw");
websocket.onMessage((e) => console.log("received:", e.message));
await websocket.sendMessage(id, "hello ztron");
await websocket.disconnect(id);`,
      run: "Connect to the echo server and round-trip a message",
      ok: (msg: string) => `Round trip succeeded: ${msg}`,
      timeout: (msg: string | null) => `No echo within 8 seconds (internet access required): ${msg}`,
    },
  },
};

/** 按语言构建本分类目录；语言切换时 main.ts 会重建 */
export function netCatalog(lang: Lang): { category: string; demos: Demo[] } {
  const t = STR[lang];

  const fetchDemo: Demo = {
    id: "net.fetch",
    title: t.fetch.title,
    description: t.fetch.description,
    code: t.fetch.code,
    docPath: "/plugins/http.html",
    mount(area, out) {
      area.append(
        act(out, t.fetch.getZen, async () => {
          const resp = await http.fetch("https://api.github.com/zen");
          out.ok(`status ${resp.status}\n${resp.body}`);
        }),
        act(out, t.fetch.outOfScope, async () => {
          try {
            await http.fetch("https://evil.example.com/steal");
            out.ok(t.fetch.allowed);
          } catch (e) {
            out.ok(t.fetch.rejected(extractError(e).slice(0, 80)));
          }
        }),
      );
    },
  };

  const streamDemo: Demo = {
    id: "net.stream",
    title: t.stream.title,
    description: t.stream.description,
    code: t.stream.code,
    docPath: "/plugins/http.html",
    mount(area, out) {
      area.append(
        act(out, t.stream.read, async () => {
          const port = await invoke<number>("showcase:echo-port", {});
          const t0 = Date.now();
          const resp = await fetchStream(`http://localhost:${port}/stream`);
          const headMs = Date.now() - t0;
          const reader = resp.body.getReader();
          const dec = new TextDecoder();
          let chunks = 0;
          let text = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks++;
            text += dec.decode(value);
          }
          out.ok(t.stream.done(headMs, chunks, Date.now() - t0, text));
        }),
      );
    },
  };

  const wsDemo: Demo = {
    id: "net.websocket",
    title: t.ws.title,
    description: t.ws.description,
    code: t.ws.code,
    docPath: "/plugins/websocket.html",
    mount(area, out) {
      area.append(
        act(out, t.ws.run, async () => {
          const echoed = new Promise<string>((resolve) => {
            void websocket.onMessage((e) => resolve(e.message));
          });
          const { id } = await websocket.connect("wss://ws.postman-echo.com/raw");
          await websocket.sendMessage(id, "hello ztron");
          const msg = await Promise.race([
            echoed,
            new Promise<null>((r) => setTimeout(() => r(null), 8000)),
          ]);
          await websocket.disconnect(id);
          if (msg && msg.includes("hello ztron")) {
            out.ok(t.ws.ok(msg));
          } else {
            out.fail(t.ws.timeout(msg));
          }
        }),
      );
    },
  };

  return { category: t.category, demos: [fetchDemo, streamDemo, wsDemo] };
}
