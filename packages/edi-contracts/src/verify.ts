import { createPublicKey, verify } from "node:crypto";
import type { EdiToolId } from "@informach/config/edi-tools";
import {
  CLOCK_SKEW_SECONDS,
  compareReleaseVersions,
  type LeaseClaims,
  leaseClaimsSchema,
  leaseHeaderSchema,
  releaseVersionSchema,
} from "./index";

export type LeaseVerification =
  | { valid: true; claims: LeaseClaims }
  | {
      valid: false;
      reason:
        | "malformed"
        | "untrusted_key"
        | "invalid_signature"
        | "wrong_binding"
        | "expired"
        | "update_required"
        | "clock_rollback";
    };

export function verifyLicense(
  token: string,
  context: {
    trustedKeys: Readonly<Record<string, string>>;
    issuer: string;
    environment: LeaseClaims["environment"];
    userId: string;
    deviceId: string;
    keyThumbprint: string;
    activationId: string;
    minimumRevision: number;
    clientVersion: string;
    toolId: EdiToolId;
    now: Date;
    lastTrustedTime: Date;
  },
): LeaseVerification {
  if (token.length > 8192) return { valid: false, reason: "malformed" };
  const parts = token.split(".");
  const [headerPart, claimsPart, signaturePart] = parts;
  if (
    parts.length !== 3 ||
    !headerPart ||
    !claimsPart ||
    !signaturePart ||
    parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
  )
    return { valid: false, reason: "malformed" };
  let rawHeader: unknown;
  let rawClaims: unknown;
  try {
    rawHeader = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
    rawClaims = JSON.parse(Buffer.from(claimsPart, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }
  const header = leaseHeaderSchema.safeParse(rawHeader);
  const claims = leaseClaimsSchema.safeParse(rawClaims);
  if (!header.success || !claims.success) return { valid: false, reason: "malformed" };
  const pem = Object.hasOwn(context.trustedKeys, header.data.kid)
    ? context.trustedKeys[header.data.kid]
    : undefined;
  if (!pem) return { valid: false, reason: "untrusted_key" };
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Trusted license key must be Ed25519");
  const signature = Buffer.from(signaturePart, "base64url");
  if (
    signature.length !== 64 ||
    !verify(null, Buffer.from(`${headerPart}.${claimsPart}`), key, signature)
  )
    return { valid: false, reason: "invalid_signature" };
  const lease = claims.data;
  if (!releaseVersionSchema.safeParse(context.clientVersion).success)
    return { valid: false, reason: "malformed" };
  if (
    lease.iss !== context.issuer ||
    lease.environment !== context.environment ||
    lease.sub !== context.userId ||
    lease.deviceId !== context.deviceId ||
    lease.keyThumbprint !== context.keyThumbprint ||
    lease.activationId !== context.activationId ||
    lease.revision < context.minimumRevision ||
    !lease.tools.includes(context.toolId)
  )
    return { valid: false, reason: "wrong_binding" };
  const now = Math.floor(context.now.getTime() / 1000);
  const last = Math.floor(context.lastTrustedTime.getTime() / 1000);
  if (!Number.isFinite(now) || !Number.isFinite(last))
    return { valid: false, reason: "clock_rollback" };
  if (now + CLOCK_SKEW_SECONDS < last) return { valid: false, reason: "clock_rollback" };
  // Skew never extends paid access or expiry; it only tolerates a slightly fast issuer clock.
  if (now >= lease.exp || now >= lease.paidThrough || now + CLOCK_SKEW_SECONDS < lease.nbf)
    return { valid: false, reason: "expired" };
  // A version-specific refusal must not mask a shared binding, expiry or clock
  // failure: callers may preserve other apps' leases only for update_required.
  if (compareReleaseVersions(context.clientVersion, lease.minimumClientVersion) < 0)
    return { valid: false, reason: "update_required" };
  return { valid: true, claims: lease };
}
