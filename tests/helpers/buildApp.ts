/**
 * Shared app builder for the unit test suite: installs the in-memory tjs
 * stub, registers every framework plugin, and returns a permissive app
 * (no capabilities -> ACL allows everything).
 */
import {
  AppBuilder,
  MockRuntime,
  autostartPlugin,
  fsPlugin,
  httpPlugin,
  localIpPlugin,
  logPlugin,
  networkPlugin,
  osPlugin,
  pathPlugin,
  persistedScopePlugin,
  shellPlugin,
  singleInstancePlugin,
  sqlPlugin,
  storePlugin,
  updaterPlugin,
  uploadPlugin,
  websocketPlugin,
  windowStatePlugin,
} from "../../packages/core/dist/index.js";
import { installTjs } from "./tjs-stub.ts";

export interface TestApp {
  mock: MockRuntime;
  app: import("../../packages/core/dist/index.js").App;
  tjs: ReturnType<typeof installTjs>;
}

/** Builds a permissive app with every plugin registered. */
export function buildApp(seed: Record<string, string> = {}): TestApp {
  const tjs = installTjs(seed);
  const mock = new MockRuntime();
  const persisted = persistedScopePlugin({
    file: `${tjs.tmpDir}/ztron_persisted_scope.json`,
    scope: { allow: ["$TMP/**"] },
  });

  const builder = new AppBuilder(mock, "com.ztron.test")
    .plugin(persisted)
    .plugin(fsPlugin({ scope: persisted.scope }))
    .plugin(pathPlugin({ appId: "com.ztron.test" }))
    .plugin(
      httpPlugin({ scope: { allow: [{ url: "https://example.com/*" }] } }),
    )
    .plugin(osPlugin())
    .plugin(storePlugin({ scope: { allow: ["$TMP/**"] } }))
    .plugin(logPlugin())
    .plugin(
      shellPlugin({
        scope: [
          { program: "echo", args: ["*"] },
          { program: "sh", args: ["**"] },
        ],
      }),
    )
    .plugin(
      updaterPlugin({
        currentVersion: "0.1.0",
        scope: { allow: [{ url: "http://localhost:*/*" }] },
      }),
    )
    .plugin(sqlPlugin({ scope: { allow: ["$TMP/**"] } }))
    .plugin(autostartPlugin({ id: "com.ztron.test" }))
    .plugin(
      windowStatePlugin({
        file: `${tjs.tmpDir}/ztron_window_state.json`,
        restoreOnStartup: false,
      }),
    )
    .plugin(singleInstancePlugin({ identifier: "com.ztron.test" }))
    .plugin(websocketPlugin())
    .plugin(localIpPlugin())
    .plugin(networkPlugin())
    .plugin(
      uploadPlugin({
        fileScope: { allow: ["$TMP/**"] },
        urlScope: { allow: [{ url: "http://localhost:*/*" }] },
      }),
    );

  const app = builder.build();
  app.createWindow({ label: "main", title: "t", width: 100, height: 100 });
  return { mock, app, tjs };
}
