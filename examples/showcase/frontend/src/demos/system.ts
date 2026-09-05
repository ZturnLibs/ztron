import {
  os,
  shell,
  path,
  openUrl,
  openPath,
  revealItemInDir,
  isPrimaryInstance,
  onDeepLink,
  enableAutostart,
  disableAutostart,
  isAutostartEnabled,
  saveWindowState,
  restoreWindowState,
  setPosition,
  getPosition,
  getLocalIpv4,
  getNetworkIpv4,
  getLocalIpv6,
  getPublicIp,
  updater,
} from "@zturnlibs/ztron-api";
import { act, extractError, type Demo } from "../demo-ui";

const appInfo: Demo = {
  id: "system.appinfo",
  title: "应用与系统信息",
  description: "os 模块读平台/架构/语言；这是适配平台差异的第一步。",
  code: `import { os } from "@zturnlibs/ztron-api";

const info = await os.info();   // { platform, arch, version, ... }
const type = await os.type();   // "Darwin" / "Windows_NT" / "Linux"
const eol = await os.eol();     // "\\n" 或 "\\r\\n"
const locale = await os.locale();`,
  docPath: "/plugins/app.html",
  mount(area, out) {
    area.append(
      act(out, "读取系统信息", async () => {
        const info = await os.info();
        const [type, eol, locale] = await Promise.all([os.type(), os.eol(), os.locale()]);
        out.ok(
          `platform: ${info.platform}\narch: ${info.arch}\ntype: ${type}\neol: ${JSON.stringify(eol)}\nlocale: ${locale}`,
        );
      }),
    );
  },
};

const shellDemo: Demo = {
  id: "system.shell",
  title: "执行命令 shell",
  description: "运行外部命令并捕获输出；scope 白名单决定允许的程序（本应用放行 echo/pwd/cat/sh）。",
  code: `import { shell } from "@zturnlibs/ztron-api";

const r = await shell.execute("echo", ["hi"]);
console.log(r.stdout, r.stderr, r.code);

// cwd 选项
const r2 = await shell.execute("pwd", [], { cwd: "/tmp" });

// 越权程序（scope 未放行）会抛错
await shell.execute("curl", ["http://example.com"]);`,
  docPath: "/plugins/shell.html",
  mount(area, out) {
    area.append(
      act(out, "echo 你好", async () => {
        const r = await shell.execute("echo", ["你好 shell"]);
        out.ok(`stdout: ${r.stdout.trim()}\ncode: ${r.code}`);
      }),
      act(out, "pwd（带 cwd）", async () => {
        const tmp = await path.tempDir();
        const r = await shell.execute("pwd", [], { cwd: tmp });
        out.ok(`stdout: ${r.stdout.trim()}`);
      }),
      act(out, "越权程序（scope 拒绝演示）", async () => {
        try {
          await shell.execute("curl", ["http://example.com"]);
          out.ok("竟然放行了？请检查 shell scope 配置");
        } catch (e) {
          out.ok(`符合预期被拒绝：${extractError(e).slice(0, 80)}`);
        }
      }),
    );
  },
};

const openerDemo: Demo = {
  id: "system.opener",
  title: "打开 URL / 文件",
  description: "用系统默认应用打开链接或目录，在访达中定位文件。",
  code: `import { openUrl, openPath, revealItemInDir } from "@zturnlibs/ztron-api";

await openUrl("https://zturnlibs.github.io/ztron/");
await openPath("/tmp");               // 访达打开目录
await revealItemInDir("/etc/hosts");  // 定位并选中`,
  docPath: "/plugins/opener.html",
  mount(area, out) {
    area.append(
      act(out, "打开 Ztron 文档站", async () => {
        await openUrl("https://zturnlibs.github.io/ztron/");
        out.ok("已在默认浏览器打开");
      }),
      act(out, "访达打开临时目录", async () => {
        await openPath(await path.tempDir());
        out.ok("访达已打开");
      }),
      act(out, "定位 hosts 文件", async () => {
        await revealItemInDir("/etc/hosts");
        out.ok("访达已定位 /etc/hosts");
      }),
    );
  },
};

const singleInstance: Demo = {
  id: "system.single-instance",
  title: "单实例",
  description: "isPrimaryInstance 判断是否首个实例；二次启动时参数会转交给首实例。",
  code: `import { isPrimaryInstance } from "@zturnlibs/ztron-api";

const primary = await isPrimaryInstance();
if (primary) console.log("我是主实例");
// 再次启动 app 时，第二实例自动退出并把 argv 转交主实例`,
  docPath: "/plugins/single-instance.html",
  mount(area, out) {
    area.append(
      act(out, "查询实例身份", async () => {
        const primary = await isPrimaryInstance();
        out.ok(primary ? "我是主实例（再次启动 app 会转交参数并退出）" : "我是从实例");
      }),
    );
  },
};

