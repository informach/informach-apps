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
    assert.ok(list.result.tools.some((t) => t.name === "edit_document"));
    assert.ok(list.result.tools.some((t) => t.name === "get_track"));
    assert.ok(list.result.tools.some((t) => t.name === "get_font_coverage"));
    assert.ok(list.result.tools.some((t) => t.name === "get_lottie_report"));
    const ok = await post("tools/call", { name: "set_transform", arguments: { x: 10 } });
    assert.equal(ok.result.isError, false);
    assert.equal(called, true);
    called = false;
    const badLottieRead = await post("tools/call", {
      name: "get_lottie_report",
      arguments: { artboardId: "artboard-test", animationId: "animation-test", subdivisions: 8 },
    });
    assert.equal(badLottieRead.result.isError, true);
    assert.equal(called, false);
    const badFontRead = await post("tools/call", {
      name: "get_font_coverage",
      arguments: { id: "not-an-object" },
    });
    assert.equal(badFontRead.result.isError, true);
    assert.equal(called, false);
    const bad = await post("tools/call", { name: "set_transform", arguments: { opacity: 200 } });
    assert.equal(bad.result.isError, true);
    assert.equal(called, false);
    const badTransaction = await post("tools/call", {
      name: "edit_document",
      arguments: {
        projectId: "project-valid",
        sessionId: "not-a-session",
        revision: 0,
        commands: [],
      },
    });
    assert.equal(badTransaction.result.isError, true);
    assert.equal(called, false);
    const transaction = {
      projectId: "project-valid",
      sessionId: crypto.randomUUID(),
      revision: 0,
      commands: [
        {
          type: "animation-keys",
          command: {
            operation: "move",
            animationId: "animation-valid",
            references: [
              { kind: "motion", trackId: "track-shared", keyId: "key-shared" },
              {
                kind: "rig",
                artboardId: "artboard-valid",
                trackId: "track-shared",
                keyId: "key-shared",
              },
            ],
            deltaFrames: 1,
            scale: 1,
            anchorFrame: 0,
          },
        },
      ],
    };
    licensed = true;
    const mixed = await post("tools/call", { name: "edit_document", arguments: transaction });
    assert.equal(mixed.result.isError, false);
    assert.deepEqual(JSON.parse(mixed.result.content[0].text).input, transaction);
    called = false;
    const incomplete = structuredClone(transaction);
    delete incomplete.commands[0].command.references[1].artboardId;
    const missingBoard = await post("tools/call", { name: "edit_document", arguments: incomplete });
    assert.equal(missingBoard.result.isError, true);
    assert.equal(called, false, "Incomplete rig identity cannot reach the document dispatcher");
    licensed = false;
    const revoked = await fetch(url, { method: "POST", headers, body: "{}" });
    assert.equal(revoked.status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
