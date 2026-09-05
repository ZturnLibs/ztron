import {
  Window,
  WebviewWindow,
  getAllWindows,
  availableMonitors,
  currentMonitor,
} from "@zturnlibs/ztron-api";
import { act, type Demo } from "../demo-ui";
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
      description: "setTheme 切换原生窗口外观，整个界面即时变色；传 null 恢复跟随系统，随 macOS 外观设置同步。",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setTheme("dark");     // 深色
await win.setTheme("light");    // 浅色
await win.setTheme(null);       // 跟随系统
const theme = await win.getTheme();   // "light" | "dark"

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
        "setTheme switches the native window appearance and the entire UI recolors instantly; pass null to follow the system again, syncing with the macOS appearance setting.",
      code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setTheme("dark");     // dark
await win.setTheme("light");    // light
await win.setTheme(null);       // follow system
const theme = await win.getTheme();   // "light" | "dark"

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
        act(out, t.frameless.overlayBtn, async () => {
          await win.setTrafficLightPosition(24, 40);
          await win.setTitleBarStyle("overlay");
          out.info(t.frameless.overlayInfo);
          await new Promise((r) => setTimeout(r, 3000));
          await win.setTitleBarStyle("visible");
          await win.setTrafficLightPosition(16, 16);
          out.ok(t.frameless.overlayDone);
        }),
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

  return { category: t.category, demos: [winControl, multiwin, monitors, theme, frameless] };
}
