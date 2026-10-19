import assert from "node:assert/strict";
import { test } from "node:test";
import { clientCommand, personalClientEnvironment } from "../src/main/clientProcess.ts";
import { personalAiChanges, personalAiPreferences } from "../src/shared/personalAi.ts";

test("legacy API settings migrate to personal clients without executable credentials", () => {
  assert.deepEqual(
    personalAiPreferences({ engine: "api", apiKeyEnc: "old", model: "old", confirmDeletes: false }),
    { engine: "claude-code", confirmDeletes: false },
  );
  assert.equal(personalAiChanges.safeParse({ engine: "api" }).success, false);
  assert.equal(personalAiChanges.safeParse({ apiKey: "value" }).success, false);
});
test("official native client arguments stay literal and paid-provider environment is removed", () => {
  const prompt = 'Text & $(echo secret) "quotes"';
  assert.deepEqual(clientCommand("codex.exe", [prompt]), { command: "codex.exe", args: [prompt] });
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    assert.equal(personalClientEnvironment().OPENAI_API_KEY, undefined);
    assert.equal(process.env.OPENAI_API_KEY, "test-only");
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});
