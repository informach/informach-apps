import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { Configuration } from "electron-builder";
import { EDI_DESKTOP_APPS, hasNativeMedia } from "../../packages/config/src/edi-tools";
import { desktopAppIdSchema, releaseVersionSchema } from "../../packages/edi-contracts/src/index";
import { desktopConfigSchema } from "../../packages/edi-desktop/src/contracts";
import { nativeMediaDirectory, verifyNativeMediaBundle } from "./media-bundle.mts";
import { writeThirdPartyNotices } from "./third-party-notices.mts";

const ediAulaHelper = resolve("apps/ediaula/resources/native/ediaula-helper.exe");

/** The app build compiles the helper; a stale or missing one must not reach an installer. */
async function verifyEdiAulaHelper(version: string) {
  if (!existsSync(ediAulaHelper))
    throw new Error("EdiAula helper is missing; the app build compiles it on Windows");
  const { stdout } = await promisify(execFile)(ediAulaHelper, ["--version"], {
    windowsHide: true,
    timeout: 30000,
  });
  if (stdout.trim() !== version)
    throw new Error(
      `EdiAula helper version ${stdout.trim()} does not match the release ${version}`,
    );
}
export function installerConfiguration(rawId: unknown, rawVersion: unknown): Configuration {
  const appId = desktopAppIdSchema.parse(rawId);
  const version = releaseVersionSchema.parse(rawVersion);
  const app = EDI_DESKTOP_APPS.find((item) => item.id === appId);
  if (!app) throw new Error("Unknown Edi application");
  const config = desktopConfigSchema.parse({
    portalUrl: process.env.EDI_PORTAL_URL,
    clientId: process.env.EDI_DESKTOP_CLIENT_ID,
    publisher: process.env.EDI_PUBLISHER ?? "Informach — sem Authenticode",
    downloadHost: process.env.EDI_DOWNLOAD_HOST ?? "github.com",
    distributionRepository: process.env.EDI_DISTRIBUTION_REPOSITORY ?? "informach/edi-releases",
    updateKeys: JSON.parse(process.env.EDI_UPDATE_PUBLIC_KEYS ?? "{}"),
    updateChannel: version.includes("-beta.") ? "beta" : "stable",
    environment: "production",
    trustedKeys: JSON.parse(process.env.EDI_LICENSE_PUBLIC_KEYS ?? "{}"),
  });
  if (
    process.env.EDI_COMMERCIAL_BUILD !== "true" ||
    !process.env.EDI_UPDATE_SIGNING_KEY_ID ||
    !process.env.EDI_UPDATE_SIGNING_PRIVATE_KEY
  )
    throw new Error("Packaged releases require our own update signing identity");
  return {
    appId: app.windowsAppId,
    productName: app.name,
    executableName: app.name,
    directories: {
      app: resolve("apps", app.id),
      output: resolve(".cache", "edi-release", version, app.id),
    },
    extraMetadata: { version, ediSourceCommit: process.env.EDI_SOURCE_COMMIT },
    files: [
      "out/**/*",
      "resources/**/*",
      "package.json",
      "!**/*.map",
      "!**/tests/**",
      ...(appId === "ediaula"
        ? ["!resources/fonts/**", "!resources/native/**", "!resources/rnnoise/**"]
        : []),
    ],
    asar: true,
    extraResources: [
      ...(hasNativeMedia(appId)
        ? [{ from: nativeMediaDirectory, to: "native-media", filter: ["**/*"] }]
        : []),
      ...(appId === "ediaula"
        ? [
            { from: resolve("apps/ediaula/resources/fonts"), to: "fonts" },
            // FFmpeg reads the model from disk, outside the ASAR.
            { from: resolve("apps/ediaula/resources/rnnoise"), to: "rnnoise" },
            // Subprocesses cannot run from inside the ASAR archive.
            {
              from: resolve("apps/ediaula/resources/native"),
              to: "native",
              filter: ["ediaula-helper.exe"],
            },
          ]
        : []),
    ],
    beforePack: async () => {
      if (hasNativeMedia(appId)) await verifyNativeMediaBundle();
      if (appId === "ediaula") await verifyEdiAulaHelper(version);
    },
    afterPack: async (context) => {
      await writeThirdPartyNotices(appId, resolve(context.appOutDir, "resources"));
    },
    forceCodeSigning: false,
    artifactName: `${app.id}-${version}-win-x64.exe`,
    electronVersion: "44.8.0",
    electronFuses: {
      runAsNode: false,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableCookieEncryption: true,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
    },
    publish: {
      provider: "generic",
      url: `https://github.com/${config.distributionRepository}/releases/latest/download`,
      channel: version.includes("-beta.") ? "beta" : "latest",
    },
    win: {
      icon: resolve("apps", app.id, "resources/icon.ico"),
      target: [{ target: "nsis", arch: ["x64"] }],
      verifyUpdateCodeSignature: true,
      signtoolOptions: {
        // Marker for our mandatory verifier, not an Authenticode publisher claim.
        publisherName: "edi-manifest-v1",
        signingHashAlgorithms: ["sha256"],
      },
    },
    nsis: {
      installerIcon: resolve("apps", app.id, "resources/icon.ico"),
      uninstallerIcon: resolve("apps", app.id, "resources/icon.ico"),
      oneClick: true,
      perMachine: false,
      allowElevation: false,
      packElevateHelper: false,
      allowToChangeInstallationDirectory: false,
      runAfterFinish: false,
      deleteAppDataOnUninstall: false,
      include: resolve("scripts/edi/installer.nsh"),
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: app.name,
    },
  };
}
