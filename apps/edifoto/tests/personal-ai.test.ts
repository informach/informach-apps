import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AI_TOOL_NAMES,
  ALWAYS_ASK,
  MUTATING_TOOLS,
  toolPermission,
} from "../src/shared/aiTools.ts";
import { personalAiChanges, personalAiPreferences } from "../src/shared/personalAi.ts";

test("legacy API settings migrate to personal clients without executable credentials", () => {
  assert.deepEqual(
    personalAiPreferences({ engine: "api", apiKeyEnc: "old", model: "old", confirmDeletes: false }),
    { engine: "claude-code", confirmDeletes: false },
  );
  assert.equal(personalAiChanges.safeParse({ engine: "api" }).success, false);
  assert.equal(personalAiChanges.safeParse({ apiKey: "value" }).success, false);
});

test("external AI apps need the write scope or the person's approval to change the image", () => {
  for (const name of AI_TOOL_NAMES)
    assert.equal(
      toolPermission(name),
      MUTATING_TOOLS.has(name) || name === "export_image" ? "write" : "read",
      name,
    );
  for (const name of ["get_document", "get_preview", "analyze_image"] as const)
    assert.equal(toolPermission(name), "read", name);
  // Opening, placing and saving files ask every time, and all of them are writes.
  for (const name of ALWAYS_ASK) assert.equal(toolPermission(name), "write", name);
});
