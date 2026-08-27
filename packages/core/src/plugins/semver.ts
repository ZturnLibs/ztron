/**
 * SemVer 2.0.0 precedence comparison (semver.org §11) — used by the updater
 * so prerelease channels behave exactly like Tauri's Cargo-semver gate
 * (`1.0.0-beta < 1.0.0`, build metadata ignored on both sides).
 */

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** Prerelease identifiers split on "."; null when absent. */
  pre: readonly string[] | null;
}

function parseSemver(input: string): ParsedVersion {
  // Build metadata never affects precedence.
  const withoutBuild = input.split("+", 1)[0] ?? input;
  const dash = withoutBuild.indexOf("-");
  const mainPart = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  const prePart = dash === -1 ? null : withoutBuild.slice(dash + 1);

  const nums = mainPart.split(".");
  if (nums.length !== 3) {
    throw new Error(`semver: invalid version "${input}"`);
  }
  const coreNums = nums.map((n) => {
    if (!/^\d+$/.test(n)) {
      throw new Error(`semver: invalid numeric "${n}" in "${input}"`);
    }
    return Number.parseInt(n, 10);
  });
  return {
    major: coreNums[0] ?? 0,
    minor: coreNums[1] ?? 0,
    patch: coreNums[2] ?? 0,
    pre: prePart === null ? null : prePart.split("."),
  };
}

/**
 * Returns −1 / 0 / +1 for a<b / equal / a>b under SemVer precedence rules.
 * Throws on non-semver inputs (callers decide whether that is fatal —
 * silent "NaN → 0" coercion was the old compareVersions bug).
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    const ai = [pa.major, pa.minor, pa.patch][i]!;
    const bi = [pb.major, pb.minor, pb.patch][i]!;
    if (ai !== bi) return ai < bi ? -1 : 1;
  }
  // A version WITH a prerelease has LOWER precedence than one without.
  if (pa.pre === null && pb.pre === null) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;

  const len = Math.min(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i++) {
    const ai = pa.pre[i]!;
    const bi = pb.pre[i]!;
    if (ai === bi) continue;
    const aNum = /^\d+$/.test(ai);
    const bNum = /^\d+$/.test(bi);
    if (aNum && bNum) {
      const na = Number.parseInt(ai, 10);
      const nb = Number.parseInt(bi, 10);
      if (na !== nb) return na < nb ? -1 : 1;
      continue; // "00" vs "0" numeric-equal → keep scanning identifiers
    }
    // Numeric identifiers always have lower precedence than alphanumeric.
    if (aNum) return -1;
    if (bNum) return 1;
    return ai < bi ? -1 : 1;
  }
  // All shared identifiers equal → the shorter one has lower precedence.
  if (pa.pre.length === pb.pre.length) return 0;
  return pa.pre.length < pb.pre.length ? -1 : 1;
}
