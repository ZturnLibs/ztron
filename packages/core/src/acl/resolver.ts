/**
 * ACL resolver — combines a {@link PermissionRegistry} with a list of
 * {@link Capability} files into a {@link ResolvedAcl} used by `IpcHub`.
 *
 * Translated from Tauri's `tauri-utils/src/acl/resolved.rs::ResolvedAcl::new`.
 */
import type { Capability, CapabilityFile, PermissionEntry } from "./types.js";
import type { PathScopeLike } from "./types.js";
import { PermissionRegistry } from "./registry.js";
import { ResolvedAcl } from "./resolved.js";

/** Normalizes a `CapabilityFile` into a flat list of capabilities. */
function normalizeCapabilities(file: CapabilityFile): Capability[] {
  if (Array.isArray(file)) {
    return file.map(normalizeCapability);
  }
  if ("capabilities" in file) {
    return file.capabilities.map(normalizeCapability);
  }
  return [normalizeCapability(file)];
}

/** Coerces string permission entries (`"core:default"`) into `{identifier}`. */
function normalizeCapability(cap: Capability): Capability {
  return {
    ...cap,
    permissions: cap.permissions.map(coerceEntry),
  };
}

function coerceEntry(entry: PermissionEntry | string): PermissionEntry {
  if (typeof entry === "string") {
    return { identifier: entry };
  }
  return entry;
}

/** Returns true if the capability's windows match the given label. */
function matchesLabel(capabilityWindows: string[], label: string): boolean {
  for (const w of capabilityWindows) {
    if (w === label || w === "*") {
      return true;
    }
  }
  return false;
}

/** Merges two path scopes (later wins for the same key). */
function mergeScope(
  a: PathScopeLike | undefined,
  b: PathScopeLike | undefined,
): PathScopeLike | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    allow: [...a.allow, ...b.allow],
    deny: [...(a.deny ?? []), ...(b.deny ?? [])],
  };
}

export function resolveAcl(
  registry: PermissionRegistry,
  capabilities: CapabilityFile[],
): ResolvedAcl {
  const acl = new ResolvedAcl(false);

  for (const file of capabilities) {
    for (const cap of normalizeCapabilities(file)) {
      console.log(
        `[acl-resolve] cap=${cap.identifier} windows=${cap.windows.join(",")}`,
      );
      for (const entry of cap.permissions) {
        const perms = registry.expand(entry.identifier);
        console.log(
          `[acl-resolve] entry=${entry.identifier} -> ${perms.length} perms`,
        );
        applyEntry(registry, acl, cap, entry);
      }
    }
  }
  return acl;
}

function applyEntry(
  registry: PermissionRegistry,
  acl: ResolvedAcl,
  cap: Capability,
  entry: PermissionEntry,
) {
  const permissions = registry.expand(entry.identifier);
  for (const label of cap.windows) {
    for (const perm of permissions) {
      const scope = mergeScope(perm.scope, entry.scope);
      for (const cmd of perm.commands) {
        if (perm.identifier.includes(":deny-") || cmd.startsWith("!")) {
          acl.deny(label, cmd.startsWith("!") ? cmd.slice(1) : cmd);
        } else {
          acl.allow(label, cmd, scope ?? null);
        }
      }
    }
  }
}

/** Helper for tests/apps that want a single-label, permissive ACL. */
export function permissiveAcl(): ResolvedAcl {
  return new ResolvedAcl(true);
}

export { PermissionRegistry, ResolvedAcl };
