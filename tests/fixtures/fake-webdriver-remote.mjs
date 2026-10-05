// Minimal W3C-shape WebDriver stand-in for ztron-driver proxy tests.
// Speaks enough of the protocol to prove the intermediary relays requests:
//   GET  /status        -> { value: { ready: true, message: "fake remote" } }
//   POST /session       -> echoes the received capabilities back
//   anything else       -> echoes { method, path, body }
// Spawned by tests/unit/driver-proxy.test.ts via `node <this file> --port=N`.
import { createServer } from "node:http";

const portArg = process.argv.find((a) => a.startsWith("--port="));
const port = Number(portArg ? portArg.slice(7) : 4445);

createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const reply = (obj) => {
      const text = JSON.stringify(obj);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(text),
      });
      res.end(text);
    };
    if (req.method === "GET" && req.url === "/status") {
      return reply({ value: { ready: true, message: "fake remote" } });
    }
    if (req.method === "POST" && req.url === "/session") {
      let received = {};
      try {
        received = JSON.parse(bodyText);
      } catch {
        /* non-JSON: echo empty */
      }
      return reply({
        value: { sessionId: "fake-1", capabilities: received.capabilities ?? null },
      });
    }
    reply({ value: { method: req.method, path: req.url, body: bodyText } });
  });
}).listen(port, "127.0.0.1");
