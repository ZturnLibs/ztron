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

const fileDialogs: Demo = {
  id: "dialog.file",
  title: "文件对话框 open / save",
  description: "原生打开/保存对话框；返回所选路径，取消返回 null。",
  code: `import { open, save } from "@zturnlibs/ztron-api";

const file = await open({
  title: "选择一个文件",
  filters: ["txt", "md", "json"],   // 扩展名过滤
});
if (file) console.log("选中：", file);

const target = await save({ title: "保存到哪里" });`,
  docPath: "/plugins/dialog.html",
  mount(area, out) {
    area.append(
      act(out, "打开文件", async () => {
        const file = await open({ title: "选择一个文件", filters: ["txt", "md", "json"] });
        out.ok(file ? `选中：${file}` : "已取消");
      }),
      act(out, "保存对话框", async () => {
        const target = await save({ title: "保存到哪里" });
        out.ok(target ? `目标：${target}` : "已取消");
      }),
    );
  },
};

const msgDialogs: Demo = {
  id: "dialog.message",
  title: "消息对话框 message / ask / confirm",
  description: "系统级提示框：message 纯提示；ask/confirm 带按钮，返回布尔值。",
  code: `import { message, ask, confirm } from "@zturnlibs/ztron-api";

await message({ title: "提示", message: "Hello Ztron", kind: "info" });
const yes = await ask({ title: "确认", message: "继续吗？" });
const ok = await confirm({ title: "确认", message: "保存修改？" });`,
  docPath: "/plugins/dialog.html",
  mount(area, out) {
    area.append(
      act(out, "message(info)", async () => {
        await message({ title: "Ztron Showcase", message: "这是一个原生消息框", kind: "info" });
        out.ok("message 已关闭");
      }),
      act(out, "ask", async () => {
        const yes = await ask({ title: "确认", message: "Ztron 好用吗？" });
        out.ok(`你选择了：${yes ? "是" : "否"}`);
      }),
      act(out, "confirm", async () => {
        const ok = await confirm({ title: "确认", message: "保存这份草稿？" });
        out.ok(`confirm 返回：${ok}`);
      }),
    );
  },
};

const notif: Demo = {
  id: "dialog.notification",
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
  docPath: "/plugins/notification.html",
  mount(area, out) {
    area.append(
      act(out, "发一条通知", async () => {
        let granted = await isPermissionGranted();
        if (!granted) granted = await requestPermission();
        if (!granted) {
          out.fail("通知权限未授予（dev 裸二进制常见，打包 .app 后可授权）");
          return;
        }
        await sendNotification({ title: "Ztron Showcase", body: "这是一条系统通知" });
        out.ok("通知已发出（看屏幕右上角）");
      }),
    );
  },
};

const clipboardDemo: Demo = {
  id: "dialog.clipboard",
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
  docPath: "/plugins/clipboard.html",
  mount(area, out) {
    const text = field("要写的文本", "来自 Ztron Showcase");
    area.append(
      text,
      act(out, "写文本", async () => {
        await writeClipboardText(fieldValue(text));
        out.ok("已写入剪贴板，去别处粘贴试试");
      }),
      act(out, "读文本", async () => {
        out.ok(`剪贴板：${(await readClipboardText()) ?? "(空)"}`);
      }),
      act(out, "HTML 往返", async () => {
        await writeClipboardHtml("<b>ztron-html</b>");
        out.ok(`读回 HTML：${await readClipboardHtml()}`);
      }),
      act(out, "清除", async () => {
        await clearClipboard();
        out.ok("已清除");
      }),
    );
  },
};

export const dialogDemos: Demo[] = [fileDialogs, msgDialogs, notif, clipboardDemo];
