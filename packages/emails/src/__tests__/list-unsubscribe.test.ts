import { describe, expect, it } from "vitest";
import { buildUnsubscribeToken, verifyUnsubscribeToken } from "../list-unsubscribe";

const SECRET = "0123456789abcdef0123456789abcdef";

describe("buildUnsubscribeToken / verifyUnsubscribeToken", () => {
  it("round-trips identifier and category", () => {
    const token = buildUnsubscribeToken(SECRET, "user@example.com", "auth.verify-email");
    const decoded = verifyUnsubscribeToken(SECRET, token);
    expect(decoded).toEqual({ identifier: "user@example.com", category: "auth.verify-email" });
  });

  it("returns the same token for the same input (deterministic)", () => {
    const a = buildUnsubscribeToken(SECRET, "u@x.com", "auth.password-reset");
    const b = buildUnsubscribeToken(SECRET, "u@x.com", "auth.password-reset");
    expect(a).toBe(b);
  });

  it("returns different tokens for different categories", () => {
    const a = buildUnsubscribeToken(SECRET, "u@x.com", "auth.verify-email");
    const b = buildUnsubscribeToken(SECRET, "u@x.com", "auth.password-reset");
    expect(a).not.toBe(b);
  });

  it("rejects tampered tokens", () => {
    const token = buildUnsubscribeToken(SECRET, "u@x.com", "auth.verify-email");
    const tampered = `${token.slice(0, -3)}XXX`;
    expect(verifyUnsubscribeToken(SECRET, tampered)).toBeNull();
  });

  it("rejects tokens signed with a different secret", () => {
    const token = buildUnsubscribeToken(SECRET, "u@x.com", "auth.verify-email");
    expect(verifyUnsubscribeToken("a-different-secret-of-equal-length-32", token)).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(verifyUnsubscribeToken(SECRET, "")).toBeNull();
    expect(verifyUnsubscribeToken(SECRET, "not-base64!!!")).toBeNull();
    expect(verifyUnsubscribeToken("", "anything")).toBeNull();
  });

  it("rejects tokens with the wrong number of parts", () => {
    const malformed = Buffer.from("only-two|parts", "utf8").toString("base64url");
    expect(verifyUnsubscribeToken(SECRET, malformed)).toBeNull();
  });

  it("throws when builder receives missing arguments", () => {
    expect(() => buildUnsubscribeToken("", "u", "c")).toThrow();
    expect(() => buildUnsubscribeToken(SECRET, "", "c")).toThrow();
    expect(() => buildUnsubscribeToken(SECRET, "u", "")).toThrow();
  });

  it("rejects identifiers/categories containing the separator", () => {
    expect(() => buildUnsubscribeToken(SECRET, "user|injected", "auth.verify-email")).toThrow();
    expect(() => buildUnsubscribeToken(SECRET, "u@x.com", "auth|injected")).toThrow();
  });
});
