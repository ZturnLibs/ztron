### Task 1: 站点骨架（可安装、可构建、双语最小首页）

**Files:**
- Create: `docs/package.json`、`docs/.gitignore`、`docs/rspress.config.ts`、`docs/i18n.json`、`docs/zh/index.md`、`docs/en/index.md`、`docs/zh/_nav.json`、`docs/en/_nav.json`
- Create: `docs/public/zturnlabs-icon.png`（复制自 `/Users/zyj/Zturn/zturn-home-site/docs/public/zturnlabs-icon.png`）

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: `docs/` 可构建站点；目录约定 `docs/zh`（默认语言、无路由前缀）与 `docs/en`（`/en/` 前缀）；`i18n.json` 键 `start`/`guide`/`reference`（后续任务在 `_nav.json` 里以键引用）

- [ ] **Step 1: 写 `docs/package.json`**

```json
{
  "name": "@zturnlibs/ztron-docs",
  "version": "0.3.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "rspress dev",
    "build": "rspress build",
    "preview": "rspress preview",
    "check:locales": "node --experimental-strip-types scripts/check-locales.ts",
    "check:locales:deploy": "node --experimental-strip-types scripts/check-locales.ts --deploy",
    "test": "node --experimental-strip-types --test scripts/*.test.ts"
  },
  "dependencies": {
    "rspress": "^1.40.2"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: 写 `docs/.gitignore`**

```
node_modules/
doc_build/
```

- [ ] **Step 3: 写 `docs/rspress.config.ts`**

```ts
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
```

- [ ] **Step 4: 写 `docs/i18n.json`（导航键双语）**

```json
{
  "start": { "zh": "开始", "en": "Start" },
  "guide": { "zh": "指南", "en": "Guide" },
  "reference": { "zh": "参考", "en": "Reference" },
  "plugins": { "zh": "插件", "en": "Plugins" }
}
```

- [ ] **Step 5: 写最小首页与导航**

`docs/zh/index.md`：

```markdown
---
title: Ztron 文档
---

# Ztron 文档

Tauri 风格的跨平台桌面框架，以 TypeScript 重写，运行于 txiki.js + 系统 WebView。

（P1 内容建设中——本页在 Task 3 之后由正式首页替换。）

适用版本：`ztron 0.1.0`
```

`docs/en/index.md`：

```markdown
---
title: Ztron Docs
---

# Ztron Docs

A Tauri-style cross-platform desktop framework rewritten in TypeScript, on txiki.js + the system WebView.

(Placeholder while P1 content lands — replaced by the real landing page after Task 3.)

适用版本：`ztron 0.1.0`
```

`docs/zh/_nav.json` 与 `docs/en/_nav.json` 内容相同（text 为 i18n 键，链接在各自 locale 内解析）：

```json
[
  { "text": "start", "link": "/start/intro" },
  { "text": "guide", "link": "/guide/architecture" },
  { "text": "reference", "link": "/reference/cli" }
]
```

- [ ] **Step 6: 复制品牌图标**

```bash
mkdir -p docs/public
cp /Users/zyj/Zturn/zturn-home-site/docs/public/zturnlabs-icon.png docs/public/
```

- [ ] **Step 7: 安装并构建验证**

```bash
cd docs && pnpm install && pnpm build
```

预期：`install` 生成 `docs/pnpm-lock.yaml`；`build` exit 0，产出 `docs/doc_build/`，内含 `index.html`（zh 默认）与 `en/index.html`。若 `en/` 前缀缺失，检查 `locales` 配置拼写。

- [ ] **Step 8: 提交**

```bash
git add docs/package.json docs/pnpm-lock.yaml docs/.gitignore docs/rspress.config.ts docs/i18n.json docs/zh docs/en docs/public
git commit -m "docs(site): rspress skeleton - bilingual locales, base path, brand icon"
```

---

