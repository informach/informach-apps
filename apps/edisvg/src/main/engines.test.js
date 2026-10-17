import assert from "node:assert/strict";
import { test } from "node:test";
import { engineArguments, parseEngineEvent } from "./engines.js";

test("CLI arguments never interpolate the user prompt into a shell command", () => {
  const options = { url: "http://127.0.0.1:47322/mcp", prompt: "hello & whoami", model: "" };
  for (const provider of ["claude", "codex"])
    assert.ok(!engineArguments(provider, options).includes(options.prompt));
  assert.ok(engineArguments("claude", options).includes("--strict-mcp-config"));
  assert.ok(engineArguments("codex", options).includes("read-only"));
  assert.throws(() => engineArguments("invalid", options));
});
test("parses streaming Claude and Codex output and failures", () => {
  assert.deepEqual(
    parseEngineEvent("claude", {
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "Olá" } },
    }),
    { type: "text", text: "Olá" },
  );
  assert.equal(
    parseEngineEvent("codex", {
      type: "item.completed",
      item: { type: "agent_message", text: "Pronto" },
    }).text,
    "Pronto\n",
  );
  assert.equal(
    parseEngineEvent("codex", { type: "turn.failed", error: { message: "Login" } }).type,
    "error",
  );
});
