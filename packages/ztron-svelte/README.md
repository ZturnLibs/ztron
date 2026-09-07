# @zturnlibs/ztron-svelte

Official Svelte 5 listeners for [Ztron](https://github.com/ZturnLibs/ztron):
`listenOnMount` / `subscribe` on top of
[`@zturnlibs/ztron-api`](https://www.npmjs.com/package/@zturnlibs/ztron-api).

- Peer dependency: `svelte ^5` (works from plain `.ts`, no runes needed).
- The subscription race (cleanup wins against the pending `listen` promise)
  is handled for you: if the listener arrives after cleanup, it unregisters
  itself immediately, so no listener ever outlives its owner.

## Usage in a component

`listenOnMount` binds the subscription to the component lifetime. Call it
during component initialisation, i.e. from the top-level `<script>` of a
`.svelte` file (Svelte throws if lifecycle hooks run outside init context):

```svelte
<script lang="ts">
  import { listenOnMount } from "@zturnlibs/ztron-svelte";

  // Subscribes at init; unlisten runs automatically at onDestroy
  listenOnMount<{ n: number }>("demo:tick", (e) => console.log(e.payload.n));
</script>
```

## Usage outside a component

`subscribe` is the plain, headless variant: it returns the cleanup
synchronously, so it works in stores, modules, and tests. You own the
cleanup:

```ts
import { subscribe } from "@zturnlibs/ztron-svelte";

const stop = subscribe<{ n: number }>("demo:tick", (e) => console.log(e.payload.n));
// later, at your scope's end:
stop();
```
