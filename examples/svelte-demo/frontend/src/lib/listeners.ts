/**
 * Ztron Svelte 监听助手：未来 @zturnlibs/ztron-svelte 包的种子实现。
 *
 * 约定：订阅在 onMount 发起、unlisten 在 onDestroy 收尾（React effect
 * cleanup 的 Svelte 对应物）；若卸载先于 listen 兑现，拿到监听后立即注销，
 * 组件销毁后无泄漏、无重复回调。仅用 svelte 的生命周期钩子，不涉及 runes，
 * 因此放在普通 .ts 模块即可（runes 只能在 .svelte / .svelte.ts 中使用）。
 */
import { onDestroy, onMount } from "svelte";
import {
  listen,
  type EventCallback,
  type UnlistenFn,
} from "@zturnlibs/ztron-api";

/**
 * 订阅后端事件：onMount 内 await listen，onDestroy 时 unlisten。
 * 若卸载先于 listen 兑现，拿到监听后立即注销，销毁无泄漏。
 */
export function listenOnMount<T>(event: string, handler: EventCallback<T>): void {
  let disposed = false;
  let unlisten: UnlistenFn | undefined;
  onMount(() => {
    void listen<T>(event, handler).then((un) => {
      if (disposed) {
        void un();
        return;
      }
      unlisten = un;
    });
  });
  onDestroy(() => {
    disposed = true;
    void unlisten?.();
  });
}
