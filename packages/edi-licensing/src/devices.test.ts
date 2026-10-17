import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateDeviceKey } from "./devices";

describe("device identity keys", () => {
  it("accepts canonical Ed25519 SPKI and derives a deterministic thumbprint", () => {
    const pair = generateKeyPairSync("ed25519");
    const spki = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
    expect(validateDeviceKey(spki)).toEqual(validateDeviceKey(spki));
    expect(validateDeviceKey(spki).keyThumbprint).toMatch(/^[a-f0-9]{64}$/);
    expect(validateDeviceKey(spki).publicKeySpki).toBe(spki);
  });
  it("rejects malformed, noncanonical or non-Ed25519 identities", () => {
    const pair = generateKeyPairSync("ed25519");
    const spki = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
    expect(() => validateDeviceKey(`${spki}\n`)).toThrow("invalid_key");
    expect(() => validateDeviceKey("not a public key")).toThrow("invalid_key");
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect(() =>
      validateDeviceKey(rsa.publicKey.export({ type: "spki", format: "der" }).toString("base64")),
    ).toThrow("invalid_key");
  });
});
