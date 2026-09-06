<script setup lang="ts">
/**
 * defineAsyncComponent 动态导入的目标组件（App.vue 里
 * `defineAsyncComponent(() => import("./LazyPane.vue"))`）。
 *
 * 打包事实：`ztron build` 的前端产物是单文件 IIFE，动态 import 会被 Rollup
 * 内联进主包，本组件因此随主 bundle 一起下发（可用产物内的 VUE_LAZY_OK
 * 标记字符串验证）。剪贴板走 core 内建的 plugin:clipboard 命令，无需额外插件。
 */
import { ref } from "vue";
import { clipboard } from "@zturnlibs/ztron-api";

const btn =
  "inline-flex items-center rounded-lg border border-black/10 bg-[#f7f8fa] px-3.5 py-1.5 text-[13px] transition-colors hover:border-black/20 disabled:cursor-default disabled:opacity-50 dark:border-white/10 dark:bg-[#161a23] dark:text-[#e6eaf2] dark:hover:border-white/20";
const out =
  "mt-3 w-full whitespace-pre-wrap break-all rounded-lg border border-black/10 bg-[#eef0f4] px-3 py-2.5 font-mono text-[12.5px] dark:border-white/10 dark:bg-[#0d1017]";

const result = ref("");
const busy = ref(false);

async function roundTrip() {
  busy.value = true;
  try {
    const stamp = `VUE_LAZY_OK ${new Date().toISOString()}`;
    await clipboard.writeText(stamp);
    const back = await clipboard.readText();
    result.value =
      back === stamp
        ? `剪贴板往返一致：${back}`
        : `不一致，写入 ${stamp}，读到 ${back}`;
  } catch (err) {
    result.value = `失败：${err instanceof Error ? err.message : String(err)}`;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mt-1">
    <p class="text-[13px] leading-relaxed text-[#5b6472] dark:text-[#9aa3b2]">
      本组件经 defineAsyncComponent 动态加载，演示 IIFE 打包下动态 import 的内联；
      按钮做一次剪贴板写入再读回的往返。
    </p>
    <button :class="btn" class="mt-3" :disabled="busy" @click="void roundTrip()">
      剪贴板写入并读回
    </button>
    <pre v-if="result" :class="out">{{ result }}</pre>
  </div>
</template>
