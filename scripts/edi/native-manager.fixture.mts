import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { app } from "electron";
import { z } from "zod";
import { electronInstallationFileSystem } from "../../packages/edi-desktop/src/electron-installation-filesystem.ts";
import { createInstallationManager } from "../../packages/edi-desktop/src/installations.ts";

const configurationPath = process.argv[2];
if (!configurationPath) throw new Error("Native manager configuration is missing");
const configuration = z
  .strictObject({
    localAppData: z.string().min(1),
    profile: z.string().min(1),
    result: z.string().min(1),
    trustedKeys: z.record(z.string().min(1), z.string().min(1)),
  })
  .parse(JSON.parse(readFileSync(configurationPath, "utf8")));
app.setPath("userData", configuration.profile);
app.setPath("sessionData", configuration.profile);

async function verify() {
  const manager = createInstallationManager({
    localAppData: configuration.localAppData,
    directory: configuration.profile,
    portalUrl: "http://127.0.0.1:1",
    clientId: "native-manager-fixture",
    environment: "development",
    trustedKeys: configuration.trustedKeys,
    updateKeys: configuration.trustedKeys,
    publisher: "Native fixture",
    downloadHost: "github.com",
    distributionRepository: "informach/edi-releases",
    updateChannel: "stable",
    fileSystem: electronInstallationFileSystem,
    acceptRelease: async () => {
      throw new Error("Opening an installed tool must not fetch a release");
    },
  });
  await manager.open("edifoto");
  const deadline = Date.now() + 20_000;
  let result: { pid: number; visible: boolean } | undefined;
  while (!result && Date.now() < deadline) {
    try {
      result = z
        .strictObject({ pid: z.number().int().positive(), visible: z.boolean() })
        .parse(JSON.parse(await readFile(configuration.result, "utf8")));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      await setTimeout(50);
    }
  }
  assert.ok(result, "The tool launched by the installation manager did not report its window");
  // Wait for the fixture's normal close before the harness removes its portable files.
  while (true) {
    try {
      process.kill(result.pid, 0);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") break;
      throw error;
    }
    assert.ok(Date.now() < deadline, "The portable fixture did not finish its normal close");
    await setTimeout(50);
  }
  assert.equal(result.visible, true, "manager.open must display the interactive tool window");
  console.log("Verified installation manager opens a signed portable Electron tool visibly");
}
void verify().then(
  () => app.exit(0),
  (error: unknown) => {
    console.error(error);
    app.exit(1);
  },
);
