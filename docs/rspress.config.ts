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
    // 顶部导航（zh 口径——主题 1.47 对 per-locale nav 覆盖支持不完整，
    // 对象/locales 形态均导致 navbar 不渲染，实测回退为单份；en 用户
    // 走 footer 的 Home 链接或右上角语言切换）。
    // navbar 的渲染与否取决于 themeConfig.nav 是否存在，故此处必须有。
    nav: [
      { text: "主页", link: "https://zturnlibs.github.io/ztron/zh/" },
      { text: "快速开始", link: "/start/intro.html" },
      { text: "指南", link: "/guide/architecture.html" },
      { text: "API 参考", link: "/reference/api/index.html" },
    ],
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
