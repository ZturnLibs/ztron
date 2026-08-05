/**
 * Scoped HTTP client — mirrors `plugin:http|fetch` from `@ztron/core`.
 * Every request is checked against the app's configured HTTP scope.
 */
import { invoke } from "./core.js";
import type { InvokeArgs } from "./core.js";

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
}

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** Performs a scoped HTTP request; throws if the URL is out of scope. */
export function fetch(
  url: string,
  options: FetchOptions = {},
): Promise<HttpResponse> {
  const args: InvokeArgs = { url, ...options };
  return invoke<HttpResponse>("plugin:http|fetch", args);
}

export const http = { fetch };
