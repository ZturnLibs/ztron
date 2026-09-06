<script setup lang="ts">
/**
 * Ztron Vue Demo：Vue 3 + Tailwind CSS v4 跑在 Ztron 管线上的活文档。
 *
 * 五个标签页分别演示：调用后端命令、事件订阅、Channel 流式推送、窗口主题
 * （与 Tailwind dark: 变体联动）、系统集成（os/fs/defineAsyncComponent 懒加载）。
 * 结构与 examples/react-demo 的 App.tsx 同构，写法换成 Vue 3 惯用法：
 * <script setup> + ref + composables（见 ./composables.ts）。
 * 样式只用 Tailwind 原子类（含任意值），不引入组件库；深色为默认观感，
 * 明暗两套都按 showcase 的调色板（#0a0c10 底、#11141b 面、紫青渐变点缀）。
 */
import { defineAsyncComponent, onMounted, ref } from "vue";
import {
  fs,
  getCurrentWebviewWindow,
  invoke,
  path,
  type OsInfo,
} from "@zturnlibs/ztron-api";
import { useChannelStream, useInvoke, useListen } from "./composables";

const LazyPane = defineAsyncComponent(() => import("./LazyPane.vue"));

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
  "border-b-2 border-transparent px-3.5 py-1.5 text-[13px] hover:text-[#1a1d26] " + muted;

const tab = ref<TabKey>("backend");

// 冒烟上报：挂载即报告 VUE_DEMO_OK。这条 invoke 走通即证明：
// Vue SFC 转换成功（模板出错页面会白屏报错）、bridge 已注入、IPC 往返可用。
onMounted(() => {
  void invoke("vue-demo:report", { received: "VUE_DEMO_OK" }).catch(() => {});
});

/* ---- 标签一：调用后端 ---- */
const name = ref("Ztron");
const greetOut = ref("");
const greetBusy = ref(false);

async function runGreet() {
  greetBusy.value = true;
  try {
    greetOut.value = await invoke<string>("vue-demo:greet", { name: name.value });
  } catch (err) {
    greetOut.value = `调用失败：${err instanceof Error ? err.message : String(err)}`;
  } finally {
    greetBusy.value = false;
  }
}

/* codegen 类型绑定的形状说明。src/ 位于 frontend root 之外，Vite 的 dev
   server 与 build 都只服务 root 内的模块，所以运行时不能直接 import
   "../../src/ztron-commands.js"；页面用 invoke<string> 直调，类型绑定作为
   业务工程的参考形状展示（把 frontend root 指到仓库根的项目可直接引用）。 */
const TYPED_BINDING_SNIPPET = `// codegen 产物 src/ztron-commands.ts 提供类型化 invoke：
import { invoke as typed } from "../../src/ztron-commands.js";

const msg = await typed("vue-demo:greet", { name: "Ztron" });
//     ^ string，命令名或参数拼错会在类型检查期报错

// 注：src/ 位于 frontend root 之外，Vite 无法直接引用该模块，
// 故本页运行时用 invoke<string>("vue-demo:greet", ...) 直调，
// 类型绑定的形状如上，供业务工程参考。`;

/* ---- 标签二：事件（useListen：onMounted 订阅，onUnmounted unlisten） ---- */
const ticks = ref<string[]>([]);

useListen<{ n: number }>("vue-demo:tick", (e) => {
  ticks.value = [...ticks.value, `tick ${e.payload.n}`];
});

/* ---- 标签三：Channel（useChannelStream 消费 1..8） ---- */
const stream = useChannelStream<number>("vue-demo:stream");

/* ---- 标签四：主题 ---- */
const theme = ref<string | null>(null);
const themeErr = ref("");

async function refreshTheme() {
  try {
    theme.value = await getCurrentWebviewWindow().getTheme();
  } catch (e) {
    themeErr.value = e instanceof Error ? e.message : String(e);
  }
}

async function applyTheme(t: "dark" | "light" | null) {
  themeErr.value = "";
  try {
    await getCurrentWebviewWindow().setTheme(t);
    theme.value = await getCurrentWebviewWindow().getTheme();
  } catch (e) {
    themeErr.value = e instanceof Error ? e.message : String(e);
  }
}

onMounted(() => {
  void refreshTheme();
});

