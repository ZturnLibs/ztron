/**
 * Ztron Vite plugin — injects the `__TAURI_INTERNALS__` bootstrap into the
 * served HTML so `@ztron/api` works inside a Vite dev server page.
 */
import type { Plugin } from "vite";
import { buildInitScript } from "@ztron/inject";

export function ztronVitePlugin(
  invokeKey: string,
  metadata?: Record<string, unknown>,
): Plugin {
  const bootstrap = buildInitScript({ invokeKey, metadata });
  return {
    name: "ztron:internals",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          children: bootstrap,
          injectTo: "head-prepend" as const,
        },
      ];
    },
  };
}
