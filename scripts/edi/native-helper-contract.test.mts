import { generateKeyPairSync } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  EDI_DESKTOP_APPS,
  EDI_TOOLS,
  nativeHelperExecutable,
} from "../../packages/config/src/edi-tools.ts";
import {
  installerConfiguration,
  nativeHelperDirectory,
  verifyNativeHelper,
} from "./installer-config.mts";

afterEach(() => vi.unstubAllEnvs());

function stubReleaseEnvironment() {
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
}

it("each installer carries only its own declared helper, outside the ASAR", () => {
  stubReleaseEnvironment();
  for (const app of EDI_DESKTOP_APPS) {
    const helper = nativeHelperExecutable(app.id);
    const config = installerConfiguration(app.id, "0.0.0-beta.1");
    const resources = Array.isArray(config.extraResources) ? config.extraResources : [];
    const native = resources.filter(
      (resource) => typeof resource === "object" && resource.to === "native",
    );
    expect(native).toEqual(
      helper ? [{ from: nativeHelperDirectory(app.id), to: "native", filter: [helper] }] : [],
    );
    const files = Array.isArray(config.files) ? config.files : [];
    expect(files.includes("!resources/native/**")).toBe(Boolean(helper));
  }
});

it("each declared helper is the tool's own and its app build compiles it first", async () => {
  const declared = EDI_TOOLS.flatMap((tool) =>
    "nativeHelper" in tool ? [{ id: tool.id, executable: tool.nativeHelper.executable }] : [],
  );
  expect(declared.map((item) => item.id)).toEqual(["ediaula", "edicaptura"]);
  for (const { id, executable } of declared) {
    expect(executable).toBe(`${id}-helper.exe`);
    const app = resolve("apps", id);
    const manifest = JSON.parse(await readFile(join(app, "package.json"), "utf8"));
    expect(manifest.scripts.build).toMatch(/^node scripts\/build-native-helper\.mjs && /);
    expect(manifest.devDependencies["@informach/edi-native"]).toBe("workspace:*");
    const script = await readFile(join(app, "scripts", "build-native-helper.mjs"), "utf8");
    expect(script).toContain(`name: "${executable.replace(/\.exe$/, "")}"`);
    expect(script).toContain('from "@informach/edi-native/build"');
    expect(existsSync(join(app, "native", "helper", "Program.cs"))).toBe(true);
  }
});

it("beforePack refuses a missing helper or one stamped with another version", async () => {
  await expect(
    verifyNativeHelper(resolve(".cache", "missing", "edicaptura-helper.exe"), "1.2.3"),
  ).rejects.toThrow(/missing/);
  // Any real executable that answers --version stands in for a stale helper.
  await expect(verifyNativeHelper(process.execPath, "1.2.3")).rejects.toThrow(
    /does not match the release 1\.2\.3/,
  );
  await expect(verifyNativeHelper(process.execPath, process.version)).resolves.toBeUndefined();
});
