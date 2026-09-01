/**
 * `ztron icon|info|add|migrate` — developer-tool subcommands (GAP F4 tail).
 * icon/migrate are covered by unit tests; info/add are conveniences.
 */
import {
  spawnSync,
} from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

/** macOS iconset sizes: [logical, scale] pairs (upstream tauri icon set). */
const ICON_SIZES: Array<[number, number]> = [
  [16, 1],
  [16, 2],
  [32, 1],
  [32, 2],
  [128, 1],
  [128, 2],
  [256, 1],
  [256, 2],
  [512, 1],
  [512, 2],
];

function sipsResize(src: string, size: number, out: string): boolean {
  const r = spawnSync(
    "sips",
    ["-z", String(size), String(size), src, "--out", out],
    { encoding: "utf8" },
  );
  return r.status === 0;
}

/** Generates `<name>.iconset`, packs `AppIcon.icns`, and copies plain-size
 *  PNGs (`32x32.png`, `128x128.png`, `128x128@2x.png`, …) like tauri icon. */
export function generateIcons(
  inputPng: string,
  outDir: string,
): { icns: string; iconset: string; pngs: string[] } {
  if (!existsSync(inputPng)) {
    throw new Error(`icon: input not found: ${inputPng}`);
  }
  mkdirSync(outDir, { recursive: true });
  const base = basename(inputPng).replace(/\.png$/i, "");
  const iconsetDir = join(outDir, `${base}.iconset`);
  mkdirSync(iconsetDir, { recursive: true });
  const pngs: string[] = [];

  for (const [logical, scale] of ICON_SIZES) {
    const px = logical * scale;
    const name = `icon_${logical}x${logical}${scale > 1 ? "@2x" : ""}.png`;
    const dst = join(iconsetDir, name);
    if (!sipsResize(inputPng, px, dst)) {
      throw new Error(`icon: sips failed for ${logical}@${scale}x`);
    }
    const plain = join(outDir, `${logical}x${logical}${scale > 1 ? "@2x" : ""}.png`);
    renameSync(dst, plain);
    renameSync(plain, dst); /* keep both: iconset member + plain-size copy */
    writeFileSync(plain, readFileSync(dst));
    pngs.push(plain);
  }

  const icns = join(outDir, "AppIcon.icns");
  const pack = spawnSync("iconutil", ["-c", "icns", iconsetDir, "-o", icns], {
    encoding: "utf8",
  });
  if (pack.status !== 0) {
    throw new Error(`icon: iconutil failed: ${(pack.stderr ?? "").slice(0, 160)}`);
  }
  return { icns, iconset: iconsetDir, pngs };
}

/** `ztron info` — environment report (tauri info spirit). */
export function printInfo(cwd: string, tjsPath: string): void {
  const lines: Array<[string, string]> = [
    ["node", process.version],
    ["platform", `${process.platform} ${process.arch}`],
    ["cwd", cwd],
  ];
  const tjs = tjsPath || "native/txiki.js/build/tjs";
  lines.push(["tjs", `${tjs} (${existsSync(tjs) ? "found" : "MISSING"})`]);
  const host = "native/libs/ztron-host";
  lines.push(["ztron-host", `${host} (${existsSync(host) ? "built" : "missing"})`]);
  const lib = "native/libs/libwebview.dylib";
  lines.push(["libwebview", `${lib} (${existsSync(lib) ? "built" : "missing"})`]);
  const conf = join(cwd, "ztron.conf.json");
  lines.push(["ztron.conf.json", existsSync(conf) ? "present" : "absent"]);
  const caps = join(cwd, "capabilities");
  lines.push(["capabilities/", existsSync(caps) ? "present" : "absent"]);
  const sips = spawnSync("which", ["sips"], { encoding: "utf8" });
  lines.push(["sips (icon tooling)", sips.status === 0 ? "available" : "absent"]);
  for (const [k, v] of lines) console.log(`  ${k.padEnd(20)} ${v}`);
}

