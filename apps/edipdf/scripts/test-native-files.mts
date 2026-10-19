import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { Arch, build, Platform } from "electron-builder";

if (process.platform !== "win32")
  throw new Error("The packaged native file probe requires Windows.");
const root = await mkdtemp(join(tmpdir(), "edipdf-native-files-"));
assert.equal(dirname(root), resolve(tmpdir()));
assert.match(basename(root), /^edipdf-native-files-[a-zA-Z0-9]+$/);
const appDirectory = resolve("apps/edipdf"),
  entry = join(appDirectory, "out/main/native-files-probe.cjs");
const report = join(root, "result.json");
// Only this isolated probe entry is selected; the product's main and SDK configuration are untouched.
const code = `
const { app } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const koffi = require('koffi');
const { Worker } = require('node:worker_threads');
const { PDFDocument } = require('pdf-lib');
const root = ${JSON.stringify(root)};
app.setPath('userData', path.join(root, 'profile'));
app.whenReady().then(async () => {
  const kernel = koffi.load('kernel32.dll');
  const move = kernel.func('int __stdcall MoveFileExW(str16 source, str16 target, uint32_t flags)');
  const error = kernel.func('uint32_t __stdcall GetLastError(void)');
  const pid = kernel.func('uint32_t __stdcall GetCurrentProcessId(void)');
  assert.equal(pid(), process.pid);
  const source = path.join(root, 'origem ação.tmp'), target = path.join(root, 'cópia ação.pdf');
  await fs.writeFile(source, 'COMPLETE_PRIVATE_BYTES');
  assert.notEqual(move(path.toNamespacedPath(source), path.toNamespacedPath(target), 8), 0);
  await fs.writeFile(source, 'OTHER_BYTES');
  assert.equal(move(path.toNamespacedPath(source), path.toNamespacedPath(target), 8), 0);
  assert.ok([80, 183].includes(error()));
  assert.equal(await fs.readFile(target, 'utf8'), 'COMPLETE_PRIVATE_BYTES');
  assert.equal(await fs.readFile(source, 'utf8'), 'OTHER_BYTES');
  const png = new Uint8Array(await fs.readFile(path.join(root, 'scan.png')));
  async function append(previous) {
    const worker = new Worker(path.join(__dirname, 'scanner-pdf-worker.js'));
    try { return await new Promise((resolve, reject) => {
      worker.once('error', reject);
      worker.once('message', reply => reply.ok ? resolve(reply) : reject(new Error(reply.error)));
      worker.postMessage({ bytes: png, dpi: 200, ...(previous ? { previous } : {}) });
    }); } finally { await worker.terminate(); }
  }
  const scanned = await append(), second = await append(scanned.bytes);
  const pdf = await PDFDocument.load(second.bytes);
  assert.equal(pdf.getPageCount(), 2);
  assert.ok(Math.abs(pdf.getPage(0).getWidth() - 23.04) < 0.001);
  await fs.writeFile(${JSON.stringify(report)}, JSON.stringify({ exclusiveRename: true, unicode: true, nativePid: true, scannerWorker: true, asar: app.getAppPath().endsWith('.asar'), electron: process.versions.electron }));
  app.quit();
}).catch(async failure => { await fs.writeFile(${JSON.stringify(report)}, JSON.stringify({ error: failure.message })); app.exit(1); });
`;
const failures: unknown[] = [];
try {
  await writeFile(
    join(root, "scan.png"),
    await readFile(new URL("../tests/fixtures/tiff/rgb-raw-1.png", import.meta.url)),
  );
  await writeFile(entry, code);
  await build({
    targets: Platform.WINDOWS.createTarget(["dir"], Arch.x64),
    config: {
      appId: "br.com.informach.edipdf.nativefilesprobe",
      productName: "EdiPDFFileProbe",
      executableName: "EdiPDFFileProbe",
      directories: { app: appDirectory, output: join(root, "package") },
      files: [
        "out/main/native-files-probe.cjs",
        "out/main/scanner-pdf-worker.js",
        "out/main/chunks/**",
        "package.json",
      ],
      extraMetadata: { main: "./out/main/native-files-probe.cjs" },
      electronVersion: "44.8.0",
      electronDist: resolve("node_modules/electron/dist"),
      asar: true,
      npmRebuild: false,
      forceCodeSigning: false,
      electronFuses: {
        runAsNode: false,
        enableNodeOptionsEnvironmentVariable: false,
        enableNodeCliInspectArguments: false,
        enableCookieEncryption: true,
        enableEmbeddedAsarIntegrityValidation: true,
        onlyLoadAppFromAsar: true,
      },
      win: { signAndEditExecutable: false },
      publish: null,
    },
    publish: "never",
  });
  const installed = join(root, "package/win-unpacked"),
    unpacked = join(installed, "resources/app.asar.unpacked");
  const natives: string[] = [];
  async function scan(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await scan(path);
      else if (entry.name.endsWith(".node")) natives.push(path);
    }
  }
  await scan(unpacked);
  assert.ok(
    natives.some((path) => path.includes("koffi")),
    "The actual native addon must be unpacked beside ASAR.",
  );
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.NODE_OPTIONS;
  await promisify(execFile)(join(installed, "EdiPDFFileProbe.exe"), [], {
    windowsHide: true,
    timeout: 30_000,
    env: environment,
  });
  const output: unknown = JSON.parse(await readFile(report, "utf8"));
  assert.deepEqual(output, {
    exclusiveRename: true,
    unicode: true,
    nativePid: true,
    scannerWorker: true,
    asar: true,
    electron: "44.8.0",
  });
} catch (failure) {
  failures.push(failure);
} finally {
  try {
    await rm(entry, { force: true });
    // Windows may still release mapped runtime DLLs after process close. Use fs.rm's bounded
    // EPERM/EBUSY cleanup policy; functional errors remain independent and are never retried.
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.match(basename(root), /^edipdf-native-files-[a-zA-Z0-9]+$/);
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  } catch (cleanupFailure) {
    failures.push(cleanupFailure);
  }
}
if (failures.length === 1) throw failures[0];
if (failures.length) throw new AggregateError(failures, "Packaged native probe and cleanup failed");
console.log(
  "Packaged Koffi and the actual scanner PDF worker pass inside Electron 44.8.0 ASAR with the standard hardened fuses.",
);
