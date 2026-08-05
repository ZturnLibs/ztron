/**
 * Path scope — the capability gate for file access.
 *
 * A scope is a set of allow/deny path prefixes (Tauri-style). `$VAR`
 * placeholders are expanded (`$HOME`, `$TMP`, `$CWD`), paths are made
 * absolute and canonicalized (via `tjs.realPath` on the parent directory),
 * then checked against the allowlist before any command touches the disk.
 */

export interface PathScopeConfig {
  /** Allowed path prefixes, e.g. `["$HOME/Documents/**", "$TMP/**"]`. */
  allow: string[];
  /** Denied prefixes, evaluated after allow. */
  deny?: string[];
}

/** Expands `$VAR` placeholders supported by the framework. */
function expandVars(input: string): string {
  return input.replace(/\$(HOME|TMP|CWD)\b/g, (m, v: string) => {
    switch (v) {
      case "HOME":
        return tjs.homeDir;
      case "TMP":
        return tjs.tmpDir;
      case "CWD":
        return tjs.cwd;
      default:
        return m;
    }
  });
}

/** The literal root of a pattern, up to the first `*`. */
function patternRoot(pattern: string): string {
  const star = pattern.indexOf("*");
  const prefix = star >= 0 ? pattern.slice(0, star) : pattern;
  return prefix.replace(/\/+$/, "");
}

export class PathScope {
  #allow: string[];
  #deny: string[];
  #allowRoots: Promise<string[]> | null = null;
  #denyRoots: Promise<string[]> | null = null;

  constructor(config: PathScopeConfig) {
    this.#allow = config.allow.map((p) => expandVars(p));
    this.#deny = (config.deny ?? []).map((p) => expandVars(p));
  }

  /** Expands vars + makes the path absolute (no canonicalization). */
  resolve(input: string): string {
    return resolveAbs(expandVars(input));
  }

  /**
   * Resolves the input and asserts it is inside the scope. Returns the
   * canonicalized path (symlinks resolved) for use by the caller.
   */
  async check(input: string): Promise<string> {
    const abs = this.resolve(input);
    const canon = await canonicalize(abs);
    const denyRoots = await this.#roots(true);
    const allowRoots = await this.#roots(false);
    if (denyRoots.some((root) => within(canon, root))) {
      throw new Error(`access denied: "${input}"`);
    }
    if (!allowRoots.some((root) => within(canon, root))) {
      throw new Error(
        `access denied: "${input}" is outside the configured scope`,
      );
    }
    return canon;
  }

  /** Like {@link check} but returns `null` instead of throwing. */
  async tryCheck(input: string): Promise<string | null> {
    try {
      return await this.check(input);
    } catch {
      return null;
    }
  }

  /** Canonicalized scope roots (memoized; the literal prefix of each pattern). */
  #roots(deny: boolean): Promise<string[]> {
    const roots = deny ? this.#deny : this.#allow;
    if (deny ? this.#denyRoots : this.#allowRoots) {
      return (deny ? this.#denyRoots : this.#allowRoots) as Promise<string[]>;
    }
    const promise = Promise.all(
      roots.map((p) =>
        canonicalize(patternRoot(p)).catch(() => patternRoot(p)),
      ),
    );
    if (deny) {
      this.#denyRoots = promise;
    } else {
      this.#allowRoots = promise;
    }
    return promise;
  }
}

function resolveAbs(p: string): string {
  return p.startsWith("/") ? p : pathJoin(tjs.cwd, p);
}

/** Canonicalizes the parent directory so non-existent children still resolve. */
async function canonicalize(p: string): Promise<string> {
  const dir = dirName(p);
  const base = baseName(p);
  const realDir = await tjs.realPath(dir);
  return dir === "/" ? pathJoin(realDir, base) : pathJoin(realDir, base);
}

function within(canon: string, root: string): boolean {
  return canon === root || canon.startsWith(root + "/");
}

function dirName(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

function baseName(p: string): string {
  const i = p.lastIndexOf("/");
  return p.slice(i + 1);
}

function pathJoin(a: string, b: string): string {
  return a.endsWith("/") ? a + b : a + "/" + b;
}