/** `ztron add <plugin>` — scaffolds a capability file + prints the wiring. */
export function addPlugin(cwd: string, plugin: string): void {
  const capsDir = join(cwd, "capabilities");
  if (!existsSync(capsDir)) {
    console.log(
      `[ztron] no capabilities/ dir in ${cwd} — run inside a ztron project.\n` +
        `        create it, or wire the plugin programmatically instead.`,
    );
    return;
  }
  const file = join(capsDir, `${plugin}.json`);
  if (existsSync(file)) {
    console.log(`[ztron] ${file} already exists — nothing to do.`);
    return;
  }
  writeFileSync(
    file,
    JSON.stringify(
      { identifier: `${plugin}-cap`, windows: ["main"], permissions: [`${plugin}:default`] },
      null,
      2,
    ) + "\n",
  );
  console.log(`[ztron] wrote ${file}`);
  console.log(
    `[ztron] register the plugin in your backend entry:\n` +
      `          .plugin(${plugin}Plugin())\n` +
      `        (import from "@zturnlibs/core")`,
  );
}

interface TauriConf {
  productName?: string;
  version?: string;
  identifier?: string;
  build?: { devUrl?: string; frontendDist?: string };
  app?: {
    windows?: Array<Record<string, unknown>>;
    security?: { csp?: string };
  };
  bundle?: { icon?: string[] };
}

const WINDOW_FIELD_MAP: Record<string, string> = {
  label: "label",
  title: "title",
  width: "width",
  height: "height",
  minWidth: "minWidth",
  minHeight: "minHeight",
  maxWidth: "maxWidth",
  maxHeight: "maxHeight",
  resizable: "resizable",
  maximizable: "maximizable",
  minimizable: "minimizable",
  closable: "closable",
  fullscreen: "fullscreen",
  visible: "visible",
  center: "center",
  x: "x",
  y: "y",
  alwaysOnTop: "alwaysOnTop",
  decorations: "decorations",
  skipTaskbar: "skipTaskbar",
  theme: "theme",
  titleBarStyle: "titleBarStyle",
  url: "url",
  userAgent: "userAgent",
  parent: "parent",
};

/** Pure mapping: tauri.conf.json shape -> ztron.conf.json shape. */
export function convertTauriConf(conf: TauriConf): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (conf.identifier) out.identifier = conf.identifier;
  if (conf.productName) {
    out.appName = conf.productName;
    out.productName = conf.productName;
  }
  if (conf.version) out.version = conf.version;
  if (conf.build?.frontendDist) {
    out.frontend = String(conf.build.frontendDist);
  }
  if (conf.app?.security?.csp) out.csp = conf.app.security.csp;
  const windows = (conf.app?.windows ?? [])
    .map((w) => {
      const m: Record<string, unknown> = {};
      for (const [from, to] of Object.entries(WINDOW_FIELD_MAP)) {
        if (w[from] !== undefined) m[to] = w[from];
      }
      if (m.url === "index.html" || m.url === "/" || m.url === "./") {
        m.url = "frontend";
      }
      return m;
    })
    .filter((w) => Object.keys(w).length > 0);
  if (windows.length) out.windows = windows;
  if (conf.bundle?.icon?.length) {
    out.bundle = { icon: conf.bundle.icon };
  }
  if (conf.build?.devUrl) {
    out.__note_devUrl = `set ZTRON_DEV_URL=${conf.build.devUrl} (or dev server config)`;
  }
  return out;
}

/** `ztron migrate [tauri.conf.json] [-o ztron.conf.json]`. */
export function migrateConf(
  cwd: string,
  args: string[],
): void {
  const input =
    resolve(cwd, args.find((a) => !a.startsWith("-")) ?? "tauri.conf.json");
  const outIdx = args.indexOf("-o");
  const output = resolve(
    cwd,
    outIdx >= 0 ? (args[outIdx + 1] ?? "ztron.conf.json") : "ztron.conf.json",
  );
  if (!existsSync(input)) {
    throw new Error(`migrate: input not found: ${input}`);
  }
  const converted = convertTauriConf(
    JSON.parse(readFileSync(input, "utf8")) as TauriConf,
  );
  writeFileSync(output, JSON.stringify(converted, null, 2) + "\n");
  console.log(`[ztron] migrated ${input} -> ${output}`);
  for (const key of Object.keys(converted)) {
    if (key.startsWith("__note_")) console.log(`[ztron] note: ${converted[key]}`);
  }
}
