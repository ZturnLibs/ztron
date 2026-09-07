# @zturnlibs/ztron-react

Official React hooks for [Ztron](https://github.com/ZturnLibs/ztron):
`useInvoke` / `useListen` / `useChannelStream` on top of
[`@zturnlibs/ztron-api`](https://www.npmjs.com/package/@zturnlibs/ztron-api).

- Peer dependency: `react >= 18` (tested against React 19).
- All subscriptions and requests live in effects and are finalized in the
  cleanup function, so React 18/19 `StrictMode` double mounting
  (mount -> cleanup -> mount) leaks nothing and fires no duplicate callbacks.

## Usage

```tsx
import { useChannelStream, useInvoke, useListen } from "@zturnlibs/ztron-react";

// Declarative command call: { data, error, loading }
const osInfo = useInvoke<OsInfo>("plugin:os|info", {});

// Event subscription; unlisten happens automatically on unmount
useListen<{ n: number }>("demo:tick", (e) => console.log(e.payload.n));

// Channel streaming: start() creates the channel and invokes the command
const stream = useChannelStream<number>("demo:stream");
stream.start(); // then render stream.messages / stream.status
```

`useInvoke` re-runs when `cmd` or the `args` value changes and discards late
responses. `useListen` unlistens on unmount, including when the unmount wins
the race against the pending `listen` promise. `useChannelStream` accumulates
messages in arrival order; restarting or unmounting invalidates stale runs so
late channel messages never reach the unmounted component.
