/**
 * G19/F4 — `ztron icon` (real sips+iconutil generation) and
 * `ztron migrate` (tauri.conf.json -> ztron.conf.json mapping).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, statSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateIcons,
  convertTauriConf,
} from "../../packages/cli/dist/tools.js";

const ROOT = new URL("../..", import.meta.url).pathname;

test("icon: sips+iconutil produce a real icns + 10 size PNGs", { skip: process.platform !== "darwin" }, () => {
  const out = mkdtempSync(join(tmpdir(), "ztron-icon-"));
  try {
    const r = generateIcons(join(ROOT, "assets/app-icon.png"), out);
    assert.ok(existsSync(r.icns));
    assert.ok(statSync(r.icns).size > 10_000, "icns suspiciously small");
    assert.equal(r.pngs.length, 10);
    for (const p of r.pngs) assert.ok(existsSync(p));
    assert.ok(existsSync(join(r.iconset, "icon_16x16.png")));
    assert.ok(existsSync(join(r.iconset, "icon_512x512@2x.png")));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("migrate: tauri.conf.json maps onto the ztron.conf.json shape", () => {
  const converted = convertTauriConf({
    productName: "My App",
    version: "1.4.2",
    identifier: "com.example.myapp",
    build: { devUrl: "http://localhost:1420", frontendDist: "../dist" },
    app: {
      security: { csp: "default-src 'self'" },
      windows: [
        {
          label: "main",
          title: "My App",
          width: 1024,
          height: 768,
          minWidth: 400,
          resizable: true,
          url: "index.html",
          userAgent: "custom/1.0",
          ignoreMe: true,
        },
      ],
    },
    bundle: { icon: ["icons/icon.icns"] },
  });
  assert.equal(converted.appName, "My App");
  assert.equal(converted.identifier, "com.example.myapp");
  assert.equal(converted.version, "1.4.2");
  assert.equal(converted.frontend, "../dist");
  assert.equal(converted.csp, "default-src 'self'");
  const w = (converted.windows as Array<Record<string, unknown>>)[0]!;
  assert.equal(w.label, "main");
  assert.equal(w.width, 1024);
  assert.equal(w.url, "frontend"); /* index.html → frontend root */
  assert.equal(w.userAgent, "custom/1.0"); /* carried (G10 unsupported-keys) */
  assert.equal("ignoreMe" in w, false); /* unknown fields dropped */
  assert.deepEqual((converted.bundle as { icon: string[] }).icon, [
    "icons/icon.icns",
  ]);
  assert.ok(
    String(converted.__note_devUrl).includes("http://localhost:1420"),
  );
});
