declare const tjs: {
  env: Record<string, string | undefined>;
  tmpDir: string;
  writeFile(p: string, d: string | Uint8Array): Promise<void>;
  readFile(p: string): Promise<Uint8Array>;
  serve(options: {
    port: number;
    listenIp?: string;
    fetch: (req: { url: string; text(): Promise<string> }) => Promise<Response>;
  }): { port: number; close(): void };
  exit(code?: number): void;
};
