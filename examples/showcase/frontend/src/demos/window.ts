import {
  Window,
  WebviewWindow,
  getAllWindows,
  availableMonitors,
  currentMonitor,
} from "@zturnlibs/ztron-api";
import { act, type Demo } from "../demo-ui";

const winControl: Demo = {
  id: "window.control",
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
  docPath: "/plugins/window.html",
  mount(area, out) {
    const win = Window.getCurrent();
    area.append(
      act(out, "改标题", async () => {
        await win.setTitle(`Ztron @ ${new Date().toLocaleTimeString()}`);
        out.ok("标题已更新（看窗口标题栏）");
      }),
      act(out, "居中", async () => {
        await win.center();
        out.ok("窗口已居中");
      }),
      act(out, "置顶 1.2 秒", async () => {
        await win.setAlwaysOnTop(true);
        await new Promise((r) => setTimeout(r, 1200));
        await win.setAlwaysOnTop(false);
        out.ok("已置顶并取消");
      }),
      act(out, "全屏切换", async () => {
        const fs = await win.isFullscreen();
        await win.setFullscreen(!fs);
        out.ok(fs ? "已退出全屏" : "已进入全屏");
      }),
    );
  },
};

const multiwin: Demo = {
  id: "window.multi",
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
  docPath: "/plugins/webview-window.html",
  mount(area, out) {
    area.append(
      act(out, "创建第二个窗口（2.5 秒后销毁）", async () => {
        const second = new WebviewWindow("showcase-second", {
          title: "第二个窗口",
          width: 360,
          height: 240,
          html: '<p style="font-family:system-ui;padding:16px">我是运行时创建的窗口</p>',
        });
        await second.create();
        await second.setTitle("第二个窗口（已改题）");
        const all = await getAllWindows();
        out.info(`当前窗口：${all.map((w) => w.label).join("、")}`);
        await new Promise((r) => setTimeout(r, 2500));
        await second.destroy();
        out.ok("第二个窗口已销毁");
      }),
    );
  },
};

const monitors: Demo = {
  id: "window.monitors",
  title: "窗口事件与显示器",
  description: "监听窗口移动事件；枚举显示器（名称/缩放/工作区）。",
  code: `import { Window, availableMonitors, currentMonitor } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
const un = await win.onMoved(() => console.log("窗口移动了"));

const monitors = await availableMonitors();
const cur = await currentMonitor();
console.log(monitors.map((m) => \`\${m.name} @\${m.scaleFactor}x\`));
un();`,
  docPath: "/plugins/dpi.html",
  mount(area, out) {
    const win = Window.getCurrent();
    area.append(
      act(out, "监听移动（8 秒，拖动窗口试试）", async () => {
        let times = 0;
        const un = await win.onMoved(() => {
          times++;
          out.info(`移动事件 x${times}`);
        });
        out.info("监听已挂上，拖动窗口标题栏");
        await new Promise((r) => setTimeout(r, 8000));
        un();
        out.ok(times > 0 ? `共捕获 ${times} 次移动` : "没等到移动事件（可再试一次）");
      }),
      act(out, "枚举显示器", async () => {
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
  docPath: "/plugins/window.html",
  mount(area, out) {
    const win = Window.getCurrent();
    const report = async (label: string) => {
      const native = await win.getTheme();
      const css = matchMedia("(prefers-color-scheme: dark)").matches ? "深色" : "浅色";
      out.ok(`${label}：窗口主题 ${native}，页面媒体查询判定${css}`);
    };
    area.append(
      act(out, "深色", async () => {
        await win.setTheme("dark");
        await report("深色主题");
      }),
      act(out, "浅色", async () => {
        await win.setTheme("light");
        await report("浅色主题");
      }),
      act(out, "跟随系统", async () => {
        await win.setTheme(null);
        await report("跟随系统");
      }),
      act(out, "读当前状态", async () => {
        await report("当前状态");
      }),
    );
  },
};

const frameless: Demo = {
  id: "window.frameless",
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
  docPath: "/plugins/window.html",
  mount(area, out) {
    const win = Window.getCurrent();
    area.append(
      act(out, "无边框 4 秒", async () => {
        await win.setDecorations(false);
        out.info("标题栏已隐藏（红绿灯消失），4 秒后自动恢复");
        await new Promise((r) => setTimeout(r, 4000));
        await win.setDecorations(true);
        out.ok("已恢复系统标题栏。声明式写法：conf 里 \"decorations\": false");
      }),
      act(out, "全透明 3 秒", async () => {
        await win.setTransparent(true);
        await new Promise((r) => setTimeout(r, 3000));
        await win.setTransparent(false);
        out.ok("透明开关往返完成");
      }),
      act(out, "背景变色 3 秒", async () => {
        await win.setBackgroundColor("#4c3a63");
        await new Promise((r) => setTimeout(r, 3000));
        await win.setBackgroundColor("transparent");
        out.ok("底色已还原");
      }),
      act(out, "关阴影 2 秒", async () => {
        await win.setShadow(false);
        await new Promise((r) => setTimeout(r, 2000));
        await win.setShadow(true);
        out.ok("阴影已恢复（注意看窗口边缘）");
      }),
      act(out, "红绿灯移位 + 悬浮标题栏 3 秒", async () => {
        await win.setTrafficLightPosition(24, 40);
        await win.setTitleBarStyle("overlay");
        out.info("红绿灯下移、标题栏悬浮在内容上，3 秒后恢复");
        await new Promise((r) => setTimeout(r, 3000));
        await win.setTitleBarStyle("visible");
        await win.setTrafficLightPosition(16, 16);
        out.ok("标题栏样式与红绿灯位置已还原");
      }),
      act(out, "点击穿透 2 秒", async () => {
        await win.setIgnoreCursorEvents(true);
        out.info("窗口正忽略所有鼠标事件（点它试试，会穿透到后面的窗口），2 秒后自动恢复");
        await new Promise((r) => setTimeout(r, 2000));
        await win.setIgnoreCursorEvents(false);
        out.ok("鼠标事件已恢复");
      }),
      act(out, "触发拖动", async () => {
        await win.startDragging();
        out.ok("拖动命令已下发。说明：无边框窗口靠拖动区移动，macOS 依赖当前鼠标按下事件，从按钮触发通常原地不动，真实拖动请配合无边框 + 声明拖动区使用");
      }),
    );
  },
};

export const windowDemos: Demo[] = [winControl, multiwin, monitors, theme, frameless];
