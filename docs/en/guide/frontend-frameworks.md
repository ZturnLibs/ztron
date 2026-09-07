---
title: Frontend Frameworks & Third-Party Packages
---

Ztron's frontend layer is a standard Vite project and is framework-agnostic.
React, Vue, Svelte, Solid, Tailwind CSS, and the rest of the frontend
ecosystem plug in directly. This page uses `examples/react-demo`
(React 19 + Tailwind CSS v4), `examples/vue-demo` (Vue 3 + Tailwind CSS
v4), and `examples/svelte-demo` (Svelte 5 + Tailwind CSS v4) as living
examples to cover the integration recipe and the bundling constraints.

## The Core Takeaway: Framework-Agnostic

`ztron dev` / `ztron build` let the CLI build its own Vite dev server /
build, and the `ztronVitePlugin` injects the `__ZTRON_INTERNALS__` bridge
script into `index.html` via `transformIndexHtml`. Vite merges the project's
own `frontend/vite.config.ts`, so third-party plugins such as `react()` and
`tailwindcss()` take effect as soon as you list them. The project config does
not need to repeat `base` / `output.format` (the CLI enforces `./` and
`iife`), and you must not add the `__ZTRON_INTERNALS__` bootstrap script
yourself (the CLI injects it).

The only contract between frontend and backend is `@zturnlibs/ztron-api`: an
ordinary npm package whose `invoke`, events, Channel, fs/path/window, and
other APIs are plain ESM exports, independent of any framework. Components,
routing, and state management are entirely your choice.

## React Integration

Taking `examples/react-demo` as the example, the dependencies are plain
frontend dependencies:

```jsonc
// examples/react-demo/package.json (excerpt)
{
  "dependencies": {
    "@zturnlibs/ztron-api": "workspace:*",
    "@zturnlibs/ztron-react": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

Note the `vite` entry in devDependencies: `frontend/vite.config.ts` needs
`import { defineConfig } from "vite"`, and under pnpm's strict isolation the
config file itself must be able to resolve it, so the project installs its
own vite (same 6.x major as the CLI, the same instance inside the lockfile).

`frontend/vite.config.ts` only declares the third-party plugins:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

The entry `frontend/src/main.tsx` is a plain React entry with no Ztron-specific
initialization; the bridge is already in place from the index.html stage:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@zturnlibs/ztron-api";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

One point about code layout: the backend TS sources live in `src/`, outside
the Vite root (`frontend/`). Both the Vite dev server and build only serve
modules inside the root, so at runtime you cannot reach across the root to
import them. Therefore:

- Runtime calls always go through `invoke` from `@zturnlibs/ztron-api`
  directly, e.g. `invoke<string>("react-demo:greet", { name })`;
- The typed bindings produced by `ztron codegen`
  (`src/ztron-commands.ts`) are shown as a code block for their reference
  shape, for business projects that point the frontend root at the repo root
  and can import them directly:

```ts
// the codegen artifact src/ztron-commands.ts provides a typed invoke:
import { invoke as typed } from "../../src/ztron-commands.js";

const msg = await typed("react-demo:greet", { name: "Ztron" });
//     ^ string; a mistyped command name or args fails at type-check time
```

## The Hooks Pattern: Cleanup Conventions for Subscriptions & Requests

React 19's `StrictMode` runs effects twice in development
(mount → cleanup → mount), deliberately to surface leaks. Ztron's
subscription-style APIs (`listen` returns an `UnlistenFn`; geolocation's
`watchPosition` pairs with `clearWatch`) therefore come with one hard rule:
**the unlisten/teardown must be returned from cleanup**, otherwise a double
mount leaves duplicate listeners and duplicate callbacks behind.

`frontend/src/hooks.ts` in react-demo provides three hooks you can copy as-is
(extracted into the official package below; the demo now re-exports it):

```ts
// Declarative command call: runs once on mount or when args change;
// results are dropped after unmount
function useInvoke<T>(cmd: string, args?: InvokeArgs): InvokeState<T>;
// InvokeState<T> = { data: T | null; error: string | null; loading: boolean }

