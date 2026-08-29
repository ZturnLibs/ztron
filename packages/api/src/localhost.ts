/** Localhost origin API — mirrors `plugin:localhost|*` (GAP E1). */
import { invoke } from "./core.js";

export interface LocalhostStatus {
  already?: boolean;
  running?: boolean;
  port: number | null;
  origin?: string;
  stopped?: boolean;
}

/** Starts (or reports) the localhost asset origin. */
export function start(port?: number): Promise<LocalhostStatus> {
  return invoke<LocalhostStatus>("plugin:localhost|start", port ? { port } : {});
}

/** Stops the origin. */
export function stop(): Promise<LocalhostStatus> {
  return invoke<LocalhostStatus>("plugin:localhost|stop", {});
}

/** Current origin status. */
export function status(): Promise<LocalhostStatus> {
  return invoke<LocalhostStatus>("plugin:localhost|status", {});
}

export const localhost = { start, stop, status };
