/**
 * Ztron additions: runtime globals the upstream types miss, each verified
 * against the vendored txiki.js this package syncs from.
 *
 * Keep a unique filename — scripts/sync-tjs-types.sh overwrites every file
 * that also exists in the upstream types/src directory.
 */

declare global {
    namespace tjs {
        /**
         * Lowercase CMake system name of the host ("darwin" | "linux" |
         * "windows"). Exposed by the sys module (src/mod_sys.c,
         * tjs__mod_sys_init) but missing from the upstream types.
         *
         * @category System
         */
        const platform: "darwin" | "linux" | "windows";
    }
}

export {};
