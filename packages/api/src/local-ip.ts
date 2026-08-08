/**
 * Local IP API — a port of Tauri's `tauri-plugin-local-ip`, backed by the
 * `plugin:local-ip|*` command.
 */
import { invoke } from "./core.js";

/** The primary interface IPv4 address (null when unknown/offline). */
export async function getLocalIpv4(): Promise<string | null> {
  return invoke<string | null>("plugin:local-ip|get", {});
}

export const localIp = { getLocalIpv4 };
