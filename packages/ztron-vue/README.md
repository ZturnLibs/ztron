# @zturnlibs/ztron-vue

Official Vue 3 composables for [Ztron](https://github.com/ZturnLibs/ztron):
`useInvoke` / `useListen` / `useChannelStream` on top of
[`@zturnlibs/ztron-api`](https://www.npmjs.com/package/@zturnlibs/ztron-api).

- Peer dependency: `vue ^3.5` (Composition API).
- All subscriptions and requests are finalized via `onScopeDispose`, so they
  are cleaned up on component unmount and on `effectScope.stop()` alike
  (which also makes the composables testable headless). Late responses and
  late channel messages of invalidated runs are discarded.

## Usage

```vue
<script setup lang="ts">
import { useChannelStream, useInvoke, useListen } from "@zturnlibs/ztron-vue";

// Declarative command call: { data, error, loading } refs
const osInfo = useInvoke<OsInfo>("plugin:os|info", {});

// Event subscription; unlisten happens automatically on unmount
useListen<{ n: number }>("demo:tick", (e) => console.log(e.payload.n));

// Channel streaming: start() creates the channel and invokes the command
const stream = useChannelStream<number>("demo:stream");
stream.start(); // then render stream.messages.value / stream.status.value
</script>
```

`useInvoke` re-runs when reactive `args` change by value (pass a
`reactive()` object to get reactivity; plain object args and the `cmd`
string are setup-time: they run once) and discards late responses after a
re-run or unmount. `useListen`
unlistens via `onScopeDispose`, including when the disposal wins the race
against the pending `listen` promise. `useChannelStream` accumulates
messages in arrival order; restarting or disposing the scope invalidates
stale runs so late channel messages never reach the disposed component.
