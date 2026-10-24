import { describe, expect, it } from "vitest";
import { respondSharedActivityInputSchema } from "./schemas";

// A version 4 UUID, as the database makes them: zod 4 checks the version and variant digits.
const validUuid = "11111111-1111-4111-8111-111111111111";

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
