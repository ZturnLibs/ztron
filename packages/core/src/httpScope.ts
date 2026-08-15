/**
 * HTTP scope — URL allowlist for outbound network requests.
 *
 * Translated conceptually from Tauri's `tauri-plugin-http` scope: each entry
 * is a URL pattern (protocol://host[:port]/path), with `*` wildcards allowed
 * in the host (subdomain) and path. Matches are performed against the URL
 * class parsing; ports default to protocol-standard.
 *
 * Example scopes:
 *   - "https://api.example.com/*"
 *   - "https://*.example.com/v1/**"
 *   - "http://localhost:*"
 */

/** A single allow/deny URL pattern. */
export interface HttpScopeEntry {
  /** URL pattern, e.g. `https://api.example.com/v1/*`. */
  url: string;
}

/** HTTP scope configuration. */
export interface HttpScopeConfig {
  /** Allowed URL patterns. */
  allow?: HttpScopeEntry[];
  /** Denied URL patterns (evaluated after allow; wins on conflict). */
  deny?: HttpScopeEntry[];
}

/** Parsed pattern (pre-compiled for fast matching). */
interface CompiledPattern {
  protocol: string;
  /** Host segments; `*` matches any single label. */
  hostLabels: string[];
  port: number | null;
  /** Path prefix segments (no trailing slash); empty = any path. */
  pathPrefix: string[];
  /** True if the last path segment is a `**` (match any depth). */
  pathGlobstar: boolean;
}

export class HttpScope {
  #allow: CompiledPattern[];
  #deny: CompiledPattern[];

  constructor(config: HttpScopeConfig) {
    this.#allow = (config.allow ?? []).map((e) => compile(e.url));
    this.#deny = (config.deny ?? []).map((e) => compile(e.url));
  }

  /** Returns true if the URL is permitted by the scope. */
  permits(input: string): boolean {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return false;
    }
    if (this.#deny.some((p) => match(url, p))) {
      return false;
    }
    if (this.#allow.length === 0) {
      return false;
    }
    return this.#allow.some((p) => match(url, p));
  }
}

function compile(pattern: string): CompiledPattern {
  // `new URL` can't parse a `*` port, so normalize `://host:*` first.
  let portWildcard = false;
  let clean = pattern;
  const m = pattern.match(/^(https?):\/\/([^/]+):\*\//);
  if (m) {
    portWildcard = true;
    clean = `${m[1]}://${m[2]}/`;
  } else if (/^https?:\/\/[^/]+:\*$/.test(pattern)) {
    portWildcard = true;
    clean = pattern.replace(/:\*$/, "");
  }
  let url: URL;
  try {
    url = new URL(clean);
  } catch {
    // Treat as host-only pattern with default https
    url = new URL("https://" + clean);
  }
  const hostLabels = url.hostname.split(".");
  const pathParts = url.pathname.split("/").filter(Boolean);
  const pathGlobstar =
    pathParts.length > 0 && pathParts[pathParts.length - 1] === "**";
  const pathPrefix = pathGlobstar ? pathParts.slice(0, -1) : pathParts;
  return {
    protocol: url.protocol.replace(":", ""),
    hostLabels,
    port: portWildcard ? -1 : url.port ? Number(url.port) : null,
    pathPrefix,
    pathGlobstar,
  };
}

function match(url: URL, p: CompiledPattern): boolean {
  if (url.protocol.replace(":", "") !== p.protocol) {
    return false;
  }
  const urlPort = url.port ? Number(url.port) : null;
  // p.port === -1 is a wildcard that matches any port.
  if (p.port !== null && p.port !== -1 && urlPort !== p.port) {
    return false;
  }
  if (!matchHost(url.hostname.split("."), p.hostLabels)) {
    return false;
  }
  return matchPath(url.pathname.split("/").filter(Boolean), p);
}

function matchHost(labels: string[], pattern: string[]): boolean {
  if (pattern.length === 1 && pattern[0] === "*") {
    return true;
  }
  if (labels.length < pattern.length) {
    return false;
  }
  // Match from the end (rightmost labels) for subdomain wildcards
  const offset = labels.length - pattern.length;
  for (let i = pattern.length - 1; i >= 0; i--) {
    const pl = pattern[i];
    const ul = labels[i + offset];
    if (pl !== "*" && pl !== ul) {
      return false;
    }
  }
  return true;
}

function matchPath(segments: string[], p: CompiledPattern): boolean {
  if (p.pathPrefix.length === 0) {
    return true;
  }
  if (p.pathGlobstar) {
    /* `**` matches any depth at or beyond the prefix. */
    if (segments.length < p.pathPrefix.length) {
      return false;
    }
  } else {
    /* A trailing `*` segment also matches the empty path (glob semantics:
       `https://host/*` matches `https://host/`), like Tauri's url patterns. */
    const optionalTail =
      p.pathPrefix[p.pathPrefix.length - 1] === "*" ? 1 : 0;
    const maxLen = p.pathPrefix.length;
    if (segments.length < maxLen - optionalTail || segments.length > maxLen) {
      return false;
    }
  }
  for (let i = 0; i < p.pathPrefix.length; i++) {
    if (p.pathPrefix[i] !== "*" && p.pathPrefix[i] !== segments[i]) {
      return false;
    }
  }
  return true;
}
