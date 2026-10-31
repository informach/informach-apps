import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AI_TOOLS, toolActivity } from "../shared/aiTools.js";
import { createEngineRunner, panelEvent, panelImages, providerClient } from "./engines.js";

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
      title: "Lendo o projeto",
      status: "running",
    }),
    { type: "tool", text: "Lendo o projeto" },
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

test("the panel says what a tool does in words, never its name", () => {
  assert.equal(toolActivity("edit_document"), "Editando o desenho");
  assert.equal(toolActivity("get_something_new"), "Consultando o projeto");
  assert.equal(toolActivity("toString"), "Trabalhando no projeto");
  // Every editor tool has its own words, not the fallback.
  for (const name of Object.keys(AI_TOOLS))
    assert.doesNotMatch(toolActivity(name), /^(Consultando o projeto|Trabalhando no projeto)$/);
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

test("reference images from the panel must be real PNG, JPEG, GIF or WebP, a few per message", async () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  assert.deepEqual(panelImages(undefined), []);
  assert.equal(panelImages([{ mediaType: "image/png", data: png.buffer }])[0].data.length, 9);
  for (const images of [
    "x",
    [{ mediaType: "image/png", data: "iVBOR" }],
    [{ mediaType: "image/svg+xml", data: png }],
    [{ mediaType: "image/jpeg", data: png }],
    Array.from({ length: 5 }, () => ({ mediaType: "image/png", data: png })),
  ])
    assert.throws(() => panelImages(images));
  const workspace = await mkdtemp(join(tmpdir(), "edisvg-ai-"));
  try {
    const runner = createEngineRunner(workspace, "http://127.0.0.1:47322/mcp", () => {});
    await assert.rejects(
      runner.send({
        provider: "claude",
        prompt: "oi",
        images: [{ mediaType: "image/gif", data: png }],
      }),
      /PNG, JPEG/,
    );
    assert.equal(runner.busy(), false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
