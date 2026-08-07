/** Clipboard API — mirrors `plugin:clipboard|*`. */
import { invoke } from "./core.js";

export async function readText(): Promise<string | null> {
  return invoke<string | null>("plugin:clipboard|read_text", {});
}
export async function writeText(text: string): Promise<void> {
  await invoke("plugin:clipboard|write_text", { text });
}

export const clipboard = { readText, writeText };
