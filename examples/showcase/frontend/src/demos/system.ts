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
import type { Lang } from "../i18n";

/** 每个模块一个双语字典：可见文案（标题/描述/按钮/输出/代码注释）全覆盖 */
const STR = {
  zh: {
    category: "系统集成",
    appInfo: {
      title: "应用与系统信息",
      description: "os 模块读平台/架构/语言；这是适配平台差异的第一步。",
      code: `import { os } from "@zturnlibs/ztron-api";

const info = await os.info();   // { platform, arch, version, ... }
const type = await os.type();   // "Darwin" / "Windows_NT" / "Linux"
const eol = await os.eol();     // "\\n" 或 "\\r\\n"
const locale = await os.locale();`,
      read: "读取系统信息",
    },
    shell: {
      title: "执行命令 shell",
      description: "运行外部命令并捕获输出；scope 白名单决定允许的程序（本应用放行 echo/pwd/cat/sh）。",
      code: `import { shell } from "@zturnlibs/ztron-api";

const r = await shell.execute("echo", ["hi"]);
console.log(r.stdout, r.stderr, r.code);

// cwd 选项
const r2 = await shell.execute("pwd", [], { cwd: "/tmp" });

// 越权程序（scope 未放行）会抛错
await shell.execute("curl", ["http://example.com"]);`,
      echo: "echo 你好",
      echoArg: "你好 shell",
      pwd: "pwd（带 cwd）",
      outOfScope: "越权程序（scope 拒绝演示）",
      allowed: "竟然放行了？请检查 shell scope 配置",
      rejected: (detail: string) => `符合预期被拒绝：${detail}`,
    },
    opener: {
      title: "打开 URL / 文件",
      description: "用系统默认应用打开链接或目录，在访达中定位文件。",
      code: `import { openUrl, openPath, revealItemInDir } from "@zturnlibs/ztron-api";

await openUrl("https://zturnlibs.github.io/ztron/");
await openPath("/tmp");               // 访达打开目录
await revealItemInDir("/etc/hosts");  // 定位并选中`,
      openDocs: "打开 Ztron 文档站",
      docsOpened: "已在默认浏览器打开",
      openTmp: "访达打开临时目录",
      tmpOpened: "访达已打开",
      revealHosts: "定位 hosts 文件",
      hostsRevealed: "访达已定位 /etc/hosts",
    },
    singleInstance: {
      title: "单实例",
      description: "isPrimaryInstance 判断是否首个实例；二次启动时参数会转交给首实例。",
      code: `import { isPrimaryInstance } from "@zturnlibs/ztron-api";

const primary = await isPrimaryInstance();
if (primary) console.log("我是主实例");
// 再次启动 app 时，第二实例自动退出并把 argv 转交主实例`,
      check: "查询实例身份",
      primary: "我是主实例（再次启动 app 会转交参数并退出）",
      secondary: "我是从实例",
    },
    deepLink: {
      title: "深层链接 deep-link",
      description:
        "处理 ztron:// 协议 URL。dev 裸二进制注册不了协议，打包 .app 后从浏览器打开 ztron://showcase/hello 可触发。",
      code: `import { onDeepLink } from "@zturnlibs/ztron-api";

const un = await onDeepLink((url) => {
  console.log("收到深层链接：", url);   // "ztron://showcase/hello"
});
un();`,
      attach: "挂监听",
      received: (url: string) => `收到：${url}`,
      attached: "监听已挂上。触发前提：打包 .app 并注册 CFBundleURLTypes（见文档）",
    },
    autostart: {
      title: "开机自启",
      description: "enable / disable / isEnabled 三件套（macOS 写入登录项）。",
      code: `import { enableAutostart, disableAutostart, isAutostartEnabled } from "@zturnlibs/ztron-api";

await enableAutostart();
console.log(await isAutostartEnabled());   // true
await disableAutostart();`,
      enable: "开启自启",
      disable: "关闭自启",
      status: (v: boolean) => `当前状态：${v}`,
    },
    winState: {
      title: "窗口状态记忆与定位",
      description: "window-state 保存/恢复窗口位置；positioner 把窗口摆到指定坐标。",
      code: `import {
  saveWindowState, restoreWindowState, setPosition, getPosition,
} from "@zturnlibs/ztron-api";

const saved = await saveWindowState();   // { x, y, width, height }
await setPosition(100, 100);
const pos = await getPosition();
await restoreWindowState();              // 回到保存的位置`,
      moveTo: "移到 (100, 100)",
      pos: (p: string) => `当前位置：${p}`,
      saveRestore: "保存并恢复",
      moving: "窗口已挪动，0.8 秒后恢复…",
      restored: (x: number, y: number) => `已回到 (${x}, ${y})`,
    },
    network: {
      title: "网络信息",
      description: "本机 IPv4/IPv6、主网卡地址、公网出口（需外网）。",
      code: `import {
  getLocalIpv4, getLocalIpv6, getNetworkIpv4, getPublicIp,
} from "@zturnlibs/ztron-api";

console.log(await getLocalIpv4());    // 192.168.x.x
console.log(await getNetworkIpv4());  // 主网卡
console.log(await getPublicIp());     // 公网出口（需外网）`,
      read: "读取网络信息",
      summary: (v4: string | null, net: string | null, v6: string | null, pub: string | null) =>
        `本机 IPv4：${v4}\n主网卡：${net}\nIPv6：${v6}\n公网出口：${pub}`,
      none: "无",
      unreachable: "不可达（需外网）",
    },
    updater: {
      title: "应用更新 updater",
      description:
        "check() 拉取更新清单比对版本。真实更新依赖签名与 endpoint；这里请求一个不存在的端口，展示报错路径。",
      code: `import { updater } from "@zturnlibs/ztron-api";

const result = await updater.check("https://my-app.com/latest.json");
if (result.hasUpdate) {
  console.log(\`新版本 \${result.version}\`);
  // 生产环境：download -> verify -> install
}`,
      check: "check（演示失败路径）",
      failed: (detail: string) => `如预期失败（无可用更新服务）：${detail}`,
    },
  },
  en: {
    category: "System",
    appInfo: {
      title: "App and system info",
      description:
        "The os module reads platform, architecture, and language; it is the first step in adapting to platform differences.",
      code: `import { os } from "@zturnlibs/ztron-api";

const info = await os.info();   // { platform, arch, version, ... }
const type = await os.type();   // "Darwin" / "Windows_NT" / "Linux"
const eol = await os.eol();     // "\\n" or "\\r\\n"
const locale = await os.locale();`,
      read: "Read system info",
    },
    shell: {
      title: "Run commands with shell",
      description:
        "Run external commands and capture their output; a scope allowlist decides which programs are permitted (this app allows echo/pwd/cat/sh).",
      code: `import { shell } from "@zturnlibs/ztron-api";

const r = await shell.execute("echo", ["hi"]);
console.log(r.stdout, r.stderr, r.code);

// The cwd option
const r2 = await shell.execute("pwd", [], { cwd: "/tmp" });

// Programs not allowed by scope throw
await shell.execute("curl", ["http://example.com"]);`,
      echo: "echo hello",
      echoArg: "hello shell",
      pwd: "pwd (with cwd)",
      outOfScope: "Out-of-scope program (scope rejection demo)",
      allowed: "The request went through? Please check the shell scope configuration",
      rejected: (detail: string) => `Rejected as expected: ${detail}`,
    },
    opener: {
      title: "Open URLs / files",
      description:
        "Open links or directories with the system default app, or reveal a file in Finder.",
      code: `import { openUrl, openPath, revealItemInDir } from "@zturnlibs/ztron-api";

await openUrl("https://zturnlibs.github.io/ztron/");
await openPath("/tmp");               // opens the directory in Finder
await revealItemInDir("/etc/hosts");  // reveals and selects it`,
      openDocs: "Open the Ztron docs site",
      docsOpened: "Opened in the default browser",
      openTmp: "Open the temp directory in Finder",
      tmpOpened: "Finder opened the directory",
      revealHosts: "Reveal the hosts file",
      hostsRevealed: "Finder revealed /etc/hosts",
    },
    singleInstance: {
      title: "Single instance",
      description:
        "isPrimaryInstance tells whether this is the first instance; on a second launch its arguments are forwarded to the primary instance.",
      code: `import { isPrimaryInstance } from "@zturnlibs/ztron-api";

const primary = await isPrimaryInstance();
if (primary) console.log("I am the primary instance");
// When the app is launched again, the second instance exits and forwards argv to the primary one`,
      check: "Check instance role",
      primary: "I am the primary instance (launching the app again forwards the arguments and exits)",
      secondary: "I am a secondary instance",
    },
    deepLink: {
      title: "Deep links",
      description:
        "Handles ztron:// protocol URLs. A dev bare binary cannot register the protocol; package the app as a .app first, then opening ztron://showcase/hello from a browser triggers it.",
      code: `import { onDeepLink } from "@zturnlibs/ztron-api";

const un = await onDeepLink((url) => {
  console.log("deep link received:", url);   // "ztron://showcase/hello"
});
un();`,
      attach: "Attach listener",
      received: (url: string) => `Received: ${url}`,
      attached:
        "Listener attached. To trigger it: package as a .app and register CFBundleURLTypes (see the docs)",
    },
    autostart: {
      title: "Launch at startup",
      description:
        "The enable / disable / isEnabled trio (writes a login item on macOS).",
      code: `import { enableAutostart, disableAutostart, isAutostartEnabled } from "@zturnlibs/ztron-api";

await enableAutostart();
console.log(await isAutostartEnabled());   // true
await disableAutostart();`,
      enable: "Enable autostart",
      disable: "Disable autostart",
      status: (v: boolean) => `Current status: ${v}`,
    },
    winState: {
      title: "Window state memory and positioning",
      description:
        "window-state saves and restores the window position; positioner moves the window to given coordinates.",
      code: `import {
  saveWindowState, restoreWindowState, setPosition, getPosition,
} from "@zturnlibs/ztron-api";

const saved = await saveWindowState();   // { x, y, width, height }
await setPosition(100, 100);
const pos = await getPosition();
await restoreWindowState();              // back to the saved position`,
      moveTo: "Move to (100, 100)",
      pos: (p: string) => `Current position: ${p}`,
      saveRestore: "Save and restore",
      moving: "Window moved, restoring in 0.8 seconds...",
      restored: (x: number, y: number) => `Back to (${x}, ${y})`,
    },
    network: {
      title: "Network info",
      description:
        "Local IPv4/IPv6, primary adapter address, and public egress IP (internet required).",
      code: `import {
  getLocalIpv4, getLocalIpv6, getNetworkIpv4, getPublicIp,
} from "@zturnlibs/ztron-api";

console.log(await getLocalIpv4());    // 192.168.x.x
console.log(await getNetworkIpv4());  // primary adapter
console.log(await getPublicIp());     // public egress (internet required)`,
      read: "Read network info",
      summary: (v4: string | null, net: string | null, v6: string | null, pub: string | null) =>
        `Local IPv4: ${v4}\nPrimary adapter: ${net}\nIPv6: ${v6}\nPublic egress: ${pub}`,
      none: "none",
      unreachable: "unreachable (internet required)",
    },
    updater: {
      title: "App updates with updater",
      description:
        "check() fetches the update manifest and compares versions. Real updates depend on signatures and an endpoint; this demo requests a nonexistent port to show the error path.",
      code: `import { updater } from "@zturnlibs/ztron-api";

const result = await updater.check("https://my-app.com/latest.json");
if (result.hasUpdate) {
  console.log(\`new version \${result.version}\`);
  // In production: download -> verify -> install
}`,
      check: "check (demo of the failure path)",
      failed: (detail: string) => `Failed as expected (no update service available): ${detail}`,
    },
  },
};

