/**
 * `plugin:http|*` — scoped HTTP client wrapping `fetch`.
 *
 * Translated from Tauri's `tauri-plugin-http`. Every request is gated by an
 * {@link HttpScope}: the URL is matched against the configured allowlist
 * before the request is dispatched.
 */
import { HttpScope, type HttpScopeConfig } from "../httpScope.js";
import type { Plugin } from "../plugin.js";

export interface HttpPluginOptions {
  scope?: HttpScopeConfig;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
}

export function httpPlugin(options: HttpPluginOptions = {}): Plugin {
  const scope = new HttpScope(options.scope ?? { allow: [] });

  return {
    name: "http",
    commands: {
      async fetch(args) {
        const { url, method, headers, body } = args as {
          url: string;
          method?: string;
          headers?: Record<string, string>;
          body?: string;
        };
        if (!scope.permits(url)) {
          throw new Error(`http scope denied: ${url}`);
        }
        const resp = await fetch(url, {
          method: method ?? "GET",
          headers: headers ?? {},
          body: body ?? undefined,
        });
        const text = await resp.text();
        const respHeaders: Record<string, string> = {};
        resp.headers.forEach((v, k) => {
          respHeaders[k] = v;
        });
        const out: HttpResponse = {
          status: resp.status,
          ok: resp.ok,
          headers: respHeaders,
          body: text,
        };
        return out;
      },
    },
    permissions: [
      {
        identifier: "http:allow-fetch",
        description: "Allows scoped HTTP requests via plugin:http|fetch.",
        commands: ["plugin:http|fetch"],
      },
      {
        identifier: "http:deny-fetch",
        description: "Explicitly denies all HTTP requests.",
        commands: ["!plugin:http|fetch"],
      },
    ],
    permissionSets: [
      {
        name: "http:default",
        description: "Allows HTTP requests (subject to scope URL allowlist).",
        permissions: ["http:allow-fetch"],
      },
    ],
  };
}
