/**
 * Network API — a port of Tauri's `tauri-plugin-network`, backed by the
 * `plugin:network|*` commands.
 */
import { invoke } from "./core.js";

/** The primary interface IPv4 (null when unknown/offline). */
export async function getLocalIpv4(): Promise<string | null> {
  return invoke<string | null>("plugin:network|get_local_ipv4", {});
}

/** The primary interface IPv6 (null when unknown). */
export async function getLocalIpv6(): Promise<string | null> {
  return invoke<string | null>("plugin:network|get_local_ipv6", {});
}

/** The public IPv4 (null when offline / service unreachable). */
export async function getPublicIp(): Promise<string | null> {
  return invoke<string | null>("plugin:network|get_public_ip", {});
}

export const network = { getLocalIpv4, getLocalIpv6, getPublicIp };
