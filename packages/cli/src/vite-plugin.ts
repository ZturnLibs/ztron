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
    configureServer: ((server: {
      middlewares: { use: (m: unknown) => void };
    }) => {
      server.middlewares.use(
        (
          _req: unknown,
          res: { setHeader: (k: string, v: string) => void },
          next: () => void,
        ) => {
          res.setHeader("Access-Control-Allow-Origin", "*");
          next();
        },
      );
    }) as never,
    transformIndexHtml(html: string): string {
      // 1. Strip crossorigin + type="module" from scripts (IIFE bundle,
      //    file:// has null origin so module scripts fail CORS).
      let out = html.replace(
        /<script type="module"(?:\s+crossorigin)? src="([^"]+)"><\/script>/g,
        (_, src: string) => `<script src="${src}"></script>`,
      );
      // 2. Inject the __TAURI_INTERNALS__ bootstrap IMMEDIATELY after <head>
      //    so it runs before the app bundle script.
      if (!out.includes("__TAURI_INTERNALS__")) {
        out = out.replace(/<head>/, `<head><script>${bootstrap}</script>`);
      }
      return out;
    },
  };
}
