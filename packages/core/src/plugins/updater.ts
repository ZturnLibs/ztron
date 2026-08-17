/**
 * `plugin:updater|*` — self-update: check/download/verify/apply.
 * Translated conceptually from Tauri's `tauri-plugin-updater` (simplified):
 * manifest is a JSON doc with a version + per-platform artifact.
 *
 * Manifest shape:
 * ```json
 * {
 *   "version": "1.2.0",
 *   "notes": "…",
 *   "platforms": {
 *     "darwin": { "url": "https://…/app.dmg", "sha256": "…" },
 *     "windows": { "url": "https://…/setup.exe", "sha256": "…" },
 *     "linux":   { "url": "https://…/app.AppImage", "sha256": "…" }
 *   }
 * }
 * ```
 */
import { HttpScope, type HttpScopeConfig } from "../httpScope.js";
import type { Plugin } from "../plugin.js";

const dec = new TextDecoder();

export interface UpdaterManifest {
  version: string;
  notes?: string;
  platforms: Record<string, { url: string; sha256?: string }>;
}

export interface UpdateCheck {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  notes?: string;
  artifactUrl?: string;
  sha256?: string;
}

export interface UpdaterPluginOptions {
  /** URL of the update manifest (can be overridden per call). */
  manifestUrl?: string;
  /** Current app version. */
  currentVersion: string;
  /** HTTP scope for downloading the manifest + artifact. */
  scope?: HttpScopeConfig;
}

/** Simple semver compare: returns >0 if a>b, <0 if a<b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function updaterPlugin(options: UpdaterPluginOptions): Plugin {
  const scope = new HttpScope(options.scope ?? { allow: [] });
  const platform =
    (globalThis as { navigator?: { platform?: string } }).navigator?.platform ??
    "";

  function currentPlatform(): string {
    const p = platform.toLowerCase();
    if (p.includes("mac")) return "darwin";
    if (p.includes("win")) return "windows";
    return "linux";
  }

  async function fetchManifest(url: string): Promise<UpdaterManifest> {
    if (!scope.permits(url)) {
      throw new Error(`updater scope denied: ${url}`);
    }
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`updater: manifest fetch failed (${resp.status})`);
    }
    const json = JSON.parse(await resp.text()) as UpdaterManifest;
    if (!json.version || !json.platforms) {
      throw new Error("updater: invalid manifest (missing version/platforms)");
    }
    return json;
  }

  return {
    name: "updater",
    commands: {
      async check(args) {
        const { url } = args as { url?: string };
        const manifestUrl = url ?? options.manifestUrl;
        if (!manifestUrl) {
          throw new Error("updater: no manifest url");
        }
        const manifest = await fetchManifest(manifestUrl);
        const hasUpdate =
          compareVersions(manifest.version, options.currentVersion) > 0;
        const artifact = manifest.platforms[currentPlatform()];
        const check: UpdateCheck = {
          hasUpdate,
          currentVersion: options.currentVersion,
          latestVersion: manifest.version,
          notes: manifest.notes,
          artifactUrl: artifact?.url,
          sha256: artifact?.sha256,
        };
        return check;
      },
      async download(args) {
        const { url, destination } = args as {
          url: string;
          destination: string;
        };
        if (!scope.permits(url)) {
          throw new Error(`updater scope denied: ${url}`);
        }
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(`updater: download failed (${resp.status})`);
        }
        const bytes = new Uint8Array(await resp.arrayBuffer());
        await tjs.writeFile(destination, bytes);
        return { bytes: bytes.byteLength, path: destination };
      },
      async verify(args) {
        const { file, sha256 } = args as { file: string; sha256: string };
        const bytes = new Uint8Array(await tjs.readFile(file));
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const hex = [...new Uint8Array(digest)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        return { ok: hex.toLowerCase() === sha256.toLowerCase(), actual: hex };
      },
      /**
       * One-shot update application (Tauri's downloadAndInstall): check →
       * download → verify → relaunch. Verification failure aborts before
       * the relaunch so a corrupt/truncated artifact never replaces the
       * running app.
       */
      async install(args, ctx) {
        const { url } = args as { url?: string };
        const dest = `${tjs.tmpDir}/ztron-update-${Date.now()}.pkg`;
        const check = await (this as {
          check(a: unknown): Promise<UpdateCheck>;
        }).check({ url });
        if (!check.hasUpdate || !check.artifactUrl || !check.sha256) {
          return { ok: false, reason: "no-update" as const };
        }
        const dl = await (this as unknown as {
          download(a: unknown): Promise<{ bytes: number; path: string }>;
        }).download({ url: check.artifactUrl, destination: dest });
        const v = await (this as unknown as {
          verify(a: unknown): Promise<{ ok: boolean; actual: string }>;
        }).verify({ file: dl.path, sha256: check.sha256 });
        if (!v.ok) {
          await tjs.remove(dest).catch(() => {});
          throw new Error(
            `updater: sha256 mismatch (expected ${check.sha256}, got ${v.actual})`,
          );
        }
        ctx.app.commands.get("plugin:process|relaunch")?.({}, ctx as never);
        return { ok: true, bytes: dl.bytes, path: dl.path };
      },
    },
    permissions: [
      {
        identifier: "updater:allow-check",
        commands: ["plugin:updater|check"],
      },
      {
        identifier: "updater:allow-download",
        commands: ["plugin:updater|download"],
      },
      {
        identifier: "updater:allow-verify",
        commands: ["plugin:updater|verify"],
      },
      {
        identifier: "updater:allow-install",
        commands: ["plugin:updater|install"],
      },
    ],
    permissionSets: [
      {
        name: "updater:default",
        description: "Allows update checks, downloads and verification.",
        permissions: [
          "updater:allow-check",
          "updater:allow-download",
          "updater:allow-verify",
        ],
      },
    ],
  };
}
