import { execFileSync, spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EDI_DESKTOP_APPS } from "../../packages/config/src/edi-tools.ts";
import { buildArtifactSchema } from "../../packages/edi-contracts/src/index.ts";

if (
  process.platform !== "win32" ||
  process.env.CI !== "true" ||
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.RUNNER_ENVIRONMENT !== "github-hosted"
)
  throw new Error("Upgrade installation is restricted to disposable GitHub-hosted Windows runners");
const app = EDI_DESKTOP_APPS.find((item) => item.id === process.argv[2]);
if (!app) throw new Error("Expected an Edi desktop app from the suite catalog");
const update = generateKeyPairSync("ed25519");
const license = generateKeyPairSync("ed25519");
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  EDI_COMMERCIAL_BUILD: "true",
  EDI_SOURCE_COMMIT: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim(),
  EDI_DISTRIBUTION_REPOSITORY: "informach/edi-releases",
  EDI_UPDATE_SIGNING_KEY_ID: "ephemeral-upgrade-test",
  EDI_UPDATE_SIGNING_PRIVATE_KEY: update.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString(),
  EDI_UPDATE_PUBLIC_KEYS: JSON.stringify({
    "ephemeral-upgrade-test": update.publicKey.export({ type: "spki", format: "pem" }).toString(),
  }),
  EDI_LICENSE_PUBLIC_KEYS: JSON.stringify({
    "ephemeral-license-test": license.publicKey.export({ type: "spki", format: "pem" }).toString(),
  }),
  EDI_PORTAL_URL: "https://edi-test.invalid",
  EDI_DESKTOP_CLIENT_ID: "edi-upgrade-test-only",
  EDI_PACKAGE_LAYOUT_ONLY: "false",
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
};
async function run(command: string, args: string[], env = environment) {
  const child = spawn(command, args, { windowsHide: true, env, stdio: "inherit" });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Upgrade verification failed (${code})`)),
    );
  });
}
const versions = ["0.0.0-beta.1", "0.0.0-beta.2"] as const;
const descriptors = [];
for (const version of versions) {
  await run(
    process.execPath,
    [fileURLToPath(import.meta.resolve("tsx/cli")), "scripts/edi/release.mts", "build", app.id],
    { ...environment, EDI_RELEASE_TAG: `edi-v${version}` },
  );
  descriptors.push(
    buildArtifactSchema.parse(
      JSON.parse(
        await readFile(
          resolve(".cache/edi-release", version, app.id, `${app.id}.artifact.json`),
          "utf8",
        ),
      ),
    ),
  );
}
const [before, after] = descriptors;
if (!before || !after) throw new Error("Both build descriptors are required");
await run("powershell.exe", [
  "-NoLogo",
  "-NoProfile",
  "-NonInteractive",
  "-File",
  resolve("scripts/edi/installer-upgrade.ps1"),
  "-InstallerA",
  resolve(".cache/edi-release", before.version, app.id, `${app.id}-${before.version}-win-x64.exe`),
  "-InstallerB",
  resolve(".cache/edi-release", after.version, app.id, `${app.id}-${after.version}-win-x64.exe`),
  "-AppId",
  app.id,
  "-ProductName",
  app.name,
  "-VersionA",
  before.version,
  "-VersionB",
  after.version,
  "-Sha512A",
  before.artifact.sha512,
  "-Sha512B",
  after.artifact.sha512,
  "-ResultFile",
  resolve(".cache/edi-upgrade-results", `${app.id}.json`),
]);
