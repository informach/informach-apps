import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { contentLengthExceeds } from "./request-size";

describe("contentLengthExceeds", () => {
  it("returns true when content-length is larger than the limit", () => {
    const request = new Request("https://app.example.com", {
      headers: { "content-length": "1025" },
    });

    expect(contentLengthExceeds(request, 1024)).toBe(true);
  });

  it("returns false for missing, invalid, or allowed content-length", () => {
    expect(contentLengthExceeds(new Request("https://app.example.com"), 1024)).toBe(false);
    expect(
      contentLengthExceeds(
        new Request("https://app.example.com", { headers: { "content-length": "invalid" } }),
        1024,
      ),
    ).toBe(false);
    expect(
      contentLengthExceeds(
        new Request("https://app.example.com", { headers: { "content-length": "1024" } }),
        1024,
      ),
    ).toBe(false);
  });
});