// Backend event subscription: await listen inside the effect, unlisten on
// cleanup; if cleanup lands before listen resolves, the listener is
// unregistered as soon as it arrives, so StrictMode double mounts are safe
function useListen<T>(event: string, handler: EventCallback<T>): void;

// Channel streaming call: start() creates the channel and invokes; messages
// accumulate in arrival order; status is "idle" | "running" | "done" | "error"
function useChannelStream<T = unknown>(
  cmd: string,
  args?: InvokeArgs,
): ChannelStreamState<T>;
```

Typical usage inside components:

```tsx
// Three-state rendering: loading / error / data
const osInfo = useInvoke<OsInfo>("plugin:os|info", {});

// Event subscription: the handler can live in JSX scope; unlisten is automatic
useListen<{ n: number }>("react-demo:tick", (e) => {
  setTicks((prev) => [...prev, `tick ${e.payload.n}`]);
});

// Streaming push: a button calls stream.start(), render stream.messages
const stream = useChannelStream<number>("react-demo:stream");
```

> **Official adapter packages**: the three hooks above are now published as
> `@zturnlibs/ztron-react` (tested against React 19, peer dependency
> `react >= 18`, depending only on `@zturnlibs/ztron-api`; React 18 works
> too). The whole usage fits in five lines:
>
> ```tsx
> import { useChannelStream, useInvoke, useListen } from "@zturnlibs/ztron-react";
>
> const osInfo = useInvoke<OsInfo>("plugin:os|info", {}); // declarative call
> useListen<number>("demo:tick", (e) => console.log(e.payload)); // events
> const stream = useChannelStream<number>("demo:stream"); // Channel stream
> stream.start();
> ```
>
> The Vue / Svelte twins (`@zturnlibs/ztron-vue`, `@zturnlibs/ztron-svelte`)
> follow in the same release train, with API shapes mirroring the React one.

## Vue 3 Integration

`examples/vue-demo` replicates the full react-demo showcase (five tabs:
backend calls, events, Channel, theme, system) in Vue 3, proving that the
same pipeline holds for SFC single-file components. The dependencies are
again plain frontend dependencies:

```jsonc
// examples/vue-demo/package.json (excerpt)
{
  "dependencies": {
    "@zturnlibs/ztron-api": "workspace:*",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.0",
    "vue-tsc": "^3.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

The `vite` note is the same as for React (the config file itself must
resolve it; same 6.x major as the CLI). `@vitejs/plugin-vue` uses the
vite-6-compatible 6.x major.

`frontend/vite.config.ts` just swaps the React plugin for the Vue one:

```ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
});
```

The entry `frontend/src/main.ts` is a plain Vue entry; the bridge is already
in place from the index.html stage:

```ts
import { createApp } from "vue";
import App from "./App.vue";
import "./index.css";

createApp(App).mount("#root");
```

Single-file components and type checking: components are written with
`<script setup lang="ts">`, and the typecheck script becomes
`vue-tsc --noEmit` (vue-tsc understands `.vue` files directly; the tsconfig
needs no jsx setting, and include only has to cover `src` and
`frontend/src`). The across-the-root constraint from react-demo applies to
Vue as well: runtime calls go through `invoke<string>("vue-demo:greet",
{ name })` directly, with the codegen bindings shown only as a reference
shape.

The composables cleanup convention: React's hooks cleanup rule translates
to Vue as **the unlisten must be torn down in `onUnmounted` /
`onScopeDispose`**. `frontend/src/composables.ts` in vue-demo provides three
composables you can copy as-is (also the seed implementation of a future
`@zturnlibs/ztron-vue` package):

```ts
// Declarative command call: runs once in setup; results are dropped after
// unmount. Returns three refs { data, error, loading }; the watch's
// onCleanup invalidates late responses
function useInvoke<T>(cmd: string, args?: InvokeArgs): InvokeState<T>;

// Backend event subscription: await listen inside onMounted, unlisten in
// onUnmounted; if unmount lands before listen resolves, the listener is
// unregistered as soon as it arrives
function useListen<T>(event: string, handler: EventCallback<T>): void;

// Channel streaming call: start() creates the channel and invokes; messages
// accumulate in arrival order; onScopeDispose invalidates the in-flight run
// so late messages never reach an unmounted component
function useChannelStream<T = unknown>(
  cmd: string,
  args?: InvokeArgs,
): { messages; status; error; start };
```

defineAsyncComponent and IIFE inlining: Vue's lazy-loading idiom is
`defineAsyncComponent(() => import("./LazyPane.vue"))`. Like `React.lazy`,
dynamic `import()` is inlined into the main bundle by the single-file IIFE
artifact of `ztron build` (vue-demo verifies this with the `VUE_LAZY_OK`
marker string inside LazyPane), and there is likewise no real code
splitting.

To start from a scaffold, `ztron init --template vue-ts` generates the same
minimal project (see the [CLI Reference](/reference/cli)).

## Svelte 5 Integration

`examples/svelte-demo` replicates the full react-demo showcase (five tabs:
backend calls, events, Channel, theme, system) in Svelte 5, proving that the
same pipeline holds for Svelte single-file components. The dependencies are
again plain frontend dependencies:

```jsonc
// examples/svelte-demo/package.json (excerpt)
{
  "dependencies": {
    "@zturnlibs/ztron-api": "workspace:*",
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^5.0.0",
    "svelte-check": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

The `vite` note is the same as for React and Vue (the config file itself
must resolve it; same 6.x major as the CLI). `@sveltejs/vite-plugin-svelte`
uses the vite-6-compatible 5.x major (the plugin's 6.x targets vite 7).

`frontend/vite.config.ts` just swaps the framework plugin for the Svelte
one:

```ts
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
});
```

The entry `frontend/src/main.ts` is a plain Svelte 5 entry using the
`mount` idiom (which replaces the Svelte 4 `new App({...})` constructor
style); the bridge is already in place from the index.html stage:

```ts
import { mount } from "svelte";
import App from "./App.svelte";
import "./index.css";

