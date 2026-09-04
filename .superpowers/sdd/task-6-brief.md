### Task 6: docs start/ — `quick-start.md` 重写（zh/en，核心教程页）

**Files:**
- Modify: `docs/zh/start/quick-start.md`, `docs/en/start/quick-start.md`

**Interfaces:**
- Consumes: install 页的环境变量与 CLI（`ztron init/dev/codegen/build/doctor`）；`defineCommand`/`invoke` 事实源（`examples/hello/src/commands.ts` 的 `defineCommand("my:greet", { args: {} as { name: string }, result: "" as string, handler })` 模式）
- Produces: 教程代码片段——Task 7 验收时逐条实测

- [ ] **Step 1: 重写 `docs/zh/start/quick-start.md`**

`````markdown
---
title: 快速开始
---

# Try Ztron（3 行）

前置：完成[前置条件与安装](/start/install)（`ztron doctor` 全绿）。

```bash
ztron init my-app && cd my-app
pnpm install
ztron dev
```

原生窗口出现「Hello Ztron」即成功。`dev` = Vite 构建前端 → 拉起原生窗口 →
启动 tjs 后端；前端改动即时热重载。

# 第一个应用

## 项目结构

```
my-app/
├── ztron.conf.json      # 窗口声明 + 入口（entry: src/main.ts）
├── src/main.ts          # 后端：连接 host、注册命令
└── frontend/            # 前端：普通 Vite 页面
    ├── index.html
    └── src/main.ts
```

## 改前端

编辑 `frontend/index.html`，把 `<h1>Hello Ztron</h1>` 改成
`<h1>我的第一个 Ztron 应用</h1>` 并加一个按钮：

```html
<h1>我的第一个 Ztron 应用</h1>
<button id="greet">打招呼</button>
<p id="out"></p>
```

保存后窗口内即时生效（Vite HMR）。

## 加一个 TypeScript 命令（后端 → 前端）

命令定义在后端（`src/main.ts` 旁新建 `src/commands.ts`）：

```ts
import { defineCommand } from "@zturnlibs/ztron-core";

export const greet = defineCommand("my:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => `你好, ${args.name}`,
});
```

在 `src/main.ts` 注册（AppBuilder 链上，`init` 模板已内置 registerCommand
调用处——把 `greet` 加入其 imports 与注册列表即可）：

```ts
import { greet } from "./commands.js";
```

生成类型化前端绑定并安装 API 包：

```bash
ztron codegen
pnpm i @zturnlibs/ztron-api
```

前端调用（`frontend/src/main.ts`）：

```ts
import { invoke } from "@zturnlibs/ztron-api";

document.getElementById("greet")!.onclick = async () => {
  document.getElementById("out")!.textContent = await invoke("my:greet", { name: "Ztron" });
};
```

点按钮 → 显示「你好, Ztron」。这条链（后端命令 → codegen → 前端 invoke）
就是 Ztron 应用的全部骨架。

## 打包

```bash
ztron build
```

产出独立 `.app`（ad-hoc 签名）。分发前可在
`ztron.conf.json` 修改 `identifier` 与窗口声明。

**下一步：[示例](/start/examples) · [架构](/guide/architecture) · [命令参考](/reference/commands)**
`````

- [ ] **Step 2: 写 `docs/en/start/quick-start.md`（英文镜像）**

结构与 zh 逐段对应；代码块逐字相同；链接同样指向 `/start/examples`、`/guide/architecture`、`/reference/commands`。

- [ ] **Step 3: 教程片段逐条实测（本任务核心步骤）**

在干净 tmpdir 按教程执行（worktree 仓库根提供原生链 + env 指向 worktree 的 `native/libs`；若 worktree 无原生链，用主仓库路径）：

Run: `cd $(mktemp -d) && ztron init my-app && cd my-app && pnpm install && ZTRON_DEV_URL= node ../../… `（实际以 `ztron dev --entry src/main.ts` 冒烟；无 GUI 断言窗口则以 `ztron build` exit 0 + `ztron check` 于 hello 为替代验证）
Expected: init/codegen/build 全部 exit 0；教程中代码片段与脚手架实际内容一致（若 `init` 模板与教程有出入——如模板未内置 registerCommand 调用处——**以实现为准修正教程文本**，并在报告记录）

- [ ] **Step 4: 双语门禁 + 构建**

Run: `pnpm --dir docs run check:locales:deploy && pnpm --dir docs run build 2>&1 | tail -2`
Expected: 门禁 OK、构建成功

- [ ] **Step 5: Commit**

```bash
git add docs/zh/start/quick-start.md docs/en/start/quick-start.md
git commit -m "docs(start): first-app tutorial (try 3-liner, structure, first TS command, package)"
```

---

