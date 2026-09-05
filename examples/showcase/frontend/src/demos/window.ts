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

export const windowDemos: Demo[] = [winControl, multiwin, monitors];
