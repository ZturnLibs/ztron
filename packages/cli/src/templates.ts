/**
 * `ztron init` project templates.
 *
 * Each builder returns a { relativePath -> content } map; initProject writes
 * only the files that do not exist yet. Dependency conventions: `latest` for
 * @zturnlibs/* (npm-publish convention), caret ranges for third-party
 * toolchain. The react-ts, vue-ts and svelte templates codify the
 * pipeline-verified React 19 / Vue 3 / Svelte 5 + Tailwind CSS v4
 * configurations from examples/react-demo (PR #20), examples/vue-demo
 * (PR #23) and examples/svelte-demo, minimized to runnable scaffolds
 * (greet button only). The backend bootstrap is framework-agnostic and
 * shared verbatim by all three.
 */

export type TemplateFiles = Record<string, string>;

/* ------------------------------------------------------------------ *
 * vanilla — the original scaffold (inline-html fallback + "hello").
 * ------------------------------------------------------------------ */

const MAIN_TEMPLATE = `import { AppBuilder, fsPlugin } from "@zturnlibs/ztron-core";
import { HostRuntime } from "@zturnlibs/ztron-runtime-ffi";

declare const tjs: { env: Record<string, string | undefined> };

const runtime = new HostRuntime({
  host: tjs.env.ZTRON_HOST ?? "127.0.0.1",
  port: Number(tjs.env.ZTRON_HOST_PORT),
});
await runtime.connect();

// The CLI points ZTRON_DEV_URL at the built/development frontend index.html;
// inline html is only a fallback when no frontend is configured.
const devUrl = tjs.env.ZTRON_DEV_URL;

const html = \`<!doctype html>
<html>
  <body style="font-family:system-ui;padding:2rem">
    <h1>Hello Ztron</h1>
    <p id="status">ready</p>
  </body>
</html>\`;

new AppBuilder(runtime, "com.example.app")
  .plugin(fsPlugin({ scope: { allow: ["$TMP/**"] } }))
  .setup((app) => {
    app.command("hello", (args) => {
      const { name } = (args ?? {}) as { name?: string };
      return "hello, " + (name ?? "world");
    });
  })
  .window({
    label: "main",
    title: "My Ztron App",
    width: 800,
    height: 600,
    ...(devUrl ? { url: devUrl } : { html }),
  })
  .build()
  .run();
`;

const FRONTEND_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>My Ztron App</title>
  </head>
  <body style="font-family:system-ui;padding:2rem">
    <h1>Hello Ztron</h1>
    <p>invoke: <span id="status">running...</span></p>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

const FRONTEND_MAIN = `import { invoke } from "@zturnlibs/ztron-api";

const status = document.getElementById("status")!;
status.textContent = String(await invoke("hello", { name: "scaffold" }));
`;

export function vanillaTemplate(name: string): TemplateFiles {
  return {
    "package.json": JSON.stringify(
      {
        name,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          dev: "ztron dev",
          build: "ztron build",
        },
        dependencies: {
          "@zturnlibs/ztron-api": "latest",
          "@zturnlibs/ztron-core": "latest",
          "@zturnlibs/ztron-runtime-ffi": "latest",
        },
        devDependencies: {
          "@zturnlibs/ztron-cli": "latest",
        },
      },
      null,
      2,
    ),
    "ztron.conf.json": JSON.stringify(
      {
        entry: "src/main.ts",
        identifier: "com.example.app",
        version: "0.1.0",
        windows: [{ label: "main", title: "Ztron App", width: 800, height: 600 }],
      },
      null,
      2,
    ),
    "src/main.ts": MAIN_TEMPLATE,
    "frontend/index.html": FRONTEND_HTML,
    "frontend/src/main.ts": FRONTEND_MAIN,
  };
}

/* ------------------------------------------------------------------ *
 * react-ts — React 19 + Tailwind CSS v4 (config verbatim from
 * examples/react-demo, minimized).
 * ------------------------------------------------------------------ */

