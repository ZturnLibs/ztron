import {
  Window,
  WebviewWindow,
  Effect,
  getAllWindows,
  availableMonitors,
  currentMonitor,
} from "@zturnlibs/ztron-api";
import { act, extractError, type Demo } from "../demo-ui";
import { getPlatform, isMac } from "../platform";
import type { Lang } from "../i18n";

/** 每个模块一个双语字典：可见文案（标题/描述/按钮/输出/代码注释）全覆盖 */
const STR = {
  zh: {
    category: "窗口",
    winControl: {
      title: "窗口控制",
      description: "Window 是操控当前窗口的句柄：标题、位置、置顶、全屏等。",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setTitle("新标题");
await win.center();
await win.setAlwaysOnTop(true);   // 置顶
await win.setAlwaysOnTop(false);
await win.setFullscreen(true);    // 全屏（Esc 退出）
const title = await win.getTitle();`,
      changeTitle: "改标题",
      titleUpdated: "标题已更新（看窗口标题栏）",
      center: "居中",
      centered: "窗口已居中",
      pin: "置顶 1.2 秒",
      pinned: "已置顶并取消",
      toggleFullscreen: "全屏切换",
      fullscreenExited: "已退出全屏",
      fullscreenEntered: "已进入全屏",
    },
    multi: {
      title: "多窗口 WebviewWindow",
      description: "运行时创建第二个原生窗口，操控它，然后销毁。label 是窗口路由主键。",
      code: `import { WebviewWindow, getAllWindows } from "@zturnlibs/ztron-api";

const second = new WebviewWindow("tools", {
  title: "第二个窗口",
  width: 360,
  height: 240,
  html: "<p>我是运行时创建的窗口</p>",
});
await second.create();
await second.setTitle("改过的标题");
const all = await getAllWindows();   // label 列表
await second.destroy();`,
      create: "创建第二个窗口（2.5 秒后销毁）",
      secondTitle: "第二个窗口",
      secondHtml: '<p style="font-family:system-ui;padding:16px">我是运行时创建的窗口</p>',
      secondRetitled: "第二个窗口（已改题）",
      windows: (labels: string[]) => `当前窗口：${labels.join("、")}`,
      destroyed: "第二个窗口已销毁",
    },
    monitors: {
      title: "窗口事件与显示器",
      description: "监听窗口移动事件；枚举显示器（名称/缩放/工作区）。",
      code: `import { Window, availableMonitors, currentMonitor } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
const un = await win.onMoved(() => console.log("窗口移动了"));

const monitors = await availableMonitors();
const cur = await currentMonitor();
console.log(monitors.map((m) => \`\${m.name} @\${m.scaleFactor}x\`));
un();`,
      listen: "监听移动（8 秒，拖动窗口试试）",
      moved: (n: number) => `移动事件 x${n}`,
      attached: "监听已挂上，拖动窗口标题栏",
      captured: (n: number) => `共捕获 ${n} 次移动`,
      none: "没等到移动事件（可再试一次）",
      listMonitors: "枚举显示器",
    },
    theme: {
      title: "主题切换与跟随系统",
      description: "setTheme 切换原生窗口外观，整个界面即时变色；传 null 恢复跟随系统（Windows：个性化→颜色；macOS：系统设置→外观）。",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setTheme("dark");     // 深色
await win.setTheme("light");    // 浅色
await win.setTheme(null);       // 跟随系统
const theme = await win.getTheme();   // "light" | "dark"

// 系统主题切换时还会推送事件（Windows WM_SETTINGCHANGE / macOS 分布式通知）：
const un = win.onThemeChanged((theme) => console.log("系统主题：", theme));

// 页面配色由 CSS 媒体查询自动跟随，无需 JS：
// @media (prefers-color-scheme: light) { :root { ...浅色令牌... } }`,
      dark: "深色",
      light: "浅色",
      followSystem: "跟随系统",
      readState: "读当前状态",
      darkLabel: "深色主题",
      lightLabel: "浅色主题",
      systemLabel: "跟随系统",
      stateLabel: "当前状态",
      darkCss: "深色",
      lightCss: "浅色",
      report: (label: string, native: string | null, css: string) =>
        `${label}：窗口主题 ${native}，页面媒体查询判定${css}`,
      listenPush: "监听系统主题推送（8 秒）",
      pushInfo: (where: string) => `监听已挂上：去 ${where} 切换深浅色，窗口会实时收到推送`,
      pushWhere: "系统设置 → 个性化 → 颜色",
      pushSeen: (theme: string) => `收到系统主题推送：${theme}`,
      pushNone: "8 秒内未收到推送（期间没切换系统主题？）",
    },
    frameless: {
      title: "无边框窗口",
      description:
        "关掉系统标题栏后如何自己掌控窗口：透明、背景色、阴影、红绿灯位置、悬浮标题栏、点击穿透与拖动区。每个效果几秒后自动恢复。",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setDecorations(false);   // 无边框（无标题栏）
await win.setTransparent(true);    // 透明
await win.setBackgroundColor("#101418"); // 自定义底色
await win.setShadow(false);        // 阴影
await win.setTrafficLightPosition(24, 40); // macOS 红绿灯位置
await win.setTitleBarStyle("overlay");     // 标题栏悬浮
await win.setIgnoreCursorEvents(true);     // 点击穿透
await win.startDragging();         // 无边框时靠拖动区移动窗口
await win.setDecorations(true);    // 恢复

// 也可以在 ztron.conf.json 的窗口声明里写 "decorations": false`,
      framelessBtn: "无边框 4 秒",
      framelessInfo: "标题栏已隐藏（红绿灯消失），4 秒后自动恢复",
      framelessDone: '已恢复系统标题栏。声明式写法：conf 里 "decorations": false',
      transparentBtn: "全透明 3 秒",
      transparentDone: "透明开关往返完成",
      backgroundBtn: "背景变色 3 秒",
      backgroundDone: "底色已还原",
      shadowBtn: "关阴影 2 秒",
      shadowDone: "阴影已恢复（注意看窗口边缘）",
      overlayBtn: "红绿灯移位 + 悬浮标题栏 3 秒",
      overlayInfo: "红绿灯下移、标题栏悬浮在内容上，3 秒后恢复",
      overlayDone: "标题栏样式与红绿灯位置已还原",
      clickThroughBtn: "点击穿透 2 秒",
      clickThroughInfo: "窗口正忽略所有鼠标事件（点它试试，会穿透到后面的窗口），2 秒后自动恢复",
      clickThroughDone: "鼠标事件已恢复",
      dragBtn: "触发拖动",
      dragDone: "拖动命令已下发。说明：无边框窗口靠拖动区移动，macOS 依赖当前鼠标按下事件，从按钮触发通常原地不动，真实拖动请配合无边框 + 声明拖动区使用",
    },
    effects: {
      title: "窗口材质 effects",
      description: "setEffects 给窗口加系统级背景材质：Windows 11 是 Mica/亚克力/选项卡（DWM SystemBackdrop），macOS 是毛玻璃 vibrancy。每个效果几秒后自动清除。",
      code: `import { Window, Effect } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
// Windows 11：Mica / Acrylic / Tabbed
await win.setEffects({ effects: [Effect.Mica] });
// macOS：vibrancy 材质（Sidebar/HudWindow/Popover…）
await win.setEffects({ effects: [Effect.Sidebar] });
await win.clearEffects();   // 去除材质`,
      mica: "Mica 3.5 秒",
      acrylic: "亚克力 Acrylic 3.5 秒",
      tabbed: "选项卡 Tabbed 3.5 秒",
      vibrancySidebar: "毛玻璃 Sidebar 3.5 秒",
      vibrancyHud: "毛玻璃 HudWindow 3.5 秒",
      applied: (names: string) => `已应用材质：${names}，3.5 秒后自动清除`,
      cleared: "材质已清除",
      unsupported: (detail: string) => `当前系统不支持该材质（诚实报错）：${detail}`,
    },
    dragdrop: {
      title: "文件拖放 drag-drop",
      description: "把文件从资源管理器/Finder 拖进窗口，收到 enter/over/drop/leave 事件族（路径 + 窗口内物理坐标）；也可整体开关拖放。",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
const un = win.onDragDropEvent((e) => {
  if (e.type === "enter") console.log("拖入：", e.paths, e.position);
  else if (e.type === "over") console.log("悬停：", e.position);
  else if (e.type === "drop") console.log("放下：", e.paths);
  else console.log("拖离窗口");
});
await win.setFileDropEnabled(true);   // 默认开启；false 关闭整族事件
un();`,
      listen: "开始监听（10 秒，拖文件进来试试）",
      listening: "监听已挂上：从文件管理器拖一两个文件到窗口上",
      ev: (desc: string) => `事件：${desc}`,
      enter: (paths: string, x: number, y: number) => `enter 拖入 [${paths}] @(${x},${y})`,
      over: (x: number, y: number) => `over 悬停 @(${x},${y})`,
      drop: (paths: string, x: number, y: number) => `drop 放下 [${paths}] @(${x},${y})`,
      leave: "leave 拖离窗口",
      summary: (n: number) => `共捕获 ${n} 个拖放事件，已取消监听`,
      none: "10 秒内没有拖放事件（把文件拖进窗口再试一次）",
      toggle: "关闭拖放 2 秒",
      toggleOff: "拖放已整体关闭（现在拖文件无事件），2 秒后恢复",
      toggleOn: "拖放已恢复",
    },
    badge: {
      title: "应用徽标 badge",
      description: "setBadgeCount/setBadgeLabel 在应用身份锚点上挂徽标：Windows 是任务栏按钮的 overlay 角标，macOS 是 Dock 图标红点数字。数字或文字二选一，清 null 复原。",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setBadgeCount(3);        // 数字徽标
await win.setBadgeLabel("NEW");    // 文字徽标（覆盖数字）
await win.setBadgeCount(null);     // 清除
await win.setBadgeLabel(null);`,
      countBtn: "数字徽标 3（3 秒）",
      countInfo: "已挂数字徽标：看任务栏图标右下角角标（macOS 看 Dock），3 秒后清除",
      labelBtn: "文字徽标 NEW（3 秒）",
      labelInfo: "已挂文字徽标：任务栏图标上应显示 NEW，3 秒后清除",
      cleared: "徽标已清除复原",
    },
    pointer: {
      title: "指针捕获与多工作区",
      description: "setCursorGrab 把光标锁定在窗口矩形内（Windows ClipCursor / macOS CGAssociateMouseAndMouseCursorPosition）；setVisibleOnAllWorkspaces 让窗口浮到所有虚拟桌面/工作区之上。",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setCursorGrab(true);     // 光标锁进窗口（自动 clipping）
await win.setCursorGrab(false);    // 释放
await win.setVisibleOnAllWorkspaces(true);   // 所有工作区可见
await win.setVisibleOnAllWorkspaces(false);`,
      grabBtn: "捕获光标 1.2 秒",
      grabInfo: "光标已被锁进窗口（试着移出边界），1.2 秒后自动释放",
      grabDone: "光标已释放",
      wsBtn: "置顶所有工作区 2 秒",
      wsInfo: "窗口已置顶到所有虚拟桌面（Windows 走 TOPMOST；切到别的虚拟桌面也能看到它），2 秒后恢复",
      wsDone: "已恢复常规层级",
    },
    closeguard: {
      title: "关闭拦截 preventClose",
      description: "preventClose(true) 拦下关闭请求，改发 close-requested 事件；onCloseRequested 的 handler 决定去留——preventDefault 留下，否则窗口销毁（Tauri v2 语义）。适合「未保存确认」场景。",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
const un = await win.onCloseRequested((e) => {
  console.log("有人想关窗口");
  e.preventDefault();   // 留下窗口（不调用则 handler 结束后销毁）
});
await win.close();     // 触发的是 close-requested，而不是真关闭
// …确认可以关后：
await win.preventClose(false);
await win.destroy();   // 或不加 prevent 直接 destroy()`,
      demoBtn: "演示：拦截一次关闭",
      intercepting: "已开启拦截并调用 close()——若窗口还在且下方显示收到事件，即拦截生效",
      got: "✓ 收到 close-requested，窗口被拦下没关",
      notGot: "✗ 没等到 close-requested 事件",
      restored: "已恢复常规关闭行为（本窗口保持打开）",
    },
  },
  en: {
    category: "Window",
    winControl: {
      title: "Window control",
      description:
        "Window is the handle for controlling the current window: title, position, always-on-top, fullscreen, and more.",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setTitle("New title");
await win.center();
await win.setAlwaysOnTop(true);   // always-on-top
await win.setAlwaysOnTop(false);
await win.setFullscreen(true);    // fullscreen (Esc to exit)
const title = await win.getTitle();`,
      changeTitle: "Change title",
      titleUpdated: "Title updated (check the window title bar)",
      center: "Center",
      centered: "Window centered",
      pin: "Always-on-top for 1.2s",
      pinned: "Always-on-top toggled on and off",
      toggleFullscreen: "Toggle fullscreen",
      fullscreenExited: "Exited fullscreen",
      fullscreenEntered: "Entered fullscreen",
    },
    multi: {
      title: "Multi-window WebviewWindow",
      description:
        "Create a second native window at runtime, control it, then destroy it. The label is the primary key for window routing.",
      code: `import { WebviewWindow, getAllWindows } from "@zturnlibs/ztron-api";

const second = new WebviewWindow("tools", {
  title: "Second window",
  width: 360,
  height: 240,
  html: "<p>I was created at runtime</p>",
});
await second.create();
await second.setTitle("Retitled");
const all = await getAllWindows();   // list of labels
await second.destroy();`,
      create: "Create the second window (destroyed after 2.5s)",
      secondTitle: "Second window",
      secondHtml: '<p style="font-family:system-ui;padding:16px">I was created at runtime</p>',
      secondRetitled: "Second window (retitled)",
      windows: (labels: string[]) => `Windows: ${labels.join(", ")}`,
      destroyed: "Second window destroyed",
    },
    monitors: {
      title: "Window events and monitors",
      description: "Listen for window move events; enumerate monitors (name / scale / work area).",
      code: `import { Window, availableMonitors, currentMonitor } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
const un = await win.onMoved(() => console.log("window moved"));

const monitors = await availableMonitors();
const cur = await currentMonitor();
console.log(monitors.map((m) => \`\${m.name} @\${m.scaleFactor}x\`));
un();`,
      listen: "Listen for moves (8s, try dragging the window)",
      moved: (n: number) => `Move event x${n}`,
      attached: "Listener attached; drag the window title bar",
      captured: (n: number) => `Captured ${n} moves in total`,
      none: "No move events arrived (try again)",
      listMonitors: "List monitors",
    },
    theme: {
      title: "Theme switching & follow system",
      description:
        "setTheme switches the native window appearance and the entire UI recolors instantly; pass null to follow the system again (Windows: Personalization > Colors; macOS: System Settings > Appearance).",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setTheme("dark");     // dark
await win.setTheme("light");    // light
await win.setTheme(null);       // follow system
const theme = await win.getTheme();   // "light" | "dark"

// A push event also arrives when the system theme changes
// (Windows WM_SETTINGCHANGE / macOS distributed notification):
const un = win.onThemeChanged((theme) => console.log("system theme:", theme));

// The page palette follows automatically via the CSS media query, no JS needed:
// @media (prefers-color-scheme: light) { :root { ...light tokens... } }`,
      dark: "Dark",
      light: "Light",
      followSystem: "Follow system",
      readState: "Read current state",
      darkLabel: "Dark theme",
      lightLabel: "Light theme",
      systemLabel: "Follow system",
      stateLabel: "Current state",
      darkCss: "dark",
      lightCss: "light",
      report: (label: string, native: string | null, css: string) =>
        `${label}: window theme ${native}, page media query says ${css}`,
      listenPush: "Listen for system theme pushes (8s)",
      pushInfo: (where: string) =>
        `Listener attached: switch the system light/dark mode in ${where} and the window receives the push live`,
      pushWhere: "Settings > Personalization > Colors",
      pushSeen: (theme: string) => `System theme push received: ${theme}`,
      pushNone: "No push within 8 seconds (did you switch the system theme?)",
    },
    frameless: {
      title: "Frameless window",
      description:
        "How to take control of the window yourself once the system title bar is gone: transparency, background color, shadow, traffic light position, floating title bar, click-through, and drag regions. Each effect restores itself after a few seconds.",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setDecorations(false);   // frameless (no title bar)
await win.setTransparent(true);    // transparent
await win.setBackgroundColor("#101418"); // custom background color
await win.setShadow(false);        // shadow
await win.setTrafficLightPosition(24, 40); // macOS traffic light position
await win.setTitleBarStyle("overlay");     // floating title bar
await win.setIgnoreCursorEvents(true);     // click-through
await win.startDragging();         // frameless windows move via drag regions
await win.setDecorations(true);    // restore

// You can also declare "decorations": false in the window config in ztron.conf.json`,
      framelessBtn: "Frameless for 4s",
      framelessInfo: "Title bar hidden (traffic lights gone); restoring automatically in 4s",
      framelessDone: 'System title bar restored. Declarative alternative: "decorations": false in the conf',
      transparentBtn: "Fully transparent for 3s",
      transparentDone: "Transparency toggled on and off",
      backgroundBtn: "Background color for 3s",
      backgroundDone: "Background color restored",
      shadowBtn: "Shadow off for 2s",
      shadowDone: "Shadow restored (watch the window edges)",
      overlayBtn: "Traffic lights moved + overlay title bar for 3s",
      overlayInfo: "Traffic lights moved down and the title bar floats over the content; restoring in 3s",
      overlayDone: "Title bar style and traffic light position restored",
      clickThroughBtn: "Click-through for 2s",
      clickThroughInfo:
        "The window is ignoring all mouse events (try clicking it; clicks pass through to the windows behind); restoring in 2s",
      clickThroughDone: "Mouse events restored",
      dragBtn: "Trigger drag",
      dragDone:
        "Drag command sent. Note: frameless windows move via drag regions; on macOS this relies on the current mouse-down event, so triggering from a button usually leaves the window in place. For a real drag, combine frameless with a declared drag region.",
    },
    effects: {
      title: "Window material effects",
      description:
        "setEffects applies a system-level backdrop to the window: on Windows 11 that's Mica / Acrylic / Tabbed (DWM SystemBackdrop), on macOS the vibrancy blur materials. Each effect clears itself after a few seconds.",
      code: `import { Window, Effect } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
// Windows 11: Mica / Acrylic / Tabbed
await win.setEffects({ effects: [Effect.Mica] });
// macOS: vibrancy materials (Sidebar/HudWindow/Popover...)
await win.setEffects({ effects: [Effect.Sidebar] });
await win.clearEffects();   // remove the material`,
      mica: "Mica for 3.5s",
      acrylic: "Acrylic for 3.5s",
      tabbed: "Tabbed for 3.5s",
      vibrancySidebar: "Vibrancy Sidebar for 3.5s",
      vibrancyHud: "Vibrancy HudWindow for 3.5s",
      applied: (names: string) => `Material applied: ${names}; clearing automatically in 3.5s`,
      cleared: "Material cleared",
      unsupported: (detail: string) => `This material is not supported on this system (honest error): ${detail}`,
    },
    dragdrop: {
      title: "File drag & drop",
      description:
        "Drag files from Explorer/Finder onto the window and receive the enter/over/drop/leave event family (paths + physical position inside the window); drag and drop can also be switched off entirely.",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
const un = win.onDragDropEvent((e) => {
  if (e.type === "enter") console.log("entered:", e.paths, e.position);
  else if (e.type === "over") console.log("over:", e.position);
  else if (e.type === "drop") console.log("dropped:", e.paths);
  else console.log("left the window");
});
await win.setFileDropEnabled(true);   // on by default; false mutes the whole family
un();`,
      listen: "Start listening (10s, drag files in)",
      listening: "Listener attached: drag one or two files from the file manager onto the window",
      ev: (desc: string) => `Event: ${desc}`,
      enter: (paths: string, x: number, y: number) => `enter paths [${paths}] @(${x},${y})`,
      over: (x: number, y: number) => `over position (${x},${y})`,
      drop: (paths: string, x: number, y: number) => `drop paths [${paths}] @(${x},${y})`,
      leave: "leave drag left the window",
      summary: (n: number) => `Captured ${n} drag-drop events in total, listener removed`,
      none: "No drag-drop events within 10 seconds (drag a file onto the window and try again)",
      toggle: "Disable drag-drop for 2s",
      toggleOff: "Drag-drop disabled entirely (dragging now produces no events); restoring in 2s",
      toggleOn: "Drag-drop restored",
    },
    badge: {
      title: "App badge",
      description:
        "setBadgeCount/setBadgeLabel put a badge on the app's identity anchor: on Windows an overlay on the taskbar button, on macOS the Dock icon badge. Number or text, either/or; pass null to clear.",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setBadgeCount(3);        // numeric badge
await win.setBadgeLabel("NEW");    // text badge (overrides the number)
await win.setBadgeCount(null);     // clear
await win.setBadgeLabel(null);`,
      countBtn: "Numeric badge 3 (3s)",
      countInfo: "Numeric badge attached: check the taskbar icon corner overlay (Dock on macOS); clearing in 3s",
      labelBtn: "Text badge NEW (3s)",
      labelInfo: "Text badge attached: the taskbar icon should now show NEW; clearing in 3s",
      cleared: "Badge cleared and restored",
    },
    pointer: {
      title: "Cursor grab & all workspaces",
      description:
        "setCursorGrab locks the cursor inside the window rectangle (Windows ClipCursor / macOS CGAssociateMouseAndMouseCursorPosition); setVisibleOnAllWorkspaces floats the window above every virtual desktop/workspace.",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setCursorGrab(true);     // cursor confined to the window
await win.setCursorGrab(false);    // release
await win.setVisibleOnAllWorkspaces(true);   // visible on every workspace
await win.setVisibleOnAllWorkspaces(false);`,
      grabBtn: "Grab cursor for 1.2s",
      grabInfo: "The cursor is now confined to the window (try moving it past the edge); releasing automatically in 1.2s",
      grabDone: "Cursor released",
      wsBtn: "Float over all workspaces for 2s",
      wsInfo: "The window is now visible on every virtual desktop (Windows via TOPMOST; switch desktops and it is still there), restoring in 2s",
      wsDone: "Back to the regular z-order",
    },
    closeguard: {
      title: "Close interception: preventClose",
      description:
        "preventClose(true) intercepts the close request and emits close-requested instead; the onCloseRequested handler decides — preventDefault keeps the window, otherwise it is destroyed when the handler completes (Tauri v2 semantics). Ideal for unsaved-changes confirmation.",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
const un = await win.onCloseRequested((e) => {
  console.log("someone wants to close the window");
  e.preventDefault();   // keep the window (without this it is destroyed after the handler)
});
await win.close();     // fires close-requested instead of really closing
// ...once closing is confirmed:
await win.preventClose(false);
await win.destroy();   // or skip prevent and destroy() directly`,
      demoBtn: "Demo: intercept one close",
      intercepting:
        "Interception armed and close() invoked — if the window is still open and the event shows below, interception works",
      got: "✓ close-requested received; the window was intercepted and stayed open",
      notGot: "✗ no close-requested event arrived",
      restored: "Regular closing behavior restored (this window stays open)",
    },
  },
};

/** 按语言构建本分类目录；语言切换时 main.ts 会重建 */
export function windowCatalog(lang: Lang): { category: string; demos: Demo[] } {
  const t = STR[lang];

  const winControl: Demo = {
    id: "window.control",
    title: t.winControl.title,
    description: t.winControl.description,
    code: t.winControl.code,
    docPath: "/plugins/window.html",
    mount(area, out) {
      const win = Window.getCurrent();
      area.append(
        act(out, t.winControl.changeTitle, async () => {
          await win.setTitle(`Ztron @ ${new Date().toLocaleTimeString()}`);
          out.ok(t.winControl.titleUpdated);
        }),
        act(out, t.winControl.center, async () => {
          await win.center();
          out.ok(t.winControl.centered);
        }),
        act(out, t.winControl.pin, async () => {
          await win.setAlwaysOnTop(true);
          await new Promise((r) => setTimeout(r, 1200));
          await win.setAlwaysOnTop(false);
          out.ok(t.winControl.pinned);
        }),
        act(out, t.winControl.toggleFullscreen, async () => {
          const fs = await win.isFullscreen();
          await win.setFullscreen(!fs);
          out.ok(fs ? t.winControl.fullscreenExited : t.winControl.fullscreenEntered);
        }),
      );
    },
  };

  const multiwin: Demo = {
    id: "window.multi",
    title: t.multi.title,
    description: t.multi.description,
    code: t.multi.code,
    docPath: "/plugins/webview-window.html",
    mount(area, out) {
      area.append(
        act(out, t.multi.create, async () => {
          const second = new WebviewWindow("showcase-second", {
            title: t.multi.secondTitle,
            width: 360,
            height: 240,
            html: t.multi.secondHtml,
          });
          await second.create();
          await second.setTitle(t.multi.secondRetitled);
          const all = await getAllWindows();
          out.info(t.multi.windows(all.map((w) => w.label)));
          await new Promise((r) => setTimeout(r, 2500));
          await second.destroy();
          out.ok(t.multi.destroyed);
        }),
      );
    },
  };

  const monitors: Demo = {
    id: "window.monitors",
    title: t.monitors.title,
    description: t.monitors.description,
    code: t.monitors.code,
    docPath: "/plugins/dpi.html",
    mount(area, out) {
      const win = Window.getCurrent();
      area.append(
        act(out, t.monitors.listen, async () => {
          let times = 0;
          const un = await win.onMoved(() => {
            times++;
            out.info(t.monitors.moved(times));
          });
          out.info(t.monitors.attached);
          await new Promise((r) => setTimeout(r, 8000));
          un();
          out.ok(times > 0 ? t.monitors.captured(times) : t.monitors.none);
        }),
        act(out, t.monitors.listMonitors, async () => {
          const list = await availableMonitors();
          const cur = await currentMonitor();
          const lines = list.map(
            (m) =>
              `${cur && m.name === cur.name ? ">" : " "} ${m.name} @${m.scaleFactor}x work=${m.workArea.width}x${m.workArea.height}`,
          );
          out.ok(lines.join("\n"));
        }),
      );
    },
  };

  const theme: Demo = {
    id: "window.theme",
    title: t.theme.title,
    description: t.theme.description,
    code: t.theme.code,
    docPath: "/plugins/window.html",
    mount(area, out) {
      const win = Window.getCurrent();
      const report = async (label: string) => {
        const native = await win.getTheme();
        const css = matchMedia("(prefers-color-scheme: dark)").matches ? t.theme.darkCss : t.theme.lightCss;
        out.ok(t.theme.report(label, native, css));
      };
      area.append(
        act(out, t.theme.dark, async () => {
          await win.setTheme("dark");
          await report(t.theme.darkLabel);
        }),
        act(out, t.theme.light, async () => {
          await win.setTheme("light");
          await report(t.theme.lightLabel);
        }),
        act(out, t.theme.followSystem, async () => {
          await win.setTheme(null);
          await report(t.theme.systemLabel);
        }),
        act(out, t.theme.readState, async () => {
          await report(t.theme.stateLabel);
        }),
        act(out, t.theme.listenPush, async () => {
          out.info(t.theme.pushInfo(t.theme.pushWhere));
          let seen: string | null = null;
          const un = await win.onThemeChanged((theme) => {
            seen = theme;
            out.info(t.theme.pushSeen(theme));
          });
          await new Promise((r) => setTimeout(r, 8000));
          un();
          if (!seen) out.ok(t.theme.pushNone);
        }),
      );
    },
  };

  const frameless: Demo = {
    id: "window.frameless",
    title: t.frameless.title,
    description: t.frameless.description,
    code: t.frameless.code,
    docPath: "/plugins/window.html",
    mount(area, out) {
      const win = Window.getCurrent();
      area.append(
        act(out, t.frameless.framelessBtn, async () => {
          await win.setDecorations(false);
          out.info(t.frameless.framelessInfo);
          await new Promise((r) => setTimeout(r, 4000));
          await win.setDecorations(true);
          out.ok(t.frameless.framelessDone);
        }),
        act(out, t.frameless.transparentBtn, async () => {
          await win.setTransparent(true);
          await new Promise((r) => setTimeout(r, 3000));
          await win.setTransparent(false);
          out.ok(t.frameless.transparentDone);
        }),
        act(out, t.frameless.backgroundBtn, async () => {
          await win.setBackgroundColor("#4c3a63");
          await new Promise((r) => setTimeout(r, 3000));
          await win.setBackgroundColor("transparent");
          out.ok(t.frameless.backgroundDone);
        }),
        act(out, t.frameless.shadowBtn, async () => {
          await win.setShadow(false);
          await new Promise((r) => setTimeout(r, 2000));
          await win.setShadow(true);
          out.ok(t.frameless.shadowDone);
        }),
        // 红绿灯位置与悬浮标题栏是 macOS 专属概念（Windows 无边框由
        // setDecorations 完全接管），非 mac 不展示这个按钮
        ...(isMac()
          ? [
              act(out, t.frameless.overlayBtn, async () => {
                await win.setTrafficLightPosition(24, 40);
                await win.setTitleBarStyle("overlay");
                out.info(t.frameless.overlayInfo);
                await new Promise((r) => setTimeout(r, 3000));
                await win.setTitleBarStyle("visible");
                await win.setTrafficLightPosition(16, 16);
                out.ok(t.frameless.overlayDone);
              }),
            ]
          : []),
        act(out, t.frameless.clickThroughBtn, async () => {
          await win.setIgnoreCursorEvents(true);
          out.info(t.frameless.clickThroughInfo);
          await new Promise((r) => setTimeout(r, 2000));
          await win.setIgnoreCursorEvents(false);
          out.ok(t.frameless.clickThroughDone);
        }),
        act(out, t.frameless.dragBtn, async () => {
          await win.startDragging();
          out.ok(t.frameless.dragDone);
        }),
      );
    },
  };

  const effects: Demo = {
    id: "window.effects",
    title: t.effects.title,
    description: t.effects.description,
    code: t.effects.code,
    docPath: "/plugins/window.html",
    mount(area, out) {
      const win = Window.getCurrent();
      // 统一形状：应用材质 → 停 3.5s → 清除；错误如实上报（Win10 无
      // SystemBackdrop、部分材质组合会被 DWM 拒绝）
      const apply = (label: string, names: string, fx: Effect[]) =>
        act(out, label, async () => {
          try {
            await win.setEffects({ effects: fx });
          } catch (e) {
            out.fail(t.effects.unsupported(extractError(e).slice(0, 80)));
            return;
          }
          out.info(t.effects.applied(names));
          await new Promise((r) => setTimeout(r, 3500));
          await win.clearEffects();
          out.ok(t.effects.cleared);
        });
      const platform = getPlatform();
      if (platform === "windows") {
        area.append(
          apply(t.effects.mica, "Mica", [Effect.Mica]),
          apply(t.effects.acrylic, "Acrylic", [Effect.Acrylic]),
          apply(t.effects.tabbed, "Tabbed", [Effect.Tabbed]),
        );
      } else if (platform === "macos") {
        area.append(
          apply(t.effects.vibrancySidebar, "Sidebar", [Effect.Sidebar]),
          apply(t.effects.vibrancyHud, "HudWindow", [Effect.HudWindow]),
        );
      } else {
        out.info(t.effects.unsupported("Linux host does not implement window effects yet"));
      }
    },
  };

  const dragdrop: Demo = {
    id: "window.dragdrop",
    title: t.dragdrop.title,
    description: t.dragdrop.description,
    code: t.dragdrop.code,
    docPath: "/plugins/window.html",
    mount(area, out) {
      const win = Window.getCurrent();
      area.append(
        act(out, t.dragdrop.listen, async () => {
          let count = 0;
          const describe = (e: Parameters<Parameters<Window["onDragDropEvent"]>[0]>[0]) => {
            count++;
            switch (e.type) {
              case "enter":
                return t.dragdrop.enter(e.paths.join(", "), e.position.x, e.position.y);
              case "over":
                return t.dragdrop.over(e.position.x, e.position.y);
              case "drop":
                return t.dragdrop.drop(e.paths.join(", "), e.position.x, e.position.y);
              default:
                return t.dragdrop.leave;
            }
          };
          const un = win.onDragDropEvent((e) => out.info(t.dragdrop.ev(describe(e))));
          out.info(t.dragdrop.listening);
          await new Promise((r) => setTimeout(r, 10000));
          un();
          if (count > 0) out.ok(t.dragdrop.summary(count));
          else out.ok(t.dragdrop.none);
        }),
        act(out, t.dragdrop.toggle, async () => {
          await win.setFileDropEnabled(false);
          out.info(t.dragdrop.toggleOff);
          await new Promise((r) => setTimeout(r, 2000));
          await win.setFileDropEnabled(true);
          out.ok(t.dragdrop.toggleOn);
        }),
      );
    },
  };

  const badge: Demo = {
    id: "window.badge",
    title: t.badge.title,
    description: t.badge.description,
    code: t.badge.code,
    docPath: "/plugins/window.html",
    mount(area, out) {
      const win = Window.getCurrent();
      area.append(
        act(out, t.badge.countBtn, async () => {
          await win.setBadgeCount(3);
          out.info(t.badge.countInfo);
          await new Promise((r) => setTimeout(r, 3000));
          await win.setBadgeCount(null);
          out.ok(t.badge.cleared);
        }),
        act(out, t.badge.labelBtn, async () => {
          await win.setBadgeLabel("NEW");
          out.info(t.badge.labelInfo);
          await new Promise((r) => setTimeout(r, 3000));
          await win.setBadgeLabel(null);
          out.ok(t.badge.cleared);
        }),
      );
    },
  };

  const pointer: Demo = {
    id: "window.pointer",
    title: t.pointer.title,
    description: t.pointer.description,
    code: t.pointer.code,
    docPath: "/plugins/window.html",
    mount(area, out) {
      const win = Window.getCurrent();
      area.append(
        act(out, t.pointer.grabBtn, async () => {
          await win.setCursorGrab(true);
          out.info(t.pointer.grabInfo);
          await new Promise((r) => setTimeout(r, 1200));
          await win.setCursorGrab(false);
          out.ok(t.pointer.grabDone);
        }),
        act(out, t.pointer.wsBtn, async () => {
          await win.setVisibleOnAllWorkspaces(true);
          out.info(t.pointer.wsInfo);
          await new Promise((r) => setTimeout(r, 2000));
          await win.setVisibleOnAllWorkspaces(false);
          out.ok(t.pointer.wsDone);
        }),
      );
    },
  };

  const closeguard: Demo = {
    id: "window.closeguard",
    title: t.closeguard.title,
    description: t.closeguard.description,
    code: t.closeguard.code,
    docPath: "/plugins/window.html",
    mount(area, out) {
      const win = Window.getCurrent();
      area.append(
        act(out, t.closeguard.demoBtn, async () => {
          let intercepted = false;
          // onCloseRequested 会自己 arm preventClose；handler 里必须
          // preventDefault，否则 handler 结束后窗口被销毁
          const un = await win.onCloseRequested((e) => {
            intercepted = true;
            e.preventDefault();
          });
          out.info(t.closeguard.intercepting);
          await win.close();
          await new Promise((r) => setTimeout(r, 600));
          un();
          // 复位 host 层拦截——不复位的话点标题栏 X 也关不掉窗口
          await win.preventClose(false);
          out.ok(intercepted ? t.closeguard.got : t.closeguard.notGot);
          out.ok(t.closeguard.restored);
        }),
      );
    },
  };

  return {
    category: t.category,
    demos: [winControl, multiwin, monitors, theme, frameless, effects, dragdrop, badge, pointer, closeguard],
  };
}
