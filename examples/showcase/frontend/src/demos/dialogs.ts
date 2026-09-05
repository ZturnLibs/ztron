import {
  open,
  save,
  message,
  ask,
  confirm,
  sendNotification,
  isPermissionGranted,
  requestPermission,
  writeClipboardText,
  readClipboardText,
  writeClipboardHtml,
  readClipboardHtml,
  clearClipboard,
} from "@zturnlibs/ztron-api";
import { act, field, fieldValue, type Demo } from "../demo-ui";
import type { Lang } from "../i18n";

/** 每个模块一个双语字典：可见文案（标题/描述/按钮/输出/代码注释）全覆盖 */
const STR = {
  zh: {
    category: "对话框与通知",
    file: {
      title: "文件对话框 open / save",
      description: "原生打开/保存对话框；返回所选路径，取消返回 null。",
      code: `import { open, save } from "@zturnlibs/ztron-api";

const file = await open({
  title: "选择一个文件",
  filters: ["txt", "md", "json"],   // 扩展名过滤
});
if (file) console.log("选中：", file);

const target = await save({ title: "保存到哪里" });`,
      openBtn: "打开文件",
      openTitle: "选择一个文件",
      picked: (file: string | string[]) => `选中：${file}`,
      saveBtn: "保存对话框",
      saveTitle: "保存到哪里",
      target: (path: string) => `目标：${path}`,
      cancelled: "已取消",
    },
    msg: {
      title: "消息对话框 message / ask / confirm",
      description: "系统级提示框：message 纯提示；ask/confirm 带按钮，返回布尔值。",
      code: `import { message, ask, confirm } from "@zturnlibs/ztron-api";

await message({ title: "提示", message: "Hello Ztron", kind: "info" });
const yes = await ask({ title: "确认", message: "继续吗？" });
const ok = await confirm({ title: "确认", message: "保存修改？" });`,
      messageBtn: "message(info)",
      messageBody: "这是一个原生消息框",
      messageDone: "message 已关闭",
      askBtn: "ask",
      askTitle: "确认",
      askBody: "Ztron 好用吗？",
      youChose: (answer: string) => `你选择了：${answer}`,
      yes: "是",
      no: "否",
      confirmBtn: "confirm",
      confirmTitle: "确认",
      confirmBody: "保存这份草稿？",
      confirmDone: (ok: boolean) => `confirm 返回：${ok}`,
    },
    notif: {
      title: "系统通知",
      description: "先查/请求通知权限再发送（未授权时 send 会静默失败）。",
      code: `import {
  sendNotification, isPermissionGranted, requestPermission,
} from "@zturnlibs/ztron-api";

let granted = await isPermissionGranted();
if (!granted) granted = await requestPermission();
if (granted) {
  await sendNotification({ title: "Ztron", body: "来自 showcase 的通知" });
}`,
      sendBtn: "发一条通知",
      noPermission: "通知权限未授予（dev 裸二进制常见，打包 .app 后可授权）",
      notifBody: "这是一条系统通知",
      sent: "通知已发出（看屏幕右上角）",
    },
    clipboard: {
      title: "剪贴板",
      description: "读写文本与 HTML，支持清除；写完可去任意应用粘贴验证。",
      code: `import {
  writeClipboardText, readClipboardText,
  writeClipboardHtml, readClipboardHtml, clearClipboard,
} from "@zturnlibs/ztron-api";

await writeClipboardText("来自 Ztron");
const text = await readClipboardText();

await writeClipboardHtml("<b>加粗</b>");
const html = await readClipboardHtml();
await clearClipboard();`,
      textLabel: "要写的文本",
      textPlaceholder: "来自 Ztron Showcase",
      writeBtn: "写文本",
      written: "已写入剪贴板，去别处粘贴试试",
      readBtn: "读文本",
      clipboard: (value: string | string[]) => `剪贴板：${value}`,
      empty: "(空)",
      htmlBtn: "HTML 往返",
      htmlBack: (html: string | null) => `读回 HTML：${html}`,
      clearBtn: "清除",
      cleared: "已清除",
    },
  },
  en: {
    category: "Dialogs",
    file: {
      title: "File dialogs: open / save",
      description:
        "Native open and save dialogs; they return the chosen path, or null when cancelled.",
      code: `import { open, save } from "@zturnlibs/ztron-api";

const file = await open({
  title: "Pick a file",
  filters: ["txt", "md", "json"],   // extension filters
});
if (file) console.log("Selected:", file);

const target = await save({ title: "Choose where to save" });`,
      openBtn: "Open a file",
      openTitle: "Pick a file",
      picked: (file: string | string[]) => `Selected: ${file}`,
      saveBtn: "Save dialog",
      saveTitle: "Choose where to save",
      target: (path: string) => `Target: ${path}`,
      cancelled: "Cancelled",
    },
    msg: {
      title: "Message dialogs: message / ask / confirm",
      description:
        "System-level prompt dialogs: message shows information only; ask/confirm add buttons and return a boolean.",
      code: `import { message, ask, confirm } from "@zturnlibs/ztron-api";

await message({ title: "Notice", message: "Hello Ztron", kind: "info" });
const yes = await ask({ title: "Confirm", message: "Continue?" });
const ok = await confirm({ title: "Confirm", message: "Save changes?" });`,
      messageBtn: "message(info)",
      messageBody: "This is a native message box",
      messageDone: "message closed",
      askBtn: "ask",
      askTitle: "Confirm",
      askBody: "How do you like Ztron?",
      youChose: (answer: string) => `You chose: ${answer}`,
      yes: "Yes",
      no: "No",
      confirmBtn: "confirm",
      confirmTitle: "Confirm",
      confirmBody: "Save this draft?",
      confirmDone: (ok: boolean) => `confirm returned: ${ok}`,
    },
    notif: {
      title: "System notifications",
      description:
        "Check or request notification permission before sending (send fails silently when not authorized).",
      code: `import {
  sendNotification, isPermissionGranted, requestPermission,
} from "@zturnlibs/ztron-api";

let granted = await isPermissionGranted();
if (!granted) granted = await requestPermission();
if (granted) {
  await sendNotification({ title: "Ztron", body: "A notification from the showcase" });
}`,
      sendBtn: "Send a notification",
      noPermission:
        "Notification permission not granted (common for a bare dev binary; grant it after bundling the .app)",
      notifBody: "This is a system notification",
      sent: "Notification sent (check the top-right corner of your screen)",
    },
    clipboard: {
      title: "Clipboard",
      description:
        "Read and write text and HTML, and clear the clipboard; after writing, paste it anywhere else to verify.",
      code: `import {
  writeClipboardText, readClipboardText,
  writeClipboardHtml, readClipboardHtml, clearClipboard,
} from "@zturnlibs/ztron-api";

await writeClipboardText("From Ztron");
const text = await readClipboardText();

await writeClipboardHtml("<b>bold</b>");
const html = await readClipboardHtml();
await clearClipboard();`,
      textLabel: "Text to write",
      textPlaceholder: "From Ztron Showcase",
      writeBtn: "Write text",
      written: "Written to the clipboard; try pasting it somewhere else",
      readBtn: "Read text",
      clipboard: (value: string | string[]) => `Clipboard: ${value}`,
      empty: "(empty)",
      htmlBtn: "HTML round-trip",
      htmlBack: (html: string | null) => `HTML read back: ${html}`,
      clearBtn: "Clear",
      cleared: "Cleared",
    },
  },
};

