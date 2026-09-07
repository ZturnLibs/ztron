/**
 * Official Vue 3 composables for Ztron — `@zturnlibs/ztron-vue`.
 *
 * Moved/hardened from the `examples/vue-demo` seed
 * (`frontend/src/composables.ts`). Convention: subscriptions and requests
 * are issued when the composable runs (component `setup()` or a bare
 * `effectScope`) and finalized via `onScopeDispose` — the Vue-docs-
 * recommended registration for composables, which also makes them testable
 * headless. Re-runs and scope disposal invalidate in-flight work, so late
 * responses never write into a disposed scope.
 */
import { onScopeDispose, ref, shallowRef, watch } from "vue";
import type { Ref, ShallowRef } from "vue";
import {
  Channel,
  invoke,
  listen,
  type EventCallback,
  type InvokeArgs,
  type UnlistenFn,
} from "@zturnlibs/ztron-api";

export type { EventCallback, InvokeArgs, UnlistenFn };

/** Converts an unknown rejection into a displayable message. */
function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** State snapshot returned by {@linkcode useInvoke} (three refs). */
export interface InvokeState<T> {
  data: ShallowRef<T | null>;
  error: Ref<string | null>;
  loading: Ref<boolean>;
}

/**
 * Declarative backend command call: runs once when the composable is
 * created and re-runs when `cmd` changes or when reactive `args` change by
 * value (plain object args run once: the serialized key only changes for
 * reactive args). Late responses are discarded after a re-run or scope
 * disposal. Returns `{ data, error, loading }` refs for three-state
 * rendering.
 */
export function useInvoke<T>(cmd: string, args?: InvokeArgs): InvokeState<T> {
  // shallowRef: the generic payload must not be deeply unwrapped (ref's
  // UnwrapRefSimple breaks T).
  const data = shallowRef<T | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(true);
  // Args participate in the watch sources by value: recomputing the JSON
  // key inside the getter makes reactive args re-run on value change, while
  // unstable object identities of plain args never cause extra re-runs.
  watch(
    [() => cmd, () => JSON.stringify(args ?? {})],
    ([nextCmd, nextArgsKey], _prev, onCleanup) => {
      let cancelled = false;
      // Watcher stop (scope disposal included) or re-run sets the flag; a
      // late response no longer writes.
      onCleanup(() => {
        cancelled = true;
      });
      loading.value = true;
      error.value = null;
      invoke<T>(nextCmd, JSON.parse(nextArgsKey) as InvokeArgs).then(
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
 * Subscribe to a backend event: `listen` starts when the composable runs
 * and `unlisten` is registered on `onScopeDispose`, so it fires on
 * component unmount and on `effectScope.stop()` alike. If the scope dies
 * before `listen` resolves, the listener is unregistered as soon as it
 * arrives.
 */
export function useListen<T>(event: string, handler: EventCallback<T>): void {
  let disposed = false;
  let unlisten: UnlistenFn | undefined;
  void listen<T>(event, handler).then((un) => {
    if (disposed) {
      void un();
      return;
    }
    unlisten = un;
  });
  onScopeDispose(
    () => {
      disposed = true;
      void unlisten?.();
    },
    // failSilently: calling outside any scope stays a no-op instead of
    // warning (cleanup is then the caller's responsibility).
    true,
  );
}

/** Status of one {@linkcode useChannelStream} run. */
export type StreamStatus = "idle" | "running" | "done" | "error";

export interface ChannelStreamState<T> {
  /** Messages accumulated in arrival order. */
  messages: ShallowRef<T[]>;
  status: Ref<StreamStatus>;
  error: Ref<string | null>;
  /** Starts one streaming run; a newer run (or scope disposal) invalidates
   * the previous run's pending messages. */
  start: () => void;
}

/**
 * Consume a streaming command over a Channel: `start()` creates the channel
 * and invokes `cmd` with `{ ...args, ch }`; channel messages are appended in
 * arrival order. Scope disposal (or a newer run) invalidates the in-flight
 * run, so late channel messages never reach the disposed component.
 */
export function useChannelStream<T = unknown>(
  cmd: string,
  args?: InvokeArgs,
): ChannelStreamState<T> {
  // shallowRef: same as useInvoke, no deep unwrap of generic messages.
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

  // Scope disposal: invalidate any in-flight run so late channel messages
  // never reach the disposed component.
  onScopeDispose(
    () => {
      runId += 1;
    },
    true,
  );

  return { messages, status, error, start };
}