/* ---- 标签五：系统 ---- */
const osInfo = useInvoke<OsInfo>("plugin:os|info", {});
const fsOut = ref("");
const fsBusy = ref(false);

async function runFsRoundTrip() {
  fsBusy.value = true;
  try {
    const tmp = await path.tempDir();
    const file = `${tmp}/ztron-vue-demo.txt`;
    const stamp = `Vue demo 写于 ${new Date().toLocaleString()}`;
    await fs.writeText(file, stamp);
    const back = await fs.readText(file);
    fsOut.value = `写入 ${file}\n读回一致：${back === stamp}\n内容：${back}`;
  } catch (err) {
    fsOut.value = `失败：${err instanceof Error ? err.message : String(err)}`;
  } finally {
    fsBusy.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#f2f3f7] text-[#1a1d26] dark:bg-[#0a0c10] dark:text-[#e6eaf2]">
    <header class="sticky top-0 z-10 border-b border-black/10 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-[#11141b]/95">
      <div class="px-6 pt-4">
        <h1 class="bg-gradient-to-r from-[#8b5cf6] to-[#22d3ee] bg-clip-text text-lg font-bold text-transparent">
          Ztron Vue Demo
        </h1>
        <p class="mt-0.5 text-xs" :class="muted">
          Vue 3 + Tailwind CSS v4 运行在 Ztron 管线上：dev HMR、IIFE 打包、IPC 全链路。
        </p>
      </div>
      <nav class="flex gap-1 px-4 pt-2">
        <button
          v-for="t in TABS"
          :key="t.key"
          :class="tab === t.key ? tabOn : tabOff"
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
      </nav>
    </header>

    <main class="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
      <!-- 标签一：调用后端。codegen 类型绑定形状 + 运行时 invoke 直调。 -->
      <template v-if="tab === 'backend'">
        <section class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]">
          <h2 class="m-0 text-base font-semibold">调用后端命令</h2>
          <p class="mt-1.5 leading-relaxed" :class="muted">
            输入名字，前端经 IPC 调用后端注册的 vue-demo:greet，返回拼接问候语。
          </p>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <input v-model="name" class="w-56 rounded-lg border border-black/10 bg-[#eef0f4] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#22d3ee] dark:border-white/10 dark:bg-[#0d1017] dark:text-[#e6eaf2]" placeholder="名字" />
            <button :class="btnPrimary" :disabled="greetBusy" @click="void runGreet()">
              问候
            </button>
          </div>
          <pre v-if="greetOut" :class="out">{{ greetOut }}</pre>
        </section>
        <section class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]">
          <h2 class="m-0 text-base font-semibold">codegen 类型绑定</h2>
          <pre class="mt-4 overflow-x-auto rounded-lg border border-black/10 bg-[#eef0f4] px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-[#5b6472] dark:border-white/10 dark:bg-[#0d1017] dark:text-[#9aa3b2]">{{ TYPED_BINDING_SNIPPET }}</pre>
        </section>
      </template>

      <!-- 标签二：事件。useListen 订阅 vue-demo:tick，按钮触发后端连发 3 个 tick。 -->
      <section
        v-else-if="tab === 'events'"
        class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]"
      >
        <h2 class="m-0 text-base font-semibold">后端事件（listen）</h2>
        <p class="mt-1.5 leading-relaxed" :class="muted">
          useListen 订阅 vue-demo:tick；后端收到调用后以 120ms 间隔连发 3 个事件，卸载时在 onUnmounted 自动 unlisten。
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button :class="btnPrimary" @click="void invoke('vue-demo:emit-ticks').catch(() => {})">
            触发 emit-ticks
          </button>
          <button v-if="ticks.length > 0" :class="btn" @click="ticks = []">
            清空记录
          </button>
        </div>
        <ul
          v-if="ticks.length > 0"
          class="mt-3 flex list-none flex-col gap-1.5 p-0 font-mono text-[12.5px]"
        >
          <li
            v-for="(t, i) in ticks"
            :key="`${i}-${t}`"
            class="rounded-lg border border-black/10 bg-[#eef0f4] px-3 py-1.5 dark:border-white/10 dark:bg-[#0d1017]"
          >
            {{ t }}
          </li>
        </ul>
        <p v-else class="mt-3" :class="muted">暂无事件，点上面的按钮触发。</p>
      </section>

      <!-- 标签三：Channel。useChannelStream 消费 vue-demo:stream 推送的 1..8。 -->
      <section
        v-else-if="tab === 'channel'"
        class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]"
      >
        <h2 class="m-0 text-base font-semibold">Channel 流式推送</h2>
        <p class="mt-1.5 leading-relaxed" :class="muted">
          点击后前端创建 Channel 并调用 vue-demo:stream，后端向通道同步推送 1 到 8，结束后 end 关闭通道；消息按到达顺序累积进列表。
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button :class="btnPrimary" :disabled="stream.status.value === 'running'" @click="stream.start()">
            {{ stream.status.value === "running" ? "推送中" : "开始推送" }}
          </button>
          <span :class="muted">
            状态：{{ stream.status.value }}{{ stream.error.value ? `，错误：${stream.error.value}` : "" }}
          </span>
        </div>
        <ol
          v-if="stream.messages.value.length > 0"
          class="mt-3 flex list-none flex-wrap gap-2 p-0 font-mono text-[12.5px]"
        >
          <li
            v-for="(n, i) in stream.messages.value"
            :key="`${i}-${n}`"
            class="rounded-lg border border-[#22d3ee]/40 bg-[#eef0f4] px-3 py-1.5 dark:border-[#22d3ee]/30 dark:bg-[#0d1017]"
          >
            {{ n }}
          </li>
        </ol>
      </section>

      <!-- 标签四：主题。setTheme 切换窗口外观，Tailwind 的 dark: 变体随之翻转。 -->
      <section
        v-else-if="tab === 'theme'"
        class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]"
      >
        <h2 class="m-0 text-base font-semibold">窗口主题</h2>
        <p class="mt-1.5 leading-relaxed" :class="muted">
          三个按钮分别 setTheme 为深色、浅色、跟随系统。窗口外观即 WKWebView 的 prefers-color-scheme，Tailwind 的 dark: 变体与它同源：切换后本页配色立即翻转（观察标题栏与卡片底色）。
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button :class="btn" @click="void applyTheme('dark')">深色</button>
          <button :class="btn" @click="void applyTheme('light')">浅色</button>
          <button :class="btn" @click="void applyTheme(null)">跟随系统</button>
        </div>
        <pre v-if="themeErr" :class="out">{{ themeErr }}</pre>
        <pre v-else :class="out">当前主题：{{ theme ?? "跟随系统" }}</pre>
      </section>

      <!-- 标签五：系统。os.info 声明式读取、fs 临时目录读写、defineAsyncComponent 懒加载。 -->
      <template v-else-if="tab === 'system'">
        <section class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]">
          <h2 class="m-0 text-base font-semibold">系统信息（os.info）</h2>
          <p class="mt-1.5 leading-relaxed" :class="muted">
            useInvoke 声明式调用 plugin:os|info，setup 时自动执行，返回 loading、error、data 三态。
          </p>
          <p v-if="osInfo.loading.value" class="mt-4" :class="muted">读取中</p>
          <pre v-else-if="osInfo.error.value" :class="out">{{ osInfo.error.value }}</pre>
          <pre v-else-if="osInfo.data.value" :class="out">{{ `platform: ${osInfo.data.value?.platform}
arch: ${osInfo.data.value?.arch}
hostname: ${osInfo.data.value?.hostname}
version: ${osInfo.data.value?.version}` }}</pre>
        </section>
        <section class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]">
          <h2 class="m-0 text-base font-semibold">文件读写（$TMP）</h2>
          <p class="mt-1.5 leading-relaxed" :class="muted">
            fs.writeText 与 fs.readText 在系统临时目录做一次往返；后端 fs scope 只放行 $TMP/**。
          </p>
          <button :class="btnPrimary" class="mt-4" :disabled="fsBusy" @click="void runFsRoundTrip()">
            写入并读回
          </button>
          <pre v-if="fsOut" :class="out">{{ fsOut }}</pre>
        </section>
        <section class="rounded-[10px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#11141b]">
          <h2 class="m-0 text-base font-semibold">懒加载（defineAsyncComponent）</h2>
          <p class="mt-1.5 leading-relaxed" :class="muted">
            LazyPane 经 defineAsyncComponent 动态 import 加载；IIFE 打包时动态 import 会被内联进主包。
          </p>
          <LazyPane />
        </section>
      </template>
    </main>
  </div>
</template>
