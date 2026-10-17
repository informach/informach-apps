import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EDI_DESKTOP_APPS } from "../../packages/config/src/edi-tools";
import { releaseArtifactUrl } from "../../packages/edi-contracts/src/index";
import { signRelease, verifyRelease } from "../../packages/edi-contracts/src/release-signature";
import { publicationTrustKeys, releaseEnvironment } from "./release-configuration.mts";

const pem = () =>
  generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
function environment(): NodeJS.ProcessEnv {
  return {
    EDI_RELEASE_TAG: "edi-v1.2.3",
    EDI_PORTAL_URL: "https://edi.example.com",
    EDI_DESKTOP_CLIENT_ID: "edi-desktop",
    EDI_DISTRIBUTION_REPOSITORY: "informach/edi-releases",
    EDI_LICENSE_PUBLIC_KEYS: JSON.stringify({ license: pem() }),
    EDI_UPDATE_PUBLIC_KEYS: JSON.stringify({ update: pem() }),
    EDI_UPDATE_SIGNING_KEY_ID: "update",
  };
}
describe("release runner configuration", () => {
  it("accepts the previous signer during rotation and rejects removed or unknown identities", () => {
    const old = generateKeyPairSync("ed25519");
    const next = generateKeyPairSync("ed25519");
    const oldPublic = old.publicKey.export({ type: "spki", format: "pem" }).toString();
    const nextPublic = next.publicKey.export({ type: "spki", format: "pem" }).toString();
    const manifest = {
      version: "1.0.0",
      channel: "stable",
      publishedAt: "2026-10-16T12:00:00.000Z",
      sourceCommit: "a".repeat(40),
      notes: "Rotation",
      artifacts: EDI_DESKTOP_APPS.map((app) => ({
        appId: app.id,
        platform: "win32",
        arch: "x64",
        url: releaseArtifactUrl("informach/edi-releases", "1.0.0", app.id),
        sha512: Buffer.alloc(64).toString("base64"),
        size: 1024,
        publisher: "Informach",
      })),
    };
    const previous = signRelease(
      manifest,
      "old",
      old.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    );
    const updated = signRelease(
      manifest,
      "next",
      next.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    );
    const transition = publicationTrustKeys({ old: oldPublic, next: nextPublic });
    expect(verifyRelease(previous, transition)).toEqual(previous);
    expect(verifyRelease(updated, transition)).toEqual(updated);
    expect(() => verifyRelease(previous, publicationTrustKeys({ next: nextPublic }))).toThrow();
    expect(() => verifyRelease(updated, publicationTrustKeys({ old: oldPublic }))).toThrow();
    expect(() => publicationTrustKeys({ next: "invalid" })).toThrow();
  });
  it("exports validated public fields only, never private credentials", () => {
    const publicFields = environment();
    const input = {
      ...publicFields,
      EDI_UPDATE_SIGNING_PRIVATE_KEY: "private",
      GH_TOKEN: "secret",
    };
    const result = releaseEnvironment(input);
    expect(result).toEqual(publicFields);
    expect(result).not.toHaveProperty("EDI_UPDATE_SIGNING_PRIVATE_KEY");
    expect(result).not.toHaveProperty("GH_TOKEN");
  });
  it("refuses missing mandatory configuration before Windows builds", () => {
    for (const name of Object.keys(environment())) {
      const input = environment();
      delete input[name];
      expect(() => releaseEnvironment(input)).toThrow("Missing release configuration");
    }
  });
  it("rejects unsafe portal origins and noncanonical Windows versions", () => {
    for (const url of [
      "http://edi.example.com",
      "https://edi.example.com/path",
      "https://user@edi.example.com",
    ])
      expect(() => releaseEnvironment({ ...environment(), EDI_PORTAL_URL: url })).toThrow();
    for (const tag of ["edi-v1.2", "edi-v01.2.3", "edi-v1.2.65536", "edi-v1.2.3-rc.1"])
      expect(() => releaseEnvironment({ ...environment(), EDI_RELEASE_TAG: tag })).toThrow();
  });
  it("requires separate license and update identities and the current signing key", () => {
    const input = environment();
    input.EDI_UPDATE_PUBLIC_KEYS = input.EDI_LICENSE_PUBLIC_KEYS;
    expect(() => releaseEnvironment(input)).toThrow("different keys");
    expect(() =>
      releaseEnvironment({ ...environment(), EDI_UPDATE_SIGNING_KEY_ID: "missing" }),
    ).toThrow("no embedded public trust anchor");
  });
  it("rejects malformed and non-Ed25519 trust anchors", () => {
    expect(() =>
      releaseEnvironment({ ...environment(), EDI_UPDATE_PUBLIC_KEYS: "not json" }),
    ).toThrow();
    const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
      .publicKey.export({ type: "spki", format: "pem" })
      .toString();
    expect(() =>
      releaseEnvironment({
        ...environment(),
        EDI_UPDATE_PUBLIC_KEYS: JSON.stringify({ update: ec }),
      }),
    ).toThrow("Ed25519");
  });
});
