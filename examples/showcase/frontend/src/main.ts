import "./style.css";
import { invoke, openUrl, writeClipboardText } from "@zturnlibs/ztron-api";
import { icon, output, type Demo } from "./demo-ui";
import { docUrl } from "./doc-links";
import { coreDemos } from "./demos/core";
import { windowDemos } from "./demos/window";

/** 分类目录：Task 3-10 逐个补充 demos/* 模块后在此登记 */
const CATALOG: { category: string; demos: Demo[] }[] = [
  { category: "核心", demos: coreDemos },
  { category: "窗口", demos: windowDemos },
];

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
