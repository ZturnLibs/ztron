/**
 * `plugin:os|*` — system information (platform/arch/hostname/dirs).
 * Wraps navigator + tjs globals.
 */
import type { Plugin } from "../plugin.js";

export interface OsInfo {
  platform: string;
  arch: string;
  hostname: string;
  version: string;
  homedir: string;
  tmpdir: string;
  sep: string;
}

export function osPlugin(): Plugin {
  const navPlatform =
    (globalThis as { navigator?: { platform?: string; userAgent?: string } })
      .navigator?.platform ?? "";
  const navUA =
    (globalThis as { navigator?: { userAgent?: string } }).navigator
      ?.userAgent ?? "";
  return {
    name: "os",
    commands: {
      info: (): OsInfo => ({
        platform: normalizePlatform(navPlatform),
        arch: normalizeArch(navPlatform),
        hostname: "localhost",
        version: navUA,
        homedir: tjs.homeDir,
        tmpdir: tjs.tmpDir,
        sep: "/",
      }),
      platform: () => normalizePlatform(navPlatform),
      arch: () => normalizeArch(navPlatform),
      hostname: () => "localhost",
      version: () => navUA,
      homedir: () => tjs.homeDir,
      tmpdir: () => tjs.tmpDir,
      sep: () => "/",
      type: () => normalizeType(navPlatform),
      family: () => normalizePlatform(navPlatform),
      eol: () => (normalizePlatform(navPlatform) === "windows" ? "\r\n" : "\n"),
      locale: () => {
        const raw = tjs.env.LC_ALL ?? tjs.env.LANG ?? tjs.env.LANGUAGE ?? "";
        // "en_US.UTF-8" -> "en-US"
        const tag = raw.split(".")[0]?.replace(/_/g, "-");
        return tag || null;
      },
    },
    permissions: [
      { identifier: "os:allow-info", commands: ["plugin:os|info"] },
      { identifier: "os:allow-platform", commands: ["plugin:os|platform"] },
      { identifier: "os:allow-arch", commands: ["plugin:os|arch"] },
      { identifier: "os:allow-hostname", commands: ["plugin:os|hostname"] },
      { identifier: "os:allow-version", commands: ["plugin:os|version"] },
      { identifier: "os:allow-homedir", commands: ["plugin:os|homedir"] },
      { identifier: "os:allow-tmpdir", commands: ["plugin:os|tmpdir"] },
      { identifier: "os:allow-sep", commands: ["plugin:os|sep"] },
      { identifier: "os:allow-locale", commands: ["plugin:os|locale"] },
      { identifier: "os:allow-type", commands: ["plugin:os|type"] },
      { identifier: "os:allow-family", commands: ["plugin:os|family"] },
      { identifier: "os:allow-eol", commands: ["plugin:os|eol"] },
    ],
    permissionSets: [
      {
        name: "os:default",
        description: "Read-only system information.",
        permissions: [
          "os:allow-info",
          "os:allow-platform",
          "os:allow-arch",
          "os:allow-hostname",
          "os:allow-version",
          "os:allow-homedir",
          "os:allow-tmpdir",
          "os:allow-sep",
          "os:allow-locale",
          "os:allow-type",
          "os:allow-family",
          "os:allow-eol",
        ],
      },
    ],
  };
}

function normalizeType(nav: string): string {
  const lower = nav.toLowerCase();
  if (lower.includes("mac")) return "Darwin";
  if (lower.includes("win")) return "Windows_NT";
  if (lower.includes("linux")) return "Linux";
  return "Unknown";
}

function normalizePlatform(nav: string): string {
  const lower = nav.toLowerCase();
  if (lower.includes("mac")) return "macos";
  if (lower.includes("win")) return "windows";
  if (lower.includes("linux")) return "linux";
  return nav.toLowerCase();
}

function normalizeArch(nav: string): string {
  if (nav.includes("arm") || nav.includes("aarch")) return "arm64";
  if (nav.includes("64")) return "x86_64";
  return nav.toLowerCase();
}
