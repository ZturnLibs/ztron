/*
 * Legacy-resolution shim for the `@zturnlibs/tjs-types/web` entry: module
 * resolutions that ignore package.json `exports` (TypeScript's default in
 * tsconfig-less / inferred projects, e.g. the vanilla `ztron init`
 * scaffold) probe for `web.d.ts` at the package root. Modern `exports`-aware
 * resolutions go straight to `./src/web-globals.d.ts` (see package.json).
 * Ztron addition — scripts/sync-tjs-types.sh never touches this file.
 */

/// <reference path="./src/web-globals.d.ts" />
