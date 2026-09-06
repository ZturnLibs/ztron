/** plain `tsc` (workspace build script) treats Svelte imports as generic
    components; full type-checking of .svelte files runs via svelte-check in
    the typecheck script */
declare module "*.svelte" {
  import type { Component } from "svelte";
  const component: Component<Record<string, never>>;
  export default component;
}
