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
