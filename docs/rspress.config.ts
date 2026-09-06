import { defineConfig } from "rspress/config";

// root = 本目录（zh/ 为默认语言、无路由前缀，en/ 挂 /en/）。
// __dirname 写法与 zturn-home-site 一致，已在 Rspress 1.x 验证可构建；
// 勿改用 import.meta.url（会被打进客户端 bundle 导致构建失败）。
export default defineConfig({
  root: __dirname,
  // GitHub Pages：站点产物根 = 主页（website/），docs 挂 /docs/ 子路径，
  // 由 website.yml 一次性组装部署（避免两个 workflow 互相覆盖 Pages）。
  base: "/ztron/docs/",
  lang: "zh",
  title: "Ztron",
  icon: "/zturnlabs-icon.png",
  locales: [
    { lang: "zh", label: "中文" },
    { lang: "en", label: "English" },
  ],
  route: {
    // doc_build 必须排除：root 即本目录，产物在其中，二次构建会扫到自身
    exclude: [
      "**/doc_build/**",
      "**/superpowers/**",
      "**/scripts/**",
      "**/translations/**",
      "CONTRIBUTING.md",
      "README.md",
      "rspress.config.ts",
      "typedoc.zh-plugin.ts",
    ],
  },
  themeConfig: {
    // 注意：这里绝不能手写 themeConfig.nav/sidebar。rspress core 仅在
    // `!haveNavSidebarConfig` 时注册 plugin-auto-nav-sidebar；一旦手写，
    // _meta.json 驱动的左侧边栏将不再生成（构建静默成功、菜单为空）。
    // 顶部导航项改在 docs/{zh,en}/_meta.json 中维护（插件原生源，支持外链）。
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: "https://github.com/ZturnLibs/ztron",
      },
    ],
    footer: {
      message: `
        <div>
          <a href="https://zturnlibs.github.io/ztron/zh/">主页</a> ·
          <a href="https://zturnlibs.github.io/ztron/">Home</a> ·
          <a href="https://github.com/ZturnLibs/ztron">GitHub</a> · Ztron
        </div>
      `,
    },
  },
});
