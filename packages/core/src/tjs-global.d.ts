/**
 * The `tjs` runtime surface comes from @zturnlibs/tjs-types — the official
 * @txikijs/types synced from the vendored txiki.js checkout (see
 * scripts/sync-tjs-types.sh), plus `./web` for the web platform globals this
 * pure-ES2022 package can't get from node/DOM types. Do not re-declare `tjs`
 * here; augment @zturnlibs/tjs-types instead.
 */

/// <reference types="@zturnlibs/tjs-types" />
/// <reference types="@zturnlibs/tjs-types/web" />
