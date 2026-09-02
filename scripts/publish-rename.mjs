/**
 * Publish-time package renamer — bridges the in-repo `@ztron/*` namespace
 * to the GitHub Packages requirement that the scope match the repository
 * owner (`@zturnlibs`), mapping to `@zturnlibs/ztron-<name>` (GAP: the
 * `@ztron` scope cannot be hosted under the ZturnLibs owner).
 *
 *   node scripts/publish-rename.mjs apply    # rewrite name/deps in-place
 *   node scripts/publish-rename.mjs restore  # git-checkout the manifests
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const PACKAGES = [
  "packages/inject",
  "packages/core",
  "packages/runtime-ffi",
  "packages/api",
  "packages/cli",
  "packages/driver",
];

const mapDep = (k) =>
  k.startsWith("@ztron/") ? `@zturnlibs/ztron-${k.slice(7)}` : k;

function apply() {
  for (const dir of PACKAGES) {
    const p = `${dir}/package.json`;
    const d = JSON.parse(readFileSync(p, "utf8"));
    d.name = mapDep(d.name);
    if (d.dependencies) {
      d.dependencies = Object.fromEntries(
        Object.entries(d.dependencies).map(([k, v]) => [mapDep(k), v]),
      );
    }
    if (d.peerDependencies) {
      d.peerDependencies = Object.fromEntries(
        Object.entries(d.peerDependencies).map(([k, v]) => [mapDep(k), v]),
      );
    }
    writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
    console.log(`renamed -> ${d.name}`);
  }
}

function restore() {
  for (const dir of PACKAGES) {
    execSync(`git checkout -- ${dir}/package.json`, { stdio: "inherit" });
  }
  console.log("manifests restored");
}

const cmd = process.argv[2];
if (cmd === "apply") apply();
else if (cmd === "restore") restore();
else {
  console.error("usage: publish-rename.mjs apply|restore");
  process.exit(1);
}
