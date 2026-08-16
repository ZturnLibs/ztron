/** Clipboard API — mirrors `plugin:clipboard|*`. */
import { invoke } from "./core.js";
import { Image, toBase64 } from "./image.js";

export async function readText(): Promise<string | null> {
  return invoke<string | null>("plugin:clipboard|read_text", {});
}
export async function writeText(text: string): Promise<void> {
  await invoke("plugin:clipboard|write_text", { text });
}

/**
 * Reads an image from the clipboard as PNG bytes (null when the clipboard
 * holds no image). Ztron divergence: Tauri v2 returns an `Image`; here the
 * raw PNG bytes are returned directly — wrap with `Image.fromBytes` for a
 * registered image.
 */
export async function readImage(): Promise<Uint8Array | null> {
  // Raw IPC response: the injected invoke unwraps the envelope to bytes
  // (null when the clipboard holds no image).
  const r = await invoke<Uint8Array | null>("plugin:clipboard|read_image", {});
  return r ?? null;
}

/**
 * Writes an image to the clipboard. Accepts raw PNG bytes (Uint8Array /
 * number[] / ArrayBuffer) or a registered `Image` (re-encoded host-side).
 */
export async function writeImage(
  image: Image | Uint8Array | number[] | ArrayBuffer,
): Promise<void> {
  const args =
    image instanceof Image
      ? { rid: image.rid }
      : {
          base64: toBase64(
            image instanceof Uint8Array
              ? image
              : new Uint8Array(
                  image instanceof ArrayBuffer ? image : image,
                ),
          ),
        };
  await invoke("plugin:clipboard|write_image", args);
}

/** Clears the clipboard of all contents (text, images, files). */
export async function clear(): Promise<void> {
  await invoke("plugin:clipboard|clear", {});
}

export const clipboard = {
  readText,
  writeText,
  readImage,
  writeImage,
  clear,
};
