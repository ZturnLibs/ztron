/**
 * Resolved ACL — the per-window allow/deny command table plus merged scopes,
 * built from capabilities + the permission registry. Mirrors Tauri's
 * `ResolvedAcl`.
 *
 * At runtime, `IpcHub` calls `canRun(label, command)` before dispatching.
 */
import type { PathScopeLike } from "./types.js";
import { PathScope } from "../scope.js";

/** Result of an ACL check. */
export type AclDecision =
  | { allowed: true; scope: PathScope | null }
  | { allowed: false; reason: string };

interface LabelAcl {
  allowedCommands: Map<string, PathScope | null>;
  deniedCommands: Set<string>;
}

export class ResolvedAcl {
  #byLabel = new Map<string, LabelAcl>();
  /** When true, no capabilities are configured — permissive mode (v1 default). */
  #permissive = true;

  constructor(permissive = true) {
    this.#permissive = permissive;
  }

  /** Applies a resolved capability (allowed commands + scope) to a label. */
  allow(label: string, command: string, scope?: PathScopeLike | null): void {
    let entry = this.#byLabel.get(label);
    if (!entry) {
      entry = { allowedCommands: new Map(), deniedCommands: new Set() };
      this.#byLabel.set(label, entry);
    }
    entry.allowedCommands.set(command, scope ? new PathScope(scope) : null);
    this.#permissive = false;
  }

  /** Marks a command as explicitly denied for a label. */
  deny(label: string, command: string): void {
    let entry = this.#byLabel.get(label);
    if (!entry) {
      entry = { allowedCommands: new Map(), deniedCommands: new Set() };
      this.#byLabel.set(label, entry);
    }
    entry.deniedCommands.add(command);
    this.#permissive = false;
  }

  /** Decides whether `command` may run on the window with the given label. */
  canRun(label: string, command: string): AclDecision {
    if (this.#permissive) {
      return { allowed: true, scope: null };
    }
    const entry = this.#byLabel.get(label);
    if (!entry) {
      return { allowed: false, reason: `no capability for window "${label}"` };
    }
    if (entry.deniedCommands.has(command)) {
      return { allowed: false, reason: `command "${command}" is denied` };
    }
    const scope = entry.allowedCommands.get(command);
    if (scope === undefined) {
      return {
        allowed: false,
        reason: `command "${command}" is not allowed for window "${label}"`,
      };
    }
    return { allowed: true, scope };
  }
}
