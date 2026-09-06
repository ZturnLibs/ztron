/**
 * i18n —— showcase 多语言基建。
 * zh 为默认（与文档站一致），en 可切换；选择持久化到 localStorage，
 * 切换时重建目录并重渲染（不整页刷新，原生窗口状态不受影响）。
 */

export type Lang = "zh" | "en";

const STORAGE_KEY = "ztron-showcase-lang";

export function getLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* localStorage 不可用时走浏览器语言 */
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* 忽略：仅影响持久化 */
  }
  for (const cb of listeners) cb(lang);
}

const listeners = new Set<(lang: Lang) => void>();

/** 语言变化订阅；返回取消订阅函数 */
export function onLangChange(cb: (lang: Lang) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function applyDocumentLang(lang: Lang): void {
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
}

/** 界面骨架（非卡片内容）的双语文案 */
export const CHROME: Record<Lang, {
  brandSub: string;
  docs: string;
  copy: string;
  emptyHint: string;
  outPlaceholder: string;
}> = {
  zh: {
    brandSub: "点着玩的功能演示，每个卡片都有代码和文档",
    docs: "文档",
    copy: "复制",
    emptyHint: "demo 模块尚未登记（见 frontend/src/main.ts 的 CATALOG）",
    outPlaceholder: "运行按钮后，结果会显示在这里",
  },
  en: {
    brandSub: "Hands-on feature demos: every card ships code and docs",
    docs: "Docs",
    copy: "Copy",
    emptyHint: "No demo modules registered (see CATALOG in frontend/src/main.ts)",
    outPlaceholder: "Run a button and results appear here",
  },
};
