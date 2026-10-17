import { generateKeyPairSync, randomUUID } from "node:crypto";
import { MAX_LEASE_SECONDS } from "@informach/edi-contracts";
import { verifyLicense } from "@informach/edi-contracts/verify";
import { describe, expect, it } from "vitest";
import { type CommercialState, decideAccess } from "./policy";
import { createLicenseSigner } from "./sign";

const pair = generateKeyPairSync("ed25519");
const now = new Date("2026-10-16T12:00:00Z");
const signer = createLicenseSigner({
  privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  kid: "test",
  issuer: "https://edi.example.com",
  environment: "production",
});
const binding = {
  sub: "user-one",
  deviceId: randomUUID(),
  keyThumbprint: "a".repeat(64),
  activationId: randomUUID(),
  revision: 2,
};
const context = {
  trustedKeys: { test: pair.publicKey.export({ type: "spki", format: "pem" }).toString() },
  issuer: "https://edi.example.com",
  environment: "production" as const,
  userId: binding.sub,
  deviceId: binding.deviceId,
  keyThumbprint: binding.keyThumbprint,
  activationId: binding.activationId,
  minimumRevision: 2,
  toolId: "edipdf" as const,
  now,
  lastTrustedTime: now,
};
const paidThrough = new Date(now.getTime() + 30 * 86400000);

describe("signed offline licenses", () => {
  it("signs verifiable device-bound grants capped to 72h", () => {
    const token = signer({ ...binding, now, paidThrough });
    const result = verifyLicense(token, context);
    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error("Expected valid lease");
    expect(result.claims.exp - result.claims.iat).toBe(MAX_LEASE_SECONDS);
    expect(result.claims.tools).toHaveLength(5);
  });
  it("never extends past the paid end, including clock tolerance", () => {
    const end = new Date(now.getTime() + 60000);
    const token = signer({ ...binding, now, paidThrough: end });
    expect(verifyLicense(token, { ...context, now: end })).toEqual({
      valid: false,
      reason: "expired",
    });
  });
  it("rejects account, device, activation, environment and revision reuse", () => {
    const token = signer({ ...binding, now, paidThrough });
    for (const change of [
      { userId: "other" },
      { deviceId: randomUUID() },
      { activationId: randomUUID() },
      { keyThumbprint: "b".repeat(64) },
      { environment: "development" as const },
      { minimumRevision: 3 },
      { issuer: "https://other.example.com" },
    ])
      expect(verifyLicense(token, { ...context, ...change })).toEqual({
        valid: false,
        reason: "wrong_binding",
      });
  });
  it("rejects malformed tokens, unsigned content, unknown keys and rollback", () => {
    const token = signer({ ...binding, now, paidThrough });
    expect(verifyLicense("not-a-token", context).valid).toBe(false);
    const [header, payload] = token.split(".");
    expect(
      verifyLicense(`${header}.${payload}.${Buffer.alloc(64).toString("base64url")}`, context),
    ).toEqual({ valid: false, reason: "invalid_signature" });
    expect(verifyLicense(token, { ...context, trustedKeys: {} })).toEqual({
      valid: false,
      reason: "untrusted_key",
    });
    expect(
      verifyLicense(token, { ...context, lastTrustedTime: new Date(now.getTime() + 120000) }),
    ).toEqual({ valid: false, reason: "clock_rollback" });
  });
  it("refuses to issue expired grants or non-Ed25519 keys", () => {
    const token = signer({ ...binding, now, paidThrough });
    expect(verifyLicense(token, { ...context, now: new Date("invalid") })).toEqual({
      valid: false,
      reason: "clock_rollback",
    });
    expect(verifyLicense(token, { ...context, lastTrustedTime: new Date("invalid") })).toEqual({
      valid: false,
      reason: "clock_rollback",
    });
    expect(() => signer({ ...binding, now, paidThrough: now })).toThrow();
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect(() =>
      createLicenseSigner({
        privateKeyPem: rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
        kid: "rsa",
        issuer: context.issuer,
        environment: "production",
      }),
    ).toThrow("Ed25519");
  });
});

describe("commercial access policy", () => {
  const end = new Date(now.getTime() + 86400000);
  const state: CommercialState = {
    status: "active",
    trialEnd: null,
    suspended: false,
    periods: [{ start: now, end, refunded: false, disputed: false }],
  };
  it("requires an actual paid period, even when status is active", () => {
    expect(decideAccess({ ...state, periods: [] }, now).allowed).toBe(false);
    expect(decideAccess(state, now)).toEqual({ allowed: true, paidThrough: end });
    expect(decideAccess(state, end).allowed).toBe(false);
  });
  it("preserves paid cancellation but blocks dunning, disputes and refunds", () => {
    expect(decideAccess({ ...state, status: "canceled" }, now).allowed).toBe(true);
    for (const status of [
      "past_due",
      "unpaid",
      "paused",
      "incomplete",
      "incomplete_expired",
    ] as const)
      expect(decideAccess({ ...state, status }, now).allowed).toBe(false);
    expect(
      decideAccess(
        {
          ...state,
          periods: [{ ...state.periods[0], start: now, end, refunded: true, disputed: false }],
        },
        now,
      ).allowed,
    ).toBe(false);
    expect(decideAccess({ ...state, suspended: true }, now).allowed).toBe(false);
    expect(
      decideAccess(
        { ...state, periods: [{ start: now, end, refunded: false, disputed: true }] },
        now,
      ).allowed,
    ).toBe(false);
  });
  it("does not bridge unpaid gaps but joins contiguous paid periods", () => {
    const futureEnd = new Date(end.getTime() + 86400000);
    expect(
      decideAccess(
        {
          ...state,
          periods: [
            ...state.periods,
            {
              start: new Date(end.getTime() + 1),
              end: futureEnd,
              refunded: false,
              disputed: false,
            },
          ],
        },
        now,
      ),
    ).toEqual({ allowed: true, paidThrough: end });
    expect(
      decideAccess(
        {
          ...state,
          periods: [
            ...state.periods,
            { start: end, end: futureEnd, refunded: false, disputed: false },
          ],
        },
        now,
      ),
    ).toEqual({ allowed: true, paidThrough: futureEnd });
  });
  it("bounds trials and refuses absent subscriptions", () => {
    expect(decideAccess(null, now).allowed).toBe(false);
    expect(decideAccess({ ...state, status: "trialing", trialEnd: end, periods: [] }, now)).toEqual(
      { allowed: true, paidThrough: end },
    );
    expect(decideAccess({ ...state, status: "trialing", trialEnd: now }, now).allowed).toBe(false);
  });
});
