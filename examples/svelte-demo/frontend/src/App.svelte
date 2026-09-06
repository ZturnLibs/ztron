<script lang="ts">
  /**
   * Ztron Svelte Demo：Svelte 5 + Tailwind CSS v4 跑在 Ztron 管线上的活文档。
   *
   * 五个标签页分别演示：调用后端命令、事件订阅、Channel 流式推送、窗口主题
   * （与 Tailwind dark: 变体联动）、系统集成（os/fs/{#await import} 懒加载）。
   * 结构与 examples/vue-demo 的 App.vue 同构，写法换成 Svelte 5 runes 惯用法：
   * $state 管理全部可变 UI 状态，订阅清理走 ./lib/listeners.ts 的 listenOnMount。
   * 样式只用 Tailwind 原子类（含任意值），不引入组件库；深色为默认观感，
   * 明暗两套都按 showcase 的调色板（#0a0c10 底、#11141b 面、紫青渐变点缀）。
   */
  import { onDestroy, onMount } from "svelte";
  import {
    Channel,
    fs,
    getCurrentWebviewWindow,
    invoke,
    path,
    type OsInfo,
  } from "@zturnlibs/ztron-api";
  import { listenOnMount } from "./lib/listeners";

  /** 把未知错误转成可展示的消息。 */
  function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

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
  const muted = "text-[13px] text-[#5b6472] dark:text-[#9aa3b2]";
  const tabOn =
    "rounded-t-lg border-b-2 border-[#22d3ee] bg-[#f7f8fa] px-3.5 py-1.5 text-[13px] font-medium dark:bg-[#161a23]";
  const tabOff =
    "border-b-2 border-transparent px-3.5 py-1.5 text-[13px] hover:text-[#1a1d26] " +
    muted;

  let tab = $state<TabKey>("backend");

  // 冒烟上报：挂载即报告 SVELTE_DEMO_OK。这条 invoke 走通即证明：
  // Svelte 组件编译成功（模板出错页面会白屏报错）、bridge 已注入、IPC 往返可用。
  onMount(() => {
    void invoke("svelte-demo:report", { received: "SVELTE_DEMO_OK" }).catch(() => {});
  });

  /* ---- 标签一：调用后端 ---- */
  let name = $state("Ztron");
  let greetOut = $state("");
  let greetBusy = $state(false);

  async function runGreet() {
    greetBusy = true;
    try {
      greetOut = await invoke<string>("svelte-demo:greet", { name });
    } catch (err) {
      greetOut = `调用失败：${errMessage(err)}`;
    } finally {
      greetBusy = false;
    }
  }

  /* codegen 类型绑定的形状说明。src/ 位于 frontend root 之外，Vite 的 dev
     server 与 build 都只服务 root 内的模块，所以运行时不能直接 import
     "../../src/ztron-commands.js"；页面用 invoke<string> 直调，类型绑定作为
     业务工程的参考形状展示（把 frontend root 指到仓库根的项目可直接引用）。 */
  const TYPED_BINDING_SNIPPET = `// codegen 产物 src/ztron-commands.ts 提供类型化 invoke：
import { invoke as typed } from "../../src/ztron-commands.js";

const msg = await typed("svelte-demo:greet", { name: "Ztron" });
//     ^ string，命令名或参数拼错会在类型检查期报错

// 注：src/ 位于 frontend root 之外，Vite 无法直接引用该模块，
// 故本页运行时用 invoke<string>("svelte-demo:greet", ...) 直调，
// 类型绑定的形状如上，供业务工程参考。`;

  /* ---- 标签二：事件（listenOnMount：onMount 订阅，onDestroy unlisten） ---- */
  let ticks = $state<string[]>([]);

  listenOnMount<{ n: number }>("svelte-demo:tick", (e) => {
    ticks = [...ticks, `tick ${e.payload.n}`];
  });

  /* ---- 标签三：Channel（消费 svelte-demo:stream 推送的 1..8） ---- */
  let streamMessages = $state<number[]>([]);
  let streamStatus = $state<"idle" | "running" | "done" | "error">("idle");
  let streamError = $state("");
  // 非响应式：只做进行中一轮的代际标记，不进模板。
  let streamRunId = 0;

  function startStream(): void {
    const id = ++streamRunId;
    streamMessages = [];
    streamError = "";
    streamStatus = "running";
    const ch = new Channel<number>((msg) => {
      if (streamRunId !== id) return;
      streamMessages = [...streamMessages, msg];
    });
    void invoke<string>("svelte-demo:stream", { ch }).then(
      () => {
        if (streamRunId === id) streamStatus = "done";
      },
      (err: unknown) => {
        if (streamRunId !== id) return;
        streamError = errMessage(err);
        streamStatus = "error";
      },
    );
  }

  // 卸载清理：作废进行中的一轮，晚到的通道消息不再写入。
  onDestroy(() => {
    streamRunId += 1;
  });

  /* ---- 标签四：主题 ---- */
  let theme = $state<string | null>(null);
  let themeErr = $state("");

  async function refreshTheme() {
    try {
      theme = await getCurrentWebviewWindow().getTheme();
    } catch (e) {
      themeErr = errMessage(e);
    }
  }

  async function applyTheme(t: "dark" | "light" | null) {
    themeErr = "";
    try {
      await getCurrentWebviewWindow().setTheme(t);
      theme = await getCurrentWebviewWindow().getTheme();
    } catch (e) {
      themeErr = errMessage(e);
    }
  }

  onMount(() => {
    void refreshTheme();
  });

  /* ---- 标签五：系统 ---- */
  let osInfo = $state<OsInfo | null>(null);
  let osErr = $state("");
  let osLoading = $state(true);

  onMount(async () => {
    try {
      osInfo = await invoke<OsInfo>("plugin:os|info", {});
    } catch (e) {
      osErr = errMessage(e);
    } finally {
      osLoading = false;
    }
  });

  let fsOut = $state("");
  let fsBusy = $state(false);

  async function runFsRoundTrip() {
    fsBusy = true;
    try {
      const tmp = await path.tempDir();
      const file = `${tmp}/ztron-svelte-demo.txt`;
      const stamp = `Svelte demo 写于 ${new Date().toLocaleString()}`;
      await fs.writeText(file, stamp);
      const back = await fs.readText(file);
      fsOut = `写入 ${file}\n读回一致：${back === stamp}\n内容：${back}`;
    } catch (err) {
      fsOut = `失败：${errMessage(err)}`;
    } finally {
      fsBusy = false;
    }
  }
