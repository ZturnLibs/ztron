### Task 2: 前端骨架 —— 品牌令牌、demo-ui、doc-links、路由与冒烟

**Files:**
- Create: `examples/showcase/frontend/index.html`
- Create: `examples/showcase/frontend/src/style.css`、`demo-ui.ts`、`doc-links.ts`、`main.ts`

**Interfaces:**
- Consumes: Task 1 的 `showcase:report` 命令；`@zturnlibs/ztron-api` 的 `openUrl`/`writeClipboardText`/`invoke`。
- Produces: 本计划开头的共享接口（Demo/Output/act/field/output/icon/extractError，逐字照抄）；`doc-links.ts` 的 `docUrl(docPath: string): string`。后续 demo 任务只 import 这些。

- [ ] **Step 1: index.html**

```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <title>Ztron Showcase</title>
  </head>
  <body>
    <div id="app">
      <nav id="sidebar">
        <div class="brand">Ztron Showcase</div>
        <div class="brand-sub">点着玩的功能演示，每个卡片都有代码和文档</div>
        <div id="nav"></div>
      </nav>
      <main id="content"></main>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: style.css**

```css
/* Ztron Showcase —— 令牌逐字继承官网 website/src/styles/tokens.css（品牌一致性）。
   深色主题锁定（与官网一致）；圆角体系：容器 10px、交互控件 8px。 */
:root {
  --bg: #0a0c10;
  --surface: #11141b;
  --elevated: #161a23;
  --border: rgba(255, 255, 255, 0.08);
  --text-1: #e6eaf2;
  --text-2: #9aa3b2;
  --accent-from: #8b5cf6;
  --accent-to: #22d3ee;
  --ok: #34d399;
  --bad: #f87171;
  --code-bg: #0d1017;
  --grad: linear-gradient(120deg, var(--accent-from), var(--accent-to));
  --font-ui: system-ui, -apple-system, "PingFang SC", "Segoe UI", sans-serif;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Consolas, monospace;
  --radius: 10px;
  --radius-ctl: 8px;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.6;
  background: var(--bg);
  color: var(--text-1);
}
#app { display: flex; height: 100vh; }

/* 侧边栏 */
#sidebar {
  width: 220px;
  flex: none;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: var(--surface);
  border-right: 1px solid var(--border);
}
.brand {
  padding: 18px 16px 4px;
  font-size: 16px;
  font-weight: 700;
  background: var(--grad);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.brand-sub { padding: 0 16px 12px; font-size: 12px; color: var(--text-2); }
.nav-category { padding: 12px 16px 4px; font-size: 12px; color: var(--text-2); }
.nav-item {
  display: block;
  width: 100%;
  padding: 6px 16px 6px 24px;
  font: inherit;
  font-size: 13px;
  text-align: left;
  color: var(--text-2);
  background: none;
  border: 0;
  border-left: 2px solid transparent;
  cursor: pointer;
  transition:
    color 0.15s ease-out,
    background-color 0.15s ease-out,
    border-color 0.15s ease-out;
}
.nav-item:hover { color: var(--text-1); background: var(--elevated); }
.nav-item.active {
  color: var(--text-1);
  background: var(--elevated);
  border-left-color: var(--accent-to);
}

/* 内容区与卡片 */
#content { flex: 1; overflow-y: auto; padding: 24px 28px 48px; }
.empty { color: var(--text-2); padding: 40px 0; }
.card {
  max-width: 760px;
  padding: 20px 22px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.card-title { margin: 0; font-size: 18px; font-weight: 650; }
.card-desc { margin: 6px 0 0; font-size: 13px; color: var(--text-2); max-width: 65ch; }
.card-area { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin-top: 16px; }
.card-out {
  width: 100%;
  min-height: 38px;
  margin: 14px 0 0;
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-ctl);
}
.card-out:empty::before { content: "运行按钮后，结果会显示在这里"; color: rgba(154, 163, 178, 0.55); }
.card-out.ok { color: var(--ok); }
.card-out.fail { color: var(--bad); }
.card-code { position: relative; margin: 14px 0 0; }
.card-code pre {
  margin: 0;
  padding: 12px 14px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-2);
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-ctl);
  overflow-x: auto;
}
.card-code .copy { position: absolute; top: 8px; right: 8px; }

