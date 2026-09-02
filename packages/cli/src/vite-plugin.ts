/**
 * Ztron Vite plugin — injects the `__ZTRON_INTERNALS__` bootstrap into the
 * served HTML so `@ztron/api` works inside a Vite page.
 *
 * - dev server: keep ESM `type="module"` (strip `crossorigin`), add CORS
 *   headers so WKWebView can load modules from http://localhost.
 * - build: Vite emits an IIFE bundle, so rewrite module tags to classic
 *   `<script>` (file:// has a null origin; module scripts fail CORS).
 */
import type { Plugin } from "vite";
import { buildInitScript } from "@ztron/inject";

export function ztronVitePlugin(
  invokeKey: string,
  metadata?: Record<string, unknown>,
): Plugin {
  const bootstrap = buildInitScript({ invokeKey, metadata });
  let isDev = false;
  return {
    name: "ztron:internals",
    configureServer: ((server: {
      middlewares: { use: (m: unknown) => void };
    }) => {
      isDev = true;
      // Add CORS first (before vite's own middleware) so WKWebView can load
      // ESM modules from http://localhost.
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
      let out: string;
      if (isDev) {
        // Dev: keep ESM, just drop the crossorigin attribute.
        out = html.replace(
          /<script type="module" crossorigin /g,
          '<script type="module" ',
        );
      } else {
        // Build: the bundle is IIFE, so emit a classic script.
        out = html.replace(
          /<script type="module"(?:\s+crossorigin)? src="([^"]+)"><\/script>/g,
          (_, src: string) => `<script src="${src}"></script>`,
        );
      }
      // Inject the __ZTRON_INTERNALS__ bootstrap immediately after <head> so
      // it runs before the app bundle.
      if (!out.includes("__ZTRON_INTERNALS__")) {
        out = out.replace(/<head>/, `<head><script>${bootstrap}</script>`);
      }
      return out;
    },
  };
}
