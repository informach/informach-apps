import assert from "node:assert/strict";
import { test } from "node:test";
import { configureDesktopAccess, localMcpHeaders } from "@informach/edi-desktop/access";
import { startMcpServer } from "./mcpServer.js";

test("MCP exposes validated tools and refuses browser origins", async () => {
  let called = false;
  let licensed = true;
  configureDesktopAccess({
    token: "a".repeat(64),
    assertAccess: () => {
      if (!licensed) throw new Error("Access revoked");
    },
  });
  const server = await startMcpServer(async (name, input) => {
    called = true;
    return { ok: true, text: JSON.stringify({ name, input }) };
  }, 0);
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  const headers = {
    ...localMcpHeaders(),
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  try {
    const forbidden = await fetch(url, {
      method: "POST",
      headers: { ...headers, Origin: "https://example.com" },
      body: "{}",
    });
    assert.equal(forbidden.status, 403);
    const anonymous = await fetch(url, { method: "POST", body: "{}" });
    assert.equal(anonymous.status, 403);
    const post = async (method, params) => {
      const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      return r.json();
    };
    const list = await post("tools/list", {});
    assert.ok(list.result.tools.some((t) => t.name === "set_transform"));
    const ok = await post("tools/call", { name: "set_transform", arguments: { x: 10 } });
    assert.equal(ok.result.isError, false);
    assert.equal(called, true);
    called = false;
    const bad = await post("tools/call", { name: "set_transform", arguments: { opacity: 200 } });
    assert.equal(bad.result.isError, true);
    assert.equal(called, false);
    licensed = false;
    const revoked = await fetch(url, { method: "POST", headers, body: "{}" });
    assert.equal(revoked.status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
