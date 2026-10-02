### Task 3: demos/core.ts（4 卡：关于本应用 / invoke / 事件 / Channel）

**Files:**
- Create: `examples/showcase/frontend/src/demos/core.ts`
- Modify: `examples/showcase/frontend/src/main.ts`（CATALOG 登记）

**Interfaces:**
- Consumes: 共享接口（见计划开头）；后端命令 `showcase:greet/add/echo/emit-ticks/stream`。
- Produces: `export const coreDemos: Demo[]`（4 项，id: `app.about` / `core.invoke` / `core.events` / `core.channel`）。

- [ ] **Step 1: 写 demos/core.ts（完整文件）**

```ts
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
```

- [ ] **Step 2: CATALOG 登记**

`frontend/src/main.ts` 顶部加 import，并把 CATALOG 换成：

```ts
import { coreDemos } from "./demos/core";

const CATALOG: { category: string; demos: Demo[] }[] = [
  { category: "核心", demos: coreDemos },
];
```

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @zturnlibs/ztron-example-showcase typecheck`
Expected: exit 0。

- [ ] **Step 4: dev 人工点验**

Run: `pnpm --filter @zturnlibs/ztron-example-showcase dev`
Expected 逐卡：
1. 关于本应用：点按钮输出 name/version/identifier 三行（绿色）。
2. invoke：输入「张三」点 greet 输出 `hello, 张三`；add 输出 `2 + 3 = 5`。
3. 事件：点按钮后依次 info 三行 tick、最后 ok「已取消订阅」。
4. Channel：点按钮后 info 8 行、ok「共 8 条」。
每张卡片「文档」按钮能打开对应文档页；代码区「复制」后可在别处粘贴。

- [ ] **Step 5: Commit**

```bash
git add examples/showcase/frontend
git commit -m "feat(examples): showcase core demos - about/invoke/events/channel"
```

---

