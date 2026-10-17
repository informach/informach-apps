import { execFileSync, spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { EDI_DESKTOP_APPS } from "../../packages/config/src/edi-tools.ts";

if (process.platform !== "win32") throw new Error("Packaged layout tests require Windows");
const allowed = EDI_DESKTOP_APPS.map((app) => app.id);
const compileInstaller = process.argv.includes("--installer");
const selected = process.argv.slice(2).filter((argument) => argument !== "--installer");
if (selected.some((id) => !allowed.includes(id))) throw new Error("Unknown Edi application");
const update = generateKeyPairSync("ed25519");
const license = generateKeyPairSync("ed25519");
const version = `0.0.0-beta.${process.pid % 65536}`;
const environment = {
  ...process.env,
  EDI_COMMERCIAL_BUILD: "true",
  EDI_RELEASE_TAG: `edi-v${version}`,
  EDI_SOURCE_COMMIT: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim(),
  EDI_DISTRIBUTION_REPOSITORY: "informach/edi-releases",
  EDI_UPDATE_SIGNING_KEY_ID: "ephemeral-layout-test",
  EDI_UPDATE_SIGNING_PRIVATE_KEY: update.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString(),
  EDI_UPDATE_PUBLIC_KEYS: JSON.stringify({
    "ephemeral-layout-test": update.publicKey.export({ type: "spki", format: "pem" }).toString(),
  }),
  EDI_LICENSE_PUBLIC_KEYS: JSON.stringify({
    "ephemeral-license-test": license.publicKey.export({ type: "spki", format: "pem" }).toString(),
  }),
  EDI_PORTAL_URL: "https://edi-test.invalid",
  EDI_DESKTOP_CLIENT_ID: "edi-test-only",
  EDI_PACKAGE_LAYOUT_ONLY: compileInstaller ? "false" : "true",
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
};
for (const id of selected.length ? selected : allowed) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.resolve("tsx/cli")), "scripts/edi/release.mts", "build", id],
    { windowsHide: true, env: environment, stdio: "inherit" },
  );
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Packaged layout failed: ${id} (${code})`)),
    );
  });
}
console.log(
  `Verified local packaged layouts (${version}). Ephemeral test keys only; no installer published or installed.`,
);
