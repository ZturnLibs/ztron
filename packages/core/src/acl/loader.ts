/**
 * Capability parsing + loading utilities.
 *
 * Since zod (and most npm libs) don't work under txiki.js (no module
 * resolution), validation is hand-written but produces clear errors matching
 * the Tauri capability schema.
 */
import type { CapabilityFile, Capability, PermissionEntry } from "./types.js";

/** Parses + validates a capability file JSON string. */
export function parseCapabilityFile(json: string): CapabilityFile {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("capability file is not valid JSON");
  }
  return normalizeFile(data);
}

/**
 * Loads every `*.json` capability file in `dir` and returns them in a
 * deterministic (alphabetical) order.
 */
export async function loadCapabilitiesFromDir(
  dir: string,
): Promise<CapabilityFile[]> {
  const iter = await tjs.readDir(dir);
  const names: string[] = [];
  for await (const entry of iter as unknown as AsyncIterable<DirEntry>) {
    if (entry.isFile && entry.name.endsWith(".json")) {
      names.push(entry.name);
    }
  }
  names.sort();
  const out: CapabilityFile[] = [];
  for (const name of names) {
    const bytes = await tjs.readFile(`${dir}/${name}`);
    const text = new TextDecoder().decode(bytes);
    out.push(parseCapabilityFile(text));
  }
  return out;
}

/** Convenience: load from the default `./capabilities` dir (empty if missing). */
export async function loadCapabilities(
  dir = "./capabilities",
): Promise<CapabilityFile[]> {
  try {
    return await loadCapabilitiesFromDir(dir);
  } catch {
    return [];
  }
}

function normalizeFile(data: unknown): CapabilityFile {
  if (Array.isArray(data)) {
    return data.map(normalizeCapability);
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if ("capabilities" in obj && Array.isArray(obj.capabilities)) {
      return { capabilities: obj.capabilities.map(normalizeCapability) };
    }
    return normalizeCapability(obj);
  }
  throw new Error(
    "capability file must be an object, array, or { capabilities: [] }",
  );
}

function normalizeCapability(data: unknown): Capability {
  if (!data || typeof data !== "object") {
    throw new Error("capability must be an object");
  }
  const obj = data as Record<string, unknown>;
  requireString(obj.identifier, "capability.identifier");
  if (!Array.isArray(obj.windows)) {
    throw new Error(`capability "${obj.identifier}": windows must be an array`);
  }
  if (!Array.isArray(obj.permissions)) {
    throw new Error(
      `capability "${obj.identifier}": permissions must be an array`,
    );
  }
  return {
    identifier: String(obj.identifier),
    description:
      typeof obj.description === "string" ? obj.description : undefined,
    windows: obj.windows.map((w) => {
      if (typeof w !== "string")
        throw new Error("window label must be a string");
      return w;
    }),
    permissions: obj.permissions.map(normalizeEntry),
  };
}

function normalizeEntry(data: unknown): PermissionEntry {
  if (typeof data === "string") {
    return { identifier: data };
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    requireString(obj.identifier, "permission entry identifier");
    const entry: PermissionEntry = { identifier: String(obj.identifier) };
    if (obj.allow && Array.isArray(obj.allow)) {
      entry.scope = {
        allow: obj.allow.map(String),
        deny: Array.isArray(obj.deny) ? obj.deny.map(String) : undefined,
      };
    }
    return entry;
  }
  throw new Error("permission entry must be a string or { identifier }");
}

function requireString(v: unknown, name: string): void {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}
