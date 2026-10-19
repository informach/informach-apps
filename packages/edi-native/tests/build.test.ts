import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { buildNativeHelper, helperVersion } from "../src/build.ts";
import { NATIVE_MODULES, nativeSourceDirectory, nativeSources } from "../src/sources.ts";

const run = promisify(execFile);
const fixture = fileURLToPath(new URL("./fixtures/helper", import.meta.url));

describe("helper version stamp", () => {
  it("uses the app version, or the suite release being packaged", () => {
    expect(helperVersion("0.2.2")).toEqual({ version: "0.2.2", numeric: "0.2.2.0" });
    expect(helperVersion("0.2.2", "edi-v0.3.0-beta.4")).toEqual({
      version: "0.3.0-beta.4",
      numeric: "0.3.0.0",
    });
    expect(helperVersion("0.2.2", "")).toEqual({ version: "0.2.2", numeric: "0.2.2.0" });
  });
  it("refuses what a Windows file version cannot hold", () => {
    for (const version of ["1.2", "1.2.3.4", "65535.0.0", "v1.2.3", "1.2.3+build"])
      expect(() => helperVersion(version)).toThrow("unsupported version");
  });
});

describe("shared sources", () => {
  it("always carry the core and add only the chosen modules, without repeats", () => {
    const core = nativeSources([]);
    expect(core.files).toEqual([
      join(nativeSourceDirectory, "HelperInfo.cs"),
      join(nativeSourceDirectory, "Json.cs"),
    ]);
    expect(core.references).toEqual(["System.dll", "System.Core.dll", "System.Web.Extensions.dll"]);
    const all = nativeSources(["window-capture", "file-drop", "window-capture"]);
    expect(all.files.map((file) => file.slice(nativeSourceDirectory.length + 1))).toEqual([
      "HelperInfo.cs",
      "Json.cs",
      "WindowCapture.cs",
      "FileDrop.cs",
    ]);
    expect(all.references.filter((name) => name === "System.Drawing.dll")).toHaveLength(1);
    expect(Object.keys(NATIVE_MODULES)).toEqual(["window-capture", "file-drop"]);
  });
  it("refuses an unknown module", () => {
    expect(() => nativeSources(JSON.parse('["shell"]'))).toThrow("unknown module shell");
  });
});

describe("buildNativeHelper", () => {
  const base = {
    name: "fixture-helper",
    product: "EdiFixture",
    modules: ["window-capture", "file-drop"] as const,
    appSources: fixture,
    inUse: "está em uso.",
  };
  const folders: string[] = [];
  afterAll(async () => {
    for (const folder of folders) await rm(folder, { recursive: true, force: true });
  });
  async function app(version: string) {
    const folder = await mkdtemp(join(tmpdir(), "edi-native-build-"));
    folders.push(folder);
    await writeFile(
      join(folder, "package.json"),
      JSON.stringify({ name: "fixture", version, author: 'Edi "teste"' }),
    );
    return folder;
  }

  it("only warns outside Windows and validates its own options", async () => {
    const appDir = await app("1.0.0");
    await expect(buildNativeHelper({ ...base, appDir, platform: "linux" })).resolves.toEqual({
      status: "skipped",
    });
    await expect(buildNativeHelper({ ...base, appDir, name: "../evil" })).rejects.toThrow(
      "invalid helper name",
    );
    await expect(buildNativeHelper({ ...base, appDir, product: 'Edi")]' })).rejects.toThrow(
      "invalid product",
    );
  });

  it.runIf(process.platform === "win32")(
    "compiles the shared modules with the app sources, stamps the version and skips unchanged builds",
    { timeout: 120_000 },
    async () => {
      const appDir = await app("3.4.5");
      const env = { ...process.env, EDI_RELEASE_TAG: undefined };
      const first = await buildNativeHelper({ ...base, appDir, env });
      const executable = join(appDir, "resources", "native", "fixture-helper.exe");
      expect(first).toEqual({ status: "compiled", version: "3.4.5", executable, sources: 5 });
      expect((await run(executable, ["--version"], { windowsHide: true })).stdout).toBe("3.4.5\n");
      expect(
        JSON.parse(
          await readFile(join(appDir, "resources", "native", "fixture-helper.json"), "utf8"),
        ),
      ).toMatchObject({ version: "3.4.5" });
      const built = (await stat(executable)).mtimeMs;
      expect(await buildNativeHelper({ ...base, appDir, env })).toMatchObject({
        status: "up-to-date",
      });
      expect((await stat(executable)).mtimeMs).toBe(built);
      // A release build restamps the same sources with the suite version.
      const release = await buildNativeHelper({
        ...base,
        appDir,
        env: { ...env, EDI_RELEASE_TAG: "edi-v3.5.0-beta.2" },
      });
      expect(release).toMatchObject({ status: "compiled", version: "3.5.0-beta.2" });
      expect((await run(executable, ["--version"], { windowsHide: true })).stdout).toBe(
        "3.5.0-beta.2\n",
      );
      const answer = await new Promise<string>((resolve, reject) => {
        const child = execFile(executable, ["capture"], { windowsHide: true }, (error, stdout) =>
          error ? reject(error) : resolve(stdout),
        );
        child.stdin?.end('{"op":"windows","handles":[]}\n');
      });
      expect(answer).toBe('{"ok":true,"result":[]}\n');
    },
  );

  it.runIf(process.platform === "win32")(
    "reports compiler diagnostics instead of leaving a stale helper",
    { timeout: 120_000 },
    async () => {
      const appDir = await app("1.0.0");
      const sources = await mkdtemp(join(tmpdir(), "edi-native-broken-"));
      folders.push(sources);
      await writeFile(join(sources, "Program.cs"), "internal static class Program { int x }\n");
      await expect(
        buildNativeHelper({ ...base, appDir, appSources: sources, modules: [] }),
      ).rejects.toThrow("fixture-helper: compilation failed");
    },
  );
});