const REACT_MAIN_TEMPLATE = `import {
  AppBuilder,
  defineCommand,
  loadCapabilities,
} from "@zturnlibs/ztron-core";
import { HostRuntime } from "@zturnlibs/ztron-runtime-ffi";

declare const tjs: { env: Record<string, string | undefined> };

const runtime = new HostRuntime({
  host: tjs.env.ZTRON_HOST ?? "127.0.0.1",
  port: Number(tjs.env.ZTRON_HOST_PORT),
});
await runtime.connect();
console.log("[ztron] backend connected");

// Typed command: \`ztron codegen\` scans defineCommand calls and generates
// src/ztron-commands.ts bindings for compile-time-checked invokes.
const greet = defineCommand("app:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => "hello, " + args.name,
});

// The CLI points ZTRON_DEV_URL at the Vite dev server / built frontend;
// inline html is only a fallback when neither exists.
const devUrl = tjs.env.ZTRON_DEV_URL;
const inlineHtml = \`<!doctype html>
<html>
  <body style="font-family:system-ui;padding:2rem">
    <h1>Ztron App</h1>
    <p>frontend unavailable - run the Vite dev frontend via ztron dev</p>
  </body>
</html>\`;

const conf = tjs.env.ZTRON_CONF
  ? (JSON.parse(tjs.env.ZTRON_CONF) as Parameters<AppBuilder["fromConfig"]>[0])
  : {};
if (!devUrl) {
  for (const w of conf.windows ?? []) {
    if (w.url === "frontend") {
      delete w.url;
      w.html = inlineHtml;
    }
  }
}

const capabilities = await loadCapabilities(
  tjs.env.ZTRON_CAPABILITIES_DIR ?? "./capabilities",
);

new AppBuilder(runtime, "com.example.app")
  .configure({
    invokeKey: tjs.env.ZTRON_INVOKE_KEY ?? Math.random().toString(36).slice(2),
    capabilities,
  })
  .fromConfig(conf, { frontendUrl: devUrl ?? undefined })
  .setup((app) => {
    app.commandDef(greet);
  })
  .build()
  .run();
`;

const REACT_VITE_CONFIG = `// Project-level Vite config: React + Tailwind CSS v4 plugins. \`ztron dev\` /
// \`ztron build\` create the Vite server/build themselves (root = this frontend
// dir, injecting the ztron bridge plugin) and merge this file on top, so
// third-party plugins belong here — no need to restate base / output.format
// (the CLI pins "./" and "iife").
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
`;

const REACT_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Ztron App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const REACT_INDEX_CSS = `@import "tailwindcss";
`;

const REACT_MAIN_TSX = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

const REACT_APP_TSX = `/**
 * Minimal greeting UI: input + button calling invoke<string>("app:greet",
 * { name }) over the ztron IPC bridge. Tailwind atomic classes only, dark
 * as the default look (bg-neutral-950 / text-neutral-100 family).
 *
 * Upgrade path: run \`ztron codegen\` to generate src/ztron-commands.ts
 * typed bindings from the backend's defineCommand calls, then invoke via
 * those for compile-time-checked command names and payloads.
 */
import { useState } from "react";
import { invoke } from "@zturnlibs/ztron-api";

export default function App() {
  const [name, setName] = useState("Ztron");
  const [greeting, setGreeting] = useState("");
  const [error, setError] = useState("");

  async function runGreet() {
    setError("");
    try {
      setGreeting(await invoke<string>("app:greet", { name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 text-neutral-100">
      <h1 className="text-2xl font-semibold">Ztron App</h1>
      <div className="flex items-center gap-2">
        <input
          className="w-56 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
        <button
          className="rounded-lg bg-neutral-100 px-3.5 py-1.5 text-sm font-semibold text-neutral-950 transition-transform active:translate-y-px"
          onClick={() => void runGreet()}
        >
          Greet
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {greeting && (
        <pre className="font-mono text-sm text-neutral-300">{greeting}</pre>
      )}
    </main>
  );
}
`;

/* Shared scaffold blobs (byte-identical across react-ts/vue-ts/svelte): the
 * frontend-driven ztron.conf.json, the core:default capabilities, and the
 * standalone no-jsx tsconfig base (react-ts has its own tsconfig with jsx). */

