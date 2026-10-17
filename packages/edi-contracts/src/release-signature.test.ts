import { generateKeyPairSync } from "node:crypto";
import { EDI_DESKTOP_APPS } from "@informach/config/edi-tools";
import { describe, expect, it } from "vitest";
import { installationPathSchema, releaseArtifactUrl, releaseVersionSchema } from "./index";
import {
  signInstallation,
  signRelease,
  verifyInstallationSignature,
  verifyRelease,
} from "./release-signature";

const pair = generateKeyPairSync("ed25519");
const privateKey = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const trusted = { pilot: pair.publicKey.export({ format: "pem", type: "spki" }).toString() };
const manifest = {
  version: "1.0.0",
  channel: "stable",
  publishedAt: "2026-10-16T12:00:00.000Z",
  sourceCommit: "a".repeat(40),
  notes: "Piloto",
  artifacts: EDI_DESKTOP_APPS.map((app) => ({
    appId: app.id,
    platform: "win32",
    arch: "x64",
    url: releaseArtifactUrl("informach/edi-releases", "1.0.0", app.id),
    sha512: Buffer.alloc(64).toString("base64"),
    size: 1024,
    publisher: "Informach — piloto",
  })),
};
describe("independent update trust", () => {
  it("accepts our signed release and reordered JSON object keys", () => {
    const signed = signRelease(manifest, "pilot", privateKey);
    expect(verifyRelease(JSON.parse(JSON.stringify(signed)), trusted).manifest.version).toBe(
      "1.0.0",
    );
    const { notes, ...remainingFields } = manifest;
    expect(verifyRelease({ ...signed, manifest: { notes, ...remainingFields } }, trusted)).toEqual(
      signed,
    );
  });
  it("rejects missing signatures, unknown keys, changed version, URL and hashes", () => {
    const signed = signRelease(manifest, "pilot", privateKey);
    expect(() => verifyRelease(manifest, trusted)).toThrow();
    expect(() => verifyRelease(signed, {})).toThrow();
    for (const changed of [
      { ...manifest, version: "1.0.1" },
      {
        ...manifest,
        artifacts: manifest.artifacts.map((item, i) =>
          i ? item : { ...item, url: "https://evil.example/app.exe" },
        ),
      },
      {
        ...manifest,
        artifacts: manifest.artifacts.map((item, i) =>
          i ? item : { ...item, sha512: Buffer.alloc(64, 1).toString("base64") },
        ),
      },
    ])
      expect(() => verifyRelease({ ...signed, manifest: changed }, trusted)).toThrow();
  });
  it("separates installation and release signatures and validates the file inventory", () => {
    const signed = signInstallation(
      {
        appId: "edifoto",
        version: "1.0.0",
        sourceCommit: "a".repeat(40),
        files: [
          { path: "EdiFoto.exe", sha512: Buffer.alloc(64).toString("base64"), size: 42 },
          { path: "resources/app.asar", sha512: Buffer.alloc(64).toString("base64"), size: 100 },
        ],
      },
      "pilot",
      privateKey,
    );
    expect(verifyInstallationSignature(signed, trusted).manifest.appId).toBe("edifoto");
    expect(() => verifyRelease(signed, trusted)).toThrow();
    expect(() =>
      verifyInstallationSignature(
        { ...signed, manifest: { ...signed.manifest, appId: "edipdf" } },
        trusted,
      ),
    ).toThrow();
  });
  it("rejects Windows traversal, ADS, reserved names and unrepresentable versions", () => {
    for (const path of [
      "../app.exe",
      "/app.exe",
      "C:/app.exe",
      "a\\b",
      "a:secret",
      "a/CON.txt",
      "a/.",
      "a/hello. ",
    ])
      expect(installationPathSchema.safeParse(path).success).toBe(false);
    expect(installationPathSchema.safeParse("resources/app.asar").success).toBe(true);
    expect(releaseVersionSchema.safeParse("65536.0.0").success).toBe(false);
  });
});
