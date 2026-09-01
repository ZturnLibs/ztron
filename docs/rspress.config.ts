import { defineConfig } from "rspress/config";
import { fileURLToPath } from "node:url";

// 站点根即本目录：zh/ 为默认语言（无路由前缀），en/ 挂 /en/。
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
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
    exclude: ["**/superpowers/**", "**/scripts/**", "**/translations/**"],
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
