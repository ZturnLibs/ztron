---
title: 前端框架与第三方包
---

Ztron 的前端层是一个标准 Vite 工程，框架无关。React、Vue、Svelte、Solid、
Tailwind CSS 等前端生态的框架与工具链都能直接接入。本文以
`examples/react-demo`（React 19 + Tailwind CSS v4）、
`examples/vue-demo`（Vue 3 + Tailwind CSS v4）与
`examples/svelte-demo`（Svelte 5 + Tailwind CSS v4）为活例子，说明接入方式
与打包边界。

## 核心结论：框架无关

`ztron dev` / `ztron build` 由 CLI 自建 Vite dev server / build，并通过
`ztronVitePlugin` 的 `transformIndexHtml` 把 `__ZTRON_INTERNALS__` 桥接脚本
注入 `index.html`。Vite 会合并项目自己的 `frontend/vite.config.ts`，因此
`react()`、`tailwindcss()` 等第三方插件写进去就直接生效。项目配置无需复述
`base` / `output.format`（CLI 强制 `./` 与 `iife`），也不要自加
`__ZTRON_INTERNALS__` 引导脚本（由 CLI 注入）。

前端与后端的唯一契约是 `@zturnlibs/ztron-api`：一个普通 npm 包，`invoke`、
事件、Channel、fs/path/window 等 API 全部以普通 ESM 导出的形式提供，与
框架无关。组件、路由、状态管理完全由项目自选。

## React 接入

以 `examples/react-demo` 为例，依赖只是普通前端依赖：

```jsonc
// examples/react-demo/package.json（节选）
{
  "dependencies": {
    "@zturnlibs/ztron-api": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

注意 devDependencies 里的 `vite`：`frontend/vite.config.ts` 要
`import { defineConfig } from "vite"`，在 pnpm 的严格隔离下配置文件自身必须
能解析到它，所以工程里要装一份 vite（与 CLI 同一 6.x 主版本，lock 内同一
实例）。

`frontend/vite.config.ts` 只声明第三方插件：

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

入口 `frontend/src/main.tsx` 就是一个普通 React 入口，没有任何 Ztron 特殊
初始化，桥在 index.html 阶段已注入完毕：

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@zturnlibs/ztron-api";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

代码位置有一个要点：后端 TS 源码在 `src/`，位于 Vite root（`frontend/`）
之外。Vite 的 dev server 与 build 都只服务 root 内的模块，运行时无法越
root 引用它。因此：

- 运行时调用一律走 `@zturnlibs/ztron-api` 的 `invoke` 直调，例如
  `invoke<string>("react-demo:greet", { name })`；
- `ztron codegen` 产出的类型绑定（`src/ztron-commands.ts`）以代码块形式
  展示参考形状，供把 frontend root 指到仓库根的业务工程直接引用：

```ts
// codegen 产物 src/ztron-commands.ts 提供类型化 invoke：
import { invoke as typed } from "../../src/ztron-commands.js";

const msg = await typed("react-demo:greet", { name: "Ztron" });
//     ^ string，命令名或参数拼错会在类型检查期报错
```

## hooks 模式：订阅与请求的清理约定

React 19 的 `StrictMode` 在开发期会把 effect 执行两遍
（mount → cleanup → mount），这是有意暴露泄漏的设计。Ztron 的订阅式 API
（`listen` 返回 `UnlistenFn`，geolocation 的 `watchPosition` 配对
`clearWatch`）由此有一条硬约定：**unlisten 等清理必须在 cleanup 中返回**，
否则双挂载会留下重复监听与重复回调。

react-demo 的 `frontend/src/hooks.ts` 给出三个可直接抄走的 hook（也是未来
`@zturnlibs/ztron-react` 包的种子实现）：

```ts
// 声明式调用命令：挂载或 args 变化时执行一次，卸载后丢弃结果
function useInvoke<T>(cmd: string, args?: InvokeArgs): InvokeState<T>;
// InvokeState<T> = { data: T | null; error: string | null; loading: boolean }

// 订阅后端事件：effect 内 await listen，清理时 unlisten；
// 若清理先于 listen 兑现，拿到监听后立即注销，StrictMode 双挂载安全
function useListen<T>(event: string, handler: EventCallback<T>): void;

// Channel 流式调用：start() 创建通道并 invoke，消息按到达顺序累积；
// status 为 "idle" | "running" | "done" | "error"
function useChannelStream<T = unknown>(
  cmd: string,
  args?: InvokeArgs,
): ChannelStreamState<T>;
```

组件里的典型用法：

```tsx
// 三态渲染：loading / error / data
const osInfo = useInvoke<OsInfo>("plugin:os|info", {});

// 事件订阅：handler 写在 JSX 作用域里即可，卸载自动 unlisten
useListen<{ n: number }>("react-demo:tick", (e) => {
  setTicks((prev) => [...prev, `tick ${e.payload.n}`]);
});

