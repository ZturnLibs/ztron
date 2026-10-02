### Task 5: demos/fs.ts（3 卡：读写 / 目录与路径 / watch）

**Files:**
- Create: `examples/showcase/frontend/src/demos/fs.ts`
- Modify: `examples/showcase/frontend/src/main.ts`

**Interfaces:**
- Consumes: 共享接口；`fs`/`path`（scope：`$TMP/**` 已放行）。
- Produces: `export const fsDemos: Demo[]`（3 项）。

- [ ] **Step 1: 写 demos/fs.ts（完整文件）**

```ts
import { fs, path } from "@zturnlibs/ztron-api";
import { act, field, fieldValue, type Demo } from "../demo-ui";

const readWrite: Demo = {
  id: "fs.rw",
  title: "文件读写",
  description: "fs 写/读文本与二进制；路径受 ACL scope 约束（本应用放行 $TMP/**）。",
  code: `import { fs } from "@zturnlibs/ztron-api";

await fs.writeText("$TMP/ztron_demo.txt", "你好 Ztron");
const text = await fs.readText("$TMP/ztron_demo.txt");

const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
await fs.writeFile("$TMP/ztron_demo.bin", bytes);
const back = await fs.readFile("$TMP/ztron_demo.bin");`,
  docPath: "/plugins/fs.html",
  mount(area, out) {
    const content = field("文件内容", "你好 Ztron");
    area.append(
      content,
      act(out, "写入并读回", async () => {
        await fs.writeText("$TMP/ztron_showcase.txt", fieldValue(content));
        const back = await fs.readText("$TMP/ztron_showcase.txt");
        out.ok(`读回：${back}`);
      }),
      act(out, "二进制写读", async () => {
        const magic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        await fs.writeFile("$TMP/ztron_showcase.bin", magic);
        const back = await fs.readFile("$TMP/ztron_showcase.bin");
        const same = magic.every((b, i) => back[i] === b);
        out.ok(`读回 ${back.length} 字节，逐字节一致：${same}`);
      }),
    );
  },
};

const dirs: Demo = {
  id: "fs.path",
  title: "目录列表与路径",
  description: "readDir 列目录；path 拼路径并取系统目录（临时/家/应用数据）。",
  code: `import { fs, path } from "@zturnlibs/ztron-api";

const entries = await fs.readDir("$TMP");   // { name, isDirectory, isFile }[]
const temp = await path.tempDir();
const home = await path.homeDir();
const appData = await path.appDataDir();    // ~/Library/Application Support/<appId>
const joined = await path.join(temp, "a", "b.txt");`,
  docPath: "/plugins/path.html",
  mount(area, out) {
    area.append(
      act(out, "列出临时目录前 8 项", async () => {
        const entries = await fs.readDir("$TMP");
        const names = entries
          .slice(0, 8)
          .map((e) => `${e.isDirectory ? "[目录] " : "[文件] "}${e.name}`);
        out.ok(
          `$TMP 共 ${entries.length} 项：\n${names.join("\n")}${entries.length > 8 ? "\n…" : ""}`,
        );
      }),
      act(out, "系统目录", async () => {
        const [temp, home, appData] = await Promise.all([
          path.tempDir(),
          path.homeDir(),
          path.appDataDir(),
        ]);
        out.ok(`temp: ${temp}\nhome: ${home}\nappData: ${appData}`);
      }),
    );
  },
};

const watchDemo: Demo = {
  id: "fs.watch",
  title: "文件监听 watch",
  description: "fs.watch 监听文件变化（底层 FSEvents），返回取消监听函数。",
  code: `import { fs } from "@zturnlibs/ztron-api";

const unwatch = await fs.watch("$TMP/ztron_watch.txt", (ev) => {
  console.log(ev.type, ev.path);   // "modify" | ...
});
await fs.writeText("$TMP/ztron_watch.txt", "v2");  // 触发 modify
unwatch();`,
  docPath: "/plugins/fs.html",
  mount(area, out) {
    area.append(
      act(out, "监听并改写文件", async () => {
        await fs.writeText("$TMP/ztron_showcase_watch.txt", "v1");
        const events: string[] = [];
        const unwatch = await fs.watch("$TMP/ztron_showcase_watch.txt", (ev) => {
          events.push(ev.type);
          out.info(`事件：${ev.type}`);
        });
        await new Promise((r) => setTimeout(r, 400));
        await fs.writeText("$TMP/ztron_showcase_watch.txt", "v2");
        await new Promise((r) => setTimeout(r, 1500));
        unwatch();
        out.ok(events.length > 0 ? `共 ${events.length} 个事件（${[...new Set(events)].join("、")}），已取消监听` : "未捕获事件（可再试一次）");
      }),
    );
  },
};

export const fsDemos: Demo[] = [readWrite, dirs, watchDemo];
```

- [ ] **Step 2: CATALOG 登记** — `{ category: "文件", demos: fsDemos },`

- [ ] **Step 3: typecheck** — Expected: exit 0。

- [ ] **Step 4: dev 人工点验** — 三个按钮全部绿色输出；把内容改成中文再写读，UTF-8 不乱码；watch 卡两次运行都应捕获 modify。

- [ ] **Step 5: Commit**

```bash
git add examples/showcase/frontend
git commit -m "feat(examples): showcase fs demos - rw/dirs/watch"
```

---

