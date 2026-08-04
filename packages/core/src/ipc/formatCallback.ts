/**
 * Serializes a value into a JS expression that invokes a registered callback.
 *
 * Translated from Tauri's `crates/tauri/src/ipc/format_callback.rs`.
 * For large JSON payloads we route through `JSON.parse('...')` to avoid
 * evaluating arbitrary object literals.
 */

/** Minimum JSON length before the `JSON.parse('...')` path is used. */
const MIN_JSON_PARSE_LEN = 10_240;

/** Maximum JSON string length the WebView can realistically handle. */
const MAX_JSON_STR_LEN = 2 ** 30 - 2;

/** Single-quote escaped string literal, safe to embed in an `eval` call. */
function escapeJsString(value: string): string {
  return (
    "'" +
    value
      .replaceAll("\\", "\\\\")
      .replaceAll("'", "\\'")
      .replaceAll("\u2028", "\\u2028")
      .replaceAll("\u2029", "\\u2029")
      .replaceAll("\n", "\\n")
      .replaceAll("\r", "\\r")
      .replaceAll("\u0000", "\\u0000")
      .replaceAll("\t", "\\t") +
    "'"
  );
}

function primitiveLiteral(value: unknown): string | undefined {
  switch (typeof value) {
    case "string":
      return escapeJsString(value);
    case "number":
    case "boolean":
      return String(value);
    case "bigint":
      return `${value}n`;
    case "undefined":
      return "undefined";
    default:
      return value === null ? "null" : undefined;
  }
}

/**
 * Produces the JS expression `window.__TAURI_INTERNALS__.runCallback(id, value)`
 * with `value` serialized safely. Used for events and Channel messages.
 */
export function formatCallback(callbackId: number, value: unknown): string {
  const prim = primitiveLiteral(value);
  const expr = prim ?? complexExpr(value);
  return `window.__TAURI_INTERNALS__.runCallback(${callbackId}, ${expr})`;
}

function complexExpr(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) {
    return "undefined";
  }
  if (json.length > MAX_JSON_STR_LEN) {
    throw new Error(
      `Serialized value exceeds the maximum supported length (${MAX_JSON_STR_LEN}).`,
    );
  }
  if (json.length >= MIN_JSON_PARSE_LEN) {
    // Avoid embedding a huge object literal; parse it at the call site.
    return `JSON.parse(${escapeJsString(json)})`;
  }
  return json;
}
