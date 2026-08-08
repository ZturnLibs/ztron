/**
 * Upload API — a port of Tauri's `tauri-plugin-upload`, backed by the
 * `plugin:upload|*` command.
 */
import { invoke } from "./core.js";

export interface UploadResult {
  status: number;
  ok: boolean;
  body: string;
}

/** Uploads a file's contents to a scoped URL (raw POST). */
export async function upload(url: string, file: string): Promise<UploadResult> {
  return invoke<UploadResult>("plugin:upload|upload", { url, file });
}

export const uploader = { upload };