mount(App, { target: document.getElementById("root")! });
```

Components and type checking: components are written with
`<script lang="ts">` plus Svelte 5 runes, with UI state declared via
`$state` (`$derived` available). The typecheck script is
`svelte-check --tsconfig ./tsconfig.json --config ./svelte.config.js`, and
the two configs split the work: during dev / build the Svelte 5 compiler
understands erasable `lang="ts"` syntax natively, so the vite plugin
compiles directly without preprocessing; the root `svelte.config.js`
(with `vitePreprocess`) is read by svelte-check and must be pinned with
`--config`, otherwise svelte-check's upward search from `frontend/src`
hits `frontend/vite.config.ts` first and fails with "No Svelte
configuration found". The across-the-root constraint from react/vue
applies to Svelte as well: runtime calls go through
`invoke<string>("svelte-demo:greet", { name })` directly, with the codegen
bindings shown only as a reference shape.

The runes cleanup convention: React/Vue's cleanup rule translates to Svelte
as **subscriptions start in `onMount` and the unlisten is torn down in
`onDestroy`**. `frontend/src/lib/listeners.ts` in svelte-demo provides a
listener helper you can copy as-is (also the seed implementation of a
future `@zturnlibs/ztron-svelte` package; it only uses lifecycle hooks and
no runes, so a plain `.ts` module is enough):

```ts
// Backend event subscription: await listen inside onMount, unlisten in
// onDestroy; if unmount lands before listen resolves, the listener is
// unregistered as soon as it arrives
function listenOnMount<T>(event: string, handler: EventCallback<T>): void;
```

{#await import} and IIFE inlining: Svelte's lazy-loading idiom is an await
block that consumes the dynamic import's module namespace and destructures
the component out of it:

```svelte
{#await import("./LazyPane.svelte") then { default: Lazy }}
  <Lazy />
{/await}
```

Like `React.lazy` and `defineAsyncComponent`, dynamic `import()` is inlined
into the main bundle by the single-file IIFE artifact of `ztron build`
(svelte-demo verifies this with the `SVELTE_LAZY_OK` marker string inside
LazyPane), and there is likewise no real code splitting.

To start from a scaffold, `ztron init --template svelte` generates the same
minimal project (see the [CLI Reference](/reference/cli)).

## Tailwind CSS v4

Tailwind v4 plugs in with a single `@tailwindcss/vite` line (the
`tailwindcss()` above); the entry CSS only needs `@import "tailwindcss";`.

- **CSP already covers it**: Tailwind injects styles as inline `<style>`
  elements, which the default CSP's `style-src 'self' 'unsafe-inline'`
  already allows; no extra configuration needed.
- **Dark styling**: Tailwind's `dark:` variant follows CSS
  `prefers-color-scheme` by default, and inside the WebView
  `prefers-color-scheme` follows the window's appearance. Calling
  `getCurrentWebviewWindow().setTheme("dark" | "light" | null)` switches the
  window appearance and the page palette flips immediately (`null` means
  follow the system). The react-demo "Theme" tab demonstrates this.

## Bundling Constraints (Important)

The `ztron build` frontend artifact is a **single-file IIFE + classic
script**: under the `file://` opaque origin the WebView refuses to execute
module scripts, so the CLI enforces IIFE output. Three constraints follow:

- **Dynamic `import()` is inlined** into the main bundle. `React.lazy` +
  `Suspense` still work (react-demo's LazyPane does exactly this), but there
  is no real code splitting; do not expect on-demand loading to shrink the
  initial bundle.
- **CSS is inlined into the JS**: the Tailwind style output is inlined too
  and injected at runtime as `<style>` (covered by the default CSP).
- **Dev is unaffected**: `ztron dev` runs a Vite dev server that serves
  modules normally with HMR; the constraints above only apply to the build
  artifact.

## CSP

The default CSP injected into the built `index.html` is:

```text
default-src 'self'; script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline'; img-src 'self' data:;
connect-src 'self' http://localhost:* ws://localhost:*
```

`ws://localhost:*` covers the React dev server and the HMR websocket, and
`style-src 'unsafe-inline'` covers runtime style injection from Tailwind and
component libraries, so the React development experience works out of the
box. Remote images, fonts, and similar resources need `img-src` / `font-src`
extensions in `ztron.conf.json`'s `app.security.csp` (or `devCsp` during
development); see the [Security Model](/guide/security).

## SSR Frameworks Do Not Apply

The WebView loads a purely static SPA: there is no Node server and no SSR
pipeline. Meta-frameworks premised on server-side rendering, such as
Next.js, Nuxt, and Remix, do not apply. SPA routing (react-router and
friends) works, but `file://` has no server-side path fallback, so a
hash/memory routing mode that does not depend on server paths is the safest
choice.

## Other Frameworks

Solid (`vite-plugin-solid`) and other frameworks use their official Vite
plugins; list them in the `plugins` array of `frontend/vite.config.ts` and
everything else follows the exact same pattern as React, Vue, and Svelte:
the bridge is injected by the CLI, the config is merged by Vite, and
runtime calls go through `@zturnlibs/ztron-api`. The subscription/request
cleanup convention applies equally; wrap it for each framework's lifecycle
following the react-demo `hooks.ts`, the vue-demo `composables.ts`, or the
svelte-demo `listeners.ts` pattern.

**Deep dive: [Examples](/start/examples) · [Calling Backend Commands](/guide/ipc) · [CLI Reference](/reference/cli)**

适用版本：`ztron 0.3.1`
