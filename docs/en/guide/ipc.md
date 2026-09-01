---
title: Calling Backend Commands
---

Commands are the core calling convention between frontend and backend: the
frontend `invoke`s a command name, the handler registered in the backend
executes and returns the result. Ztron's protocol aligns with Tauri v2 desktop
(JSON + callback/error id + Channel).

## Declaring Typed Commands

Declare with `defineCommand` in `src/commands.ts` (recognized by
`ztron codegen`, which auto-generates typed frontend bindings):

```ts
// src/commands.ts —— typed commands (recognized by ztron codegen)
import { defineCommand } from "@zturnlibs/core";

export const greet = defineCommand("my:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => `hello, ${args.name}`,
});
```

## Registering Commands

Register inside the `AppBuilder` setup callback in `src/main.ts`. Use
`commandDef` for typed commands, or register inline when no types are needed:

```ts
// src/main.ts —— registration (inside the setup callback)
app.commandDef(greet);            // typed
app.command("m3:echo-port", () => echoPort);  // inline
```

## Calling from the Frontend

The frontend simply `invoke`s; the generic parameter is the return type:

```ts
// frontend/src/main.ts —— frontend call
import { invoke } from "@zturnlibs/api";
const echoed = await invoke<string>("my:echo", { msg: "hello-m3" });
```

## codegen: Type-Safe invoke

`ztron codegen` scans `defineCommand` declarations in the source and generates
the `ztron-commands.ts` typed bindings under `src/`. The frontend can then
call in a fully typed way:

```ts
// frontend/src/main.ts —— after codegen (from hello example lines 103–110)
const g = await import("../../src/ztron-commands.js");
const greetRes = await g.invoke("my:greet", { name: "codegen" });
// greetRes's type is inferred as string from the command declaration
```

The source of truth for types lives on the TS side (the opposite of Tauri's
Rust source of truth); codegen keeps frontend and backend types from drifting
(`CODEGEN_OK` verified in the hello example).

## Commands & Security

Commands are not "register and anyone may call": every command belongs to a
plugin or core, and whether the frontend may call it is decided jointly by the
permission string in a capability (e.g. `fs:allow-read-file`) and the scope —
unauthorized calls are rejected in the backend (verification anchor
`ACL_DENY_OK`). See the [Security Model](/guide/security).

适用版本：`ztron 0.1.0`
