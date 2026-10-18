import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASSISTANT_MODELS,
  buildRequest,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  EFFORTS,
  isEffort,
  resolveModel,
} from "../src/shared/aiModels.ts";

test("Opus 5.5 is the default and the list is Opus, Sonnet and Haiku 5.5", () => {
  assert.equal(DEFAULT_MODEL, "claude-opus-5-5");
  assert.deepEqual(
    ASSISTANT_MODELS.map((m) => m.id),
    ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  );
  assert.match(ASSISTANT_MODELS[0].label, /recomendado/);
  assert.match(ASSISTANT_MODELS[2].label, /econômico/);
});

test("earlier choices: Opus 5 stays with a notice, Haiku 4.5 moves to Haiku 5.5", () => {
  assert.deepEqual(resolveModel(undefined), { model: "claude-opus-5-5" });
  assert.deepEqual(resolveModel("claude-sonnet-5-5"), { model: "claude-sonnet-5-5" });
  const opus5 = resolveModel("claude-opus-5");
  assert.equal(opus5.model, "claude-opus-5");
  assert.match(opus5.notice ?? "", /Opus 5\.5 é mais novo e mais barato/);
  assert.ok(!opus5.migrated);
  const haiku = resolveModel("claude-haiku-4-5");
  assert.deepEqual([haiku.model, haiku.migrated], ["claude-haiku-5-5", true]);
  assert.equal(resolveModel("claude-que-nao-existe").model, "claude-opus-5-5");
});

test("every request sends adaptive thinking and the effort, high by default", () => {
  assert.equal(DEFAULT_EFFORT, "high");
  for (const { id } of ASSISTANT_MODELS)
    for (const { id: effort } of EFFORTS) {
      const request = buildRequest(id, effort);
      assert.deepEqual(request.thinking, { type: "adaptive" });
      assert.deepEqual(request.output_config, { effort });
      assert.equal(request.model, id);
    }
  assert.ok(isEffort("xhigh"));
  assert.ok(!isEffort("ultra"));
});

test("long conversations are compacted; the fallback model only where the API offers it", () => {
  const opus = buildRequest("claude-opus-5-5", "high");
  assert.deepEqual(
    opus.context_management?.edits.map((e) => e.type),
    ["clear_tool_uses_20250919", "compact_20260112"],
  );
  assert.deepEqual(opus.betas.sort(), [
    "compact-2026-01-12",
    "context-management-2025-06-27",
    "server-side-fallback-2026-07-01",
  ]);
  assert.equal(opus.fallbacks, "default");
  assert.equal(buildRequest("claude-sonnet-5-5", "low").fallbacks, "default");
  // Haiku 5.5 has no server-side fallback: the parameter is not sent at all.
  const haiku = buildRequest("claude-haiku-5-5", "medium");
  assert.equal(haiku.fallbacks, undefined);
  assert.deepEqual(haiku.betas, ["context-management-2025-06-27", "compact-2026-01-12"]);
  assert.ok(haiku.context_management);
  // A model this version does not know gets neither beta.
  const unknown = buildRequest("claude-futuro", "high");
  assert.deepEqual(unknown.betas, []);
  assert.equal(unknown.context_management, undefined);
});
