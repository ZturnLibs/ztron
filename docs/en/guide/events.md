---
title: Events & Channel
---

The event system lets backend and frontend communicate in both directions: the
frontend can listen to any named event emitted by the backend, and can also
send targeted to the frontend/other windows. The listener registry lives in
the backend's `EventManager`; the API is provided by the `event` module of
`@zturnlibs/ztron-api`.

## listen / once / emit / emitTo

Actual signatures (from `packages/api/src/event.ts`):

```ts
export async function listen<T>(
  event: string,
  handler: EventCallback<T>,
  options?: Options,
): Promise<UnlistenFn>;

export type UnlistenFn = () => Promise<void>;
```

Typical usage:

```ts
import { listen, once, emit, emitTo } from "@zturnlibs/ztron-api";

// Listen (options.target can specify a window label, default { kind: "Any" })
const unlisten = await listen<{ n: number }>("m3:tick", (e) => {
  console.log(e.payload.n); // e: { event, id, payload }
});
await unlisten(); // stop listening when no longer needed

// Fires once only, auto-unlistens after firing
await once("app:ready", () => console.log("ready"));

// Send an event to the backend (the backend fans out to all listeners)
await emit("frontend:poke", { at: Date.now() });

// Send targeted to a specific window
await emitTo("main", "broadcast:x", { v: 1 });
```

## Window Event Names

The full `WindowEventName` list from `packages/api/src/window.ts` (verbatim):

```ts
export type WindowEventName =
  | "resize"
  | "move"
  | "focus"
  | "blur"
  | "close-requested"
  | "suspended"
  | "resumed"
  | "scale-change"
  | "theme-changed"
  | "drag-enter"
  | "drag-over"
  | "drag-drop"
  | "drag-leave";
```

Of these, `suspended`/`resumed` are names reserved for mobile lifecycles; the
desktop host never fires them; the four `drag-*` entries correspond to file
drag & drop (`ztron://drag-enter/over/drop/leave`). `event.ts` also exports
the `ZtronEvent` constant enum (the counterpart of upstream `TauriEvent`;
e.g. `ZtronEvent.WINDOW_RESIZED = "ztron://resize"`), and window instances offer
convenience methods like `onResized`/`onMoved`/`onScaleChanged`/`onThemeChanged`/`onDragDropEvent`.

## Channel: Streaming Data

A one-shot `invoke` can only return a single value; when the backend needs to
push continuously, pass `{ kind: "channel", id }` in the command arguments —
the backend obtains a handle via `ctx.getChannel(id)` and pushes repeatedly
with `handle.send(...)` and finishes with `handle.end()`. The hello example's
`m3:stream` command is exactly this pattern (`M1_EVENTS_CHANNEL_WINDOW_OK`
verified).

## Plugin Listeners

On the plugin side there is also a `plugin:*|__listener` contract (e.g. the
log plugin pushing logs to a webview target); the P2 plugins page will expand
on it.

适用版本：`ztron 0.3.0`
