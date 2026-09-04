/**
 * `ztron doctor` — one-shot environment check for newcomers.
 * Pure logic here (returns a report); index.ts renders and sets exit code.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { findTjs, findHostBin, findWebviewLib } from "./native-locate.js";

export interface DoctorCheck {
  name: string;
  pass: boolean;
  detail: string;
  hint: string;
}
export interface DoctorReport {
  checks: DoctorCheck[];
  ok: boolean;
}

const CHAIN_HINT =
  "clone https://github.com/ZturnLibs/ztron and run `scripts/build-native.sh`, then export ZTRON_TJS / ZTRON_HOST_BIN / ZTRON_WEBVIEW_LIB to native/libs/*";

export function runDoctor(opts: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  platform: string;
}): DoctorReport {
  const { cwd, env, platform } = opts;
  const checks: DoctorCheck[] = [];

  const nodeOk = Number.parseInt(process.versions.node, 10) >= 20;
  checks.push({
    name: "node >= 20",
    pass: nodeOk,
    detail: process.versions.node,
    hint: "install Node.js 20+ from https://nodejs.org",
  });

  try {
    const p = env.ZTRON_TJS ?? findTjs();
    checks.push({ name: "tjs runtime", pass: existsSync(resolve(p)) || p === "tjs", detail: p, hint: CHAIN_HINT });
  } catch (e) {
    checks.push({ name: "tjs runtime", pass: false, detail: String((e as Error).message), hint: CHAIN_HINT });
  }

  const host = env.ZTRON_HOST_BIN
    ? resolve(env.ZTRON_HOST_BIN)
    : findHostBin(cwd);
  checks.push({
    name: "ztron-host",
    pass: existsSync(host),
    detail: host,
    hint: CHAIN_HINT,
  });

  const lib = findWebviewLib(cwd);
  checks.push({
    name: "webview library",
    pass: Boolean(lib && existsSync(lib)),
    detail: lib ?? "not found",
    hint: CHAIN_HINT,
  });

  /* Platform: informational only — it never fails the doctor. Always emitted
     so the report has a stable shape (5 checks); on the supported dev
     platform it just confirms that, elsewhere it warns the host is a
     skeleton (see ROADMAP.md). */
  checks.push({
    name: "platform",
    pass: true,
    detail:
      platform === "darwin"
        ? "darwin — supported dev platform"
        : `${platform} — host is a skeleton; macOS is the supported dev platform`,
    hint: platform === "darwin" ? "" : "see ROADMAP.md for Windows/Linux status",
  });

  return { checks, ok: checks.every((c) => c.pass) };
}