const FRONTEND_CONF_JSON = JSON.stringify(
  {
    entry: "src/main.ts",
    frontend: "frontend",
    identifier: "com.example.app",
    version: "0.1.0",
    windows: [
      {
        label: "main",
        title: "Ztron App",
        url: "frontend",
        width: 1024,
        height: 680,
      },
    ],
  },
  null,
  2,
);

const CORE_CAPABILITIES_JSON = JSON.stringify(
  {
    identifier: "main",
    description: "Default capabilities for the main window.",
    windows: ["main"],
    permissions: ["core:default"],
  },
  null,
  2,
);

const TS_CONFIG_NO_JSX = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      types: ["node"],
      strict: true,
      noUncheckedIndexedAccess: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      isolatedModules: true,
      useDefineForClassFields: true,
      noEmit: true,
    },
    include: ["src", "frontend/src"],
  },
  null,
  2,
);

export function reactTsTemplate(name: string): TemplateFiles {
  return {
    "package.json": JSON.stringify(
      {
        name,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          dev: "ztron dev",
          build: "ztron build",
          typecheck: "tsc --noEmit",
        },
        dependencies: {
          "@zturnlibs/ztron-api": "latest",
          "@zturnlibs/ztron-core": "latest",
          "@zturnlibs/ztron-runtime-ffi": "latest",
          react: "latest",
          "react-dom": "latest",
        },
        devDependencies: {
          "@zturnlibs/ztron-cli": "latest",
          vite: "^6.0.0",
          "@vitejs/plugin-react": "^4.3.0",
          tailwindcss: "^4.0.0",
          "@tailwindcss/vite": "^4.0.0",
          typescript: "^5.7.2",
          "@types/react": "^19.0.0",
          "@types/react-dom": "^19.0.0",
          "@types/node": "^22.10.2",
        },
      },
      null,
      2,
    ),
    // Standalone equivalent of the repo's tsconfig.base.json + the demo's
    // overrides (lib/types/jsx) — no repo file to extend in a fresh project.
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          types: ["node"],
          strict: true,
          noUncheckedIndexedAccess: true,
          jsx: "react-jsx",
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          isolatedModules: true,
          useDefineForClassFields: true,
          noEmit: true,
        },
        include: ["src", "frontend/src"],
      },
      null,
      2,
    ),
    "ztron.conf.json": FRONTEND_CONF_JSON,
    "capabilities/default.json": CORE_CAPABILITIES_JSON,
    "src/main.ts": REACT_MAIN_TEMPLATE,
    "frontend/vite.config.ts": REACT_VITE_CONFIG,
    "frontend/index.html": REACT_INDEX_HTML,
    "frontend/src/index.css": REACT_INDEX_CSS,
    "frontend/src/main.tsx": REACT_MAIN_TSX,
    "frontend/src/App.tsx": REACT_APP_TSX,
  };
}

/* ------------------------------------------------------------------ *
 * vue-ts — Vue 3 + Tailwind CSS v4 (config verbatim from
 * examples/vue-demo, minimized). Backend bootstrap is shared verbatim
 * with react-ts: HostRuntime/AppBuilder/defineCommand are framework-
 * agnostic — only the frontend entry differs.
 * ------------------------------------------------------------------ */

const VUE_VITE_CONFIG = `// Project-level Vite config: Vue 3 + Tailwind CSS v4 plugins. \`ztron dev\` /
// \`ztron build\` create the Vite server/build themselves (root = this frontend
// dir, injecting the ztron bridge plugin) and merge this file on top, so
// third-party plugins belong here — no need to restate base / output.format
// (the CLI pins "./" and "iife").
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
});
`;

const VUE_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Ztron App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

const VUE_INDEX_CSS = `@import "tailwindcss";
`;

const VUE_MAIN_TS = `import { createApp } from "vue";
import App from "./App.vue";
import "./index.css";

createApp(App).mount("#root");
`;

