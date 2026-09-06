/** plain `tsc` (workspace build script) treats SFC imports as generic components;
    full type-checking of .vue files runs via vue-tsc in the typecheck script */
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