/* 控件 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font: inherit;
  font-size: 13px;
  color: var(--text-1);
  background: var(--elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-ctl);
  cursor: pointer;
  transition:
    transform 0.12s ease-out,
    border-color 0.15s ease-out,
    background-color 0.15s ease-out;
}
.btn:hover { border-color: rgba(255, 255, 255, 0.2); }
.btn:active { transform: translateY(1px); }
.btn:disabled { opacity: 0.5; cursor: default; }
.btn.primary { background: var(--grad); border: 0; color: #0a0c10; font-weight: 600; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field span { font-size: 12px; color: var(--text-2); }
.field input {
  width: 220px;
  padding: 7px 10px;
  font: inherit;
  font-size: 13px;
  color: var(--text-1);
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-ctl);
}
.field input:focus { outline: none; border-color: var(--accent-to); }
svg.icon {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
```

- [ ] **Step 3: demo-ui.ts**

```ts
/**
 * demo-ui —— showcase 前端的全部 UI 原语。
 * 每个 demo = 一个 Demo 注册项；act/field/output 负责控件与结果展示，
 * demo 代码只写成功路径（act 自动捕获异常并以红色显示）。
 */

export interface Output {
  root: HTMLPreElement;
  info(msg: string): void;
  ok(msg: string): void;
  fail(msg: string): void;
}

export interface Demo {
  id: string;
  title: string;
  description: string;
  /** 展示给读者的最小用法片段（文档字符串，不参与编译） */
  code: string;
  /** 文档站相对路径，如 "/plugins/fs.html" */
  docPath: string;
  mount(area: HTMLElement, out: Output): void;
}

/** Tauri 风格 rejection payload（{ error }）转可读字符串 */
export function extractError(e: unknown): string {
  if (e && typeof e === "object" && "error" in e) {
    return String((e as { error: unknown }).error);
  }
  return String(e);
}

export function output(): Output {
  const root = document.createElement("pre");
  root.className = "card-out";
  const write = (msg: string, cls: string) => {
    root.className = `card-out ${cls}`.trim();
    root.textContent += (root.textContent ? "\n" : "") + msg;
    root.scrollTop = root.scrollHeight;
  };
  return {
    root,
    info: (msg) => write(msg, ""),
    ok: (msg) => write(msg, "ok"),
    fail: (msg) => write(msg, "fail"),
  };
}

/** 带自动错误捕获与 busy 态的按钮 */
export function act(
  out: Output,
  label: string,
  run: () => Promise<void> | void,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "btn";
  b.textContent = label;
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await run();
    } catch (e) {
      out.fail(extractError(e));
    } finally {
      b.disabled = false;
    }
  });
  return b;
}

/** label 在上的输入框（无 placeholder-as-label） */
export function field(labelText: string, placeholder = "", value = ""): HTMLInputElement {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const cap = document.createElement("span");
  cap.textContent = labelText;
  const input = document.createElement("input");
  input.placeholder = placeholder;
  input.value = value;
  wrap.append(cap, input);
  // 返回 input 本身：demo 只关心取值；样式由 .field 后代选择器命中
  return input;
}

