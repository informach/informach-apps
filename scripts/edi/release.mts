import { execFile } from "node:child_process";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import { build, Platform } from "electron-builder";
import { EDI_DESKTOP_APPS } from "../../packages/config/src/edi-tools";
import {
  buildArtifactSchema,
  compareReleaseVersions,
  desktopAppIdSchema,
  githubRepositorySchema,
  releaseArtifactUrl,
  releaseManifestSchema,
  releaseVersionSchema,
} from "../../packages/edi-contracts/src/index";
import { signRelease, verifyRelease } from "../../packages/edi-contracts/src/release-signature";
import {
  fileDigest,
  verifyInstalledApplication,
  writeInstallationReceipt,
} from "../../packages/edi-desktop/src/installation-integrity";
import { windowsPowerShellEnvironment } from "../../packages/edi-desktop/src/windows-powershell.ts";
import { fetchPublicRelease } from "../../packages/edi-releases/src/public";
import { publishGithubRelease } from "./github-publication.mts";
import { installerConfiguration } from "./installer-config.mts";
import { publicationTrustKeys } from "./release-configuration.mts";

const execute = promisify(execFile);
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing release configuration: ${name}`);
  return value;
}
const version = releaseVersionSchema.parse(required("EDI_RELEASE_TAG").replace(/^edi-v/, ""));
const sourceCommit = required("EDI_SOURCE_COMMIT");
if (!/^[a-f0-9]{40}$/.test(sourceCommit))
  throw new Error("Release source must be a full Git commit SHA");
const repository = githubRepositorySchema.parse(required("EDI_DISTRIBUTION_REPOSITORY"));
const keyId = required("EDI_UPDATE_SIGNING_KEY_ID");
const privateKey = required("EDI_UPDATE_SIGNING_PRIVATE_KEY");
const publicKeys = publicationTrustKeys(JSON.parse(required("EDI_UPDATE_PUBLIC_KEYS")));
if (!Object.hasOwn(publicKeys, keyId))
  throw new Error("The signing key must have an embedded public trust anchor");
const expectedPublic = createPublicKey(createPrivateKey(privateKey))
  .export({ type: "spki", format: "pem" })
  .toString();
if (publicKeys[keyId] !== expectedPublic)
  throw new Error("Update signing key does not match the trusted public key");
const channel = version.includes("-beta.") ? "beta" : "stable";
const folder = resolve(".cache", "edi-release", version);
const artifactName = (id: string) => `${id}-${version}-win-x64.exe`;

async function buildInstaller() {
  if (process.platform !== "win32")
    throw new Error("Windows installers require a Windows build host");
  const appId = desktopAppIdSchema.parse(process.argv[3]);
  if (process.env.CSC_LINK || process.env.CSC_KEY_PASSWORD || process.env.WIN_CSC_LINK)
    throw new Error("This pilot builds without an external Authenticode identity");
  await mkdir(folder, { recursive: true });
  const packageManager = process.env.npm_execpath;
  if (!packageManager || !isAbsolute(packageManager) || basename(packageManager) !== "pnpm.cjs")
    throw new Error("Run the installer command through the pinned pnpm workspace scripts");
  await execute(process.execPath, [packageManager, "--filter", `@informach/${appId}`, "build"], {
    windowsHide: true,
    timeout: 600000,
    maxBuffer: 2 * 1024 ** 2,
  });
  const config = installerConfiguration(appId, version);
  // Two supported build phases cover final executable resources and fuses
  // before NSIS archives those exact inventoried bytes.
  await build({ targets: Platform.WINDOWS.createTarget(["dir"]), config, publish: "never" });
  const unpacked = resolve(folder, appId, "win-unpacked");
  await writeFile(
    resolve(unpacked, "resources/app-update.yml"),
    `provider: generic\nurl: https://github.com/${repository}/releases/latest/download\npublisherName: edi-manifest-v1\nupdaterCacheDirName: ${appId}-updater\n`,
  );
  await writeInstallationReceipt({
    directory: unpacked,
    appId,
    version,
    sourceCommit,
    keyId,
    privateKey,
  });
  await verifyInstalledApplication({
    directory: unpacked,
    appId,
    version,
    trustedKeys: { [keyId]: expectedPublic },
  });
  if (process.env.EDI_PACKAGE_LAYOUT_ONLY === "true") {
    console.log(`Verified packaged application layout: ${appId} ${version}`);
    return;
  }
  // electron-builder normalizes its configuration in place. Each independent
  // phase receives a fresh configuration from the same validated factory.
  await build({
    targets: Platform.WINDOWS.createTarget(["nsis"]),
    prepackaged: unpacked,
    config: installerConfiguration(appId, version),
    publish: "never",
  });
  await verifyInstalledApplication({
    directory: unpacked,
    appId,
    version,
    trustedKeys: { [keyId]: expectedPublic },
  });
  const installer = resolve(folder, appId, artifactName(appId));
  const digest = await fileDigest(installer);
  if (digest.size >= 2 * 1024 ** 3)
    throw new Error("GitHub release asset must be smaller than 2 GiB");
  const artifact = {
    appId,
    platform: "win32",
    arch: "x64",
    url: releaseArtifactUrl(repository, version, appId),
    ...digest,
    publisher: "Informach — piloto sem Authenticode",
  };
  await writeFile(
    resolve(folder, appId, `${appId}.artifact.json`),
    JSON.stringify({ version, sourceCommit, artifact }),
  );
  if (process.env.CI === "true") {
    await execute(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-File",
        resolve("scripts/edi/installer-smoke.ps1"),
        "-Installer",
        installer,
        "-AppId",
        appId,
        "-ProductName",
        EDI_DESKTOP_APPS.find((app) => app.id === appId)?.name ?? appId,
        "-Version",
        version,
        "-Sha512",
        digest.sha512,
      ],
      {
        windowsHide: true,
        timeout: 600000,
        maxBuffer: 32768,
        env: windowsPowerShellEnvironment(),
      },
    );
  }
  console.log(`Verified pilot installer: ${appId} ${version} (${digest.size} bytes)`);
}
async function publish() {
  const head = (await execute("git", ["rev-parse", "HEAD"])).stdout.trim();
  if (head !== sourceCommit || (await execute("git", ["status", "--porcelain"])).stdout.trim())
    throw new Error("Publication requires the exact reviewed commit and a clean working tree");
  const artifacts = [];
  for (const app of EDI_DESKTOP_APPS) {
    const descriptor = buildArtifactSchema.parse(
      JSON.parse(await readFile(resolve(folder, app.id, `${app.id}.artifact.json`), "utf8")),
    );
    const artifact = descriptor.artifact;
    if (
      descriptor.version !== version ||
      descriptor.sourceCommit !== sourceCommit ||
      artifact.appId !== app.id
    )
      throw new Error("Application artifact provenance mismatch");
    artifacts.push(artifact);
    const digest = await fileDigest(resolve(folder, app.id, artifactName(app.id)));
    if (artifact.sha512 !== digest.sha512 || artifact.size !== digest.size)
      throw new Error(`Build artifact changed: ${app.id}`);
  }
  const notes: unknown = JSON.parse(
    await readFile(resolve("scripts/edi/release-notes.json"), "utf8"),
  );
  const note =
    notes && typeof notes === "object" && Object.hasOwn(notes, version)
      ? Reflect.get(notes, version)
      : "Atualização da Suíte Edi — piloto.";
  const publishedAt = new Date(
    (await execute("git", ["show", "-s", "--format=%cI", sourceCommit])).stdout.trim(),
  ).toISOString();
  const manifest = releaseManifestSchema.parse({
    version,
    channel,
    sourceCommit,
    publishedAt,
    notes: note,
    artifacts,
  });
  const signed = signRelease(manifest, keyId, privateKey);
  verifyRelease(signed, { [keyId]: expectedPublic });
  const current = await fetchPublicRelease({
    repository,
    channel,
    trustedKeys: publicKeys,
  });
  if (current && compareReleaseVersions(version, current.version) < 0)
    throw new Error("An older suite cannot replace the current release");
  if (current?.version === version && current.sourceCommit !== sourceCommit)
    throw new Error("Published versions cannot be reused for different source commits");
  if (current?.version === version) {
    console.log(
      `Suite ${version} is already published with verified source provenance; no assets were changed.`,
    );
    return;
  }
  const signedPath = resolve(folder, "edi-release.json");
  await writeFile(signedPath, JSON.stringify(signed));
  const files = [
    ...EDI_DESKTOP_APPS.map((app) => resolve(folder, app.id, artifactName(app.id))),
    signedPath,
  ];
  await publishGithubRelease({ repository, version, sourceCommit, notes: manifest.notes, files });
  console.log(
    `Published complete suite ${version} on GitHub. No external signing service was used.`,
  );
}
if (process.argv[2] === "build") await buildInstaller();
else if (process.argv[2] === "publish") await publish();
else throw new Error("Expected build <appId> or publish");
