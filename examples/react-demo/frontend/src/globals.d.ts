declare module "*.css";

// Vite 开发期 HMR 上下文的最小类型面（仅 App.tsx 的 Fast Refresh 诊断用到）。
// vite/client 的类型不随 CLI 暴露给示例工程，这里就地声明。
interface ImportMeta {
  readonly hot?: {
    accept(): void;
    decline(): void;
    dispose(cb: (data: unknown) => void): void;
    invalidate(): void;
    on<T = unknown>(event: string, handler: (data: T) => void): void;
    send(event: string, data?: unknown): void;
  };
}
