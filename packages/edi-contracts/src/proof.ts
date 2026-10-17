import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import { z } from "zod";

export const proofSchema = z.strictObject({
  version: z.literal(1),
  audience: z.url(),
  method: z.literal("POST"),
  path: z.enum(["/api/desktop/activate", "/api/desktop/license", "/api/desktop/logout"]),
  userId: z.string().min(1).max(200),
  deviceId: z.uuid(),
  sessionId: z.uuid().nullable(),
  iat: z.int().positive(),
  nonce: z.uuid(),
  bodySha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type RequestProof = z.infer<typeof proofSchema>;
export function bodyHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}
export function signRequestProof(
  input: Omit<RequestProof, "version" | "nonce" | "bodySha256">,
  body: string,
  privateKeyPem: string,
): string {
  const proof = proofSchema.parse({
    ...input,
    version: 1,
    nonce: randomUUID(),
    bodySha256: bodyHash(body),
  });
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Device key must be Ed25519");
  const payload = Buffer.from(JSON.stringify(proof)).toString("base64url");
  return `${payload}.${sign(null, Buffer.from(payload), key).toString("base64url")}`;
}
export function verifyRequestProof(
  input: string,
  body: string,
  publicKeySpki: string,
  expected: Pick<
    RequestProof,
    "audience" | "method" | "path" | "userId" | "deviceId" | "sessionId"
  >,
  now: Date,
): RequestProof | null {
  if (input.length > 4096 || body.length > 16384 || publicKeySpki.length > 256) return null;
  const parts = input.split(".");
  const [payload, signature] = parts;
  if (
    parts.length !== 2 ||
    !payload ||
    !signature ||
    !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  )
    return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const data = proofSchema.safeParse(parsed);
  if (!data.success) return null;
  const proof = data.data;
  const time = Math.floor(now.getTime() / 1000);
  if (
    !Number.isFinite(time) ||
    proof.iat < time - 120 ||
    proof.iat > time + 30 ||
    proof.bodySha256 !== bodyHash(body)
  )
    return null;
  for (const field of ["audience", "method", "path", "userId", "deviceId", "sessionId"] as const)
    if (proof[field] !== expected[field]) return null;
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeySpki, "base64"),
      format: "der",
      type: "spki",
    });
    if (
      key.asymmetricKeyType !== "ed25519" ||
      !verify(null, Buffer.from(payload), key, Buffer.from(signature, "base64url"))
    )
      return null;
  } catch {
    return null;
  }
  return proof;
}
