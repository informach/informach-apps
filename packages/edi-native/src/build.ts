// Compiles a suite helper (resources/native/<name>.exe of the app) from the shared C# sources of
// this package plus the app's own, with the C# compiler of the .NET Framework 4.x that ships with
// Windows (C# 5). Skips the compiler when sources, version and options are unchanged. Outside
// Windows it only warns: the helpers exist for Windows alone.
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type NativeModule, nativeSourceDirectory, nativeSources } from "./sources.ts";

export interface NativeHelperOptions {
  /** Executable name without extension, also the log prefix: `ediaula-helper`. */
  name: string;
  /** App folder: its package.json gives version and company; the helper goes to resources/native. */
  appDir: string;
  /** Product name for the assembly and the manifest identity (`Informach.<product>.Helper`). */
  product: string;
  /** Shared modules the app's Program dispatches. The core (version and JSON) is always included. */
  modules: readonly NativeModule[];
  /** Folder with the app's own C# sources (every `*.cs`), including its `Program` with `Main`. */
  appSources: string;
  /** Extra .NET Framework assemblies, relative to the framework folder (`WPF/WindowsBase.dll`). */
  references?: readonly string[];
  /** Shown when Windows keeps the previous executable locked by a running app. */
  inUse: string;
  /** Defaults to the process environment: `EDI_RELEASE_TAG`, `WINDIR` and `CSC`. */
  env?: Readonly<Record<string, string | undefined>>;
  platform?: string;
}

export type NativeHelperResult =
  | { status: "skipped" }
  | { status: "compiled" | "up-to-date"; version: string; executable: string; sources: number };

const namePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-helper$/;
const productPattern = /^[A-Z][A-Za-z0-9]*$/;
const options = [
  "/nologo",
  "/noconfig",
  "/target:exe",
  "/platform:x64",
  "/optimize+",
  "/unsafe",
  "/warnaserror+",
  "/codepage:65001",
  "/utf8output",
];

/**
 * Release builds stamp the suite version, the same one the packaged app reports; otherwise the
 * app's own version. Windows file versions take four numbers up to 65534.
 */
export function helperVersion(
  manifestVersion: string,
  releaseTag?: string,
): { version: string; numeric: string } {
  const version = releaseTag ? releaseTag.replace(/^edi-v/, "") : manifestVersion;
  const parts = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version);
  if (!parts || parts.slice(1, 4).some((part) => Number(part) > 65534))
    throw new Error(`unsupported version ${version}`);
  return { version, numeric: `${parts[1]}.${parts[2]}.${parts[3]}.0` };
}

const quote = (text: string) => text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

function isBusy(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error.code === "EPERM" || error.code === "EBUSY")
  );
}

