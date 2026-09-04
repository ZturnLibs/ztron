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

原生窗口出现「Hello Ztron」即成功。`dev` 会启动 Vite dev server、拉起原生窗口
并启动 tjs 后端；前端改动即时热重载（HMR）。

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

在 `src/main.ts` 注册（`init` 模板已在 `.setup((app) => …)` 内置命令注册处——
与模板自带的 `app.command("hello", …)` 并排加一行 `app.commandDef(greet)`，
并补上 import 即可）：

```ts
import { greet } from "./commands.js";
```

```ts
// .setup((app) => { … }) 内：
app.commandDef(greet);
```

生成类型化前端绑定（API 包 `@zturnlibs/ztron-api` 已由 `init` 写入
`dependencies`）：

```bash
ztron codegen
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

产出独立 `.app`（ad-hoc 签名，默认附带 `.dmg`）。分发前可在
`ztron.conf.json` 修改 `identifier` 与窗口声明。

**下一步：[示例](/start/examples) · [架构](/guide/architecture) · [CLI 参考](/reference/cli)**
