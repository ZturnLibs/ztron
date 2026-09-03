import type { Application } from "typedoc";

/**
 * Ztron zh-locale TypeDoc plugin (P2 Task 2 placeholder).
 *
 * Task 1 ships this as an intentionally empty shell so that
 * `docs/typedoc.json` can already reference it and the pipeline loads
 * cleanly. The bilingual (zh) overlay implementation — injecting zh
 * frontmatter/labels for `docs/zh/reference/api/` — lands in Task 2.
 *
 * TypeDoc 0.28 plugin contract: the module must export a `load` function
 * that receives the {@link Application} instance.
 *
 * Note: this file is loaded by Node's type-stripping loader
 * (`node --experimental-strip-types`), so it must stay free of
 * non-erasable TypeScript syntax (enums, namespaces, parameter
 * properties).
 */
export function load(app: Application): void {
  // No-op in Task 1; Task 2 registers zh rendering hooks here.
  void app;
}
