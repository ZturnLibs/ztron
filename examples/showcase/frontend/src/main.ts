import "./style.css";
import { invoke, openUrl, writeClipboardText } from "@zturnlibs/ztron-api";
import { icon, output, type Demo } from "./demo-ui";
import { docUrl } from "./doc-links";
import { CHROME, applyDocumentLang, getLang, onLangChange, setLang, type Lang } from "./i18n";
import { coreCatalog } from "./demos/core";
import { windowCatalog } from "./demos/window";
import { fsCatalog } from "./demos/fs";
import { dialogCatalog } from "./demos/dialogs";
import { netCatalog } from "./demos/net";
import { menuTrayCatalog } from "./demos/menu-tray";
import { dataCatalog } from "./demos/data";
import { systemCatalog } from "./demos/system";

interface CategoryEntry { category: string; demos: Demo[] }

/** 分类目录按当前语言构建；新增 demo 模块时在此登记 */
function buildCatalog(lang: Lang): CategoryEntry[] {
  return [
    coreCatalog(lang),
    windowCatalog(lang),
    fsCatalog(lang),
    dialogCatalog(lang),
    netCatalog(lang),
    menuTrayCatalog(lang),
    dataCatalog(lang),
    systemCatalog(lang),
  ];
}

const nav = document.getElementById("nav")!;
const content = document.getElementById("content")!;
const brandSub = document.querySelector<HTMLElement>(".brand-sub")!;

let currentCardId: string | null = null;

function renderCard(demo: Demo, chrome: (typeof CHROME)[Lang]): void {
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
  docBtn.append(icon("book"), document.createTextNode(chrome.docs));
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
  copyBtn.append(icon("copy"), document.createTextNode(chrome.copy));
  copyBtn.addEventListener("click", () => {
    void writeClipboardText(demo.code);
  });
  codeWrap.append(pre, copyBtn);

  card.append(header, area, out.root, codeWrap);
  content.append(card);
  demo.mount(area, out);
}

function renderAll(): void {
  const lang = getLang();
  const chrome = CHROME[lang];
  applyDocumentLang(lang);
  brandSub.textContent = chrome.brandSub;

  const catalog = buildCatalog(lang);

  // 选中卡：记住的 id 在目录里仍存在则保持，否则回落到第一张
  const flat = catalog.flatMap((c) => c.demos);
  const activeId = flat.some((d) => d.id === currentCardId)
    ? currentCardId
    : flat[0]?.id ?? null;
  currentCardId = activeId;

  nav.innerHTML = "";
  content.innerHTML = "";
  for (const { category, demos } of catalog) {
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
        currentCardId = demo.id;
        renderCard(demo, chrome);
      });
      if (demo.id === activeId) {
        item.classList.add("active");
        renderCard(demo, chrome);
      }
      nav.append(item);
    }
  }
  if (catalog.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = chrome.emptyHint;
    content.append(empty);
  }
}

/** 侧边栏底部的语言开关（中文 / EN） */
function renderLangSwitch(): void {
  const holder = document.createElement("div");
  holder.className = "lang-switch";
  holder.id = "lang-switch";
  const render = (lang: Lang) => {
    holder.innerHTML = "";
    for (const [code, label] of [["zh", "中文"], ["en", "EN"]] as const) {
      const b = document.createElement("button");
      b.className = `lang-btn${lang === code ? " on" : ""}`;
      b.textContent = label;
      b.addEventListener("click", () => {
        if (getLang() !== code) setLang(code);
      });
      holder.append(b);
    }
  };
  render(getLang());
  onLangChange(render);
  document.getElementById("sidebar")!.append(holder);
}

renderLangSwitch();
renderAll();

// 语言切换：保持当前卡片选中，重建目录并重渲染（当前卡片的临时监听器随重建丢弃）
onLangChange(() => renderAll());

// 冒烟：卡片渲染完成后上报卡片总数，供 ztron check --expect SHOWCASE_OK 门禁
void invoke("showcase:report", {
  received: `SHOWCASE_OK:${buildCatalog(getLang()).reduce((n, c) => n + c.demos.length, 0)}`,
});
