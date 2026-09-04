---
title: Quick Start
---

# Try Ztron (3 lines)

Prerequisite: complete [Prerequisites & Installation](/start/install) (`ztron doctor` fully green).

```bash
ztron init my-app && cd my-app
pnpm install
ztron dev
```

Success is the native window showing "Hello Ztron". `dev` starts a Vite dev server,
launches the native window and boots the tjs backend; frontend edits hot-reload
instantly (HMR).

# Your First App

## Project Structure

```
my-app/
├── ztron.conf.json      # window declarations + entry (entry: src/main.ts)
├── src/main.ts          # backend: connect to the host, register commands
└── frontend/            # frontend: a plain Vite page
    ├── index.html
    └── src/main.ts
```

## Edit the Frontend

Open `frontend/index.html`, change `<h1>Hello Ztron</h1>` to
`<h1>我的第一个 Ztron 应用</h1>` ("My First Ztron App") and add a button:

```html
<h1>我的第一个 Ztron 应用</h1>
<button id="greet">打招呼</button>
<p id="out"></p>
```

Saving takes effect inside the window immediately (Vite HMR).

## Add a TypeScript Command (backend → frontend)

Commands are defined in the backend (create `src/commands.ts` next to
`src/main.ts`):

```ts
import { defineCommand } from "@zturnlibs/ztron-core";

export const greet = defineCommand("my:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => `你好, ${args.name}`,
});
```

Register it in `src/main.ts` (the `init` template already ships a command
registration site inside `.setup((app) => …)` — add one line,
`app.commandDef(greet)`, next to the template's own `app.command("hello", …)`,
plus the import):

```ts
import { greet } from "./commands.js";
```

```ts
// inside .setup((app) => { … }):
app.commandDef(greet);
```

Generate the typed frontend bindings (the `@zturnlibs/ztron-api` package is
already listed in `dependencies` by `init`):

```bash
ztron codegen
```

Call it from the frontend (`frontend/src/main.ts`):

```ts
import { invoke } from "@zturnlibs/ztron-api";

document.getElementById("greet")!.onclick = async () => {
  document.getElementById("out")!.textContent = await invoke("my:greet", { name: "Ztron" });
};
```

Click the button → "你好, Ztron" appears. This chain (backend command →
codegen → frontend invoke) is the entire skeleton of a Ztron app.

## Packaging

```bash
ztron build
```

Produces a standalone `.app` (ad-hoc signed, `.dmg` included by default).
Before distributing, adjust `identifier` and the window declarations in
`ztron.conf.json`.

**Next: [Examples](/start/examples) · [Architecture](/guide/architecture) · [CLI Reference](/reference/cli)**
