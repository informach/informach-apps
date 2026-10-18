// Compiles native/helper/*.cs into resources/native/ediaula-helper.exe with the C# compiler of the
// .NET Framework 4.x that ships with Windows (C# 5). Skips the compiler when sources, version and
// options are unchanged. Outside Windows it only warns: the helper exists for Windows alone.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(app, "native", "helper");
const outputDir = join(app, "resources", "native");
const output = join(outputDir, "ediaula-helper.exe");
const stampFile = join(outputDir, "ediaula-helper.json");

if (process.platform !== "win32") {
  console.warn("ediaula-helper: compiled only on Windows; skipping on this platform.");
  process.exit(0);
}

const manifest = JSON.parse(await readFile(join(app, "package.json"), "utf8"));
// Release builds stamp the suite version, the same one the packaged app reports.
const version = process.env.EDI_RELEASE_TAG
  ? process.env.EDI_RELEASE_TAG.replace(/^edi-v/, "")
  : manifest.version;
const parts = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version);
if (!parts || parts.slice(1, 4).some((part) => Number(part) > 65534))
  throw new Error(`ediaula-helper: unsupported version ${version}`);
const numeric = `${parts[1]}.${parts[2]}.${parts[3]}.0`;

if (!process.env.WINDIR) throw new Error("ediaula-helper: WINDIR is not set");
const framework = join(process.env.WINDIR, "Microsoft.NET", "Framework64", "v4.0.30319");
const csc = process.env.CSC ?? join(framework, "csc.exe");
if (!existsSync(csc))
  throw new Error(
    `ediaula-helper: C# compiler not found at ${csc}; set CSC to csc.exe of .NET Framework 4.x`,
  );
const references = [
  "System.dll",
  "System.Core.dll",
  "System.Drawing.dll",
  "System.Web.Extensions.dll",
  "WPF/UIAutomationClient.dll",
  "WPF/UIAutomationTypes.dll",
  "WPF/WindowsBase.dll",
].map((name) => join(framework, name));
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

const sources = (await readdir(sourceDir)).filter((name) => name.endsWith(".cs")).sort();
if (sources.length === 0) throw new Error("ediaula-helper: no C# sources");
const quote = (text) => text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const assemblyInfo = [
  "using System.Reflection;",
  '[assembly: AssemblyTitle("EdiAula helper")]',
  '[assembly: AssemblyProduct("EdiAula")]',
  `[assembly: AssemblyCompany("${quote(String(manifest.author ?? ""))}")]`,
  `[assembly: AssemblyVersion("${numeric}")]`,
  `[assembly: AssemblyFileVersion("${numeric}")]`,
  `[assembly: AssemblyInformationalVersion("${quote(version)}")]`,
  "",
].join("\n");

const hash = createHash("sha256");
hash.update(`${version}\0${csc}\0${options.join(" ")}\0${references.join(";")}\0${assemblyInfo}\0`);
hash.update(await readFile(fileURLToPath(import.meta.url)));
for (const name of [...sources, "app.manifest"])
  hash
    .update(`${name}\0`)
    .update((await readFile(join(sourceDir, name), "utf8")).replace(/\r\n/g, "\n"))
    .update("\0");
const digest = hash.digest("hex");

const previous = existsSync(stampFile)
  ? JSON.parse(await readFile(stampFile, "utf8")).sha256
  : undefined;
if (previous === digest && existsSync(output)) {
  console.log(`ediaula-helper ${version}: up to date`);
  process.exit(0);
}

/** Compiles into a scratch folder; the answer is a message for the person when it fails. */
async function compile(work) {
  const info = join(work, "AssemblyInfo.cs");
  const staged = join(work, "ediaula-helper.exe");
  await writeFile(info, assemblyInfo, "utf8");
  const args = [
    ...options,
    `/win32manifest:${join(sourceDir, "app.manifest")}`,
    `/out:${staged}`,
    ...references.map((path) => `/reference:${path}`),
    info,
    ...sources.map((name) => join(sourceDir, name)),
  ];
  const compiled = await new Promise((done) =>
    execFile(csc, args, { windowsHide: true, maxBuffer: 4 * 1024 ** 2 }, (error, stdout) =>
      done({ error, stdout }),
    ),
  );
  // csc reports diagnostics on stdout.
  if (compiled.error)
    return `ediaula-helper: compilation failed
${String(compiled.stdout || compiled.error.message)}`;
  await mkdir(outputDir, { recursive: true });
  try {
    await rename(staged, output);
  } catch (error) {
    // Windows keeps a running executable locked: an EdiAula in development may be using it.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["EPERM", "EBUSY"].includes(error.code)
    )
      return `ediaula-helper: ${output} está em uso. Feche o EdiAula aberto em desenvolvimento (ou a gravação em andamento) e rode o comando de novo.`;
    throw error;
  }
  await writeFile(
    stampFile,
    `${JSON.stringify({ version, sha256: digest }, null, 2)}
`,
  );
  return undefined;
}

// The scratch folder sits on the same drive as the output, so the final rename never crosses
// drives (CI runners keep the temp folder on C: and the checkout on D:).
const scratchRoot = join(app, ".cache");
await mkdir(scratchRoot, { recursive: true });
const work = await mkdtemp(join(scratchRoot, "ediaula-helper-"));
let failure;
try {
  failure = await compile(work);
} finally {
  await rm(work, { recursive: true, force: true });
}
if (failure) {
  console.error(failure);
  process.exit(1);
}
console.log(`ediaula-helper ${version}: compiled ${sources.length} sources`);
