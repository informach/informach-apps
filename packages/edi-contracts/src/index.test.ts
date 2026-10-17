import { describe, expect, it } from "vitest";
import {
  activationRequestSchema,
  releaseManifestSchema,
  releaseVersionSchema,
  toolIdSchema,
} from "./index";

describe("public input contracts", () => {
  it("rejects unknown tools and injected activation fields", () => {
    expect(toolIdSchema.safeParse("../admin").success).toBe(false);
    expect(
      activationRequestSchema.safeParse({
        deviceId: "bad",
        name: "PC",
        publicKeySpki: "abc",
        userId: "other",
      }).success,
    ).toBe(false);
  });
  it("rejects incomplete release batches", () => {
    expect(
      releaseManifestSchema.safeParse({
        version: "1.0.0",
        channel: "stable",
        publishedAt: new Date().toISOString(),
        artifacts: [],
      }).success,
    ).toBe(false);
  });
  it("rejects noncanonical versions and mixing release channels", () => {
    for (const version of ["01.2.3", "1.2.3-beta.01", "1.2", "1.2.3-rc.1", "../1.2.3"])
      expect(releaseVersionSchema.safeParse(version).success).toBe(false);
    expect(releaseVersionSchema.safeParse("1.2.3-beta.1").success).toBe(true);
  });
});
