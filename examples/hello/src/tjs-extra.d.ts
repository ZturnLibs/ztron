declare const tjs: {
  env: Record<string, string | undefined>;
  tmpDir: string;
  homeDir: string;
  writeFile(p: string, d: string | Uint8Array): Promise<void>;
  readFile(p: string): Promise<Uint8Array>;
  stat(p: string): Promise<{ size: number; isFile: boolean; isDirectory: boolean }>;
  readDir(
    p: string,
  ): Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean }>>;
  remove(p: string): Promise<void>;
  serve(options: {
    port: number;
    listenIp?: string;
    fetch: (req: { url: string; text(): Promise<string> }) => Promise<Response>;
  }): { port: number; close(): void };
  exit(code?: number): void;
};
