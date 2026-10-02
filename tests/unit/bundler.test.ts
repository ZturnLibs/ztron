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
  findMakensis,
  packNsis,
  packNsisDir,
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

test("nsisDir emits flat-layout installer script; .ico in icons becomes MUI + shortcut icon", () => {
  const dir = tmp();
  const appDir = join(dir, "app");
  mkdirSync(appDir, { recursive: true });
  // when makensis is discoverable the .nsi really compiles — `File /r
  // appDir\*.*` aborts on an empty dir, so give it a payload file
  writeFileSync(join(appDir, "payload.bin"), "x");
  const icoSrc = join(dir, "app.ico");
  // minimal VALID 16x16 32bpp .ico — makensis compiles MUI_ICON into the exe
  // resource, so text-stub bytes would make the build branch fail
  const ico = Buffer.alloc(1150);
  ico.writeUInt16LE(1, 2); // type: icon
  ico.writeUInt16LE(1, 4); // 1 image
  ico.writeUInt8(16, 6); // width
  ico.writeUInt8(16, 7); // height
  ico.writeUInt16LE(1, 10); // planes
  ico.writeUInt16LE(32, 12); // bpp
  ico.writeUInt32LE(1150 - 22, 14); // bytes in resource
  ico.writeUInt32LE(22, 18); // image offset
  ico.writeUInt32LE(40, 22); // BITMAPINFOHEADER size
  ico.writeInt32LE(16, 26); // width
  ico.writeInt32LE(32, 30); // height (XOR + AND)
  ico.writeUInt16LE(1, 34); // planes
  ico.writeUInt16LE(32, 36); // bpp
  writeFileSync(icoSrc, ico);
  const r = packNsisDir(dir, { ...CFG, icons: [icoSrc] }, appDir, "ztron-launcher.exe");
  assert.equal(r.type, "nsis");
  const nsi = readFileSync(join(dir, "nsis", "DemoApp.nsi"), "utf8");
  assert.ok(nsi.includes("!define MUI_ICON"));
  assert.ok(nsi.includes("!define MUI_UNICON"));
  assert.ok(nsi.includes('File "' + join(dir, "nsis", "app.ico") + '"'));
  assert.ok(
    nsi.includes(
      'CreateShortcut "$SMPROGRAMS\\DemoApp.lnk" "$INSTDIR\\ztron-launcher.exe" "" "$INSTDIR\\app.ico" 0',
    ),
  );
  assert.ok(nsi.includes('WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.ztron.demo" "DisplayIcon" "$INSTDIR\\app.ico"'));
  // the .ico is staged next to the .nsi so makensis can compile it in
  assert.ok(existsSync(join(dir, "nsis", "app.ico")));
  // Availability-tolerant: on hosts with makensis discoverable (windows-spike
  // runners install NSIS; devs may have it or ZTRON_MAKENSIS) packNsisDir
  // really builds — the content pins above are the contract, the built flag
  // only reports the toolchain.
  if (findMakensis() === null) {
    assert.equal(r.built, false);
    assert.ok(r.reason?.includes("makensis"));
  } else {
    assert.equal(r.built, true);
    assert.ok(existsSync(r.path));
  }
});

test("nsisDir without .ico stays icon-less (shortcut has no icon arg)", () => {
  const dir = tmp();
  const appDir = join(dir, "app");
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(appDir, "payload.bin"), "x"); // makensis aborts on an empty appDir
  const pngSrc = join(dir, "icon.png");
  writeFileSync(pngSrc, "png");
  const r = packNsisDir(dir, { ...CFG, icons: [pngSrc] }, appDir, "ztron-launcher.exe");
  const nsi = readFileSync(join(dir, "nsis", "DemoApp.nsi"), "utf8");
  assert.ok(!nsi.includes("MUI_ICON"));
  assert.ok(
    nsi.includes(
      'CreateShortcut "$SMPROGRAMS\\DemoApp.lnk" "$INSTDIR\\ztron-launcher.exe"',
    ),
  );
  assert.ok(!nsi.includes('"$INSTDIR\\icon.png" 0'));
  assert.ok(nsi.includes('WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.ztron.demo" "DisplayIcon" "$INSTDIR\\ztron-launcher.exe"'));
  if (findMakensis() === null) {
    assert.equal(r.built, false);
  } else {
    assert.equal(r.built, true);
    assert.ok(existsSync(r.path));
  }
});

test("findMakensis: ZTRON_MAKENSIS override wins (portable installs)", () => {
  const fake = join(tmp(), "makensis.exe");
  writeFileSync(fake, "stub");
  const prev = process.env.ZTRON_MAKENSIS;
  process.env.ZTRON_MAKENSIS = fake;
  try {
    assert.equal(findMakensis(), fake);
  } finally {
    if (prev === undefined) delete process.env.ZTRON_MAKENSIS;
    else process.env.ZTRON_MAKENSIS = prev;
  }
});

test("findMakensis: a nonexistent ZTRON_MAKENSIS falls through to discovery", () => {
  const prev = process.env.ZTRON_MAKENSIS;
  process.env.ZTRON_MAKENSIS = join(tmpdir(), "ztron-no-such-makensis");
  try {
    const found = findMakensis();
    // discovery is machine-dependent: null (tool absent) or a real path —
    // both acceptable; the override contract is only about the existing-env
    // case above.
    if (found !== null) assert.ok(existsSync(found));
  } finally {
    if (prev === undefined) delete process.env.ZTRON_MAKENSIS;
    else process.env.ZTRON_MAKENSIS = prev;
  }
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
