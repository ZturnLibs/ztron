import { http, fetchStream, websocket, invoke } from "@zturnlibs/ztron-api";
import { act, extractError, type Demo } from "../demo-ui";

const fetchDemo: Demo = {
  id: "net.fetch",
  title: "HTTP 请求 fetch",
  description: "经后端代理的 fetch，受 scope 白名单约束（已放行 api.github.com 与 localhost）；越界域名直接被拒。",
  code: `import { http } from "@zturnlibs/ztron-api";

const resp = await http.fetch("https://api.github.com/zen");
console.log(resp.status, resp.ok, resp.body);

// scope 未放行的域名会抛错（见本卡片第二个按钮）
await http.fetch("https://evil.example.com/steal");`,
  docPath: "/plugins/http.html",
  mount(area, out) {
    area.append(
      act(out, "GET api.github.com/zen", async () => {
        const resp = await http.fetch("https://api.github.com/zen");
        out.ok(`status ${resp.status}\n${resp.body}`);
      }),
      act(out, "越界域名（scope 拒绝演示）", async () => {
        try {
          await http.fetch("https://evil.example.com/steal");
          out.ok("竟然放行了？请检查 http scope 配置");
        } catch (e) {
          out.ok(`符合预期被拒绝：${extractError(e).slice(0, 80)}`);
        }
      }),
    );
  },
};

const streamDemo: Demo = {
  id: "net.stream",
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
  docPath: "/plugins/http.html",
  mount(area, out) {
    area.append(
      act(out, "流式读取本地 /stream", async () => {
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
        out.ok(
          `头部 ${headMs}ms 到达，body 分 ${chunks} 段、共 ${Date.now() - t0}ms 读尽：\n${text}`,
        );
      }),
    );
  },
};

const wsDemo: Demo = {
  id: "net.websocket",
  title: "WebSocket",
  description: "经后端托管的 WebSocket（连接/发消息/收消息/断开）；用公共回声服务器演示往返，需外网。",
  code: `import { websocket } from "@zturnlibs/ztron-api";

const { id } = await websocket.connect("wss://ws.postman-echo.com/raw");
websocket.onMessage((e) => console.log("收到：", e.message));
await websocket.sendMessage(id, "hello ztron");
await websocket.disconnect(id);`,
  docPath: "/plugins/websocket.html",
  mount(area, out) {
    area.append(
      act(out, "连接回声服务器并收发", async () => {
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
          out.ok(`往返成功：${msg}`);
        } else {
          out.fail(`8 秒内未收到回声（需外网）：${msg}`);
        }
      }),
    );
  },
};

export const netDemos: Demo[] = [fetchDemo, streamDemo, wsDemo];
