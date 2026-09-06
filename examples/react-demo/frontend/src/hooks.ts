/**
 * Ztron React hooks：未来 @zturnlibs/ztron-react 包的种子实现。
 *
 * 约定：订阅与请求只在 effect 中发起，并在清理函数里收尾，保证
 * StrictMode 双挂载（mount -> cleanup -> mount）下无泄漏、无重复回调。
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

/** useInvoke 的状态快照。 */
export interface InvokeState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * 声明式调用后端命令：挂载或 args 变化时执行一次，卸载后丢弃结果。
 * 返回 { data, error, loading }，调用方按声明式渲染即可。
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
  // args 按值参与依赖：对象引用不稳定也不会造成多余重跑。
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
 * 订阅后端事件：effect 内 await listen，清理时 unlisten。
 * StrictMode 双挂载安全：若清理先于 listen 兑现，拿到监听后立即注销。
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

/** 一次 Channel 流式调用的状态。 */
export type StreamStatus = "idle" | "running" | "done" | "error";

export interface ChannelStreamState<T> {
  /** 按到达顺序累积的消息。 */
  messages: T[];
  status: StreamStatus;
  error: string | null;
  /** 启动一次流式调用；重复调用开启新一轮并丢弃上一轮消息。 */
  start: () => void;
}

/**
 * 以 Channel 消费流式命令：start() 时创建通道并 invoke(cmd, { ...args, ch })，
 * 通道消息按到达顺序写入 state；卸载后旧通道的消息不再写入已卸载的组件。
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

  // 卸载清理：作废进行中的一轮，避免晚到的通道消息写入已卸载组件。
  useEffect(
    () => () => {
      runIdRef.current += 1;
    },
    [],
  );

  return { messages, status, error, start };
}
