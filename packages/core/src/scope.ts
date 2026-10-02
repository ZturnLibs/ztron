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

/**
 * Windows path conventions apply unless the platform says otherwise
 * (mirrors the path plugin's `detectPlatform` default-to-windows rule).
 * Only consulted for separator/case normalization, never under Node tests,
 * where the tjs stub pins `navigator.platform` to a macOS value.
 */
function windowsPaths(): boolean {
  const p = (
    (globalThis as { navigator?: { platform?: string } }).navigator?.platform ??
    ""
  ).toLowerCase();
  return !p.includes("mac") && !p.includes("linux");
}

/** On Windows `\` is a separator; normalize to `/` so the prefix
 * comparisons below work. POSIX paths pass through untouched. */
function normalizeSep(p: string): string {
  return windowsPaths() ? p.replace(/\\/g, "/") : p;
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
    this.#allow = config.allow.map((p) => normalizeSep(expandVars(p)));
    this.#deny = (config.deny ?? []).map((p) => normalizeSep(expandVars(p)));
  }

  /** Expands vars + makes the path absolute (no canonicalization). */
  resolve(input: string): string {
    return resolveAbs(normalizeSep(expandVars(input)));
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

  /** Adds an allow pattern at runtime (invalidates cached roots). */
  addAllow(pattern: string): void {
    this.#allow.push(normalizeSep(expandVars(pattern)));
    this.#allowRoots = null;
  }

  /** The current allow patterns (for persistence). */
  serializeAllow(): string[] {
    return [...this.#allow];
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
  return isAbs(p) ? p : pathJoin(normalizeSep(tjs.cwd), p);
}

/** POSIX `/`, UNC `//` and Windows `C:/` (post-normalization) are absolute. */
function isAbs(p: string): boolean {
  return p.startsWith("/") || /^[a-zA-Z]:\//.test(p);
}

/** Canonicalizes the parent directory so non-existent children still resolve. */
async function canonicalize(p: string): Promise<string> {
  const dir = dirName(p);
  const base = baseName(p);
  const realDir = normalizeSep(await tjs.realPath(dir));
  return dir === "/" ? pathJoin(realDir, base) : pathJoin(realDir, base);
}

function within(canon: string, root: string): boolean {
  // Windows paths are case-insensitive (C:\ == c:\); fold before comparing.
  if (windowsPaths()) {
    canon = canon.toLowerCase();
    root = root.toLowerCase();
  }
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
