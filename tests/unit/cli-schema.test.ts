/**
 * G18/D5 — declarative CLI schema (clap-shaped): shorts/longs/inline =,
 * takesValue, multiple, required, conflicts, indexed positionals,
 * nested subcommands, defaults — plus the legacy flat-form compatibility.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgv } from "../../packages/core/dist/index.js";

const SCHEMA = {
  description: "demo",
  args: [
    { name: "verbose", short: "v", long: "verbose", takesValue: false },
    { name: "port", short: "p", long: "port", takesValue: true },
    { name: "tag", long: "tag", takesValue: true, multiple: true },
    { name: "input", long: "input", index: 1 },
  ],
  subcommands: [
    {
      name: "serve",
      args: [
        { name: "host", long: "host", takesValue: true, required: true },
        { name: "dry", long: "dry", takesValue: false },
      ],
    },
    { name: "build" },
  ],
};

test("cli schema: shorts, longs, inline =, takesValue, multiple", () => {
  const m = parseArgv(["-v", "--port", "8080", "--tag=a", "--tag", "b"], {
    schema: SCHEMA,
  });
  assert.equal(m.args.verbose, true);
  assert.equal(m.args.port, 8080);
  assert.deepEqual(m.args.tag, ["a", "b"]);
});

test("cli schema: indexed positional", () => {
  const m = parseArgv(["main.rs"], { schema: SCHEMA });
  assert.equal(m.args.input, "main.rs");
});

test("cli schema: subcommand nesting with required enforcement", () => {
  const m = parseArgv(["--port", "99", "serve", "--host", "x.io", "--dry"], {
    schema: SCHEMA,
  });
  assert.equal(m.args.port, 99);
  assert.equal(m.subcommand?.name, "serve");
  assert.equal(m.subcommand?.matches.args.host, "x.io");
  assert.equal(m.subcommand?.matches.args.dry, true);

  assert.throws(
    () => parseArgv(["serve"], { schema: SCHEMA }),
    /missing required argument --host/,
  );
});

test("cli schema: conflicts", () => {
  const schema = {
    args: [
      { name: "a", long: "a", takesValue: false, conflicts: ["b"] },
      { name: "b", long: "b", takesValue: false },
    ],
  };
  assert.throws(
    () => parseArgv(["--a", "--b"], { schema }),
    /conflicts with --b/,
  );
  const ok = parseArgv(["--a"], { schema });
  assert.equal(ok.args.a, true);
});

test("cli schema: defaults fill absent declared args", () => {
  const schema = {
    args: [{ name: "mode", long: "mode", takesValue: true, default: "dev" }],
  };
  const m = parseArgv([], { schema });
  assert.equal(m.args.mode, "dev");
});

test("cli legacy flat form still parses (back-compat)", () => {
  const m = parseArgv(["--verbose", "serve", "--port", "3"], {
    subcommands: ["serve"],
    booleans: ["verbose"],
  });
  assert.equal(m.args.verbose, true);
  assert.equal(m.subcommand?.name, "serve");
  assert.equal(m.subcommand?.matches.args.port, 3);
});
