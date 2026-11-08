import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSources, isBuildInput, watchBuildSources } from "./work-freshness.mts";

describe("isBuildInput", () => {
  it("counts sources and configuration, not outputs, tests or notes", () => {
    expect(isBuildInput("src\\main\\library-ipc.ts")).toBe(true);
    expect(isBuildInput("src/renderer/index.html")).toBe(true);
    expect(isBuildInput("electron.vite.config.mjs")).toBe(true);
    expect(isBuildInput("package.json")).toBe(true);
    expect(isBuildInput("out\\main\\main.js")).toBe(false);
    expect(isBuildInput("out")).toBe(false);
    expect(isBuildInput("node_modules\\.vite\\deps\\x.js")).toBe(false);
    expect(isBuildInput("tests\\library.test.ts")).toBe(false);
    expect(isBuildInput("src\\shared\\ranges.test.ts")).toBe(false);
    expect(isBuildInput("scripts\\build-native-helper.mjs")).toBe(true);
    expect(isBuildInput("native\\obj\\Debug\\helper.dll")).toBe(false);
    expect(isBuildInput("README.md")).toBe(false);
    expect(isBuildInput("tsconfig.tsbuildinfo")).toBe(false);
    expect(isBuildInput("")).toBe(false);
  });
});

describe("buildSources", () => {
  it("follows the @informach packages the tool consumes, through other packages too", () => {
    const manifests: Record<string, object> = {
      [join("r", "apps", "edicaptura", "package.json")]: {
        dependencies: { "@informach/edi-desktop": "workspace:*", electron: "44.8.0" },
        devDependencies: { "@informach/edi-native": "workspace:*" },
      },
      [join("r", "packages", "edi-desktop", "package.json")]: {
        dependencies: { "@informach/config": "workspace:*", "@informach/edi-native": "*" },
      },
      [join("r", "packages", "edi-native", "package.json")]: {},
      [join("r", "packages", "config", "package.json")]: {
        peerDependencies: { "@informach/gone": "*" },
      },
    };
    const read = (path: string) => {
      const manifest = manifests[path];
      if (!manifest) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return JSON.stringify(manifest);
    };
    expect(buildSources("r", "edicaptura", read)).toEqual([
      join("apps", "edicaptura"),
      join("packages", "edi-desktop"),
      join("packages", "edi-native"),
      join("packages", "config"),
      join("packages", "gone"),
    ]);
    expect(() => buildSources("r", "edifoto", read)).toThrow("missing");
  });
});

describe("watchBuildSources", () => {
  let repo = "";
  const old = new Date(2026, 0, 1);
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  /** A repository with EdiFoto, which consumes @informach/config; every file dated long ago. */
  function makeRepo() {
    repo = mkdtempSync(join(tmpdir(), "edi-work-freshness-"));
    execFileSync("git", ["init", "-q"], { cwd: repo });
    const files: Record<string, string> = {
      ".gitignore": "out/\n",
      "apps/edifoto/.gitignore": "resources/native/\n",
      "apps/edifoto/package.json": JSON.stringify({
        dependencies: { "@informach/config": "workspace:*" },
      }),
      "apps/edifoto/src/index.ts": "export {};",
      "apps/edifoto/scripts/build-native-helper.mjs": "",
      "packages/config/package.json": "{}",
    };
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(repo, file)), { recursive: true });
      writeFileSync(join(repo, file), text);
      utimesSync(join(repo, file), old, old);
    }
    for (const folder of [
      "apps/edifoto/out",
      "apps/edifoto/resources/native",
      "packages/config/src",
    ])
      mkdirSync(join(repo, folder), { recursive: true });
  }

  it("reports the first changed source once, ignoring what the build writes", async () => {
    makeRepo();
    const changes: string[] = [];
    const stop = watchBuildSources(repo, "edifoto", (path) => changes.push(path));
    try {
      writeFileSync(join(repo, "apps/edifoto/out/main.js"), "built");
      writeFileSync(join(repo, "apps/edifoto/resources/native/helper.exe"), "built");
      mkdirSync(join(repo, "apps/edifoto/src/screens"));
      // Read by the build: Windows reports the access time, the content is the same.
      utimesSync(join(repo, "apps/edifoto/package.json"), new Date(), old);
      await new Promise((done) => setTimeout(done, 500));
      expect(changes).toEqual([]);
      writeFileSync(join(repo, "packages/config/src/catalog.ts"), "export {};");
      await expect.poll(() => changes, { timeout: 5000 }).toHaveLength(1);
      writeFileSync(join(repo, "apps/edifoto/src/index.ts"), "export const a = 1;");
      await new Promise((done) => setTimeout(done, 300));
      expect(changes).toEqual([join("packages", "config", "src", "catalog.ts")]);
    } finally {
      stop();
    }
  });

  it("catches a source edited while the build ran, and not what the build wrote", () => {
    makeRepo();
    const buildStarted = Date.now() - 1000;
    writeFileSync(join(repo, "apps/edifoto/out/main.js"), "built");
    writeFileSync(join(repo, "apps/edifoto/resources/native/helper.exe"), "built");
    const quiet: string[] = [];
    watchBuildSources(repo, "edifoto", (path) => quiet.push(path), buildStarted)();
    expect(quiet).toEqual([]);
    // The native helper's build script feeds the build too.
    writeFileSync(join(repo, "apps/edifoto/scripts/build-native-helper.mjs"), "// new");
    const changes: string[] = [];
    watchBuildSources(repo, "edifoto", (path) => changes.push(path), buildStarted)();
    expect(changes).toEqual([join("apps", "edifoto", "scripts", "build-native-helper.mjs")]);
  });
});
