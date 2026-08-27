/**
 * `plugin:updater|*` — self-update: check/download/verify/apply.
 * Translated from Tauri's `tauri-plugin-updater`, with the G3 security chain
 * (GAP.md D1): semver-precedence version gating, sha256 integrity AND
 * minisign signature verification (`pubkey` configured ⇒ fail-closed).
 *
 * Manifest shape:
 * ```json
 * {
 *   "version": "1.2.0",
 *   "notes": "…",
 *   "platforms": {
 *     "darwin": { "url": "https://…/app.dmg", "sha256": "…", "signature": "untrusted comment: …\nb64(sig)\ntrusted comment: …\nb64(global)\n" }
 *   }
 * }
 * ```
 */
import { HttpScope, type HttpScopeConfig } from "../httpScope.js";
import type { Plugin } from "../plugin.js";
import { verifyMinisig, type VerifyResult } from "./minisign.js";
import { compareSemver } from "./semver.js";

export interface UpdaterArtifact {
  url: string;
  sha256?: string;
  /** minisign `.minisig` text over the artifact file contents. */
  signature?: string;
}

export interface UpdaterManifest {
  version: string;
  notes?: string;
  platforms: Record<string, UpdaterArtifact>;
}

export interface UpdateCheck {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  notes?: string;
  artifactUrl?: string;
  sha256?: string;
  /** minisign signature text over the artifact (present when published). */
  signature?: string;
}

export interface UpdaterPluginOptions {
  /** URL of the update manifest (can be overridden per call). */
  manifestUrl?: string;
  /** Current app version. */
  currentVersion: string;
  /** HTTP scope for downloading the manifest + artifact. */
  scope?: HttpScopeConfig;
  /**
   * minisign public key file text. When set, `install` verifies the
   * artifact's `signature` against it and FAILS CLOSED when either is
   * missing or mismatched.
   */
  pubkey?: string;
}

/**
 * SemVer 2.0.0 precedence compare — returns >0 if a>b, <0 if a<b, 0 equal.
 * Kept as the historical export name; delegates to {@linkcode compareSemver}
 * (the old parseInt coercion made `1.0.0-beta` compare as NaN → 0).
 */
