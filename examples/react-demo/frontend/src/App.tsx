/**
 * Ztron React Demo：React 19 + Tailwind CSS v4 跑在 Ztron 管线上的活文档。
 *
 * 五个标签页分别演示：调用后端命令、事件订阅、Channel 流式推送、窗口主题
 * （与 Tailwind dark: 变体联动）、系统集成（os/fs/React.lazy 懒加载）。
 * 样式只用 Tailwind 原子类（含任意值），不引入组件库；深色为默认观感，
 * 明暗两套都按 showcase 的调色板（#0a0c10 底、#11141b 面、紫青渐变点缀）。
 */
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import {
  fs,
  getCurrentWebviewWindow,
  invoke,
  path,
  type OsInfo,
} from "@zturnlibs/ztron-api";
import { useChannelStream, useInvoke, useListen } from "./hooks";

const LazyPane = lazy(() => import("./LazyPane"));

type TabKey = "backend" | "events" | "channel" | "theme" | "system";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "backend", label: "调用后端" },
  { key: "events", label: "事件" },
  { key: "channel", label: "Channel" },
  { key: "theme", label: "主题" },
  { key: "system", label: "系统" },
];

/* Tailwind 类组：明暗双色系，任意见 showcase 的令牌（#0a0c10/#11141b/#8b5cf6/#22d3ee）。 */
const btn =
  "inline-flex items-center rounded-lg border border-black/10 bg-[#f7f8fa] px-3.5 py-1.5 text-[13px] transition-colors hover:border-black/20 disabled:cursor-default disabled:opacity-50 dark:border-white/10 dark:bg-[#161a23] dark:text-[#e6eaf2] dark:hover:border-white/20";
const btnPrimary =
  "inline-flex items-center rounded-lg bg-gradient-to-r from-[#8b5cf6] to-[#22d3ee] px-3.5 py-1.5 text-[13px] font-semibold text-[#0a0c10] transition-transform active:translate-y-px disabled:cursor-default disabled:opacity-50";
const field =
  "w-56 rounded-lg border border-black/10 bg-[#eef0f4] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#22d3ee] dark:border-white/10 dark:bg-[#0d1017] dark:text-[#e6eaf2]";
const out =
  "mt-3 w-full whitespace-pre-wrap break-all rounded-lg border border-black/10 bg-[#eef0f4] px-3 py-2.5 font-mono text-[12.5px] dark:border-white/10 dark:bg-[#0d1017]";

function Card(props: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]">
      <h2 className="m-0 text-base font-semibold">{props.title}</h2>
      {props.desc && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#5b6472] dark:text-[#9aa3b2]">
          {props.desc}
        </p>
      )}
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

/* codegen 类型绑定的形状说明。src/ 位于 frontend root 之外，Vite 的 dev
   server 与 build 都只服务 root 内的模块，所以运行时不能直接 import
   "../../src/ztron-commands.js"；页面用 invoke<string> 直调，类型绑定作为
   业务工程的参考形状展示（把 frontend root 指到仓库根的项目可直接引用）。 */
const TYPED_BINDING_SNIPPET = `// codegen 产物 src/ztron-commands.ts 提供类型化 invoke：
import { invoke as typed } from "../../src/ztron-commands.js";

const msg = await typed("react-demo:greet", { name: "Ztron" });
//     ^ string，命令名或参数拼错会在类型检查期报错

// 注：src/ 位于 frontend root 之外，Vite 无法直接引用该模块，
// 故本页运行时用 invoke<string>("react-demo:greet", ...) 直调，
// 类型绑定的形状如上，供业务工程参考。`;