// 流式推送：按钮触发 stream.start()，渲染 stream.messages
const stream = useChannelStream<number>("react-demo:stream");
```

## Vue 3 接入

`examples/vue-demo` 用 Vue 3 复刻了 react-demo 的全部演示（五个标签：调用
后端、事件、Channel、主题、系统），证明同一管线对 SFC 单文件组件同样成立。
依赖同样只是普通前端依赖：

```jsonc
// examples/vue-demo/package.json（节选）
{
  "dependencies": {
    "@zturnlibs/ztron-api": "workspace:*",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.0",
    "vue-tsc": "^3.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

`vite` 的说明与 React 一致（配置文件自身要能解析到它，与 CLI 同一 6.x
主版本）。`@vitejs/plugin-vue` 用与 vite 6 兼容的 6.x 大版本。

`frontend/vite.config.ts` 把 React 插件换成 Vue 插件即可：

```ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
});
```

入口 `frontend/src/main.ts` 是普通 Vue 入口，桥同样在 index.html 阶段已
注入完毕：

```ts
import { createApp } from "vue";
import App from "./App.vue";
import "./index.css";

createApp(App).mount("#root");
```

单文件组件与类型检查：组件用 `<script setup lang="ts">` 编写，
typecheck 脚本换成 `vue-tsc --noEmit`（vue-tsc 直接理解 `.vue` 文件，
tsconfig 无需 jsx 配置，include 覆盖 `src` 与 `frontend/src` 即可）。
react-demo 的「越 root 引用」约束对 Vue 同样成立：运行时用
`invoke<string>("vue-demo:greet", { name })` 直调，codegen 类型绑定只作
参考形状展示。

composables 清理约定：React 的 hooks 清理约定换到 Vue 就是
**unlisten 挂在 `onUnmounted`/`onScopeDispose` 上收尾**。vue-demo 的
`frontend/src/composables.ts` 给出三个可直接抄走的 composable（也是未来
`@zturnlibs/ztron-vue` 包的种子实现）：

```ts
// 声明式调用命令：setup 时执行一次，卸载后丢弃结果
// 返回 { data, error, loading } 三个 ref（watch 的 onCleanup 作废晚到响应）
function useInvoke<T>(cmd: string, args?: InvokeArgs): InvokeState<T>;

// 订阅后端事件：onMounted 内 await listen，onUnmounted 时 unlisten；
// 若卸载先于 listen 兑现，拿到监听后立即注销
function useListen<T>(event: string, handler: EventCallback<T>): void;

// Channel 流式调用：start() 创建通道并 invoke，消息按到达顺序累积；
// onScopeDispose 作废进行中的一轮，晚到消息不写入已卸载组件
function useChannelStream<T = unknown>(
  cmd: string,
  args?: InvokeArgs,
): { messages; status; error; start };
```

defineAsyncComponent 与 IIFE 内联：Vue 的懒加载写法是
`defineAsyncComponent(() => import("./LazyPane.vue"))`。与 React.lazy
一样，`ztron build` 的单文件 IIFE 产物会把动态 import 内联进主包（vue-demo
用 LazyPane 里的 `VUE_LAZY_OK` 标记串验证了这一点），同样没有真正的代码
分割。

想从脚手架开始时，`ztron init --template vue-ts` 会生成同款最小工程
（见 [CLI 参考](/reference/cli)）。

## Svelte 5 接入

`examples/svelte-demo` 用 Svelte 5 复刻了 react-demo 的全部演示（五个标签：
调用后端、事件、Channel、主题、系统），证明同一管线对 Svelte 单文件组件
同样成立。依赖同样只是普通前端依赖：

```jsonc
// examples/svelte-demo/package.json（节选）
{
  "dependencies": {
    "@zturnlibs/ztron-api": "workspace:*",
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^5.0.0",
    "svelte-check": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

`vite` 的说明与 React、Vue 一致（配置文件自身要能解析到它，与 CLI 同一
6.x 主版本）。`@sveltejs/vite-plugin-svelte` 用与 vite 6 兼容的 5.x 大版本
（该插件的 6.x 对应 vite 7）。

`frontend/vite.config.ts` 把框架插件换成 svelte 插件即可：

```ts
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
});
```

入口 `frontend/src/main.ts` 是普通 Svelte 5 入口，用 `mount` 惯用法
（取代 Svelte 4 的 `new App({...})` 构造器写法），桥同样在 index.html
阶段已注入完毕：

```ts
import { mount } from "svelte";
import App from "./App.svelte";
import "./index.css";