export function compareVersions(a: string, b: string): number {
  return compareSemver(a, b);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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

  async function verifyFile(
    path: string,
    expectedSha256?: string,
    signatureText?: string,
  ): Promise<{ hex: string; okSha: boolean }> {
    const bytes = new Uint8Array(await tjs.readFile(path));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const okSha = !expectedSha256 || hex.toLowerCase() === expectedSha256.toLowerCase();
    if (!okSha) {
      throw new Error(
        `updater: sha256 mismatch (expected ${expectedSha256}, got ${hex})`,
      );
    }
    // Signature gate — fail-closed whenever a pubkey is configured.
    if (options.pubkey) {
      if (!signatureText) {
        throw new Error(
          "updater: artifact signature missing but a pubkey is configured",
        );
      }
      const result = verifyMinisig(bytes, signatureText, options.pubkey);
      if (!result.ok) {
        throw new Error(
          `updater: signature verification failed (${result.error ?? "unknown"})`,
        );
      }
    }
    return { hex, okSha };
  }

  interface ProgressMessage {
    event: "Started" | "Progress" | "Finished";
    data?: { contentLength?: number; chunkLength?: number };
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
        const hasUpdate = compareSemver(manifest.version, options.currentVersion) > 0;
        const artifact = manifest.platforms[currentPlatform()];
        const check: UpdateCheck = {
          hasUpdate,
          currentVersion: options.currentVersion,
          latestVersion: manifest.version,
          notes: manifest.notes,
          artifactUrl: artifact?.url,
          sha256: artifact?.sha256,
          signature: artifact?.signature,
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
        const { file, sha256, signature } = args as {
          file: string;
          sha256?: string;
          signature?: string;
        };
        const { hex } = await verifyFile(file, sha256, signature);
        return { ok: true, actual: hex };
      },
      /**
       * Verifies an inline payload without touching the filesystem — the
       * unit-testable core of the gate ({data} base64 vs {file} on disk).
       */
      async verify_signature(args): Promise<VerifyResult & { actualSha256?: string }> {
        const { data, signature, pubkey, allowLegacyPlain } = args as {
          data: string;
          signature: string;
          pubkey: string;
          allowLegacyPlain?: boolean;
        };
        return verifyMinisig(
          b64ToBytes(data),
          signature,
          pubkey,
          { allowLegacyPlain },
        );
      },
      /**
       * Streaming variant of download+install: pushes Started/Progress/
       * Finished over a Channel while downloading, then enforces both
       * integrity gates before relaunching.
       */
      async install_stream(args, ctx) {
        const { url, ch } = args as { url?: string; ch?: { kind: "channel"; id: number } };
        const channel = ch ? ctx.getChannel(ch.id) : undefined;
        const progress = (
          event: ProgressMessage["event"],
          data?: ProgressMessage["data"],
        ) => channel?.send({ event, data } satisfies ProgressMessage);

        try {
          const resolved = url ?? options.manifestUrl;
          if (!resolved) throw new Error("updater: no manifest url");
          const check = await (
            this as unknown as {
              check(a: unknown): Promise<UpdateCheck>;
            }
          ).check({ url: resolved });
          if (!check.hasUpdate || !check.artifactUrl) {
            progress("Finished");
            return { ok: false, reason: "no-update" as const };
          }
          if (!scope.permits(check.artifactUrl)) {
            throw new Error(`updater scope denied: ${check.artifactUrl}`);
          }
          const resp = await fetch(check.artifactUrl);
          if (!resp.ok) {
            throw new Error(`updater: download failed (${resp.status})`);
          }
          const contentLength = Number(resp.headers?.get?.("content-length") ?? 0);
          progress("Started", {
            contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
          });

          const dest = `${tjs.tmpDir}/ztron-update-${Date.now()}.pkg`;
          let total = 0;
          const chunks: Uint8Array[] = [];
          const reader = resp.body?.getReader?.();
          if (reader) {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value && value.length > 0) {
                chunks.push(value);
                total += value.byteLength;
                progress("Progress", { chunkLength: value.byteLength });
              }
            }
          } else {
            const all = new Uint8Array(await resp.arrayBuffer());
            chunks.push(all);
            total = all.byteLength;
            progress("Progress", { chunkLength: total });
          }
          const bytes = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) {
            bytes.set(c, off);
            off += c.byteLength;
          }
          await tjs.writeFile(dest, bytes);

          await verifyFile(dest, check.sha256, check.signature);
          progress("Finished");
          if (channel && !channel.ended) channel.end();
          ctx.app.commands.get("plugin:process|relaunch")?.({}, ctx as never);
          return { ok: true, bytes: total, path: dest };
        } catch (err) {
          void err;
          if (channel && !channel.ended) channel.end();
          throw err;
        }
      },
      /**
       * One-shot update application (kept for back-compat): check →
       * download → sha256+signature gates → relaunch. Verification failure
       * aborts before the relaunch so a corrupt/artifact never replaces the
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
        await verifyFile(dl.path, check.sha256, check.signature);
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
        identifier: "updater:allow-verify-signature",
        commands: ["plugin:updater|verify_signature"],
      },
      {
        identifier: "updater:allow-install-stream",
        commands: ["plugin:updater|install_stream"],
      },
      {
        identifier: "updater:allow-install",
        commands: ["plugin:updater|install"],
      },
    ],
    permissionSets: [
      {
        name: "updater:default",
        description:
          "Allows update checks, downloads and both integrity verifications.",
        permissions: [
          "updater:allow-check",
          "updater:allow-download",
          "updater:allow-verify",
          "updater:allow-verify-signature",
        ],
      },
    ],
  };
}
