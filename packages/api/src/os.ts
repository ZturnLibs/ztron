/** OS info API — mirrors `plugin:os|*`. */
import { invoke } from "./core.js";

export interface OsInfo {
  platform: string;
  arch: string;
  hostname: string;
  version: string;
  homedir: string;
  tmpdir: string;
  sep: string;
}

export function info(): Promise<OsInfo> {
  return invoke<OsInfo>("plugin:os|info", {});
}
export function platform(): Promise<string> {
  return invoke<string>("plugin:os|platform", {});
}
export function arch(): Promise<string> {
  return invoke<string>("plugin:os|arch", {});
}
export function hostname(): Promise<string> {
  return invoke<string>("plugin:os|hostname", {});
}
export function version(): Promise<string> {
  return invoke<string>("plugin:os|version", {});
}
export function homedir(): Promise<string> {
  return invoke<string>("plugin:os|homedir", {});
}
export function tmpdir(): Promise<string> {
  return invoke<string>("plugin:os|tmpdir", {});
}

/** The system locale tag (e.g. "en-US"), or null when unknown. */
export function locale(): Promise<string | null> {
  return invoke<string | null>("plugin:os|locale", {});
}

export const os = {
  info,
  platform,
  arch,
  hostname,
  version,
  homedir,
  tmpdir,
  locale,
};
