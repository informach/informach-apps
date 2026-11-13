import { expect, it } from "vitest";
import { cronAuthorizationStatus } from "./cron-auth";

it("requires the exact configured bearer and refuses an unconfigured worker", () => {
  const secret = "isolated-cron-secret".repeat(2);
  const request = (authorization?: string) =>
    new Request("https://example.test/api/jobs", {
      headers: authorization ? { authorization } : {},
    });
  expect(cronAuthorizationStatus(request(`Bearer ${secret}`), secret)).toBe(200);
  expect(cronAuthorizationStatus(request(`Bearer ${secret}`), undefined)).toBe(503);
  for (const value of [
    undefined,
    secret,
    `bearer ${secret}`,
    `Bearer ${secret}x`,
    `Bearer ${"x".repeat(secret.length)}`,
  ]) {
    expect(cronAuthorizationStatus(request(value), secret)).toBe(401);
  }
});
