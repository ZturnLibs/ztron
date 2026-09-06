// Svelte 工具链共享配置（工程根）。
// 角色分工：`ztron dev` / `ztron build` 时 Vite root 是 frontend/，其
// vite.config.ts 里的 svelte() 插件负责编译（Svelte 5 编译器原生支持
// lang="ts" 的 erasable 语法，无需预处理）；typecheck 脚本经 svelte-check 的
// --config 显式指到本文件（否则 svelte-check 自 frontend/src 向上搜配置会先
// 撞到 frontend/vite.config.ts），vitePreprocess 覆盖非 erasable 的 TS 语法。
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
};
