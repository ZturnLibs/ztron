### Task 8: demos/menu-tray.ts（3 卡：应用菜单 / 托盘 / 全局快捷键）

**Files:**
- Create: `examples/showcase/frontend/src/demos/menu-tray.ts`
- Modify: `examples/showcase/frontend/src/main.ts`

**Interfaces:**
- Consumes: 共享接口；`setAppMenu`/`Menu`/`TrayIcon`/`registerShortcut`/`unregisterShortcut`/`isRegistered`/`onShortcut`。
- Produces: `export const menuTrayDemos: Demo[]`（3 项）。

- [ ] **Step 1: 写 demos/menu-tray.ts（完整文件）**

```ts
import {
  setAppMenu,
  Menu,
  TrayIcon,
  registerShortcut,
  unregisterShortcut,
  isRegistered,
  onShortcut,
} from "@zturnlibs/ztron-api";
import { act, type Demo } from "../demo-ui";

const menuDemo: Demo = {
  id: "menu.app",
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
  docPath: "/plugins/menu.html",
  mount(area, out) {
    let menu: Awaited<ReturnType<typeof setAppMenu>> | null = null;
    let zoomChecked = true;
    area.append(
      act(out, "安装示例菜单", async () => {
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
        out.ok("已安装（看屏幕顶部菜单栏），quit 已绑定 CmdOrCtrl+Q");
      }),
      act(out, "切换 Zoom 勾选", async () => {
        if (!menu) {
          out.fail("请先安装示例菜单");
          return;
        }
        zoomChecked = !zoomChecked;
        await menu.setItemChecked("zoom", zoomChecked);
        out.ok(`Zoom 已切换为${zoomChecked ? "勾选" : "不勾选"}（打开 View 菜单核对）`);
      }),
    );
  },
};

const trayDemo: Demo = {
  id: "menu.tray",
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
  docPath: "/plugins/tray.html",
  mount(area, out) {
    area.append(
      act(out, "创建托盘（5 秒后销毁）", async () => {
        const tray = await TrayIcon.create({ title: "Z", tooltip: "Ztron Showcase 托盘" });
        out.info("托盘已出现在菜单栏右上角（标题 Z）");
        await tray.setIconAsTemplate(true);
        await new Promise((r) => setTimeout(r, 5000));
        await tray.destroy();
        out.ok("托盘已销毁");
      }),
    );
  },
};

const shortcut: Demo = {
  id: "menu.shortcut",
  title: "全局快捷键",
  description: "注册系统级快捷键，应用在后台也能收到触发事件；注册后切到别的应用按 Cmd+Shift+J 试试。",
  code: `import { registerShortcut, isRegistered, onShortcut } from "@zturnlibs/ztron-api";

await registerShortcut("showcase", "Cmd+Shift+J");
console.log("已注册：", await isRegistered("showcase"));

const un = await onShortcut((e) => {
  console.log("触发：", e.shortcutId);   // "showcase"
});
// await unregisterShortcut("showcase"); un();`,
  docPath: "/plugins/global-shortcut.html",
  mount(area, out) {
    area.append(
      act(out, "注册 Cmd+Shift+J（10 秒窗口）", async () => {
        await registerShortcut("showcase-demo", "Cmd+Shift+J");
        const reg = await isRegistered("showcase-demo");
        out.info(`注册${reg ? "成功" : "失败"}，切到其他应用按 Cmd+Shift+J`);
        let firedSeen = false;
        const fired = await onShortcut((e) => {
          firedSeen = true;
          out.info(`触发：${e.shortcutId}`);
        });
        await new Promise((r) => setTimeout(r, 10000));
        await unregisterShortcut("showcase-demo");
        await fired();
        out.ok(firedSeen ? "捕获到全局触发" : "10 秒内未触发（快捷键可能被其他应用占用）");
      }),
    );
  },
};

export const menuTrayDemos: Demo[] = [menuDemo, trayDemo, shortcut];
```

- [ ] **Step 2: CATALOG 登记** — `{ category: "菜单与托盘", demos: menuTrayDemos },`

- [ ] **Step 3: typecheck** — Expected: exit 0。

- [ ] **Step 4: dev 人工点验** — 菜单栏出现 New Window/View/Quit 且 Cmd+Shift+Q 生效（按下会退出应用，属预期，重跑 dev 即可）；Zoom 勾选切换可在菜单里核对；托盘 Z 图标出现又消失；全局快捷键在切走后触发有 info 行。

- [ ] **Step 5: Commit**

```bash
git add examples/showcase/frontend
git commit -m "feat(examples): showcase menu-tray demos - appmenu/tray/global-shortcut"
```

---