/** 按语言构建本分类目录；语言切换时 main.ts 会重建 */
export function systemCatalog(lang: Lang): { category: string; demos: Demo[] } {
  const t = STR[lang];

  const appInfo: Demo = {
    id: "system.appinfo",
    title: t.appInfo.title,
    description: t.appInfo.description,
    code: t.appInfo.code,
    docPath: "/plugins/app.html",
    mount(area, out) {
      area.append(
        act(out, t.appInfo.read, async () => {
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
    title: t.shell.title,
    description: t.shell.description,
    code: t.shell.code,
    docPath: "/plugins/shell.html",
    mount(area, out) {
      area.append(
        act(out, t.shell.echo, async () => {
          const r = await shell.execute("echo", [t.shell.echoArg]);
          out.ok(`stdout: ${r.stdout.trim()}\ncode: ${r.code}`);
        }),
        act(out, t.shell.pwd, async () => {
          const tmp = await path.tempDir();
          const r = await shell.execute("pwd", [], { cwd: tmp });
          out.ok(`stdout: ${r.stdout.trim()}`);
        }),
        act(out, t.shell.outOfScope, async () => {
          try {
            await shell.execute("curl", ["http://example.com"]);
            out.ok(t.shell.allowed);
          } catch (e) {
            out.ok(t.shell.rejected(extractError(e).slice(0, 80)));
          }
        }),
      );
    },
  };

  const openerDemo: Demo = {
    id: "system.opener",
    title: t.opener.title,
    description: t.opener.description,
    code: t.opener.code,
    docPath: "/plugins/opener.html",
    mount(area, out) {
      area.append(
        act(out, t.opener.openDocs, async () => {
          await openUrl("https://zturnlibs.github.io/ztron/");
          out.ok(t.opener.docsOpened);
        }),
        act(out, t.opener.openTmp, async () => {
          await openPath(await path.tempDir());
          out.ok(t.opener.tmpOpened);
        }),
        act(out, t.opener.revealHosts, async () => {
          await revealItemInDir("/etc/hosts");
          out.ok(t.opener.hostsRevealed);
        }),
      );
    },
  };

  const singleInstance: Demo = {
    id: "system.single-instance",
    title: t.singleInstance.title,
    description: t.singleInstance.description,
    code: t.singleInstance.code,
    docPath: "/plugins/single-instance.html",
    mount(area, out) {
      area.append(
        act(out, t.singleInstance.check, async () => {
          const primary = await isPrimaryInstance();
          out.ok(primary ? t.singleInstance.primary : t.singleInstance.secondary);
        }),
      );
    },
  };

  const deepLink: Demo = {
    id: "system.deep-link",
    title: t.deepLink.title,
    description: t.deepLink.description,
    code: t.deepLink.code,
    docPath: "/plugins/deep-link.html",
    mount(area, out) {
      area.append(
        act(out, t.deepLink.attach, async () => {
          await onDeepLink((url) => out.info(t.deepLink.received(url)));
          out.ok(t.deepLink.attached);
        }),
      );
    },
  };

  const autostart: Demo = {
    id: "system.autostart",
    title: t.autostart.title,
    description: t.autostart.description,
    code: t.autostart.code,
    docPath: "/plugins/autostart.html",
    mount(area, out) {
      area.append(
        act(out, t.autostart.enable, async () => {
          await enableAutostart();
          out.ok(t.autostart.status(await isAutostartEnabled()));
        }),
        act(out, t.autostart.disable, async () => {
          await disableAutostart();
          out.ok(t.autostart.status(await isAutostartEnabled()));
        }),
      );
    },
  };

  const winState: Demo = {
    id: "system.window-state",
    title: t.winState.title,
    description: t.winState.description,
    code: t.winState.code,
    docPath: "/plugins/window-state.html",
    mount(area, out) {
      area.append(
        act(out, t.winState.moveTo, async () => {
          await setPosition(100, 100);
          out.ok(t.winState.pos(JSON.stringify(await getPosition())));
        }),
        act(out, t.winState.saveRestore, async () => {
          const saved = await saveWindowState();
          await setPosition(saved.x + 60, saved.y + 60);
          out.info(t.winState.moving);
          await new Promise((r) => setTimeout(r, 800));
          await restoreWindowState();
          out.ok(t.winState.restored(saved.x, saved.y));
        }),
      );
    },
  };

  const network: Demo = {
    id: "system.network",
    title: t.network.title,
    description: t.network.description,
    code: t.network.code,
    docPath: "/plugins/network.html",
    mount(area, out) {
      area.append(
        act(out, t.network.read, async () => {
          const v4 = await getLocalIpv4();
          const net = await getNetworkIpv4();
          const v6 = await getLocalIpv6().catch(() => null);
          const pub = await getPublicIp().catch(() => null);
          out.ok(
            t.network.summary(v4, net, v6 ?? t.network.none, pub ?? t.network.unreachable),
          );
        }),
      );
    },
  };

  const updaterDemo: Demo = {
    id: "system.updater",
    title: t.updater.title,
    description: t.updater.description,
    code: t.updater.code,
    docPath: "/plugins/updater.html",
    mount(area, out) {
      area.append(
        act(out, t.updater.check, async () => {
          try {
            const result = await updater.check("http://localhost:9/latest.json");
            out.ok(JSON.stringify(result));
          } catch (e) {
            out.ok(t.updater.failed(extractError(e).slice(0, 80)));
          }
        }),
      );
    },
  };

  return {
    category: t.category,
    demos: [
      appInfo,
      shellDemo,
      openerDemo,
      singleInstance,
      deepLink,
      autostart,
      winState,
      network,
      updaterDemo,
    ],
  };
}