const VUE_APP_VUE = `<script setup lang="ts">
/**
 * Minimal greeting UI: input + button calling invoke<string>("app:greet",
 * { name }) over the ztron IPC bridge. Tailwind atomic classes only, dark
 * as the default look (bg-neutral-950 / text-neutral-100 family).
 *
 * Upgrade path: run \`ztron codegen\` to generate src/ztron-commands.ts
 * typed bindings from the backend's defineCommand calls, then invoke via
 * those for compile-time-checked command names and payloads.
 */
import { ref } from "vue";
import { invoke } from "@zturnlibs/ztron-api";

const name = ref("Ztron");
const greeting = ref("");
const error = ref("");

async function runGreet() {
  error.value = "";
  try {
    greeting.value = await invoke<string>("app:greet", { name: name.value });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}
</script>

<template>
  <main class="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 text-neutral-100">
    <h1 class="text-2xl font-semibold">Ztron App</h1>
    <div class="flex items-center gap-2">
      <input
        v-model="name"
        class="w-56 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
        placeholder="Your name"
      />
      <button
        class="rounded-lg bg-neutral-100 px-3.5 py-1.5 text-sm font-semibold text-neutral-950 transition-transform active:translate-y-px"
        @click="void runGreet()"
      >
        Greet
      </button>
    </div>
    <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
    <pre v-if="greeting" class="font-mono text-sm text-neutral-300">{{ greeting }}</pre>
  </main>
</template>
`;

export function vueTsTemplate(name: string): TemplateFiles {
  return {
    "package.json": JSON.stringify(
      {
        name,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          dev: "ztron dev",
          build: "ztron build",
          typecheck: "vue-tsc --noEmit",
        },
        dependencies: {
          "@zturnlibs/ztron-api": "latest",
          "@zturnlibs/ztron-core": "latest",
          "@zturnlibs/ztron-runtime-ffi": "latest",
          vue: "latest",
        },
        devDependencies: {
          "@zturnlibs/ztron-cli": "latest",
          vite: "^6.0.0",
          "@vitejs/plugin-vue": "^6.0.0",
          "vue-tsc": "^3.0.0",
          tailwindcss: "^4.0.0",
          "@tailwindcss/vite": "^4.0.0",
          typescript: "^5.7.2",
          "@types/node": "^22.10.2",
        },
      },
      null,
      2,
    ),
    // Standalone equivalent of the repo's tsconfig.base.json + the demo's
    // overrides (lib/types) — no repo file to extend in a fresh project.
    // No jsx: .vue SFCs are type-checked by vue-tsc directly.
    "tsconfig.json": TS_CONFIG_NO_JSX,
    "ztron.conf.json": FRONTEND_CONF_JSON,
    "capabilities/default.json": CORE_CAPABILITIES_JSON,
    "src/main.ts": REACT_MAIN_TEMPLATE,
    "frontend/vite.config.ts": VUE_VITE_CONFIG,
    "frontend/index.html": VUE_INDEX_HTML,
    "frontend/src/index.css": VUE_INDEX_CSS,
    "frontend/src/main.ts": VUE_MAIN_TS,
    "frontend/src/App.vue": VUE_APP_VUE,
  };
}

/* ------------------------------------------------------------------ *
 * svelte — Svelte 5 + Tailwind CSS v4 (config verbatim from
 * examples/svelte-demo, minimized). Backend bootstrap is shared verbatim
 * with react-ts/vue-ts (framework-agnostic); only the frontend entry
 * differs (Svelte 5 mount + runes). The root svelte.config.js exists for
 * svelte-check: without --config it walks up from frontend/src and hits
 * frontend/vite.config.ts first, which it cannot extract Svelte options
 * from (dev/build compile via the vite plugin directly — Svelte 5 handles
 * lang="ts" natively, no preprocessing needed).
 * ------------------------------------------------------------------ */

const SVELTE_VITE_CONFIG = `// Project-level Vite config: Svelte 5 + Tailwind CSS v4 plugins. \`ztron dev\` /
// \`ztron build\` create the Vite server/build themselves (root = this frontend
// dir, injecting the ztron bridge plugin) and merge this file on top, so
// third-party plugins belong here — no need to restate base / output.format
// (the CLI pins "./" and "iife").
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
});
`;

const SVELTE_CONFIG_JS = `// Svelte toolchain config (project root), pinned by the typecheck script via
// svelte-check --config. \`ztron dev\` / \`ztron build\` compile through the
// svelte() plugin in frontend/vite.config.ts (Svelte 5 handles lang="ts"
// natively); vitePreprocess here covers non-erasable TS syntax for svelte-check.
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
};
`;

