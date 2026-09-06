// 项目级 Vite 配置：Svelte 5 + Tailwind CSS v4 插件。
// `ztron dev` / `ztron build` 由 CLI 自建 Vite server/build（root 即本 frontend
// 目录，内联注入 ztron bridge 插件），Vite 会额外加载本文件并与内联选项合并，
// 因此 third-party 插件写在这里即可，无需复述 base / output.format（CLI 强制
// "./" 与 "iife"），也不要自加 __ZTRON_INTERNALS__ 引导脚本（由 CLI 注入）。
// 注意：本文件 import 的 vite 与两个插件需能在工程内解析，故示例的
// devDependencies 里有 vite（与 CLI 同一 6.x 主版本，lock 内同一实例）。
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
});
