import { generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyInstalledApplication, writeInstallationReceipt } from "./installation-integrity";

const pair = generateKeyPairSync("ed25519");
const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const trustedKeys = { pilot: pair.publicKey.export({ type: "spki", format: "pem" }).toString() };
describe("signed offline installation inventory", () => {
  it("verifies actual file bytes and rejects changed ASAR, executable or receipt", async () => {
    const directory = await mkdtemp(join(tmpdir(), "edi-installation-test-"));
    try {
      await mkdir(join(directory, "resources"));
      await writeFile(join(directory, "resources/app.asar"), "original application");
      await writeFile(join(directory, "EdiFoto.exe"), "original executable");
      await writeInstallationReceipt({
        directory,
        appId: "edifoto",
        version: "1.0.0",
        sourceCommit: "a".repeat(40),
        keyId: "pilot",
        privateKey,
      });
      const options = { directory, appId: "edifoto" as const, trustedKeys };
      expect((await verifyInstalledApplication(options)).version).toBe("1.0.0");
      await expect(verifyInstalledApplication({ ...options, appId: "edipdf" })).rejects.toThrow(
        "identity",
      );
      await expect(verifyInstalledApplication({ ...options, version: "1.0.1" })).rejects.toThrow(
        "identity",
      );
      await writeFile(join(directory, "resources/app.asar"), "modified application");
      await expect(verifyInstalledApplication(options)).rejects.toThrow("integrity");
      await writeFile(join(directory, "resources/app.asar"), "original application");
      await writeFile(join(directory, "EdiFoto.exe"), "modified executable");
      await expect(verifyInstalledApplication(options)).rejects.toThrow("integrity");
      const receipt = JSON.parse(
        await readFile(join(directory, "resources/edi-installation.json"), "utf8"),
      );
      receipt.manifest.version = "1.0.1";
      await writeFile(join(directory, "resources/edi-installation.json"), JSON.stringify(receipt));
      await expect(verifyInstalledApplication(options)).rejects.toThrow("untrusted");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