mount(App, { target: document.getElementById("root")! });
```

组件与类型检查：组件用 `<script lang="ts">` 加 Svelte 5 runes 编写，状态
用 `$state` 声明（`$derived` 可选）。typecheck 脚本为
`svelte-check --tsconfig ./tsconfig.json --config ./svelte.config.js`，两个
配置各司其职：dev / build 时 Svelte 5 编译器原生理解 `lang="ts"` 的
erasable 语法，vite 插件直接编译，无需预处理；根级 `svelte.config.js`
（挂 `vitePreprocess`）由 svelte-check 读取，且必须用 `--config` 显式
指定，否则 svelte-check 从 `frontend/src` 向上搜配置会先撞到
`frontend/vite.config.ts` 而报「No Svelte configuration found」。
react/vue 的「越 root 引用」约束对 Svelte 同样成立：运行时用
`invoke<string>("svelte-demo:greet", { name })` 直调，codegen 类型绑定只作
参考形状展示。

runes 清理约定：React/Vue 的清理约定换到 Svelte 就是**订阅在 `onMount`
发起、unlisten 在 `onDestroy` 收尾**。svelte-demo 的
`frontend/src/lib/listeners.ts` 给出可直接抄走的监听助手（也是未来
`@zturnlibs/ztron-svelte` 包的种子实现；只用生命周期钩子、不涉及 runes，
所以放普通 `.ts` 模块即可）：

```ts
// 订阅后端事件：onMount 内 await listen，onDestroy 时 unlisten；
// 若卸载先于 listen 兑现，拿到监听后立即注销
function listenOnMount<T>(event: string, handler: EventCallback<T>): void;
```

{#await import} 与 IIFE 内联：Svelte 的懒加载写法是 await 块直接消费动态
import 的模块命名空间，解构出组件再渲染：

```svelte
{#await import("./LazyPane.svelte") then { default: Lazy }}
  <Lazy />
{/await}
```

与 `React.lazy`、`defineAsyncComponent` 一样，`ztron build` 的单文件 IIFE
产物会把动态 import 内联进主包（svelte-demo 用 LazyPane 里的
`SVELTE_LAZY_OK` 标记串验证了这一点），同样没有真正的代码分割。

想从脚手架开始时，`ztron init --template svelte` 会生成同款最小工程
（见 [CLI 参考](/reference/cli)）。

## Tailwind CSS v4

Tailwind v4 经 `@tailwindcss/vite` 一行接入（上面的 `tailwindcss()`），
入口 CSS 只需一行 `@import "tailwindcss";`。

- **CSP 已覆盖**：Tailwind 会把样式作为 inline `<style>` 注入，默认 CSP 的
  `style-src 'self' 'unsafe-inline'` 已放行，无需额外配置。
- **暗色样式**：Tailwind 的 `dark:` 变体默认跟随 CSS
  `prefers-color-scheme`，而 WebView 里 `prefers-color-scheme` 跟随窗口
  外观。调用 `getCurrentWebviewWindow().setTheme("dark" | "light" | null)`
  切换窗口外观后，页面配色立即翻转（`null` 表示跟随系统）。react-demo 的
  「主题」标签即此演示。

## 打包约束（重要）

`ztron build` 的前端产物是**单文件 IIFE + classic script**：`file://` 零源
下 WebView 不允许执行 module script，所以 CLI 强制 iife 输出。由此带来三条
约束：

- **动态 `import()` 会被内联**进主包。`React.lazy` + `Suspense` 仍可正常
  工作（react-demo 的 LazyPane 即此），但没有真正的代码分割，不要指望按需
  加载减小首包。
- **CSS 内联进 JS**：Tailwind 的样式产物同样内联，运行时注入 `<style>`
  （默认 CSP 已覆盖）。
- **dev 态不受影响**：`ztron dev` 走 Vite dev server，按模块正常服务，
  HMR 可用，上述约束只在构建产物上生效。

## CSP

构建产物 `index.html` 注入的默认 CSP 为：

```text
default-src 'self'; script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline'; img-src 'self' data:;
connect-src 'self' http://localhost:* ws://localhost:*
```

其中 `ws://localhost:*` 覆盖 React dev server 与 HMR 的 websocket，
`style-src 'unsafe-inline'` 覆盖 Tailwind 与组件库的运行时样式注入，React
开发体验开箱即用。远程图片、字体等资源需要在 `ztron.conf.json` 的
`app.security.csp`（或开发期 `devCsp`）里扩展 `img-src` / `font-src`，见
[安全模型](/guide/security)。

## SSR 类框架不适用

WebView 加载的是纯静态 SPA：没有 Node 服务器，也没有 SSR 流水线。Next.js、
Nuxt、Remix 这类以服务器端渲染为前提的元框架不适用。SPA 路由（react-router
等）可以做，但 `file://` 下没有服务器路径回退，选 hash/memory 这类不依赖
服务器路径的路由模式最稳妥。

## 其他框架

Solid（`vite-plugin-solid`）等框架用各自的官方 Vite 插件，写进
`frontend/vite.config.ts` 的 `plugins` 数组即可，其余模式与 React、Vue、
Svelte 完全相同：桥由 CLI 注入，配置由 Vite 合并，运行时用
`@zturnlibs/ztron-api`。订阅/请求的清理约定同样适用，可按各框架
的生命周期照 react-demo 的 `hooks.ts`、vue-demo 的 `composables.ts` 或
svelte-demo 的 `listeners.ts` 模式封装。

**深入：[示例](/start/examples) · [调用后端命令](/guide/ipc) · [CLI 参考](/reference/cli)**

适用版本：`ztron 0.3.1`