export default function App() {
  const [tab, setTab] = useState<TabKey>("backend");

  // 冒烟上报：挂载即报告 REACT_DEMO_OK。这条 invoke 走通即证明：
  // React 转换成功（JSX 出错页面会白屏报错）、bridge 已注入、IPC 往返可用。
  useEffect(() => {
    void invoke("react-demo:report", { received: "REACT_DEMO_OK" }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#f2f3f7] text-[#1a1d26] dark:bg-[#0a0c10] dark:text-[#e6eaf2]">
      <header className="sticky top-0 z-10 border-b border-black/10 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-[#11141b]/95">
        <div className="px-6 pt-4">
          <h1 className="bg-gradient-to-r from-[#8b5cf6] to-[#22d3ee] bg-clip-text text-lg font-bold text-transparent">
            Ztron React Demo
          </h1>
          <p className="mt-0.5 text-xs text-[#5b6472] dark:text-[#9aa3b2]">
            React 19 + Tailwind CSS v4 运行在 Ztron 管线上：dev HMR、IIFE 打包、IPC 全链路。
          </p>
        </div>
        <nav className="flex gap-1 px-4 pt-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                tab === t.key
                  ? "rounded-t-lg border-b-2 border-[#22d3ee] bg-[#f7f8fa] px-3.5 py-1.5 text-[13px] font-medium dark:bg-[#161a23]"
                  : "border-b-2 border-transparent px-3.5 py-1.5 text-[13px] text-[#5b6472] hover:text-[#1a1d26] dark:text-[#9aa3b2] dark:hover:text-[#e6eaf2]"
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
        {tab === "backend" && <BackendTab />}
        {tab === "events" && <EventsTab />}
        {tab === "channel" && <ChannelTab />}
        {tab === "theme" && <ThemeTab />}
        {tab === "system" && <SystemTab />}
      </main>
    </div>
  );
}

/** 标签一：调用后端。codegen 类型绑定形状 + 运行时 invoke 直调。 */
function BackendTab() {
  const [name, setName] = useState("Ztron");
  const [greetOut, setGreetOut] = useState("");
  const [busy, setBusy] = useState(false);

  async function runGreet() {
    setBusy(true);
    try {
      setGreetOut(await invoke<string>("react-demo:greet", { name }));
    } catch (err) {
      setGreetOut(`调用失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card
        title="调用后端命令"
        desc="输入名字，前端经 IPC 调用后端注册的 react-demo:greet，返回拼接问候语。"
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="名字"
          />
          <button className={btnPrimary} onClick={() => void runGreet()} disabled={busy}>
            问候
          </button>
        </div>
        {greetOut && <pre className={out}>{greetOut}</pre>}
      </Card>
      <Card title="codegen 类型绑定">
        <pre className="overflow-x-auto rounded-lg border border-black/10 bg-[#eef0f4] px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-[#5b6472] dark:border-white/10 dark:bg-[#0d1017] dark:text-[#9aa3b2]">
          {TYPED_BINDING_SNIPPET}
        </pre>
      </Card>
    </>
  );
}

/** 标签二：事件。useListen 订阅 react-demo:tick，按钮触发后端连发 3 个 tick。 */
function EventsTab() {
  const [ticks, setTicks] = useState<string[]>([]);

  useListen<{ n: number }>("react-demo:tick", (e) => {
    setTicks((prev) => [...prev, `tick ${e.payload.n}`]);
  });

  return (
    <Card
      title="后端事件（listen）"
      desc="useListen 订阅 react-demo:tick；后端收到调用后以 120ms 间隔连发 3 个事件，卸载时自动 unlisten（StrictMode 双挂载安全）。"
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={btnPrimary}
          onClick={() => void invoke("react-demo:emit-ticks").catch(() => {})}
        >
          触发 emit-ticks
        </button>
        {ticks.length > 0 && (
          <button className={btn} onClick={() => setTicks([])}>
            清空记录
          </button>
        )}
      </div>
      {ticks.length > 0 ? (
        <ul className="mt-3 flex list-none flex-col gap-1.5 p-0 font-mono text-[12.5px]">
          {ticks.map((t, i) => (
            <li
              key={`${i}-${t}`}
              className="rounded-lg border border-black/10 bg-[#eef0f4] px-3 py-1.5 dark:border-white/10 dark:bg-[#0d1017]"
            >
              {t}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-[#5b6472] dark:text-[#9aa3b2]">
          暂无事件，点上面的按钮触发。
        </p>
      )}
    </Card>
  );
}

/** 标签三：Channel。useChannelStream 消费 react-demo:stream 推送的 1..8。 */
function ChannelTab() {
  const stream = useChannelStream<number>("react-demo:stream");

  return (
    <Card
      title="Channel 流式推送"
      desc="点击后前端创建 Channel 并调用 react-demo:stream，后端向通道同步推送 1 到 8，结束后 end 关闭通道；消息按到达顺序累积进列表。"
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={btnPrimary}
          onClick={stream.start}
          disabled={stream.status === "running"}
        >
          {stream.status === "running" ? "推送中" : "开始推送"}
        </button>
        <span className="text-[13px] text-[#5b6472] dark:text-[#9aa3b2]">
          状态：{stream.status}
          {stream.error ? `，错误：${stream.error}` : ""}
        </span>
      </div>
      {stream.messages.length > 0 && (
        <ol className="mt-3 flex list-none flex-wrap gap-2 p-0 font-mono text-[12.5px]">
          {stream.messages.map((n, i) => (
            <li
              key={`${i}-${n}`}
              className="rounded-lg border border-[#22d3ee]/40 bg-[#eef0f4] px-3 py-1.5 dark:border-[#22d3ee]/30 dark:bg-[#0d1017]"
            >
              {n}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** 标签四：主题。setTheme 切换窗口外观，Tailwind 的 dark: 变体随之翻转。 */
function ThemeTab() {
  const [theme, setThemeState] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function refreshTheme() {
    try {
      setThemeState(await getCurrentWebviewWindow().getTheme());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function applyTheme(t: "dark" | "light" | null) {
    setErr("");
    try {
      await getCurrentWebviewWindow().setTheme(t);
      setThemeState(await getCurrentWebviewWindow().getTheme());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void refreshTheme();
  }, []);

  return (
    <Card
      title="窗口主题"
      desc="三个按钮分别 setTheme 为深色、浅色、跟随系统。窗口外观即 WKWebView 的 prefers-color-scheme，Tailwind 的 dark: 变体与它同源：切换后本页配色立即翻转（观察标题栏与卡片底色）。"
    >
      <div className="flex flex-wrap items-center gap-3">
        <button className={btn} onClick={() => void applyTheme("dark")}>
          深色
        </button>
        <button className={btn} onClick={() => void applyTheme("light")}>
          浅色
        </button>
        <button className={btn} onClick={() => void applyTheme(null)}>
          跟随系统
        </button>
      </div>
      {err ? (
        <pre className={out}>{err}</pre>
      ) : (
        <pre className={out}>当前主题：{theme ?? "跟随系统"}</pre>
      )}
    </Card>
  );
}

/** 标签五：系统。os.info 声明式读取、fs 临时目录读写、React.lazy 懒加载。 */
function SystemTab() {
  const osInfo = useInvoke<OsInfo>("plugin:os|info", {});
  const [fsOut, setFsOut] = useState("");
  const [busy, setBusy] = useState(false);

  async function runFsRoundTrip() {
    setBusy(true);
    try {
      const tmp = await path.tempDir();
      const file = `${tmp}/ztron-react-demo.txt`;
      const stamp = `React demo 写于 ${new Date().toLocaleString()}`;
      await fs.writeText(file, stamp);
      const back = await fs.readText(file);
      setFsOut(`写入 ${file}\n读回一致：${back === stamp}\n内容：${back}`);
    } catch (err) {
      setFsOut(`失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card
        title="系统信息（os.info）"
        desc="useInvoke 声明式调用 plugin:os|info，挂载时自动执行，返回 loading、data、error 三态。"
      >
        {osInfo.loading && (
          <p className="text-[13px] text-[#5b6472] dark:text-[#9aa3b2]">读取中</p>
        )}
        {osInfo.error && <pre className={out}>{osInfo.error}</pre>}
        {osInfo.data && (
          <pre className={out}>
            {`platform: ${osInfo.data.platform}
arch: ${osInfo.data.arch}
hostname: ${osInfo.data.hostname}
version: ${osInfo.data.version}`}
          </pre>
        )}
      </Card>
      <Card
        title="文件读写（$TMP）"
        desc="fs.writeText 与 fs.readText 在系统临时目录做一次往返；后端 fs scope 只放行 $TMP/**。"
      >
        <button className={btnPrimary} onClick={() => void runFsRoundTrip()} disabled={busy}>
          写入并读回
        </button>
        {fsOut && <pre className={out}>{fsOut}</pre>}
      </Card>
      <Card
        title="懒加载（React.lazy）"
        desc="Suspense 边界内的 LazyPane 经动态 import 加载；IIFE 打包时动态 import 会被内联进主包。"
      >
        <Suspense
          fallback={
            <p className="text-[13px] text-[#5b6472] dark:text-[#9aa3b2]">
              懒加载组件装载中
            </p>
          }
        >
          <LazyPane />
        </Suspense>
      </Card>
    </>
  );
}
