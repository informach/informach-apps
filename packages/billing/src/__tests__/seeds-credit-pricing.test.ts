import { describe, expect, it } from "vitest";
import {
  COZYA_PRICING_SEED,
  type CreditPricingSeedRow,
  expireLegacyCozyaPricing,
  expireSupersededCozyaPricing,
  seedCozyaCreditPricing,
} from "../seeds/credit-pricing";
import { createFakeDb } from "./_fake-db";

const sampleRows: readonly CreditPricingSeedRow[] = [
  { feature: "test.feat_a", model: "model-a", flatCost: 1, defaultEstimateCredits: 1 },
  { feature: "test.feat_b", model: "model-b", flatCost: 2, defaultEstimateCredits: 2 },
];

describe("seedCozyaCreditPricing", () => {
  it("inserts every row when nothing is active yet", async () => {
    const { db, calls } = createFakeDb({
      // both pre-existence checks come back empty
      selectQueue: [[], []],
    });

    const result = await seedCozyaCreditPricing(
      db as unknown as Parameters<typeof seedCozyaCreditPricing>[0],
      sampleRows,
    );

    expect(result).toEqual({ inserted: 2, skipped: 0 });
    const inserts = calls.filter((c) => c.mode === "insert");
    expect(inserts).toHaveLength(2);
  });

  it("skips rows whose (feature, model) already has an active pricing", async () => {
    const { db, calls } = createFakeDb({
      // first lookup finds a row → skip; second is empty → insert
      selectQueue: [[{ id: "existing-id" }], []],
    });

    const result = await seedCozyaCreditPricing(
      db as unknown as Parameters<typeof seedCozyaCreditPricing>[0],
      sampleRows,
    );

    expect(result).toEqual({ inserted: 1, skipped: 1 });
    const inserts = calls.filter((c) => c.mode === "insert");
    expect(inserts).toHaveLength(1);
  });

  it("re-runs are idempotent (every row already active)", async () => {
    const { db, calls } = createFakeDb({
      selectQueue: [[{ id: "a" }], [{ id: "b" }]],
    });

    const result = await seedCozyaCreditPricing(
      db as unknown as Parameters<typeof seedCozyaCreditPricing>[0],
      sampleRows,
    );

    expect(result).toEqual({ inserted: 0, skipped: 2 });
    const inserts = calls.filter((c) => c.mode === "insert");
    expect(inserts).toHaveLength(0);
  });

  it("default Cozya seed includes 7 features (1 vision + 5 mini + 1 whisper) with OpenRouter-prefixed model IDs", () => {
    expect(COZYA_PRICING_SEED).toHaveLength(7);
    const visionRow = COZYA_PRICING_SEED.find(
      (r) => r.feature === "cozya.recipe.extract_from_photo",
    );
    expect(visionRow?.model).toBe("openai/gpt-4o");
    const miniFeatures = COZYA_PRICING_SEED.filter((r) => r.model === "openai/gpt-4o-mini");
    expect(miniFeatures).toHaveLength(5);
    const whisperRow = COZYA_PRICING_SEED.find(
      (r) => r.feature === "cozya.recipe.transcribe_audio",
    );
    expect(whisperRow?.model).toBe("openai/gpt-4o-transcribe");
    const parseVoiceRow = COZYA_PRICING_SEED.find((r) => r.feature === "cozya.recipe.parse_voice");
    expect(parseVoiceRow?.model).toBe("openai/gpt-4o-mini");
    // Every default row is flat 1 credit per call
    for (const row of COZYA_PRICING_SEED) {
      expect(row.flatCost).toBe(1);
      expect(row.defaultEstimateCredits).toBe(1);
    }
    // No legacy (non-prefixed) IDs leaked into the seed
    for (const row of COZYA_PRICING_SEED) {
      expect(row.model).toMatch(/^openai\//);
    }
  });

  it("vision row carries imageDetail=low metadata for cost optimization", () => {
    const visionRow = COZYA_PRICING_SEED.find(
      (r) => r.feature === "cozya.recipe.extract_from_photo",
    );
    expect(visionRow?.metadata).toEqual({
      providerOptions: { openai: { imageDetail: "low" } },
    });
  });
});

describe("expireLegacyCozyaPricing", () => {
  it("returns the count of legacy rows closed", async () => {
    const { db, calls } = createFakeDb({
      updateResult: [{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }],
    });

    const result = await expireLegacyCozyaPricing(
      db as unknown as Parameters<typeof expireLegacyCozyaPricing>[0],
    );

    expect(result).toEqual({ closed: 3 });
    expect(calls.some((c) => c.mode === "update")).toBe(true);
    expect(calls.some((c) => c.mode === "set")).toBe(true);
    expect(calls.some((c) => c.mode === "where")).toBe(true);
    expect(calls.some((c) => c.mode === "returning")).toBe(true);
  });

  it("is idempotent — no rows to close returns 0", async () => {
    const { db } = createFakeDb({ updateResult: [] });

    const result = await expireLegacyCozyaPricing(
      db as unknown as Parameters<typeof expireLegacyCozyaPricing>[0],
    );

    expect(result).toEqual({ closed: 0 });
  });
});

describe("expireSupersededCozyaPricing", () => {
  it("closes one row per (feature, model) entry in COZYA_SUPERSEDED_MODELS", async () => {
    // Today the list has 2 entries: (cozya.recipe.transcribe_audio, openai/whisper-1)
    // and (cozya.recipe.transcribe_audio, openai/whisper-large-v3). The fake
    // db returns the same updateResult for each UPDATE call.
    const { db, calls } = createFakeDb({
      updateResult: [{ id: "row" }],
    });

    const result = await expireSupersededCozyaPricing(
      db as unknown as Parameters<typeof expireSupersededCozyaPricing>[0],
    );

    expect(result).toEqual({ closed: 2 });
    expect(calls.filter((c) => c.mode === "update")).toHaveLength(2);
  });

  it("is idempotent — re-running when nothing is active returns 0", async () => {
    const { db } = createFakeDb({ updateResult: [] });

    const result = await expireSupersededCozyaPricing(
      db as unknown as Parameters<typeof expireSupersededCozyaPricing>[0],
    );

    expect(result).toEqual({ closed: 0 });
  });
});
