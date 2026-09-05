import { invoke, listen, Channel, getName, getVersion, getIdentifier } from "@zturnlibs/ztron-api";
import { act, field, fieldValue, type Demo } from "../demo-ui";

const about: Demo = {
  id: "app.about",
  title: "关于本应用",
  description: "读取应用元数据（名称/版本/标识符），这是最简单的三个 API。",
  code: `import { getName, getVersion, getIdentifier } from "@zturnlibs/ztron-api";

const name = await getName();            // "com.ztron.showcase"
const version = await getVersion();      // "0.1.0"
const identifier = await getIdentifier();
console.log(name, version, identifier);`,
  docPath: "/plugins/app.html",
  mount(area, out) {
    area.append(
      act(out, "读取应用信息", async () => {
        const [name, version, id] = await Promise.all([
          getName(),
          getVersion(),
          getIdentifier(),
        ]);
        out.ok(`name: ${name}\nversion: ${version}\nidentifier: ${id}`);
      }),
    );
  },
};

const invokeDemo: Demo = {
  id: "core.invoke",
  title: "调用后端命令 invoke",
  description: "前端 invoke 后端命令；配合 ztron codegen 可生成类型安全的命令绑定。",
  code: `// 后端 src/commands.ts：defineCommand 声明
export const greet = defineCommand("showcase:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => \`hello, \${args.name}\`,
});

// 前端：直接 invoke
import { invoke } from "@zturnlibs/ztron-api";
const msg = await invoke<string>("showcase:greet", { name: "Ztron" });

// 或运行 ztron codegen 后用生成的类型绑定（本示例已生成）
import { invoke as typed } from "../src/ztron-commands.js";
const msg2 = await typed("showcase:greet", { name: "Ztron" });`,
  docPath: "/guide/ipc.html",
  mount(area, out) {
    const name = field("你的名字", "世界");
    area.append(
      name,
      act(out, "greet", async () => {
        out.ok(await invoke("showcase:greet", { name: fieldValue(name) || "世界" }));
      }),
      act(out, "add(2, 3)", async () => {
        out.ok(`2 + 3 = ${await invoke("showcase:add", { a: 2, b: 3 })}`);
      }),
    );
  },
};

const events: Demo = {
  id: "core.events",
  title: "事件 listen / emit",
  description: "后端 emit 全局事件、前端 listen 订阅；跨进程消息的另一种形态。",
  code: `import { listen } from "@zturnlibs/ztron-api";

const unlisten = await listen<{ n: number }>("showcase:tick", (e) => {
  console.log("tick", e.payload.n);
});
// 不再需要时取消订阅
unlisten();`,
  docPath: "/plugins/event.html",
  mount(area, out) {
    area.append(
      act(out, "订阅并触发 3 次 tick", async () => {
        let last = 0;
        const unlisten = await listen<{ n: number }>("showcase:tick", (e) => {
          last = e.payload.n;
          out.info(`收到 tick ${e.payload.n}`);
        });
        await invoke("showcase:emit-ticks", {});
        await new Promise((r) => setTimeout(r, 500));
        unlisten();
        out.ok(`最后一次 tick = ${last}，已取消订阅`);
      }),
    );
  },
};

const channel: Demo = {
  id: "core.channel",
  title: "Channel 流式数据",
  description: "Channel 让后端持续向前端推送消息，适合下载进度、日志流等场景。",
  code: `import { invoke, Channel } from "@zturnlibs/ztron-api";

const channel = new Channel<number>((progress) => {
  console.log(\`收到 \${progress}/8\`);
});
// 后端拿到 ch 后多次 handle.send()，前端逐条收到；handle.end() 结束
await invoke("showcase:stream", { ch: channel });`,
  docPath: "/guide/ipc.html",
  mount(area, out) {
    area.append(
      act(out, "开始接收 1..8", async () => {
        const got: number[] = [];
        const ch = new Channel<number>((m) => {
          got.push(m);
          out.info(`收到 ${m}/8`);
        });
        await invoke("showcase:stream", { ch });
        out.ok(`流结束，共 ${got.length} 条消息：${got.join(",")}`);
      }),
    );
  },
};

export const coreDemos: Demo[] = [about, invokeDemo, events, channel];
