import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngineRunner, panelEvent, providerClient } from "./engines.js";

test("the panel's providers map to the official clients and nothing else", () => {
  assert.equal(providerClient("claude"), "claude-code");
  assert.equal(providerClient("codex"), "codex");
  for (const provider of ["invalid", "toString", "__proto__", undefined])
    assert.throws(() => providerClient(provider), /Provedor inválido/);
});

test("run events reach the panel in its own shape", () => {
  assert.deepEqual(panelEvent({ type: "text", delta: "Olá" }), { type: "text", text: "Olá" });
  assert.deepEqual(
    panelEvent({
      type: "tool",
      id: "1",
      name: "mcp__edisvg__get_overview",
      title: "get_overview",
      status: "running",
    }),
    { type: "tool", text: "get_overview" },
  );
  assert.equal(panelEvent({ type: "tool", id: "1", name: "", title: "", status: "done" }), null);
  assert.deepEqual(panelEvent({ type: "error", message: "Login" }), {
    type: "error",
    text: "Login",
  });
  assert.equal(panelEvent({ type: "quota", level: "ok", text: "ok" }), null);
  assert.deepEqual(panelEvent({ type: "quota", level: "blocked", text: "Limite" }), {
    type: "error",
    text: "Limite",
  });
  assert.equal(panelEvent({ type: "usage", tokens: 3 }), null);
  assert.equal(panelEvent({ type: "done" }), null);
});

test("invalid messages, models and providers are refused before any client starts", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "edisvg-ai-"));
  const events = [];
  try {
    const runner = createEngineRunner(workspace, "http://127.0.0.1:47322/mcp", (e) =>
      events.push(e),
    );
    await assert.rejects(runner.send({ provider: "claude", prompt: "  " }), /Mensagem inválida/);
    await assert.rejects(
      runner.send({ provider: "claude", prompt: "x".repeat(32001) }),
      /longa demais/,
    );
    await assert.rejects(
      runner.send({ provider: "claude", prompt: "oi", model: "a b; rm" }),
      /Modelo inválido/,
    );
    await assert.rejects(runner.send({ provider: "outro", prompt: "oi" }), /Provedor inválido/);
    assert.equal(runner.busy(), false);
    assert.deepEqual(events, []);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
