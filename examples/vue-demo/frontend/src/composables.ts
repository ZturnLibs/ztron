/**
 * Ztron Vue composables：未来 @zturnlibs/ztron-vue 包的种子实现。
 *
 * 约定：订阅在 onMounted 发起、unlisten 在 onUnmounted 收尾（React effect
 * cleanup 的 Vue 对应物）；请求型 composable 用 watch 的 onCleanup 与
 * onScopeDispose 作废晚到响应，组件卸载后无泄漏、无重复回调。
 */
import { onMounted, onScopeDispose, onUnmounted, ref, shallowRef, watch } from "vue";
import type { Ref, ShallowRef } from "vue";
import {
  Channel,
  invoke,
  listen,
  type EventCallback,
  type InvokeArgs,
  type UnlistenFn,
} from "@zturnlibs/ztron-api";

/** 把未知错误转成可展示的消息。 */
function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** useInvoke 的状态快照（三个 ref，与 react-demo 的 hooks 同构）。 */
export interface InvokeState<T> {
  data: ShallowRef<T | null>;
  error: Ref<string | null>;
  loading: Ref<boolean>;
}

/**
 * 声明式调用后端命令：setup 时执行一次，卸载后丢弃结果。
 * 返回三个 ref：{ data, error, loading }，模板按三态渲染即可。
 */
export function useInvoke<T>(cmd: string, args?: InvokeArgs): InvokeState<T> {
  // shallowRef：泛型载荷不做深层响应式解包（ref 的 UnwrapRefSimple 会破坏 T）。
  const data = shallowRef<T | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(true);
  // args 按值参与依赖：对象引用不稳定也不会造成多余重跑。
  const argsKey = JSON.stringify(args ?? {});
  watch(
    [() => cmd, argsKey],
    (_next, _prev, onCleanup) => {
      let cancelled = false;
      // watch 停止（含组件卸载）或重跑时置位，晚到的响应不再写入。
      onCleanup(() => {
        cancelled = true;
      });
      loading.value = true;
      error.value = null;
      invoke<T>(cmd, JSON.parse(argsKey) as InvokeArgs).then(
        (result) => {
          if (!cancelled) {
            data.value = result;
            loading.value = false;
          }
        },
        (err: unknown) => {
          if (!cancelled) {
            data.value = null;
            error.value = errMessage(err);
            loading.value = false;
          }
        },
      );
    },
    { immediate: true },
  );
  return { data, error, loading };
}

/**
 * 订阅后端事件：onMounted 内 await listen，onUnmounted 时 unlisten。
 * 若卸载先于 listen 兑现，拿到监听后立即注销，卸载无泄漏。
 */
export function useListen<T>(event: string, handler: EventCallback<T>): void {
  let disposed = false;
  let unlisten: UnlistenFn | undefined;
  onMounted(() => {
    void listen<T>(event, handler).then((un) => {
      if (disposed) {
        void un();
        return;
      }
      unlisten = un;
    });
  });
  onUnmounted(() => {
    disposed = true;
    void unlisten?.();
  });
}

/** 一次 Channel 流式调用的状态。 */
export type StreamStatus = "idle" | "running" | "done" | "error";

/**
 * 以 Channel 消费流式命令：start() 时创建通道并 invoke(cmd, { ...args, ch })，
 * 通道消息按到达顺序写入 messages；卸载后作废进行中的一轮，晚到的通道
 * 消息不再写入已卸载的组件。
 */
export function useChannelStream<T = unknown>(cmd: string, args?: InvokeArgs) {
  // shallowRef：同 useInvoke，泛型消息数组不做深层解包。
  const messages = shallowRef<T[]>([]);
  const status = ref<StreamStatus>("idle");
  const error = ref<string | null>(null);
  let runId = 0;

  function start(): void {
    const id = ++runId;
    messages.value = [];
    error.value = null;
    status.value = "running";
    const ch = new Channel<T>((msg) => {
      if (runId !== id) return;
      messages.value = [...messages.value, msg];
    });
    void invoke<string>(cmd, { ...(args ?? {}), ch } as InvokeArgs).then(
      () => {
        if (runId === id) status.value = "done";
      },
      (err: unknown) => {
        if (runId !== id) return;
        error.value = errMessage(err);
        status.value = "error";
      },
    );
  }

  // 卸载清理：作废进行中的一轮。
  onScopeDispose(() => {
    runId += 1;
  });

  return { messages, status, error, start };
}
