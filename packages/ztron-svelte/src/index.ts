/**
 * Official Svelte 5 listeners for Ztron — `@zturnlibs/ztron-svelte`.
 *
 * Moved/hardened from the `examples/svelte-demo` seed
 * (`frontend/src/lib/listeners.ts`). Plain `.ts`, no runes: only Svelte's
 * lifecycle hooks are used, so the module works from component
 * initialisation without a preprocessor. The subscription race (cleanup
 * wins against the pending `listen` promise) is centralized in
 * {@linkcode subscribe}, a plain function that is usable — and testable —
 * outside any component; {@linkcode listenOnMount} binds it to the
 * component lifetime.
 */
import { onDestroy } from "svelte";
import {
  listen,
  type EventCallback,
  type UnlistenFn,
} from "@zturnlibs/ztron-api";

export type { EventCallback, UnlistenFn };

/**
 * Subscribe to a backend event without component context: returns the
 * cleanup synchronously and makes it win the race against the pending
 * `listen` promise. If the cleanup runs before the subscription resolves,
 * the listener is unregistered as soon as it arrives (no leak); calling the
 * cleanup after resolution unlistens immediately. Calling it more than once
 * is a no-op.
 */
export function subscribe<T>(
  event: string,
  handler: EventCallback<T>,
): () => void {
  let disposed = false;
  let unlisten: UnlistenFn | undefined;
  void listen<T>(event, handler).then((un) => {
    if (disposed) {
      void un();
      return;
    }
    unlisten = un;
  });
  return () => {
    if (disposed) return;
    disposed = true;
    void unlisten?.();
  };
}

/**
 * Subscribe for a Svelte component's lifetime: the subscription starts
 * during component initialisation (Svelte runs init code at mount time) and
 * the cleanup returned by {@linkcode subscribe} runs at `onDestroy`, so the
 * listener never outlives the component. Must be called during component
 * initialisation, i.e. from a component's top-level `<script>` (see the
 * svelte-demo); outside that context Svelte's `onDestroy` throws.
 */
export function listenOnMount<T>(
  event: string,
  handler: EventCallback<T>,
): void {
  const unlisten = subscribe(event, handler);
  onDestroy(() => void unlisten());
}
