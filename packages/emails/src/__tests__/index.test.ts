import { describe, expect, it } from "vitest";
import { createEmailService } from "../index";

describe("createEmailService", () => {
  it("requires an apiKey when mode defaults to live", () => {
    expect(() =>
      createEmailService({
        apiKey: "",
        defaultFrom: "noreply@example.com",
        db: {} as never,
      }),
    ).toThrow(/apiKey is required/);
  });

  it("allows missing apiKey in non-live modes", () => {
    const service = createEmailService({
      apiKey: "",
      defaultFrom: "noreply@example.com",
      db: {} as never,
      mode: "memory",
    });

    expect(service.getOutbox()).toEqual([]);
  });
});
