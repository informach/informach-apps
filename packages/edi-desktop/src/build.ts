import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { desktopConfigSchema } from "./contracts.ts";
/** Public settings are substituted at build time, never read from the installed user's environment. */
export function ediBuildOptions(options: { mainEntry?: string; preloadEntry?: string } = {}) {
  const commercial = process.env.EDI_COMMERCIAL_BUILD === "true";
  const config = desktopConfigSchema.parse({
    portalUrl: process.env.EDI_PORTAL_URL ?? "http://localhost:3006",
    clientId: process.env.EDI_DESKTOP_CLIENT_ID ?? "edi-desktop-development",
    environment: commercial ? "production" : "development",
    trustedKeys: JSON.parse(process.env.EDI_LICENSE_PUBLIC_KEYS ?? "{}"),
    publisher: process.env.EDI_PUBLISHER ?? "",
    downloadHost: process.env.EDI_DOWNLOAD_HOST ?? "",
    distributionRepository: process.env.EDI_DISTRIBUTION_REPOSITORY ?? "informach/edi-releases",
    updateKeys: JSON.parse(process.env.EDI_UPDATE_PUBLIC_KEYS ?? "{}"),
    updateChannel: process.env.EDI_RELEASE_TAG?.includes("-beta.") ? "beta" : "stable",
  });
  return {
    main: {
      define: { "process.env.EDI_DESKTOP_CONFIG": JSON.stringify(JSON.stringify(config)) },
      build: {
        externalizeDeps: {
          exclude: [
            "@informach/edi-desktop",
            "@informach/edi-contracts",
            "@informach/edi-releases",
            "@informach/config",
          ],
        },
        commonjsOptions: { include: [/node_modules/, /src[\\/]main/, /src[\\/]capture/] },
        rollupOptions: { input: resolve(options.mainEntry ?? "src/main/index.ts") },
      },
    },
    preload: {
      build: {
        externalizeDeps: false,
        isolatedEntries: true,
        rollupOptions: {
          input: {
            index: resolve(options.preloadEntry ?? "src/preload/index.ts"),
            "edi-gate": fileURLToPath(new URL("./gate-preload.ts", import.meta.url)),
          },
          output: { format: "cjs" as const, entryFileNames: "[name].cjs" },
        },
      },
    },
  };
}
