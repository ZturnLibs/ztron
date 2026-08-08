import { test } from "node:test";
import assert from "node:assert/strict";
import { AppBuilder, MockRuntime } from "../packages/core/dist/index.js";
const SECRET_PLUGIN = {
  name: "secret",
  commands: { peek: () => "pwned" },
  permissions: [
    { identifier: "secret:allow-peek", commands: ["plugin:secret|peek"] },
    { identifier: "secret:deny-peek", commands: ["!plugin:secret|peek"] },
  ],
};
const mock = new MockRuntime();
const b = new AppBuilder(mock, "com.ztron.test");
b.plugin(SECRET_PLUGIN);
b.configure({ capabilities: [{ identifier: "main", windows: ["main"], permissions: ["core:default"] }] });
const app = b.build();
app.createWindow({ label: "main", title: "t", width: 100, height: 100 });
console.log("has plugin:secret|peek:", app.commands.has("plugin:secret|peek"));
console.log("list:", app.commands.list());
const req = JSON.stringify([{ cmd: "plugin:secret|peek", payload: {} }]);
const id = "x";
const p = new Promise((resolve) => {
  const orig = mock.respond.bind(mock);
  mock.respond = (rid, status, result) => { if (rid === id) { mock.respond = orig; resolve({status, result}); } };
  // trigger onMessage via the handle
  mock.main.triggerReq(id, req);
});
console.log("resp:", JSON.stringify(await p));