</script>

<div class="min-h-screen bg-[#f2f3f7] text-[#1a1d26] dark:bg-[#0a0c10] dark:text-[#e6eaf2]">
  <header class="sticky top-0 z-10 border-b border-black/10 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-[#11141b]/95">
    <div class="px-6 pt-4">
      <h1 class="bg-gradient-to-r from-[#8b5cf6] to-[#22d3ee] bg-clip-text text-lg font-bold text-transparent">
        Ztron Svelte Demo
      </h1>
      <p class="mt-0.5 text-xs {muted}">
        Svelte 5 + Tailwind CSS v4 运行在 Ztron 管线上：dev HMR、IIFE 打包、IPC 全链路。
      </p>
    </div>
    <nav class="flex gap-1 px-4 pt-2">
      {#each TABS as t (t.key)}
        <button class={tab === t.key ? tabOn : tabOff} onclick={() => (tab = t.key)}>
          {t.label}
        </button>
      {/each}
    </nav>
  </header>

  <main class="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
    <!-- 标签一：调用后端。codegen 类型绑定形状 + 运行时 invoke 直调。 -->
    {#if tab === "backend"}
      <section class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]">
        <h2 class="m-0 text-base font-semibold">调用后端命令</h2>
        <p class="mt-1.5 leading-relaxed {muted}">
          输入名字，前端经 IPC 调用后端注册的 svelte-demo:greet，返回拼接问候语。
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <input bind:value={name} class={field} placeholder="名字" />
          <button class={btnPrimary} disabled={greetBusy} onclick={() => void runGreet()}>
            问候
          </button>
        </div>
        {#if greetOut}<pre class={out}>{greetOut}</pre>{/if}
      </section>
      <section class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]">
        <h2 class="m-0 text-base font-semibold">codegen 类型绑定</h2>
        <pre class="mt-4 overflow-x-auto rounded-lg border border-black/10 bg-[#eef0f4] px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-[#5b6472] dark:border-white/10 dark:bg-[#0d1017] dark:text-[#9aa3b2]">{TYPED_BINDING_SNIPPET}</pre>
      </section>
    {:else if tab === "events"}
      <!-- 标签二：事件。listenOnMount 订阅 svelte-demo:tick，按钮触发后端连发 3 个 tick。 -->
      <section class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]">
        <h2 class="m-0 text-base font-semibold">后端事件（listen）</h2>
        <p class="mt-1.5 leading-relaxed {muted}">
          listenOnMount 订阅 svelte-demo:tick；后端收到调用后以 120ms 间隔连发 3 个事件，组件销毁时在 onDestroy 自动 unlisten。
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button class={btnPrimary} onclick={() => void invoke("svelte-demo:emit-ticks").catch(() => {})}>
            触发 emit-ticks
          </button>
          {#if ticks.length > 0}
            <button class={btn} onclick={() => (ticks = [])}>清空记录</button>
          {/if}
        </div>
        {#if ticks.length > 0}
          <ul class="mt-3 flex list-none flex-col gap-1.5 p-0 font-mono text-[12.5px]">
            {#each ticks as t, i (`${i}-${t}`)}
              <li class="rounded-lg border border-black/10 bg-[#eef0f4] px-3 py-1.5 dark:border-white/10 dark:bg-[#0d1017]">
                {t}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="mt-3 {muted}">暂无事件，点上面的按钮触发。</p>
        {/if}
      </section>
    {:else if tab === "channel"}
      <!-- 标签三：Channel。startStream 消费 svelte-demo:stream 推送的 1..8。 -->
      <section class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]">
        <h2 class="m-0 text-base font-semibold">Channel 流式推送</h2>
        <p class="mt-1.5 leading-relaxed {muted}">
          点击后前端创建 Channel 并调用 svelte-demo:stream，后端向通道同步推送 1 到 8，结束后 end 关闭通道；消息按到达顺序累积进列表。
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button class={btnPrimary} disabled={streamStatus === "running"} onclick={startStream}>
            {streamStatus === "running" ? "推送中" : "开始推送"}
          </button>
          <span class={muted}>
            状态：{streamStatus}{streamError ? `，错误：${streamError}` : ""}
          </span>
        </div>
        {#if streamMessages.length > 0}
          <ol class="mt-3 flex list-none flex-wrap gap-2 p-0 font-mono text-[12.5px]">
            {#each streamMessages as n, i (`${i}-${n}`)}
              <li class="rounded-lg border border-[#22d3ee]/40 bg-[#eef0f4] px-3 py-1.5 dark:border-[#22d3ee]/30 dark:bg-[#0d1017]">
                {n}
              </li>
            {/each}
          </ol>
        {/if}
      </section>
    {:else if tab === "theme"}
      <!-- 标签四：主题。setTheme 切换窗口外观，Tailwind 的 dark: 变体随之翻转。 -->
      <section class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]">
        <h2 class="m-0 text-base font-semibold">窗口主题</h2>
        <p class="mt-1.5 leading-relaxed {muted}">
          三个按钮分别 setTheme 为深色、浅色、跟随系统。窗口外观即 WKWebView 的 prefers-color-scheme，Tailwind 的 dark: 变体与它同源：切换后本页配色立即翻转（观察标题栏与卡片底色）。
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button class={btn} onclick={() => void applyTheme("dark")}>深色</button>
          <button class={btn} onclick={() => void applyTheme("light")}>浅色</button>
          <button class={btn} onclick={() => void applyTheme(null)}>跟随系统</button>
        </div>
        {#if themeErr}
          <pre class={out}>{themeErr}</pre>
        {:else}
          <pre class={out}>当前主题：{theme ?? "跟随系统"}</pre>
        {/if}
      </section>
    {:else if tab === "system"}
      <!-- 标签五：系统。os.info 读取、fs 临时目录读写、{#await import} 懒加载。 -->
      <section class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]">
        <h2 class="m-0 text-base font-semibold">系统信息（os.info）</h2>
        <p class="mt-1.5 leading-relaxed {muted}">
          组件挂载时调用一次 plugin:os|info，结果写入 $state，模板按 loading、error、data 三态渲染。
        </p>
        {#if osLoading}
          <p class="mt-4 {muted}">读取中</p>
        {:else if osErr}
          <pre class={out}>{osErr}</pre>
        {:else if osInfo}
          <pre class={out}>{`platform: ${osInfo.platform}
arch: ${osInfo.arch}
hostname: ${osInfo.hostname}
version: ${osInfo.version}`}</pre>
        {/if}
      </section>
      <section class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]">
        <h2 class="m-0 text-base font-semibold">文件读写（$TMP）</h2>
        <p class="mt-1.5 leading-relaxed {muted}">
          fs.writeText 与 fs.readText 在系统临时目录做一次往返；后端 fs scope 只放行 $TMP/**。
        </p>
        <button class="mt-4 {btnPrimary}" disabled={fsBusy} onclick={() => void runFsRoundTrip()}>
          写入并读回
        </button>
        {#if fsOut}<pre class={out}>{fsOut}</pre>{/if}
      </section>
      <section class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]">
        <h2 class="m-0 text-base font-semibold">懒加载（{"{#await import}"}）</h2>
        <p class="mt-1.5 leading-relaxed {muted}">
          LazyPane 经 <code>{"{#await …}"} </code>块动态加载（动态 import）；IIFE 打包时动态 import 会被内联进主包。
        </p>
        {#await import("./LazyPane.svelte") then { default: Lazy }}
            <Lazy />
        {/await}
      </section>
    {/if}
  </main>
</div>
