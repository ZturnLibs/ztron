/**
 * ACL data types — translated from Tauri's `tauri-utils/src/acl`.
 *
 * Model:
 *  - A plugin declares a set of **Permissions** (each maps to one or more
 *    commands it allows) and optional **PermissionSets** (named groups like
 *    `default`).
 *  - The application author writes **Capabilities** (JSON files) that select
 *    which permission identifiers are granted to which window labels.
 *  - At runtime the framework resolves capabilities into a per-label
 *    allow/deny command table and gates every IPC dispatch.
 *
 * v1 simplifications vs. Tauri:
 *  - No remote URL matching (local content only).
 *  - Window label matching is exact or `*` (no full glob).
 *  - No per-platform filtering (runtime checks itself).
 */

/** Identifier of a permission or permission set, e.g. `fs:allow-write-text-file`. */
export type Identifier = string;

/** A single allowed command, optionally scoped (fs paths). */
export interface Permission {
  /** Identifier, e.g. `fs:allow-write-text-file`. */
  identifier: Identifier;
  /** Human-readable description. */
  description?: string;
  /** Commands this permission allows (e.g. `["plugin:fs|write_text"]`). */
  commands: string[];
  /** Optional path scope attached to this permission. */
  scope?: PathScopeLike;
}

/** A named group of permission identifiers, e.g. `default: ["allow-read-text-file", "allow-write-text-file"]`. */
export interface PermissionSet {
  name: string;
  /** Identifiers of permissions in this set (relative or absolute). */
  permissions: Identifier[];
  /** Human-readable description. */
  description?: string;
}

/** A permission entry inside a capability: either a ref or a ref + scope extension. */
export interface PermissionEntry {
  identifier: Identifier;
  /** Extra scope appended to the permission's own scope. */
  scope?: PathScopeLike;
}

/** A capability: grants a set of permissions to a set of windows. */
export interface Capability {
  identifier: string;
  description?: string;
  /** Window labels this capability applies to (supports `*`). */
  windows: string[];
  /** Permission entries granted. */
  permissions: PermissionEntry[];
}

/** A loose path scope (forwarded to `PathScope`). */
export interface PathScopeLike {
  allow: string[];
  deny?: string[];
}

/** A capability file (single capability, list, or named list). */
export type CapabilityFile =
  Capability | Capability[] | { capabilities: Capability[] };