const deepLink: Demo = {
  id: "system.deep-link",
  title: "深层链接 deep-link",
  description: "处理 ztron:// 协议 URL。dev 裸二进制注册不了协议，打包 .app 后从浏览器打开 ztron://showcase/hello 可触发。",
  code: `import { onDeepLink } from "@zturnlibs/ztron-api";

const un = await onDeepLink((url) => {
  console.log("收到深层链接：", url);   // "ztron://showcase/hello"
});
un();`,
  docPath: "/plugins/deep-link.html",
  mount(area, out) {
    area.append(
      act(out, "挂监听", async () => {
        await onDeepLink((url) => out.info(`收到：${url}`));
        out.ok("监听已挂上。触发前提：打包 .app 并注册 CFBundleURLTypes（见文档）");
      }),
    );
  },
};

const autostart: Demo = {
  id: "system.autostart",
  title: "开机自启",
  description: "enable / disable / isEnabled 三件套（macOS 写入登录项）。",
  code: `import { enableAutostart, disableAutostart, isAutostartEnabled } from "@zturnlibs/ztron-api";

await enableAutostart();
console.log(await isAutostartEnabled());   // true
await disableAutostart();`,
  docPath: "/plugins/autostart.html",
  mount(area, out) {
    area.append(
      act(out, "开启自启", async () => {
        await enableAutostart();
        out.ok(`当前状态：${await isAutostartEnabled()}`);
      }),
      act(out, "关闭自启", async () => {
        await disableAutostart();
        out.ok(`当前状态：${await isAutostartEnabled()}`);
      }),
    );
  },
};

const winState: Demo = {
  id: "system.window-state",
  title: "窗口状态记忆与定位",
  description: "window-state 保存/恢复窗口位置；positioner 把窗口摆到指定坐标。",
  code: `import {
  saveWindowState, restoreWindowState, setPosition, getPosition,
} from "@zturnlibs/ztron-api";

const saved = await saveWindowState();   // { x, y, width, height }
await setPosition(100, 100);
const pos = await getPosition();
await restoreWindowState();              // 回到保存的位置`,
  docPath: "/plugins/window-state.html",
  mount(area, out) {
    area.append(
      act(out, "移到 (100, 100)", async () => {
        await setPosition(100, 100);
        out.ok(`当前位置：${JSON.stringify(await getPosition())}`);
      }),
      act(out, "保存并恢复", async () => {
        const saved = await saveWindowState();
        await setPosition(saved.x + 60, saved.y + 60);
        out.info("窗口已挪动，0.8 秒后恢复…");
        await new Promise((r) => setTimeout(r, 800));
        await restoreWindowState();
        out.ok(`已回到 (${saved.x}, ${saved.y})`);
      }),
    );
  },
};

const network: Demo = {
  id: "system.network",
  title: "网络信息",
  description: "本机 IPv4/IPv6、主网卡地址、公网出口（需外网）。",
  code: `import {
  getLocalIpv4, getLocalIpv6, getNetworkIpv4, getPublicIp,
} from "@zturnlibs/ztron-api";

console.log(await getLocalIpv4());    // 192.168.x.x
console.log(await getNetworkIpv4());  // 主网卡
console.log(await getPublicIp());     // 公网出口（需外网）`,
  docPath: "/plugins/network.html",
  mount(area, out) {
    area.append(
      act(out, "读取网络信息", async () => {
        const v4 = await getLocalIpv4();
        const net = await getNetworkIpv4();
        const v6 = await getLocalIpv6().catch(() => null);
        const pub = await getPublicIp().catch(() => null);
        out.ok(
          `本机 IPv4：${v4}\n主网卡：${net}\nIPv6：${v6 ?? "无"}\n公网出口：${pub ?? "不可达（需外网）"}`,
        );
      }),
    );
  },
};

const updaterDemo: Demo = {
  id: "system.updater",
  title: "应用更新 updater",
  description: "check() 拉取更新清单比对版本。真实更新依赖签名与 endpoint；这里请求一个不存在的端口，展示报错路径。",
  code: `import { updater } from "@zturnlibs/ztron-api";

const result = await updater.check("https://my-app.com/latest.json");
if (result.hasUpdate) {
  console.log(\`新版本 \${result.version}\`);
  // 生产环境：download -> verify -> install
}`,
  docPath: "/plugins/updater.html",
  mount(area, out) {
    area.append(
      act(out, "check（演示失败路径）", async () => {
        try {
          const result = await updater.check("http://localhost:9/latest.json");
          out.ok(JSON.stringify(result));
        } catch (e) {
          out.ok(`如预期失败（无可用更新服务）：${extractError(e).slice(0, 80)}`);
        }
      }),
    );
  },
};

export const systemDemos: Demo[] = [
  appInfo,
  shellDemo,
  openerDemo,
  singleInstance,
  deepLink,
  autostart,
  winState,
  network,
  updaterDemo,
];
