/**
 * Update notification — zero-dependency and never delays exit: the notice is
 * rendered synchronously from the cache file; the registry refresh runs on an
 * unref'd timer so it only fires while the CLI process is alive anyway (the
 * fresh result surfaces on the *next* invocation).
 *
 * Guards: non-TTY, `CI`, or `ZTRON_NO_UPDATE_NOTIFIER=1` disable everything.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { dim } from "./ui.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOTICE_TTL_MS = 7 * DAY_MS;
const REFRESH_TTL_MS = DAY_MS;
const REGISTRY_TIMEOUT_MS = 2500;

export interface UpdateCache {
  lastCheck: number;
  latest: string;
}

export interface NotifierContext {
  env: NodeJS.ProcessEnv;
  isTTY: boolean;
  now: number;
}

/** Guard: notifications only for interactive, non-CI, opted-in runs. */
export function shouldRun(env: NodeJS.ProcessEnv, isTTY: boolean): boolean {
  if (env.ZTRON_NO_UPDATE_NOTIFIER === "1") return false;
  if (env.CI) return false;
  return isTTY;
}

/** Pure: the notice line for the current cache state (null = nothing to say). */
export function resolveNotice(
  cache: UpdateCache | undefined,
  cliVersion: string,
  now: number,
): string | null {
  if (!cache || !cache.latest) return null;
  if (now - cache.lastCheck > NOTICE_TTL_MS) return null;
  if (!isNewer(cache.latest, cliVersion)) return null;
  return `↟ ztron ${cache.latest} is available — npm i -g @zturnlibs/ztron-cli`;
}

/** Fetch the latest published version; undefined on any failure/timeout. */
export async function fetchLatest(
  packageName: string,
  fetchImpl: typeof fetch,
): Promise<string | undefined> {
  try {
    const res = await fetchImpl(`https://registry.npmjs.org/${packageName}/latest`, {
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { version?: string };
    return typeof json.version === "string" ? json.version : undefined;
  } catch {
    return undefined;
  }
}

/** Fetch + persist; exported for tests (the CLI path is fire-and-forget). */
export async function refreshCache(
  cachePath: string,
  packageName: string,
  cliVersion: string,
  fetchImpl: typeof fetch,
  now: number,
): Promise<void> {
  const latest = (await fetchLatest(packageName, fetchImpl)) ?? cliVersion;
  writeCache(cachePath, { lastCheck: now, latest });
}

export function defaultCachePath(): string {
  return join(homedir(), ".ztron", "update-check.json");
}

function readCache(cachePath: string): UpdateCache | undefined {
  try {
    if (!existsSync(cachePath)) return undefined;
    const json = JSON.parse(readFileSync(cachePath, "utf8")) as UpdateCache;
    if (typeof json.lastCheck !== "number" || typeof json.latest !== "string") return undefined;
    return json;
  } catch {
    return undefined;
  }
}

function writeCache(cachePath: string, cache: UpdateCache): void {
  try {
    mkdirSync(join(cachePath, ".."), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(cache));
  } catch {
    /* cache write is best-effort */
  }
}

function isNewer(candidate: string, current: string): boolean {
  const pa = candidate.replace(/^v/, "").split(".");
  const pb = current.replace(/^v/, "").split(".");
  for (let i = 0; i < 3; i += 1) {
    const a = Number(pa[i] ?? 0);
    const b = Number(pb[i] ?? 0);
    if (a !== b) return a > b;
  }
  return false;
}

/**
 * Entry point used by the CLI: prints the cached notice (if any) and
 * schedules a bounded refresh on an unref'd timer — the process can exit
 * before the fetch resolves without waiting for it.
 */
export function runUpdateCheck(opts: {
  cliVersion: string;
  packageName?: string;
  cachePath?: string;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
  now?: number;
}): void {
  const env = opts.env ?? process.env;
  const isTTY = opts.isTTY ?? process.stdout.isTTY === true;
  const now = opts.now ?? Date.now();
  if (!shouldRun(env, isTTY)) return;

  const cachePath = opts.cachePath ?? defaultCachePath();
  const packageName = opts.packageName ?? "@zturnlibs/ztron-cli";
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const cache = readCache(cachePath);

  const notice = resolveNotice(cache, opts.cliVersion, now);
  if (notice) console.error(dim(notice));

  if (cache && now - cache.lastCheck < REFRESH_TTL_MS) return;
  const timer = setTimeout(() => {
    void refreshCache(cachePath, packageName, opts.cliVersion, fetchImpl, now);
  }, 0);
  timer.unref?.();
}
