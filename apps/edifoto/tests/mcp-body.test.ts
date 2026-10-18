import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { test } from "node:test";
import { McpBodyError, readMcpBody } from "../src/main/mcpBody.ts";

test("MCP body bounds actual UTF-8 bytes and rejects malformed and aborted requests", async () => {
  const observed: unknown[] = [];
  const server = createServer(async (req, res) => {
    try {
      observed.push(await readMcpBody(req, 32));
      res.writeHead(200).end();
    } catch (error) {
      observed.push(error);
      res.writeHead(error instanceof McpBodyError ? error.status : 500).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const post = (chunks: string[], headers = {}): Promise<number | undefined> =>
    new Promise((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port: address.port, method: "POST", headers },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        },
      );
      req.on("error", reject);
      for (const chunk of chunks) req.write(chunk);
      req.end();
    });
  try {
    assert.equal(await post(['{"text":', '"Olá"}']), 200);
    assert.deepEqual(observed[0], { text: "Olá" });
    assert.equal(await post(['{"text":"', "á".repeat(20), '"}', "extra".repeat(100)]), 413);
    assert.equal(await post(["{}"], { "content-length": "100" }), 413);
    assert.equal(await post(["{invalid}"]), 400);
    // Client interruption exercises IncomingMessage.aborted, without waiting for its body.
    await new Promise<void>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port: address.port, method: "POST" });
      req.on("error", () => resolve());
      server.once("request", (incoming) => {
        incoming.once("aborted", resolve);
        req.destroy();
      });
      req.write("partial");
      req.flushHeaders();
      req.once("timeout", reject);
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