/** Tabler Icons (MIT) 内联 SVG，strokeWidth 2；本应用仅用这 3 枚 */
export function icon(name: "book" | "copy" | "external"): SVGSVGElement {
  const paths: Record<typeof name, string> = {
    book: '<path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 5a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 5v14a9 9 0 0 1 9 0a9 9 0 0 1 9 0v-14a9 9 0 0 0 -9 0a9 9 0 0 0 -9 0z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2"/>',
    external: '<path d="M11 7h-5a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-5"/><path d="M10 14l10 -10"/><path d="M15 4h5v5"/>',
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.classList.add("icon");
  svg.innerHTML = paths[name];
  return svg;
}
```

注意 `field()` 里有一段占位 style 代码，删掉它（上面的最终版应不含 `const style...` 三行；写文件时直接不写这三行）。最终版：

```ts
export function field(labelText: string, placeholder = "", value = ""): HTMLInputElement {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const cap = document.createElement("span");
  cap.textContent = labelText;
  const input = document.createElement("input");
  input.placeholder = placeholder;
  input.value = value;
  wrap.append(cap, input);
  return input;
}
```

- [ ] **Step 4: doc-links.ts**

```ts
/** 文档站地址（zh 默认语言，en 挂 /en/ 前缀）。docPath 见规格第 5 节对照表。 */
const DOCS_BASE = "https://zturnlibs.github.io/ztron/docs";

export function docUrl(docPath: string): string {
  return DOCS_BASE + docPath;
}
```

- [ ] **Step 5: frontend/src/main.ts（CATALOG 先空，冒烟为 0 卡）**

```ts
import "./style.css";
import { invoke, openUrl, writeClipboardText } from "@zturnlibs/ztron-api";
import { icon, output, type Demo } from "./demo-ui";
import { docUrl } from "./doc-links";

/** 分类目录：Task 3-10 逐个补充 demos/* 模块后在此登记 */
const CATALOG: { category: string; demos: Demo[] }[] = [];

const nav = document.getElementById("nav")!;
const content = document.getElementById("content")!;

function renderCard(demo: Demo): void {
  content.innerHTML = "";

  const card = document.createElement("article");
  card.className = "card";

  const header = document.createElement("div");
  header.className = "card-header";
  const heading = document.createElement("div");
  const title = document.createElement("h2");
  title.className = "card-title";
  title.textContent = demo.title;
  const desc = document.createElement("p");
  desc.className = "card-desc";
  desc.textContent = demo.description;
  heading.append(title, desc);
  const docBtn = document.createElement("button");
  docBtn.className = "btn";
  docBtn.append(icon("book"), document.createTextNode("文档"));
  docBtn.addEventListener("click", () => {
    const url = docUrl(demo.docPath);
    void openUrl(url).catch(() => window.open(url, "_blank"));
  });
  header.append(heading, docBtn);

  const area = document.createElement("div");
  area.className = "card-area";
  const out = output();

  const codeWrap = document.createElement("div");
  codeWrap.className = "card-code";
  const pre = document.createElement("pre");
  pre.textContent = demo.code;
  const copyBtn = document.createElement("button");
  copyBtn.className = "btn copy";
  copyBtn.append(icon("copy"), document.createTextNode("复制"));
  copyBtn.addEventListener("click", () => {
    void writeClipboardText(demo.code);
  });
  codeWrap.append(pre, copyBtn);

  card.append(header, area, out.root, codeWrap);
  content.append(card);
  demo.mount(area, out);
}

function renderNav(): void {
  nav.innerHTML = "";
  let first = true;
  for (const { category, demos } of CATALOG) {
    const cap = document.createElement("div");
    cap.className = "nav-category";
    cap.textContent = category;
    nav.append(cap);
    for (const demo of demos) {
      const item = document.createElement("button");
      item.className = "nav-item";
      item.textContent = demo.title;
      item.addEventListener("click", () => {
        nav.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
        item.classList.add("active");
        renderCard(demo);
      });
      if (first) {
        item.classList.add("active");
        renderCard(demo);
        first = false;
      }
      nav.append(item);
    }
  }
  if (CATALOG.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "demo 模块尚未登记（见 frontend/src/main.ts 的 CATALOG）";
    content.append(empty);
  }
}

renderNav();

// 冒烟：卡片渲染完成后上报卡片总数，供 ztron check --expect SHOWCASE_OK 门禁
void invoke("showcase:report", {
  received: `SHOWCASE_OK:${CATALOG.reduce((n, c) => n + c.demos.length, 0)}`,
});
```

- [ ] **Step 6: typecheck**

Run: `pnpm --filter @zturnlibs/ztron-example-showcase typecheck`
Expected: exit 0。若报 `*.css` 模块找不到：在 `frontend/src/` 新建 `globals.d.ts` 内容为 `declare module "*.css";` 后重跑。

- [ ] **Step 7: dev 人工点验（空目录态）**

Run: `pnpm --filter @zturnlibs/ztron-example-showcase dev`
Expected: 窗口出现，深色侧边栏（渐变字标「Ztron Showcase」），内容区显示空态文案；终端无报错。确认后 Ctrl+C 退出。

- [ ] **Step 8: Commit**

```bash
git add examples/showcase/frontend
git commit -m "feat(examples): showcase frontend shell - brand tokens, demo registry router, doc/copy buttons"
```

---

