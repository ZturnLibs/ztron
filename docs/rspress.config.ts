import { defineConfig } from "rspress/config";

// root = 本目录（zh/ 为默认语言、无路由前缀，en/ 挂 /en/）。
// __dirname 写法与 zturn-home-site 一致，已在 Rspress 1.x 验证可构建；
// 勿改用 import.meta.url（会被打进客户端 bundle 导致构建失败）。
export default defineConfig({
  root: __dirname,
  // GitHub Pages 项目页子路径；绑定自定义域名后改为 "/"
  base: "/ztron/",
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
    ],
  },
  themeConfig: {
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
          <div><a href="https://github.com/ZturnLibs/ztron">GitHub</a> · Ztron</div>
          <div><a href="https://beian.miit.gov.cn/">鄂ICP备2025110122号</a></div>
        </div>
      `,
    },
  },
});
