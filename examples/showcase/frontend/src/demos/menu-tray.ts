import {
  setAppMenu,
  TrayIcon,
  registerShortcut,
  unregisterShortcut,
  isRegistered,
  onShortcut,
} from "@zturnlibs/ztron-api";
import { act, type Demo } from "../demo-ui";
import { getPlatform, isMac } from "../platform";
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
      installedMac: "已安装（看屏幕顶部菜单栏），quit 已绑定 CmdOrCtrl+Q",
      installedWin: "已安装（看窗口标题栏下方的菜单栏）。加速键在 Windows 菜单上不渲染（host 能力差异），点击菜单项照常触发",
      toggleZoom: "切换 Zoom 勾选",
      needInstall: "请先安装示例菜单",
      zoomToggled: (checked: boolean) =>
        `Zoom 已切换为${checked ? "勾选" : "不勾选"}（打开 View 菜单核对）`,
    },
    tray: {
      title: "系统托盘 TrayIcon",
      description: "创建系统托盘图标（Windows 任务栏时钟附近 / macOS 菜单栏）：悬停提示、显隐控制；模板图标是 macOS 专属的自适应深浅色机制。",
      code: `import { TrayIcon } from "@zturnlibs/ztron-api";

const tray = await TrayIcon.create({
  title: "Z",
  tooltip: "Ztron Showcase 托盘",
});
await tray.setIconAsTemplate(true);   // macOS 模板图标（其他平台 no-op）
await tray.setVisible(false);
await tray.destroy();`,
      tooltip: "Ztron Showcase 托盘",
      create: "创建托盘（5 秒后销毁）",
      shownMac: "托盘已出现在菜单栏右上角（标题 Z）",
      shownWin: "托盘已出现在任务栏时钟附近（可能收进 ^ 折叠区）（标题 Z）",
      destroyed: "托盘已销毁",
    },
    shortcut: {
      title: "全局快捷键",
      description: "注册系统级快捷键，应用在后台也能收到触发事件；注册后切到别的应用按组合键试试（Windows Ctrl+Shift+J / macOS Cmd+Shift+J）。",
      code: `import { registerShortcut, isRegistered, onShortcut } from "@zturnlibs/ztron-api";

// 修饰键按平台：Windows 用 Ctrl，macOS 用 Cmd（"Cmd" 在 Windows 解析为 Win 键）
const combo = isWindows ? "Ctrl+Shift+J" : "Cmd+Shift+J";
await registerShortcut("showcase", combo);
console.log("已注册：", await isRegistered("showcase"));

const un = await onShortcut((e) => {
  console.log("触发：", e.shortcutId);   // "showcase"
});
// await unregisterShortcut("showcase"); un();`,
      register: (combo: string) => `注册 ${combo}（10 秒窗口）`,
      registered: (reg: boolean, combo: string) => `注册${reg ? "成功" : "失败"}，切到其他应用按 ${combo}`,
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
      installedMac: "Installed (see the menu bar at the top of the screen); quit is bound to CmdOrCtrl+Q",
      installedWin:
        "Installed (see the menu bar under the window title bar). Accelerators are not rendered on Windows menus (host capability difference); clicking items still fires",
      toggleZoom: "Toggle the Zoom checkbox",
      needInstall: "Install the sample menu first",
      zoomToggled: (checked: boolean) =>
        `Zoom is now ${checked ? "checked" : "unchecked"} (open the View menu to verify)`,
    },
    tray: {
      title: "System tray with TrayIcon",
      description:
        "Create a system tray icon (Windows: near the clock / macOS: the menu bar): hover tooltip, visibility control; the template icon is a macOS-only adaptive light/dark mechanism.",
      code: `import { TrayIcon } from "@zturnlibs/ztron-api";

const tray = await TrayIcon.create({
  title: "Z",
  tooltip: "Ztron Showcase tray",
});
await tray.setIconAsTemplate(true);   // macOS template icon (no-op elsewhere)
await tray.setVisible(false);
await tray.destroy();`,
      tooltip: "Ztron Showcase tray",
      create: "Create the tray (destroyed after 5 seconds)",
      shownMac: "The tray icon appeared at the right end of the menu bar (title Z)",
      shownWin: "The tray icon appeared near the clock on the taskbar (possibly inside the ^ overflow area) (title Z)",
      destroyed: "Tray icon destroyed",
    },
    shortcut: {
      title: "Global shortcuts",
      description:
        "Register a system-level shortcut that fires even when the app is in the background; after registering, switch to another app and press the combo (Windows Ctrl+Shift+J / macOS Cmd+Shift+J).",
      code: `import { registerShortcut, isRegistered, onShortcut } from "@zturnlibs/ztron-api";

// Per-platform modifiers: Ctrl on Windows, Cmd on macOS ("Cmd" parses as the
// Windows key on Windows)
const combo = isWindows ? "Ctrl+Shift+J" : "Cmd+Shift+J";
await registerShortcut("showcase", combo);
console.log("registered:", await isRegistered("showcase"));

const un = await onShortcut((e) => {
  console.log("fired:", e.shortcutId);   // "showcase"
});
// await unregisterShortcut("showcase"); un();`,
      register: (combo: string) => `Register ${combo} (10 second window)`,
      registered: (reg: boolean, combo: string) =>
        `Registration ${reg ? "succeeded" : "failed"}; switch to another app and press ${combo}`,
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
          out.ok(isMac() ? t.menu.installedMac : t.menu.installedWin);
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
          out.info(isMac() ? t.tray.shownMac : t.tray.shownWin);
          // 模板图标是 macOS 专属概念，其他平台跳过
          if (isMac()) await tray.setIconAsTemplate(true);
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
      // "Cmd" 在 Windows 上解析为 Win 键，组合键按平台选
      const combo = getPlatform() === "windows" ? "Ctrl+Shift+J" : "Cmd+Shift+J";
      area.append(
        act(out, t.shortcut.register(combo), async () => {
          await registerShortcut("showcase-demo", combo);
          const reg = await isRegistered("showcase-demo");
          out.info(t.shortcut.registered(reg, combo));
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
