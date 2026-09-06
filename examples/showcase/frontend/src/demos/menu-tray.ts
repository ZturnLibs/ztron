import {
  setAppMenu,
  TrayIcon,
  registerShortcut,
  unregisterShortcut,
  isRegistered,
  onShortcut,
} from "@zturnlibs/ztron-api";
import { act, type Demo } from "../demo-ui";
import type { Lang } from "../i18n";

/** 每个模块一个双语字典：可见文案（标题/描述/按钮/输出/代码注释）全覆盖 */
const STR = {
  zh: {
    category: "菜单与托盘",
    menu: {
      title: "应用菜单",
      description: "构建原生应用菜单栏：子菜单、勾选/单选、分隔线、加速键；点击 View 菜单可见。",
      code: `import { setAppMenu } from "@zturnlibs/ztron-api";

const menu = await setAppMenu([
  { id: "new", text: "New Window" },
  { id: "sep", text: "-", separator: true },
  { id: "view", text: "View", children: [
    { id: "zoom", text: "Zoom", type: "check", checked: true },
    { id: "s", text: "Small", type: "radio", checked: true },
    { id: "l", text: "Large", type: "radio" },
  ]},
  { id: "quit", text: "Quit" },
]);
await menu.setItemAccelerator("quit", "CmdOrCtrl+Q");
await menu.setItemChecked("zoom", false);`,
      install: "安装示例菜单",
      installed: "已安装（看屏幕顶部菜单栏），quit 已绑定 CmdOrCtrl+Q",
      toggleZoom: "切换 Zoom 勾选",
      needInstall: "请先安装示例菜单",
      zoomToggled: (checked: boolean) =>
        `Zoom 已切换为${checked ? "勾选" : "不勾选"}（打开 View 菜单核对）`,
    },
    tray: {
      title: "系统托盘 TrayIcon",
      description: "在菜单栏创建托盘：模板图标自适应深浅色、悬停提示、显隐控制。",
      code: `import { TrayIcon } from "@zturnlibs/ztron-api";

const tray = await TrayIcon.create({
  title: "Z",
  tooltip: "Ztron Showcase 托盘",
});
await tray.setIconAsTemplate(true);   // macOS 模板图标
await tray.setVisible(false);
await tray.destroy();`,
      tooltip: "Ztron Showcase 托盘",
      create: "创建托盘（5 秒后销毁）",
      shown: "托盘已出现在菜单栏右上角（标题 Z）",
      destroyed: "托盘已销毁",
    },
    shortcut: {
      title: "全局快捷键",
      description: "注册系统级快捷键，应用在后台也能收到触发事件；注册后切到别的应用按 Cmd+Shift+J 试试。",
      code: `import { registerShortcut, isRegistered, onShortcut } from "@zturnlibs/ztron-api";

await registerShortcut("showcase", "Cmd+Shift+J");
console.log("已注册：", await isRegistered("showcase"));

const un = await onShortcut((e) => {
  console.log("触发：", e.shortcutId);   // "showcase"
});
// await unregisterShortcut("showcase"); un();`,
      register: "注册 Cmd+Shift+J（10 秒窗口）",
      registered: (reg: boolean) => `注册${reg ? "成功" : "失败"}，切到其他应用按 Cmd+Shift+J`,
      fired: (id: string) => `触发：${id}`,
      captured: "捕获到全局触发",
      notCaptured: "10 秒内未触发（快捷键可能被其他应用占用）",
    },
  },
  en: {
    category: "Menu & Tray",
    menu: {
      title: "App menu",
      description:
        "Build a native app menu bar: submenus, check/radio items, separators, accelerators; visible under the View menu.",
      code: `import { setAppMenu } from "@zturnlibs/ztron-api";

const menu = await setAppMenu([
  { id: "new", text: "New Window" },
  { id: "sep", text: "-", separator: true },
  { id: "view", text: "View", children: [
    { id: "zoom", text: "Zoom", type: "check", checked: true },
    { id: "s", text: "Small", type: "radio", checked: true },
    { id: "l", text: "Large", type: "radio" },
  ]},
  { id: "quit", text: "Quit" },
]);
await menu.setItemAccelerator("quit", "CmdOrCtrl+Q");
await menu.setItemChecked("zoom", false);`,
      install: "Install the sample menu",
      installed: "Installed (see the menu bar at the top of the screen); quit is bound to CmdOrCtrl+Q",
      toggleZoom: "Toggle the Zoom checkbox",
      needInstall: "Install the sample menu first",
      zoomToggled: (checked: boolean) =>
        `Zoom is now ${checked ? "checked" : "unchecked"} (open the View menu to verify)`,
    },
    tray: {
      title: "System tray with TrayIcon",
      description:
        "Create a tray icon in the menu bar: template icon adapts to light/dark mode, hover tooltip, visibility control.",
      code: `import { TrayIcon } from "@zturnlibs/ztron-api";

const tray = await TrayIcon.create({
  title: "Z",
  tooltip: "Ztron Showcase tray",
});
await tray.setIconAsTemplate(true);   // macOS template icon
await tray.setVisible(false);
await tray.destroy();`,
      tooltip: "Ztron Showcase tray",
      create: "Create the tray (destroyed after 5 seconds)",
      shown: "The tray icon appeared at the right end of the menu bar (title Z)",
      destroyed: "Tray icon destroyed",
    },
    shortcut: {
      title: "Global shortcuts",
      description:
        "Register a system-level shortcut that fires even when the app is in the background; after registering, switch to another app and press Cmd+Shift+J.",
      code: `import { registerShortcut, isRegistered, onShortcut } from "@zturnlibs/ztron-api";

await registerShortcut("showcase", "Cmd+Shift+J");
console.log("registered:", await isRegistered("showcase"));

const un = await onShortcut((e) => {
  console.log("fired:", e.shortcutId);   // "showcase"
});
// await unregisterShortcut("showcase"); un();`,
      register: "Register Cmd+Shift+J (10 second window)",
      registered: (reg: boolean) =>
        `Registration ${reg ? "succeeded" : "failed"}; switch to another app and press Cmd+Shift+J`,
      fired: (id: string) => `Fired: ${id}`,
      captured: "Captured a global trigger",
      notCaptured: "No trigger within 10 seconds (the shortcut may be taken by another app)",
    },
  },
};

