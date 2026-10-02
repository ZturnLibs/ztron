---
title: 使用 tjs API 与完整类型
---

后端进程跑在 [txiki.js](https://txikijs.org)（`tjs`）上：文件、进程、网络（`tjs.serve`）、FFI 等能力通过全局 `tjs` 对象暴露。0.3.8 起，这个全局对象**开箱即带完整 TypeScript 类型**——应用开发者不再需要（也不应该）手写 `declare const tjs`。

## 类型从哪来

类型由 [`@zturnlibs/tjs-types`](https://www.npmjs.com/package/@zturnlibs/tjs-types) 提供，两层构成：

- **官方类型**：逐文件同步自 ztron 实际构建的 txiki.js 检出（`native/txiki.js/types/src`），与运行时严格同源——不会出现"类型说有、运行时没有"的漂移；
- **ztron 增补**：上游类型缺漏的运行时全局（如 `tjs.platform`）与前端纯 ES2022 环境声明（`@zturnlibs/tjs-types/web`）。

获取方式（任选其一，通常无需手动做）：

1. **依赖 `@zturnlibs/ztron-core`**（默认即是）：core 自带两行引用，tjs 类型自动生效；
2. **`ztron init` 脚手架**：模板已放好 `src/tjs.d.ts`（两行 `/// <reference types="..." />`）并声明 devDependency；
3. **手写 tsconfig**：`"types": ["node", "@zturnlibs/tjs-types"]`。

## 后端里直接用

`src/main.ts` 中 `tjs.*` 全局直接可用，补全与检查都是全量的。以下片段摘自 [`examples/hello/src/main.ts`](https://github.com/ZturnLibs/ztron/blob/main/examples/hello/src/main.ts)：

```ts
// 自托管 WS 回声：tjs.serve + server.upgrade（hello spike 的 WEBSOCKET_OK 检查）
const server = await tjs.serve({
  port: 0,
  listenIp: "127.0.0.1",
  fetch: (req, ctx) => {
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      ctx.server.upgrade(req);
      return;
    }
    return new Response("websocket upgrade required", { status: 426 });
  },
  websocket: {
    message: (ws, data) => ws.sendText(data),
  },
});
wsEchoPort = server.port;
```

注意类型会如实反映运行时行为——例如 `tjs.readDir` 返回的是**异步可迭代**的 `DirHandle`，不是数组：

```ts
// 同样摘自 examples/hello/src/main.ts
const stale = await tjs.readDir(spikeLogDir);
for await (const e of stale) {
  if (e.name.endsWith(".log")) await tjs.remove(`${spikeLogDir}/${e.name}`);
}
```

历史上手写的 `tjs-extra.d.ts` 曾把返回值错标成数组，类型过了、运行时炸——这正是收编官方类型的原因。

## 前端（webview）侧

webview 是纯 ES2022 环境（有 Web 标准 API，无 Node）。给前端 TS 代码补环境声明时引用子入口：

```ts
/// <reference types="@zturnlibs/tjs-types/web" />
```

## 贡献者：类型同步

仓库贡献者无需手动维护类型：`scripts/sync-tjs-types.sh` 把 vendored txiki.js 的官方 `.d.ts` 复制进 `packages/tjs-types/src/`（升 txiki 版本时跑一次）。ztron 自有增补放在独立命名的文件里（`runtime-gaps.d.ts`、`web-globals.d.ts`），不会被同步覆盖。

## 验证

类型正确性由 hello spike 端到端背书：85 项确定性检查 + `FULL_OK` 哨兵、exit 0（`ztron check`），其中就包括上面两段真实代码对应的 `WEBSOCKET_OK` 等检查。

适用版本：`ztron 0.3.8`
