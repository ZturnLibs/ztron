---
title: Frontend Frameworks & Third-Party Packages
---

Ztron's frontend layer is a standard Vite project and is framework-agnostic.
React, Vue, Svelte, Solid, Tailwind CSS, and the rest of the frontend
ecosystem plug in directly. This page uses `examples/react-demo`
(React 19 + Tailwind CSS v4) as a living example to cover the integration
recipe and the bundling constraints.

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
(also the seed implementation of a future `@zturnlibs/ztron-react` package):

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

Vue (`@vitejs/plugin-vue`), Svelte (`@sveltejs/vite-plugin-svelte`), and
Solid (`vite-plugin-solid`) each use their official Vite plugin; list it in
the `plugins` array of `frontend/vite.config.ts` and everything else follows
the exact same pattern as React: the bridge is injected by the CLI, the
config is merged by Vite, and runtime calls go through
`@zturnlibs/ztron-api`. The subscription/request cleanup convention applies
equally; wrap it for each framework's lifecycle following the react-demo
`hooks.ts` pattern.

**Deep dive: [Examples](/start/examples) · [Calling Backend Commands](/guide/ipc) · [CLI Reference](/reference/cli)**

适用版本：`ztron 0.3.1`
