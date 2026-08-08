/**
 * `plugin:upload|*` — upload a file's contents to an http(s) endpoint.
 * Translated from Tauri's `tauri-plugin-upload` (simplified: raw POST of the
 * file bytes; no multipart or progress yet).
 */
import { HttpScope, type HttpScopeConfig } from "../httpScope.js";
import { PathScope, type PathScopeConfig } from "../scope.js";
import type { Plugin } from "../plugin.js";

export interface UploadPluginOptions {
  /** File paths that may be uploaded (PathScope). */
  fileScope: PathScopeConfig;
  /** URLs that may be uploaded to (HttpScope). */
  urlScope: HttpScopeConfig;
}

export function uploadPlugin(options: UploadPluginOptions): Plugin {
  const fileScope = new PathScope(options.fileScope);
  const urlScope = new HttpScope(options.urlScope);

  return {
    name: "upload",
    commands: {
      async upload(args) {
        const { url, file } = args as { url: string; file: string };
        if (!urlScope.permits(url)) {
          throw new Error(`upload: url scope denied: ${url}`);
        }
        const canon = await fileScope.check(file);
        const data = await tjs.readFile(canon);
        const resp = await fetch(url, { method: "POST", body: data });
        const text = await resp.text();
        return {
          status: resp.status,
          ok: resp.ok,
          body: text.slice(0, 512),
        };
      },
    },
    permissions: [
      {
        identifier: "upload:allow-upload",
        commands: ["plugin:upload|upload"],
      },
    ],
    permissionSets: [
      {
        name: "upload:default",
        description: "Allows uploading files to scoped URLs.",
        permissions: ["upload:allow-upload"],
      },
    ],
  };
}
