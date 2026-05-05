import { describe, expect, it } from "vitest";
import {
  COZYA_PRICING_SEED,
  type CreditPricingSeedRow,
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

  it("default Cozya seed includes 5 features (1 vision + 4 mini)", () => {
    expect(COZYA_PRICING_SEED).toHaveLength(5);
    const visionRow = COZYA_PRICING_SEED.find(
      (r) => r.feature === "cozya.recipe.extract_from_photo",
    );
    expect(visionRow?.model).toBe("gpt-4o");
    const miniFeatures = COZYA_PRICING_SEED.filter((r) => r.model === "gpt-4o-mini");
    expect(miniFeatures).toHaveLength(4);
    // Every default row is flat 1 credit per call
    for (const row of COZYA_PRICING_SEED) {
      expect(row.flatCost).toBe(1);
      expect(row.defaultEstimateCredits).toBe(1);
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
