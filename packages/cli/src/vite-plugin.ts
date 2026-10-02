/**
 * Ztron Vite plugin — injects the `__ZTRON_INTERNALS__` bootstrap into the
 * served HTML so `@zturnlibs/ztron-api` works inside a Vite page.
 *
 * - dev server: keep ESM `type="module"` (strip `crossorigin`), add CORS
 *   headers so WKWebView can load modules from http://localhost.
 * - build: Vite emits an IIFE bundle, so rewrite module tags to classic
 *   `<script>` (file:// has a null origin; module scripts fail CORS).
 */
import type { Plugin } from "vite";
import { buildInitScript } from "@zturnlibs/ztron-inject";

/**
 * True for hostnames the dev server may serve: localhost variants only
 * (tauri cc9d522c6 DNS-rebinding guard). `*.localhost` subdomains resolve
 * to loopback per RFC 6761 and Vite serves them.
 */
export function isLocalHostname(rawHost: string): boolean {
  let host = rawHost.trim().toLowerCase();
  if (host.startsWith("[")) {
    /* [::1]:port -> ::1 */
    const end = host.indexOf("]");
    host = end === -1 ? host.slice(1) : host.slice(1, end);
  } else {
    /* strip a single port suffix (a second colon means a bare IPv6 host) */
    const colon = host.lastIndexOf(":");
    if (colon !== -1 && host.indexOf(":") === colon) host = host.slice(0, colon);
  }
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost")
  );
}

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
      // Security middleware first (before vite's own):
      // - Host allowlist: a rebound DNS name hitting 127.0.0.1 gets 403.
      // - CORS: same-origin WKWebView requests carry no Origin header and
      //   keep the wildcard (ESM loads need it); a foreign Origin gets no
      //   ACAO at all, so dev content stays unreadable cross-site.
      server.middlewares.use(
        (
          req: { headers?: Record<string, string | string[] | undefined> },
          res: {
            statusCode?: number;
            setHeader: (k: string, v: string) => void;
            end: (chunk?: string) => void;
          },
          next: () => void,
        ) => {
          const hostHeader = req.headers?.host;
          const rawHost = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
          if (!rawHost || !isLocalHostname(rawHost)) {
            res.statusCode = 403;
            res.end("Forbidden: non-local Host header");
            return;
          }
          const originHeader = req.headers?.origin;
          const origin = Array.isArray(originHeader)
            ? originHeader[0]
            : originHeader;
          if (
            origin &&
            !isLocalHostname(origin.replace(/^https?:\/\//, ""))
          ) {
            next();
            return;
          }
          res.setHeader(
            "Access-Control-Allow-Origin",
            origin && origin.startsWith("http") ? origin : "*",
          );
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
