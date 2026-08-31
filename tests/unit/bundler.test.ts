/**
 * G13 (F3/F5/F6) — bundler artifact generators. Each portable packer must
 * emit deterministic control files/manifests WITHOUT the target toolchain
 * and report built:false with an explicit reason; the updater flow must
 * produce a verifiable minisign signature + latest.json.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  packNsis,
  packMsi,
  packAppImage,
  packDeb,
  packRpm,
  packUpdaterArtifacts,
  bundleAll,
  type BundleConfigShape,
} from "../../packages/cli/dist/bundler.js";
import {
  generateKeypair,
  verifyMinisig,
} from "../../packages/core/dist/index.js";

const CFG: BundleConfigShape = {
  identifier: "com.ztron.demo",
  productName: "DemoApp",
  version: "1.2.3",
  shortDescription: "demo app",
  resources: ["extra-assets/"],
};

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ztron-bundler-"));
}

test("nsis emits a complete installer script skeleton", () => {
  const dir = tmp();
  const r = packNsis(dir, CFG, "DemoApp.exe");
  assert.equal(r.type, "nsis");
  const nsi = readFileSync(join(dir, "nsis", "DemoApp.nsi"), "utf8");
  assert.ok(nsi.includes('Name "DemoApp"'));
  assert.ok(nsi.includes("MUI2.nsh"));
  assert.ok(nsi.includes("WriteUninstaller"));
  assert.ok(nsi.includes('File /r "extra-assets/"'));
  assert.equal(r.built, false);
  assert.ok(r.reason?.includes("makensis"));
});

test("msi emits a WiX source skeleton", () => {
  const dir = tmp();
  const r = packMsi(dir, CFG, "DemoApp.exe");
  const wxs = readFileSync(join(dir, "msi", "DemoApp.wxs"), "utf8");
  assert.ok(wxs.includes("<Wix"));
  assert.ok(wxs.includes('Version="1.2.3"'));
  assert.ok(wxs.includes("UpgradeCode"));
  assert.equal(r.built, false);
});

test("appimage emits AppDir layout (AppRun + desktop + icon)", () => {
  const dir = tmp();
  const iconSrc = join(dir, "icon.png");
  writeFileSync(iconSrc, "png");
  const r = packAppImage(dir, { ...CFG, icons: [iconSrc] }, "/usr/bin/demo");
  const appdir = join(dir, "DemoApp.AppDir");
  assert.ok(existsSync(join(appdir, "AppRun")));
  const desktop = readFileSync(join(appdir, "com.ztron.demo.desktop"), "utf8");
  assert.ok(desktop.includes("Type=Application"));
  assert.ok(existsSync(join(appdir, "com.ztron.demo.png")));
  assert.equal(r.built, false);
});

test("deb emits DEBIAN/control with dependencies", () => {
  const dir = tmp();
  const r = packDeb(dir, CFG, "/usr/bin/demo");
  const control = readFileSync(join(dir, "DemoApp-deb", "DEBIAN", "control"), "utf8");
  assert.ok(control.startsWith("Package: com.ztron.demo"));
  assert.ok(control.includes("Version: 1.2.3"));
  assert.ok(control.includes("libwebkit2gtk-4.1-0"));
  assert.equal(r.built, false);
});

test("rpm emits a spec with webkit requirement", () => {
  const dir = tmp();
  const r = packRpm(dir, CFG, "/usr/bin/demo");
  const spec = readFileSync(join(dir, "com.ztron.demo.spec"), "utf8");
  assert.ok(spec.includes("Name: com.ztron.demo"));
  assert.ok(spec.includes("Requires: webkit2gtk4.1"));
  assert.equal(r.built, false);
});

test("bundleAll dispatches every requested target", () => {
  const dir = tmp();
  const rs = bundleAll(dir, CFG, {
    binPath: "/x/demo",
    targets: ["nsis", "msi", "appimage", "deb", "rpm"],
  });
  assert.deepEqual(
    rs.map((r) => r.type).sort(),
    ["appimage", "deb", "msi", "nsis", "rpm"],
  );
  assert.ok(rs.every((r) => r.built === false && r.reason));
});

test("updater artifacts: minisign signature verifies + latest.json shape", async () => {
  const dir = tmp();
  const artifact = join(dir, "DemoApp.dmg");
  const payload = new Uint8Array(2048);
  for (let i = 0; i < payload.length; i++) payload[i] = i & 0xff;
  writeFileSync(artifact, payload);

  const { publicKeyText, secretKeyText } = generateKeypair();
  const out = await packUpdaterArtifacts(dir, artifact, {
    version: "1.2.3",
    notes: "test release",
    platformKey: "darwin",
    pubkeyText: publicKeyText,
    secretKeyText,
    baseUrl: "https://updates.example.com/v",
  });

  const manifest = JSON.parse(readFileSync(out.manifestPath, "utf8"));
  assert.equal(manifest.version, "1.2.3");
  assert.equal(manifest.platforms.darwin.url, "https://updates.example.com/v/DemoApp.dmg");
  assert.ok(manifest.platforms.darwin.sha256.length === 64);
  const sigText = readFileSync(out.signaturePath, "utf8");
  assert.equal(sigText, manifest.platforms.darwin.signature);

  const res = verifyMinisig(payload, sigText, publicKeyText);
  assert.equal(res.ok, true, JSON.stringify(res));

  // tamper detection through the published manifest path
  const evil = payload.slice();
  evil[0] ^= 1;
  assert.equal(verifyMinisig(evil, sigText, publicKeyText).ok, false);
});
