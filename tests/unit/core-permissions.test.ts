/**
 * Webview permission interception (tauri 2.12 382dd6ccc alignment):
 * core-level onPermissionRequest wiring — wire request in, routed
 * response out; no handler means auto-"default" (WKUIDelegate Prompt
 * semantics).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../helpers/buildApp.ts";
import type { PermissionRequest } from "@zturnlibs/ztron-core";

test("permission wire request reaches the user handler and routes the response", async () => {
  const { mock, app } = buildApp();
  const seen: PermissionRequest[] = [];
  app.onPermissionRequest((req) => {
    seen.push(req);
    req.respond("allow");
  });
  assert.equal(seen.length, 0);
  mock.deliverPermission({
    id: 7,
    kind: "camera",
    url: "https://localhost:5173",
    label: "main",
  });
  await new Promise((r) => setTimeout(r, 10)); /* async handler dispatch */
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.kind, "camera");
  assert.equal(seen[0]!.url, "https://localhost:5173");
  assert.equal(seen[0]!.label, "main");
  assert.deepEqual(mock.permissionRespondLog, [
    { id: 7, response: "allow" },
  ]);
});

test("no handler: auto-respond default (WKUIDelegate Prompt semantics)", async () => {
  const { mock } = buildApp();
  mock.deliverPermission({
    id: 8,
    kind: "microphone",
    url: "ztron://host",
    label: "main",
  });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(mock.permissionRespondLog, [
    { id: 8, response: "default" },
  ]);
});

test("async handler: response waits for the promise", async () => {
  const { mock, app } = buildApp();
  app.onPermissionRequest(async (req) => {
    await new Promise((r) => setTimeout(r, 15));
    req.respond("deny");
  });
  mock.deliverPermission({
    id: 9,
    kind: "geolocation",
    url: "https://x",
    label: "second",
  });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(mock.permissionRespondLog, []); /* still pending */
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(mock.permissionRespondLog, [
    { id: 9, response: "deny" },
  ]);
});

test("AppOptions.onPermissionRequest seeds the handler (builder path)", async () => {
  const kinds: string[] = [];
  const { mock, app } = buildApp();
  app.onPermissionRequest((req) => {
    kinds.push(req.kind);
    req.respond("default");
  });
  mock.deliverPermission({
    id: 10,
    kind: "clipboard-read",
    url: "https://y",
    label: "main",
  });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(kinds, ["clipboard-read"]);
  assert.deepEqual(mock.permissionRespondLog, [
    { id: 10, response: "default" },
  ]);
});
