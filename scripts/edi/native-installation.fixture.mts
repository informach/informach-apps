import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { z } from "zod";
import { electronInstallationFileSystem as fileSystem } from "../../packages/edi-desktop/src/electron-installation-filesystem.ts";
import {
  fileDigest,
  verifyInstalledApplication,
} from "../../packages/edi-desktop/src/installation-integrity.ts";

const configurationPath = process.argv[2];
if (!configurationPath) throw new Error("Native inventory fixture configuration is missing");
const configuration = z
  .strictObject({
    directory: z.string().min(1),
    profile: z.string().min(1),
    trustedKeys: z.record(z.string().min(1), z.string().min(1)),
    digest: z.strictObject({ size: z.number().int().positive(), sha512: z.string().min(1) }),
  })
  .parse(JSON.parse(readFileSync(configurationPath, "utf8")));
app.setPath("userData", configuration.profile);
app.setPath("sessionData", configuration.profile);

async function verify() {
  const options = {
    directory: configuration.directory,
    appId: "edifoto" as const,
    version: "1.0.0",
    trustedKeys: configuration.trustedKeys,
    fileSystem,
  };
  const archive = join(configuration.directory, "resources/app.asar");
  // Reproduce the real Electron/Node difference instead of mocking fs behavior.
  assert.equal(statSync(archive).isDirectory(), true);
  assert.equal(readFileSync(join(archive, "app.txt"), "utf8"), "fixture");
  assert.deepEqual(await fileDigest(archive, fileSystem), configuration.digest);
  assert.equal((await verifyInstalledApplication(options)).version, "1.0.0");

  for (const path of [archive, join(configuration.directory, "EdiFoto.exe")]) {
    const bytes = await fileSystem.readFile(path);
    await fileSystem.writeFile(path, Buffer.concat([bytes, Buffer.from("modified")]));
    await assert.rejects(verifyInstalledApplication(options), /integrity/);
    await fileSystem.writeFile(path, bytes);
  }
  const receiptPath = join(configuration.directory, "resources/edi-installation.json");
  const receipt = JSON.parse(await fileSystem.readFile(receiptPath, "utf8"));
  receipt.manifest.version = "1.0.1";
  await fileSystem.writeFile(receiptPath, JSON.stringify(receipt));
  await assert.rejects(verifyInstalledApplication(options), /untrusted/);
  console.log(
    "Verified physical ASAR inventory in Electron and rejected altered ASAR, EXE and receipt",
  );
}
void verify().then(
  () => app.exit(0),
  (error: unknown) => {
    console.error(error);
    app.exit(1);
  },
);
