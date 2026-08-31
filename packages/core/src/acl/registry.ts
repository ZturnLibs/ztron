/**
 * Permission registry — collects permissions and permission sets declared by
 * plugins (and the framework itself). Mirrors the role of Tauri's
 * `PermissionOptions` / build-time manifest merging.
 *
 * Plugins declare their permissions through the `Plugin.permissions` field;
 * the framework registers them at startup. Capability files then reference
 * permission identifiers; the resolver looks them up here.
 */
import type { Identifier, Permission, PermissionSet } from "./types.js";

export class PermissionRegistry {
  #permissions = new Map<Identifier, Permission>();
  #sets = new Map<Identifier, PermissionSet>();

  /** Registers a single permission; throws on duplicate id. */
  register(permission: Permission): void {
    if (this.#permissions.has(permission.identifier)) {
      throw new Error(`duplicate permission: ${permission.identifier}`);
    }
    this.#permissions.set(permission.identifier, permission);
  }

  /** Registers a permission set (a named group). */
  registerSet(set: PermissionSet): void {
    const key = this.#sets.has(set.name) ? set.name : set.name;
    if (this.#sets.has(key)) {
      throw new Error(`duplicate permission set: ${set.name}`);
    }
    this.#sets.set(key, set);
  }

  /** Returns the permission with the given identifier, or undefined. */
  get(identifier: Identifier): Permission | undefined {
    return this.#permissions.get(identifier);
  }

  /** All registered permissions (F9 parity audits enumerate these). */
  listPermissions(): Permission[] {
    return [...this.#permissions.values()];
  }

  /** All registered permission sets. */
  listSets(): PermissionSet[] {
    return [...this.#sets.values()];
  }

  /**
   * Recursively expands an identifier into the underlying permissions.
   * A set identifier expands to its members (which may themselves be sets).
   * Cycles are detected and broken.
   */
  expand(
    identifier: Identifier,
    seen: Set<Identifier> = new Set(),
  ): Permission[] {
    if (seen.has(identifier)) {
      return [];
    }
    seen.add(identifier);

    const perm = this.#permissions.get(identifier);
    if (perm) {
      return [perm];
    }
    const set = this.#sets.get(identifier);
    if (set) {
      const out: Permission[] = [];
      for (const child of set.permissions) {
        const resolved = this.resolveRelative(child, identifier);
        out.push(...this.expand(resolved, seen));
      }
      return out;
    }
    return [];
  }

  /** Resolves a relative set member (e.g. `allow-x` inside `fs:default` → `fs:allow-x`). */
  private resolveRelative(
    member: Identifier,
    container: Identifier,
  ): Identifier {
    if (member.includes(":")) {
      return member;
    }
    const prefix = container.split(":")[0];
    return prefix ? `${prefix}:${member}` : member;
  }

  /** All registered permission identifiers (for diagnostics/tests). */
  list(): Identifier[] {
    return [...this.#permissions.keys(), ...this.#sets.keys()];
  }
}
