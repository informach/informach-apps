import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EDI_DESKTOP_APPS } from "@informach/config/edi-tools";
import { releaseArtifactUrl } from "@informach/edi-contracts";
import { signRelease, verifyRelease } from "@informach/edi-contracts/release-signature";
import { describe, expect, it, onTestFinished } from "vitest";
import { createUpdateApproval } from "./update-approval";

const pair = generateKeyPairSync("ed25519");
const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const keys = { test: pair.publicKey.export({ type: "spki", format: "pem" }).toString() };
function trustedManifest(version: string, bytes: Buffer) {
  return verifyRelease(
    signRelease(
      {
        version,
        channel: "stable",
        sourceCommit: "a".repeat(40),
        notes: "Fixture",
        publishedAt: "2026-10-16T12:00:00.000Z",
        artifacts: EDI_DESKTOP_APPS.map((app) => ({
          appId: app.id,
          platform: "win32",
          arch: "x64",
          publisher: "Pilot fixture",
          url: releaseArtifactUrl("informach/edi-releases", version, app.id),
          size: bytes.length,
          sha512: createHash("sha512").update(bytes).digest("base64"),
        })),
      },
      "test",
      privateKey,
    ),
    keys,
  ).manifest;
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "edi-update-approval-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const bytes = Buffer.from("Approved installer fixture");
  const file = join(directory, "installer.exe");
  await writeFile(file, bytes);
  return { bytes, file, approval: createUpdateApproval("edi-hub") };
}
describe("current signed installer approval", () => {
  it("accepts exact approved bytes and rejects use before catalog verification", async () => {
    const { approval, file, bytes } = await fixture();
    expect(await approval.verify(file)).not.toBeNull();
    const info = approval.approve(trustedManifest("1.0.0", bytes));
    expect(approval.resolveFiles(info)[0]?.url.href).toBe(info.files[0]?.url);
    expect(await approval.verify(file)).toBeNull();
  });
  it("rejects changed URL, hash, size, version or additional files", async () => {
    const { approval, bytes } = await fixture();
    const info = approval.approve(trustedManifest("1.0.0", bytes));
    const original = info.files[0];
    if (!original) throw new Error("Missing fixture artifact");
    for (const changed of [
      { ...info, version: "0.9.0" },
      { ...info, files: [{ ...original, url: "https://example.com/installer.exe" }] },
      { ...info, files: [{ ...original, sha512: Buffer.alloc(64).toString("base64") }] },
      { ...info, files: [{ ...original, size: bytes.length + 1 }] },
      { ...info, files: [original, original] },
    ])
      expect(() => approval.resolveFiles(changed)).toThrow("not approved");
  });
  it("rejects an installer altered after download, including immediately before quitting", async () => {
    const { approval, file, bytes } = await fixture();
    approval.approve(trustedManifest("1.0.0", bytes));
    expect(await approval.verify(file)).toBeNull();
    await writeFile(file, Buffer.alloc(bytes.length, 0));
    expect(await approval.verify(file)).not.toBeNull();
    expect(await approval.verify(`${file}.missing`)).not.toBeNull();
  });
  it("does not accept a previously approved installer after a newer catalog is accepted", async () => {
    const { approval, file, bytes } = await fixture();
    const previous = approval.approve(trustedManifest("1.0.0", bytes));
    approval.approve(trustedManifest("1.0.1", Buffer.from("Different newer installer")));
    expect(await approval.verify(file)).not.toBeNull();
    expect(() => approval.resolveFiles(previous)).toThrow("not approved");
  });
  it("fails closed if the approved release changes while an installer is being hashed", async () => {
    const { approval, file, bytes } = await fixture();
    approval.approve(trustedManifest("1.0.0", bytes));
    const verification = approval.verify(file);
    approval.approve(trustedManifest("1.0.1", bytes));
    expect(await verification).not.toBeNull();
  });
});
