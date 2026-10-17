import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import {
  installationManifestSchema,
  releaseManifestSchema,
  type SignedInstallation,
  type SignedRelease,
  signedInstallationSchema,
  signedReleaseSchema,
} from "./index";

/** Stable JSON key ordering. The validated contracts contain only safe integer numbers. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const result = JSON.stringify(value);
    if (result === undefined) throw new Error("Unserializable signed payload");
    return result;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`)
    .join(",")}}`;
}
function bytes(format: string, manifest: unknown): Buffer {
  return Buffer.from(`${format}\n${canonical(manifest)}`, "utf8");
}
function signature(format: string, manifest: unknown, keyId: string, privateKey: string) {
  const key = createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Update signing requires Ed25519");
  return { keyId, value: sign(null, bytes(format, manifest), key).toString("base64") };
}
function assertSignature(
  envelope: SignedRelease | SignedInstallation,
  trustedKeys: Readonly<Record<string, string>>,
) {
  const payload = bytes(envelope.format, envelope.manifest);
  for (const item of envelope.signatures) {
    const pem = Object.hasOwn(trustedKeys, item.keyId) ? trustedKeys[item.keyId] : undefined;
    if (!pem) continue;
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("Invalid update trust anchor");
    if (verify(null, payload, key, Buffer.from(item.value, "base64"))) return;
  }
  throw new Error("Unsigned, altered or untrusted Edi update metadata");
}
export function signRelease(raw: unknown, keyId: string, privateKey: string): SignedRelease {
  const manifest = releaseManifestSchema.parse(raw);
  return signedReleaseSchema.parse({
    format: "edi-release-v1",
    manifest,
    signatures: [signature("edi-release-v1", manifest, keyId, privateKey)],
  });
}
export function verifyRelease(
  raw: unknown,
  trustedKeys: Readonly<Record<string, string>>,
): SignedRelease {
  const envelope = signedReleaseSchema.parse(raw);
  assertSignature(envelope, trustedKeys);
  return envelope;
}
export function signInstallation(
  raw: unknown,
  keyId: string,
  privateKey: string,
): SignedInstallation {
  const manifest = installationManifestSchema.parse(raw);
  return signedInstallationSchema.parse({
    format: "edi-installation-v1",
    manifest,
    signatures: [signature("edi-installation-v1", manifest, keyId, privateKey)],
  });
}
export function verifyInstallationSignature(
  raw: unknown,
  trustedKeys: Readonly<Record<string, string>>,
): SignedInstallation {
  const envelope = signedInstallationSchema.parse(raw);
  assertSignature(envelope, trustedKeys);
  return envelope;
}