export async function buildNativeHelper(input: NativeHelperOptions): Promise<NativeHelperResult> {
  const { name, appDir, product } = input;
  if (!namePattern.test(name)) throw new Error(`edi-native: invalid helper name ${name}`);
  if (!productPattern.test(product)) throw new Error(`${name}: invalid product ${product}`);
  if ((input.platform ?? process.platform) !== "win32") return { status: "skipped" };
  const env = input.env ?? process.env;
  const outputDir = join(appDir, "resources", "native");
  const output = join(outputDir, `${name}.exe`);
  const stampFile = join(outputDir, `${name}.json`);

  const manifest: unknown = JSON.parse(await readFile(join(appDir, "package.json"), "utf8"));
  if (
    !manifest ||
    typeof manifest !== "object" ||
    !("version" in manifest) ||
    typeof manifest.version !== "string"
  )
    throw new Error(`${name}: package.json without version`);
  const author = "author" in manifest && typeof manifest.author === "string" ? manifest.author : "";
  const { version, numeric } = (() => {
    try {
      return helperVersion(manifest.version, env.EDI_RELEASE_TAG);
    } catch (error) {
      throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();

  if (!env.WINDIR) throw new Error(`${name}: WINDIR is not set`);
  const framework = join(env.WINDIR, "Microsoft.NET", "Framework64", "v4.0.30319");
  const csc = env.CSC ?? join(framework, "csc.exe");
  if (!existsSync(csc))
    throw new Error(
      `${name}: C# compiler not found at ${csc}; set CSC to csc.exe of .NET Framework 4.x`,
    );

  const shared = nativeSources(input.modules);
  const references = [...new Set([...shared.references, ...(input.references ?? [])])].map(
    (reference) => join(framework, reference),
  );
  const appFiles = (await readdir(input.appSources))
    .filter((file) => file.endsWith(".cs"))
    .sort()
    .map((file) => join(input.appSources, file));
  if (appFiles.length === 0) throw new Error(`${name}: no C# sources in ${input.appSources}`);
  const sources = [...shared.files, ...appFiles];
  const assemblyInfo = [
    "using System.Reflection;",
    `[assembly: AssemblyTitle("${product} helper")]`,
    `[assembly: AssemblyProduct("${product}")]`,
    `[assembly: AssemblyCompany("${quote(author)}")]`,
    `[assembly: AssemblyVersion("${numeric}")]`,
    `[assembly: AssemblyFileVersion("${numeric}")]`,
    `[assembly: AssemblyInformationalVersion("${quote(version)}")]`,
    "",
  ].join("\n");
  const appManifest = (await readFile(join(nativeSourceDirectory, "app.manifest"), "utf8")).replace(
    "$IDENTITY$",
    `Informach.${product}.Helper`,
  );

  const hash = createHash("sha256");
  hash.update(
    `${version}\0${csc}\0${options.join(" ")}\0${references.join(";")}\0${assemblyInfo}\0`,
  );
  hash.update(`${appManifest.replace(/\r\n/g, "\n")}\0`);
  // The build itself is part of the result: a change here recompiles every helper.
  for (const file of ["build.ts", "sources.ts"])
    hash.update(await readFile(fileURLToPath(new URL(file, import.meta.url))));
  for (const file of sources)
    hash
      .update(`${basename(file)}\0`)
      .update((await readFile(file, "utf8")).replace(/\r\n/g, "\n"))
      .update("\0");
  const digest = hash.digest("hex");

  const previous: unknown = existsSync(stampFile)
    ? JSON.parse(await readFile(stampFile, "utf8"))
    : undefined;
  if (
    previous &&
    typeof previous === "object" &&
    "sha256" in previous &&
    previous.sha256 === digest &&
    existsSync(output)
  )
    return { status: "up-to-date", version, executable: output, sources: sources.length };

  // The scratch folder sits on the same drive as the output, so the final rename never crosses
  // drives (CI runners keep the temp folder on C: and the checkout on D:).
  const scratchRoot = join(appDir, ".cache");
  await mkdir(scratchRoot, { recursive: true });
  const work = await mkdtemp(join(scratchRoot, `${name}-`));
  try {
    const info = join(work, "AssemblyInfo.cs");
    const manifestFile = join(work, "app.manifest");
    const staged = join(work, `${name}.exe`);
    await writeFile(info, assemblyInfo, "utf8");
    await writeFile(manifestFile, appManifest, "utf8");
    const args = [
      ...options,
      `/win32manifest:${manifestFile}`,
      `/out:${staged}`,
      ...references.map((path) => `/reference:${path}`),
      info,
      ...sources,
    ];
    const compiled = await new Promise<{ error: Error | null; stdout: string }>((done) =>
      execFile(csc, args, { windowsHide: true, maxBuffer: 4 * 1024 ** 2 }, (error, stdout) =>
        done({ error, stdout: String(stdout) }),
      ),
    );
    // csc reports diagnostics on stdout.
    if (compiled.error)
      throw new Error(`${name}: compilation failed\n${compiled.stdout || compiled.error.message}`);
    await mkdir(outputDir, { recursive: true });
    // Earlier executables moved aside by previous builds go once nothing holds them anymore.
    for (const entry of await readdir(outputDir))
      if (entry.startsWith(`${name}.exe.old-`))
        await rm(join(outputDir, entry), { force: true }).catch(() => undefined);
    try {
      await rename(staged, output);
    } catch (error) {
      if (!isBusy(error)) throw error;
      // Windows keeps an executable locked while it runs (an app in development, or the
      // antivirus scanning one that just ran), but lets it be renamed: move it aside and put
      // the new one in its place. The old file is removed by a later build.
      try {
        await rename(output, `${output}.old-${randomUUID()}`);
        await rename(staged, output);
      } catch (retry) {
        if (isBusy(retry)) throw new Error(`${name}: ${output} ${input.inUse}`);
        throw retry;
      }
    }
    await writeFile(stampFile, `${JSON.stringify({ version, sha256: digest }, null, 2)}\n`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return { status: "compiled", version, executable: output, sources: sources.length };
}

/** For the app's build script: logs the outcome and sets a failing exit code on errors. */
export async function runNativeHelperBuild(input: NativeHelperOptions): Promise<void> {
  try {
    const result = await buildNativeHelper(input);
    if (result.status === "skipped")
      console.warn(`${input.name}: compiled only on Windows; skipping on this platform.`);
    else if (result.status === "up-to-date")
      console.log(`${input.name} ${result.version}: up to date`);
    else console.log(`${input.name} ${result.version}: compiled ${result.sources} sources`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