const SVELTE_INDEX_HTML = VUE_INDEX_HTML;

const SVELTE_INDEX_CSS = VUE_INDEX_CSS;

const SVELTE_MAIN_TS = `import { mount } from "svelte";
import App from "./App.svelte";
import "./index.css";

// Svelte 5 mount idiom: mount(App, { target }) replaces the Svelte 4
// "new App({ target })" constructor.
mount(App, { target: document.getElementById("root")! });
`;

const SVELTE_APP_SVELTE = `<script lang="ts">
/**
 * Minimal greeting UI: input + button calling invoke<string>("app:greet",
 * { name }) over the ztron IPC bridge. Tailwind atomic classes only, dark
 * as the default look (bg-neutral-950 / text-neutral-100 family).
 *
 * Upgrade path: run \`ztron codegen\` to generate src/ztron-commands.ts
 * typed bindings from the backend's defineCommand calls, then invoke via
 * those for compile-time-checked command names and payloads.
 */
import { invoke } from "@zturnlibs/ztron-api";

let name = $state("Ztron");
let greeting = $state("");
let error = $state("");

async function runGreet() {
  error = "";
  try {
    greeting = await invoke<string>("app:greet", { name });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
}
</script>

<main class="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 text-neutral-100">
  <h1 class="text-2xl font-semibold">Ztron App</h1>
  <div class="flex items-center gap-2">
    <input
      bind:value={name}
      class="w-56 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
      placeholder="Your name"
    />
    <button
      class="rounded-lg bg-neutral-100 px-3.5 py-1.5 text-sm font-semibold text-neutral-950 transition-transform active:translate-y-px"
      onclick={() => void runGreet()}
    >
      Greet
    </button>
  </div>
  {#if error}<p class="text-sm text-red-400">{error}</p>{/if}
  {#if greeting}<pre class="font-mono text-sm text-neutral-300">{greeting}</pre>{/if}
</main>
`;

export function svelteTemplate(name: string): TemplateFiles {
  return {
    "package.json": JSON.stringify(
      {
        name,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          dev: "ztron dev",
          build: "ztron build",
          typecheck:
            "svelte-check --tsconfig ./tsconfig.json --config ./svelte.config.js",
        },
        dependencies: {
          "@zturnlibs/ztron-api": "latest",
          "@zturnlibs/ztron-core": "latest",
          "@zturnlibs/ztron-runtime-ffi": "latest",
          svelte: "latest",
        },
        devDependencies: {
          "@zturnlibs/ztron-cli": "latest",
          vite: "^6.0.0",
          "@sveltejs/vite-plugin-svelte": "^5.0.0",
          "svelte-check": "^4.0.0",
          tailwindcss: "^4.0.0",
          "@tailwindcss/vite": "^4.0.0",
          typescript: "^5.7.2",
          "@types/node": "^22.10.2",
        },
      },
      null,
      2,
    ),
    // Standalone equivalent of the repo's tsconfig.base.json + the demo's
    // overrides (lib/types) — no repo file to extend in a fresh project.
    // No jsx: .svelte files are type-checked by svelte-check directly.
    "tsconfig.json": TS_CONFIG_NO_JSX,
    "svelte.config.js": SVELTE_CONFIG_JS,
    "ztron.conf.json": FRONTEND_CONF_JSON,
    "capabilities/default.json": CORE_CAPABILITIES_JSON,
    "src/main.ts": REACT_MAIN_TEMPLATE,
    "frontend/vite.config.ts": SVELTE_VITE_CONFIG,
    "frontend/index.html": SVELTE_INDEX_HTML,
    "frontend/src/index.css": SVELTE_INDEX_CSS,
    "frontend/src/main.ts": SVELTE_MAIN_TS,
    "frontend/src/App.svelte": SVELTE_APP_SVELTE,
  };
}

/** Registry: template name -> builder. */
export const TEMPLATES: Record<string, (name: string) => TemplateFiles> = {
  vanilla: vanillaTemplate,
  "react-ts": reactTsTemplate,
  "vue-ts": vueTsTemplate,
  svelte: svelteTemplate,
};
