/**
 * Image API — a port of `@tauri-apps/api/image`. Images are registered with
 * the host and referenced by id; use them with `tray.setIcon` / window icons.
 */
import { invoke } from "./core.js";

/** Converts bytes to a base64 string for the wire. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * A native image registered in the host. Create with `fromPath`/`fromBytes`
 * (and `fromRGBA` for raw pixels) and pass to `tray.setIcon` / `setIcon`.
 */
export class Image {
  /** The host-side image registry id. */
  readonly rid: number;

  private constructor(rid: number) {
    this.rid = rid;
  }

  /** Loads an image from a file path. */
  static async fromPath(path: string): Promise<Image> {
    const rid = await invoke<number>("plugin:image|from_path", { path });
    if (rid < 0) throw new Error("image: failed to load from path");
    return new Image(rid);
  }

  /** Loads an image from raw bytes. */
  static async fromBytes(bytes: number[] | Uint8Array): Promise<Image> {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const rid = await invoke<number>("plugin:image|from_bytes", {
      base64: toBase64(data),
    });
    if (rid < 0) throw new Error("image: failed to decode bytes");
    return new Image(rid);
  }

  /** Builds an image from RGBA pixel data. */
  static async fromRGBA(
    rgba: number[] | Uint8Array,
    width: number,
    height: number,
  ): Promise<Image> {
    const data = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba);
    const bytes = new Uint8Array(8 + data.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, width, true);
    view.setUint32(4, height, true);
    bytes.set(data, 8);
    const rid = await invoke<number>("plugin:image|from_bytes", {
      base64: toBase64(bytes),
    });
    if (rid < 0) throw new Error("image: failed to build from rgba");
    return new Image(rid);
  }

  /** Releases the image in the host. */
  async close(): Promise<void> {
    await invoke("plugin:image|destroy", { id: this.rid });
  }
}
