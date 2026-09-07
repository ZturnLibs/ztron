/**
 * Official React hooks for Ztron — `@zturnlibs/ztron-react`.
 *
 * Moved/hardened from the `examples/react-demo` seed (`frontend/src/hooks.ts`).
 * Convention: subscriptions and requests are only issued inside effects and
 * always finalized in the cleanup function, so React 19 StrictMode's double
 * mount (mount -> cleanup -> mount) leaks nothing and fires no duplicate
 * callbacks.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Channel,
  invoke,
  listen,
  type EventCallback,
  type InvokeArgs,
  type UnlistenFn,
} from "@zturnlibs/ztron-api";

export type { EventCallback, InvokeArgs, UnlistenFn };

/** State snapshot returned by {@linkcode useInvoke}. */
export interface InvokeState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Declarative backend command call: runs once on mount or when `args`
 * change (compared by value), discards late responses after unmount or
 * arg churn. Returns `{ data, error, loading }` for direct rendering.
 */
export function useInvoke<T>(
  cmd: string,
  args?: InvokeArgs,
): InvokeState<T> {
  const [state, setState] = useState<InvokeState<T>>({
    data: null,
    error: null,
    loading: true,
  });
  // Args participate in deps by value: unstable object identities do not
  // cause extra re-runs.
  const argsKey = JSON.stringify(args ?? {});
  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    invoke<T>(cmd, JSON.parse(argsKey) as InvokeArgs).then(
      (data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      },
      (err: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            error: err instanceof Error ? err.message : String(err),
            loading: false,
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [cmd, argsKey]);
  return state;
}

/**
 * Subscribe to a backend event: `listen` is awaited inside the effect and
 * `unlisten` runs in the cleanup. StrictMode double-mount safe: if cleanup
 * happens before `listen` resolves, the listener is unregistered as soon as
 * it arrives.
 */
export function useListen<T>(event: string, handler: EventCallback<T>): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen<T>(event, (e) => handlerRef.current(e)).then((un) => {
      if (disposed) {
        void un();
        return;
      }
      unlisten = un;
    });
    return () => {
      disposed = true;
      void unlisten?.();
    };
  }, [event]);
}

/** Status of one {@linkcode useChannelStream} run. */
export type StreamStatus = "idle" | "running" | "done" | "error";

export interface ChannelStreamState<T> {
  /** Messages accumulated in arrival order. */
  messages: T[];
  status: StreamStatus;
  error: string | null;
  /** Starts one streaming run; calling again opens a new run and drops the
   * previous run's pending messages. */
  start: () => void;
}

/**
 * Consume a streaming command over a Channel: `start()` creates the channel
 * and invokes `cmd` with `{ ...args, ch }`; channel messages are appended to
 * state in arrival order. After unmount (or a newer run) late messages of a
 * stale run are dropped instead of reaching the unmounted component.
 */
export function useChannelStream<T = unknown>(
  cmd: string,
  args?: InvokeArgs,
): ChannelStreamState<T> {
  const [messages, setMessages] = useState<T[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const start = useCallback(() => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setMessages([]);
    setError(null);
    setStatus("running");
    const ch = new Channel<T>((msg) => {
      if (runIdRef.current !== runId) return;
      setMessages((prev) => [...prev, msg]);
    });
    void invoke<string>(cmd, { ...(args ?? {}), ch } as InvokeArgs).then(
      () => {
        if (runIdRef.current === runId) setStatus("done");
      },
      (err: unknown) => {
        if (runIdRef.current !== runId) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      },
    );
  }, [cmd, args]);

  // Unmount cleanup: invalidate any in-flight run so late channel messages
  // never reach the unmounted component.
  useEffect(
    () => () => {
      runIdRef.current += 1;
    },
    [],
  );

  return { messages, status, error, start };
}
