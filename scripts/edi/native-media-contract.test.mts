import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  EDI_DESKTOP_APPS,
  EDI_TOOLS,
  hasNativeMedia,
} from "../../packages/config/src/edi-tools.ts";
import { installerConfiguration } from "./installer-config.mts";
import { nativeMediaDirectory } from "./media-bundle.mts";

afterEach(() => vi.unstubAllEnvs());
it("each catalog media consumer has a runnable test and includes its own complete media bundle", async () => {
  const pair = generateKeyPairSync("ed25519");
  const key = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  for (const [name, value] of Object.entries({
    EDI_PORTAL_URL: "https://edi-test.invalid",
    EDI_DESKTOP_CLIENT_ID: "edi-test-only",
    EDI_UPDATE_PUBLIC_KEYS: JSON.stringify({ fixture: key }),
    EDI_LICENSE_PUBLIC_KEYS: JSON.stringify({ fixture: key }),
    EDI_COMMERCIAL_BUILD: "true",
    EDI_UPDATE_SIGNING_KEY_ID: "fixture",
    EDI_UPDATE_SIGNING_PRIVATE_KEY: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  }))
    vi.stubEnv(name, value);
  for (const app of EDI_DESKTOP_APPS) {
    const config = installerConfiguration(app.id, "0.0.0-beta.1");
    const resources = Array.isArray(config.extraResources) ? config.extraResources : [];
    const media = resources.filter(
      (resource) => typeof resource === "object" && resource.to === "native-media",
    );
    expect(media).toEqual(
      hasNativeMedia(app.id)
        ? [{ from: nativeMediaDirectory, to: "native-media", filter: ["**/*"] }]
        : [],
    );
  }
  for (const tool of EDI_TOOLS) {
    if (!("nativeMedia" in tool)) continue;
    const manifest = JSON.parse(await readFile(resolve("apps", tool.id, "package.json"), "utf8"));
    expect(manifest.scripts[tool.nativeMedia.testScript]).toBeTypeOf("string");
  }
});