/** 按语言构建本分类目录；语言切换时 main.ts 会重建 */
export function dialogCatalog(lang: Lang): { category: string; demos: Demo[] } {
  const t = STR[lang];

  const fileDialogs: Demo = {
    id: "dialog.file",
    title: t.file.title,
    description: t.file.description,
    code: t.file.code,
    docPath: "/plugins/dialog.html",
    mount(area, out) {
      area.append(
        act(out, t.file.openBtn, async () => {
          const file = await open({ title: t.file.openTitle, filters: ["txt", "md", "json"] });
          out.ok(file ? t.file.picked(file) : t.file.cancelled);
        }),
        act(out, t.file.saveBtn, async () => {
          const target = await save({ title: t.file.saveTitle });
          out.ok(target ? t.file.target(target) : t.file.cancelled);
        }),
      );
    },
  };

  const msgDialogs: Demo = {
    id: "dialog.message",
    title: t.msg.title,
    description: t.msg.description,
    code: t.msg.code,
    docPath: "/plugins/dialog.html",
    mount(area, out) {
      area.append(
        act(out, t.msg.messageBtn, async () => {
          await message({ title: "Ztron Showcase", message: t.msg.messageBody, kind: "info" });
          out.ok(t.msg.messageDone);
        }),
        act(out, t.msg.askBtn, async () => {
          const yes = await ask({ title: t.msg.askTitle, message: t.msg.askBody });
          out.ok(t.msg.youChose(yes ? t.msg.yes : t.msg.no));
        }),
        act(out, t.msg.confirmBtn, async () => {
          const ok = await confirm({ title: t.msg.confirmTitle, message: t.msg.confirmBody });
          out.ok(t.msg.confirmDone(ok));
        }),
      );
    },
  };

  const notif: Demo = {
    id: "dialog.notification",
    title: t.notif.title,
    description: t.notif.description,
    code: t.notif.code,
    docPath: "/plugins/notification.html",
    mount(area, out) {
      area.append(
        act(out, t.notif.sendBtn, async () => {
          let granted = await isPermissionGranted();
          if (!granted) granted = await requestPermission();
          if (!granted) {
            out.fail(t.notif.noPermission);
            return;
          }
          await sendNotification({ title: "Ztron Showcase", body: t.notif.notifBody });
          out.ok(t.notif.sent);
        }),
      );
    },
  };

  const clipboardDemo: Demo = {
    id: "dialog.clipboard",
    title: t.clipboard.title,
    description: t.clipboard.description,
    code: t.clipboard.code,
    docPath: "/plugins/clipboard.html",
    mount(area, out) {
      const text = field(t.clipboard.textLabel, t.clipboard.textPlaceholder);
      area.append(
        text,
        act(out, t.clipboard.writeBtn, async () => {
          await writeClipboardText(fieldValue(text));
          out.ok(t.clipboard.written);
        }),
        act(out, t.clipboard.readBtn, async () => {
          out.ok(t.clipboard.clipboard((await readClipboardText()) ?? t.clipboard.empty));
        }),
        act(out, t.clipboard.htmlBtn, async () => {
          await writeClipboardHtml("<b>ztron-html</b>");
          out.ok(t.clipboard.htmlBack(await readClipboardHtml()));
        }),
        act(out, t.clipboard.clearBtn, async () => {
          await clearClipboard();
          out.ok(t.clipboard.cleared);
        }),
      );
    },
  };

  return { category: t.category, demos: [fileDialogs, msgDialogs, notif, clipboardDemo] };
}
