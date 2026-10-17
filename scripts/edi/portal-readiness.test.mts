import { describe, expect, it } from "vitest";
import { assertPortalReady } from "./portal-readiness.mts";

describe("commercial portal release preflight", () => {
  it("requires the exact HTTPS origin without following redirects", async () => {
    await assertPortalReady("https://edi.example.test", async (url, options) => {
      expect(String(url)).toBe("https://edi.example.test/api/ready");
      expect(options?.redirect).toBe("error");
      return Response.json({ ok: true, expected: "test-migration", applied: "test-migration" });
    });
  });
  it.each([401, 404, 503])("blocks a portal returning HTTP %i", async (status) => {
    await expect(
      assertPortalReady("https://edi.example.test", async () =>
        Response.json({ ok: false }, { status }),
      ),
    ).rejects.toThrow(`Release portal is not ready (${status})`);
  });
  it("rejects HTML, false readiness and oversized successful responses", async () => {
    for (const response of [
      new Response("<html>Maintenance</html>"),
      Response.json({ ok: false }),
      Response.json({ ok: true, padding: "x".repeat(65536) }),
    ])
      await expect(
        assertPortalReady("https://edi.example.test", async () => response),
      ).rejects.toThrow();
  });
  it("rejects insecure or noncanonical origins before any request", async () => {
    for (const origin of [
      "http://edi.example.test",
      "https://edi.example.test/",
      "https://edi.example.test/path",
      "https://user:password@edi.example.test",
    ])
      await expect(
        assertPortalReady(origin, async () => {
          throw new Error("Unexpected network request");
        }),
      ).rejects.toThrow("Release portal must be a canonical HTTPS origin");
  });
});
