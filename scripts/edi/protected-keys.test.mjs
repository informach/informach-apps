import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertBackendKeyContinuity,
  assertKeyRingContinuity,
  validateKeys,
} from "./protected-keys.mjs";

function pair(id) {
  return {
    id,
    ...generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    }),
  };
}
const keys = { license: pair("license-1"), update: pair("update-1") };
const current = {
  EDI_LICENSE_KEY_ID: keys.license.id,
  EDI_LICENSE_PRIVATE_KEY: keys.license.privateKey,
  EDI_UPDATE_PUBLIC_KEYS: JSON.stringify({ [keys.update.id]: keys.update.publicKey }),
};

describe("signing key continuity", () => {
  it("refuses missing trust metadata for an already published distribution", () => {
    for (const raw of [undefined, "", "{}"])
      expect(() => assertKeyRingContinuity(raw, keys.update, { allowEmpty: false })).toThrow(
        "Signing keyring drift",
      );
  });
  it("rejects removing a rotated public distribution key with an old backup", () => {
    const rotated = pair("update-2");
    expect(() =>
      assertKeyRingContinuity(
        JSON.stringify({
          [keys.update.id]: keys.update.publicKey,
          [rotated.id]: rotated.publicKey,
        }),
        keys.update,
      ),
    ).toThrow("Signing keyring drift");
  });
  it("accepts a new backend and unchanged keys with equivalent PEM formatting", () => {
    expect(() => assertBackendKeyContinuity(keys, {})).not.toThrow();
    expect(() =>
      assertBackendKeyContinuity(keys, {
        ...current,
        EDI_LICENSE_PRIVATE_KEY: keys.license.privateKey.trim().replaceAll("\n", "\\n"),
      }),
    ).not.toThrow();
  });
  it("rejects a different license pair even when its key ID is reused", () => {
    expect(() =>
      assertBackendKeyContinuity(keys, {
        ...current,
        EDI_LICENSE_PRIVATE_KEY: pair(keys.license.id).privateKey,
      }),
    ).toThrow("Backend key drift");
  });
  it("refuses to remove an additional trust anchor during bootstrap", () => {
    expect(() =>
      assertBackendKeyContinuity(keys, {
        ...current,
        EDI_UPDATE_PUBLIC_KEYS: JSON.stringify({
          [keys.update.id]: keys.update.publicKey,
          "update-2": pair("update-2").publicKey,
        }),
      }),
    ).toThrow("Backend key drift");
  });
  it("rejects a replacement update key under the existing ID", () => {
    expect(() =>
      assertBackendKeyContinuity(keys, {
        ...current,
        EDI_UPDATE_PUBLIC_KEYS: JSON.stringify({ [keys.update.id]: pair("replacement").publicKey }),
      }),
    ).toThrow("Backend key drift");
  });
  it("rejects using the same signing key with different PEM whitespace", () => {
    expect(() =>
      validateKeys({
        license: keys.license,
        update: { ...keys.license, id: "separate-id", publicKey: keys.license.publicKey.trim() },
      }),
    ).toThrow("License and update keys must be separate");
  });
});