/** 按语言构建本分类目录；语言切换时 main.ts 会重建 */
export function menuTrayCatalog(lang: Lang): { category: string; demos: Demo[] } {
  const t = STR[lang];

  const menuDemo: Demo = {
    id: "menu.app",
    title: t.menu.title,
    description: t.menu.description,
    code: t.menu.code,
    docPath: "/plugins/menu.html",
    mount(area, out) {
      let menu: Awaited<ReturnType<typeof setAppMenu>> | null = null;
      let zoomChecked = true;
      area.append(
        act(out, t.menu.install, async () => {
          menu = await setAppMenu([
            { id: "new", text: "New Window" },
            { id: "sep", text: "-", separator: true },
            {
              id: "view",
              text: "View",
              children: [
                { id: "zoom", text: "Zoom", type: "check", checked: true },
                { id: "s", text: "Small", type: "radio", checked: true },
                { id: "l", text: "Large", type: "radio" },
              ],
            },
            { id: "quit", text: "Quit" },
          ]);
          await menu.setItemAccelerator("quit", "CmdOrCtrl+Q");
          out.ok(t.menu.installed);
        }),
        act(out, t.menu.toggleZoom, async () => {
          if (!menu) {
            out.fail(t.menu.needInstall);
            return;
          }
          zoomChecked = !zoomChecked;
          await menu.setItemChecked("zoom", zoomChecked);
          out.ok(t.menu.zoomToggled(zoomChecked));
        }),
      );
    },
  };

  const trayDemo: Demo = {
    id: "menu.tray",
    title: t.tray.title,
    description: t.tray.description,
    code: t.tray.code,
    docPath: "/plugins/tray.html",
    mount(area, out) {
      area.append(
        act(out, t.tray.create, async () => {
          const tray = await TrayIcon.create({ title: "Z", tooltip: t.tray.tooltip });
          out.info(t.tray.shown);
          await tray.setIconAsTemplate(true);
          await new Promise((r) => setTimeout(r, 5000));
          await tray.destroy();
          out.ok(t.tray.destroyed);
        }),
      );
    },
  };

  const shortcut: Demo = {
    id: "menu.shortcut",
    title: t.shortcut.title,
    description: t.shortcut.description,
    code: t.shortcut.code,
    docPath: "/plugins/global-shortcut.html",
    mount(area, out) {
      area.append(
        act(out, t.shortcut.register, async () => {
          await registerShortcut("showcase-demo", "Cmd+Shift+J");
          const reg = await isRegistered("showcase-demo");
          out.info(t.shortcut.registered(reg));
          let firedSeen = false;
          const fired = await onShortcut((e) => {
            firedSeen = true;
            out.info(t.shortcut.fired(e.shortcutId));
          });
          await new Promise((r) => setTimeout(r, 10000));
          await unregisterShortcut("showcase-demo");
          await fired();
          out.ok(firedSeen ? t.shortcut.captured : t.shortcut.notCaptured);
        }),
      );
    },
  };

  return { category: t.category, demos: [menuDemo, trayDemo, shortcut] };
}
