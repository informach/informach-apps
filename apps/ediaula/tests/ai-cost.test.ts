import assert from "node:assert/strict";
import { test } from "node:test";
import { usageCost, usageLabel } from "../src/shared/aiModels.ts";

const close = (actual: number | undefined, expected: number): void => {
  assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
};

test("a turn costs input, output, cache writes and cache reads at the model's prices", () => {
  // Opus 5.5: US$ 4 in, 20 out, 5 cache write, 0.20 cache read per million tokens.
  const opus = usageCost("claude-opus-5-5", {
    input_tokens: 1_000_000,
    output_tokens: 100_000,
    cache_creation_input_tokens: 200_000,
    cache_read_input_tokens: 2_000_000,
  });
  assert.equal(opus.tokens, 3_300_000);
  close(opus.usd, 4 + 2 + 1 + 0.4);
  // Sonnet 5.5: 2 in, 10 out.
  close(usageCost("claude-sonnet-5-5", { input_tokens: 500_000, output_tokens: 50_000 }).usd, 1.5);
});

test("Haiku 5.5 uses the second price card above 100 thousand prompt tokens", () => {
  close(usageCost("claude-haiku-5-5", { input_tokens: 100_000, output_tokens: 10_000 }).usd, 0.015);
  // 150k prompt tokens (cache reads count in the prompt): every token at the higher rates.
  close(
    usageCost("claude-haiku-5-5", {
      input_tokens: 50_000,
      cache_read_input_tokens: 100_000,
      output_tokens: 10_000,
    }).usd,
    (50_000 * 0.5 + 100_000 * 0.05 + 10_000 * 2.5) / 1_000_000,
  );
});

test("each attempt is priced at the model that ran it (a fallback, a compaction)", () => {
  const usage = {
    input_tokens: 10,
    output_tokens: 10,
    iterations: [
      { type: "message", model: "claude-opus-5-5", input_tokens: 1_000_000, output_tokens: 0 },
      {
        type: "fallback_message",
        model: "claude-opus-5",
        input_tokens: 1_000_000,
        output_tokens: 0,
      },
      { type: "compaction", input_tokens: 0, output_tokens: 1_000_000 },
    ],
  };
  const cost = usageCost("claude-opus-5-5", usage);
  assert.equal(cost.tokens, 3_000_000);
  close(cost.usd, 4 + 5 + 20);
});

test("an unknown model has tokens but no price", () => {
  const cost = usageCost("claude-futuro", { input_tokens: 10, output_tokens: 5 });
  assert.deepEqual(cost, { tokens: 15 });
});

test("the panel shows tokens and cost in Brazilian Portuguese", () => {
  assert.equal(usageLabel({ tokens: 950 }), "950 tokens");
  assert.equal(usageLabel({ tokens: 12_345, usd: 0.04 }), "12,3 mil tokens · US$ 0,04");
  assert.equal(usageLabel({ tokens: 2_500_000, usd: 1.5 }), "2,5 mi tokens · US$ 1,50");
  assert.equal(usageLabel({ tokens: 800, usd: 0.001 }), "800 tokens · menos de US$ 0,01");
  assert.equal(
    usageLabel({ tokens: 30_000, usd: 0.12, estimated: true }),
    "30,0 mil tokens · cerca de US$ 0,12",
  );
});
