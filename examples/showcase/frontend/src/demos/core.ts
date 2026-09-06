import { invoke, listen, Channel, getName, getVersion, getIdentifier } from "@zturnlibs/ztron-api";
import { act, field, fieldValue, type Demo } from "../demo-ui";
import type { Lang } from "../i18n";

/** 每个模块一个双语字典：可见文案（标题/描述/按钮/输出/代码注释）全覆盖 */
const STR = {
  zh: {
    category: "核心",
    about: {
      title: "关于本应用",
      description: "读取应用元数据（名称/版本/标识符），这是最简单的三个 API。",
      code: `import { getName, getVersion, getIdentifier } from "@zturnlibs/ztron-api";

const name = await getName();            // "com.ztron.showcase"
const version = await getVersion();      // "0.1.0"
const identifier = await getIdentifier();
console.log(name, version, identifier);`,
      read: "读取应用信息",
    },
    invoke: {
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
      nameLabel: "你的名字",
      namePlaceholder: "世界",
      greet: "greet",
      add: "add(2, 3)",
    },
    events: {
      title: "事件 listen / emit",
      description: "后端 emit 全局事件、前端 listen 订阅；跨进程消息的另一种形态。",
      code: `import { listen } from "@zturnlibs/ztron-api";

const unlisten = await listen<{ n: number }>("showcase:tick", (e) => {
  console.log("tick", e.payload.n);
});
// 不再需要时取消订阅
unlisten();`,
      run: "订阅并触发 3 次 tick",
      received: (n: number) => `收到 tick ${n}`,
      done: (last: number) => `最后一次 tick = ${last}，已取消订阅`,
    },
    channel: {
      title: "Channel 流式数据",
      description: "Channel 让后端持续向前端推送消息，适合下载进度、日志流等场景。",
      code: `import { invoke, Channel } from "@zturnlibs/ztron-api";

const channel = new Channel<number>((progress) => {
  console.log(\`收到 \${progress}/8\`);
});
// 后端拿到 ch 后多次 handle.send()，前端逐条收到；handle.end() 结束
await invoke("showcase:stream", { ch: channel });`,
      run: "开始接收 1..8",
      received: (m: number) => `收到 ${m}/8`,
      done: (count: number, list: string) => `流结束，共 ${count} 条消息：${list}`,
    },
  },
  en: {
    category: "Core",
    about: {
      title: "About this app",
      description: "Read app metadata (name / version / identifier): the three simplest APIs.",
      code: `import { getName, getVersion, getIdentifier } from "@zturnlibs/ztron-api";

const name = await getName();            // "com.ztron.showcase"
const version = await getVersion();      // "0.1.0"
const identifier = await getIdentifier();
console.log(name, version, identifier);`,
      read: "Read app info",
    },
    invoke: {
      title: "Invoke backend commands",
      description: "invoke calls backend commands from the frontend; ztron codegen generates type-safe bindings.",
      code: `// Backend src/commands.ts: declare with defineCommand
export const greet = defineCommand("showcase:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => \`hello, \${args.name}\`,
});

// Frontend: plain invoke
import { invoke } from "@zturnlibs/ztron-api";
const msg = await invoke<string>("showcase:greet", { name: "Ztron" });

// Or use the generated typed bindings (already generated in this demo)
import { invoke as typed } from "../src/ztron-commands.js";
const msg2 = await typed("showcase:greet", { name: "Ztron" });`,
      nameLabel: "Your name",
      namePlaceholder: "world",
      greet: "Greet",
      add: "add(2, 3)",
    },
    events: {
      title: "Events: listen / emit",
      description: "The backend emits global events, the frontend subscribes with listen; the other shape of cross-process messaging.",
      code: `import { listen } from "@zturnlibs/ztron-api";

const unlisten = await listen<{ n: number }>("showcase:tick", (e) => {
  console.log("tick", e.payload.n);
});
// Unsubscribe when you no longer need it
unlisten();`,
      run: "Subscribe and fire 3 ticks",
      received: (n: number) => `Received tick ${n}`,
      done: (last: number) => `Last tick = ${last}, unsubscribed`,
    },
    channel: {
      title: "Channel streaming",
      description: "A Channel lets the backend push messages to the frontend continuously: download progress, log tails, etc.",
      code: `import { invoke, Channel } from "@zturnlibs/ztron-api";

const channel = new Channel<number>((progress) => {
  console.log(\`Received \${progress}/8\`);
});
// The backend calls handle.send() repeatedly; handle.end() finishes the stream
await invoke("showcase:stream", { ch: channel });`,
      run: "Receive 1..8",
      received: (m: number) => `Received ${m}/8`,
      done: (count: number, list: string) => `Stream finished, ${count} messages: ${list}`,
    },
  },
};

/** 按语言构建本分类目录；语言切换时 main.ts 会重建 */
export function coreCatalog(lang: Lang): { category: string; demos: Demo[] } {
  const t = STR[lang];

  const about: Demo = {
    id: "app.about",
    title: t.about.title,
    description: t.about.description,
    code: t.about.code,
    docPath: "/plugins/app.html",
    mount(area, out) {
      area.append(
        act(out, t.about.read, async () => {
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
    title: t.invoke.title,
    description: t.invoke.description,
    code: t.invoke.code,
    docPath: "/guide/ipc.html",
    mount(area, out) {
      const name = field(t.invoke.nameLabel, t.invoke.namePlaceholder);
      area.append(
        name,
        act(out, t.invoke.greet, async () => {
          out.ok(await invoke("showcase:greet", { name: fieldValue(name) || t.invoke.namePlaceholder }));
        }),
        act(out, t.invoke.add, async () => {
          out.ok(`2 + 3 = ${await invoke("showcase:add", { a: 2, b: 3 })}`);
        }),
      );
    },
  };

  const events: Demo = {
    id: "core.events",
    title: t.events.title,
    description: t.events.description,
    code: t.events.code,
    docPath: "/plugins/event.html",
    mount(area, out) {
      area.append(
        act(out, t.events.run, async () => {
          let last = 0;
          const unlisten = await listen<{ n: number }>("showcase:tick", (e) => {
            last = e.payload.n;
            out.info(t.events.received(e.payload.n));
          });
          await invoke("showcase:emit-ticks", {});
          await new Promise((r) => setTimeout(r, 500));
          unlisten();
          out.ok(t.events.done(last));
        }),
      );
    },
  };

  const channel: Demo = {
    id: "core.channel",
    title: t.channel.title,
    description: t.channel.description,
    code: t.channel.code,
    docPath: "/guide/ipc.html",
    mount(area, out) {
      area.append(
        act(out, t.channel.run, async () => {
          const got: number[] = [];
          const ch = new Channel<number>((m) => {
            got.push(m);
            out.info(t.channel.received(m));
          });
          await invoke("showcase:stream", { ch });
          out.ok(t.channel.done(got.length, got.join(",")));
        }),
      );
    },
  };

  return { category: t.category, demos: [about, invokeDemo, events, channel] };
}
