import { describe, expect, it } from "vitest";
import { respondSharedActivityInputSchema } from "./schemas";

const validUuid = "11111111-1111-1111-1111-111111111111";

describe("respondSharedActivityInputSchema", () => {
  it("aceita aceitar e rejeitar", () => {
    expect(
      respondSharedActivityInputSchema.parse({ activityId: validUuid, accepted: true }).accepted,
    ).toBe(true);
    expect(
      respondSharedActivityInputSchema.parse({ activityId: validUuid, accepted: false }).accepted,
    ).toBe(false);
  });
});
