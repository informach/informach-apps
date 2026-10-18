import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import koffi from "koffi";
import { build } from "vite";

if (process.platform !== "win32")
  throw new Error("The isolated clipboard journey requires Windows.");
assert.equal(
  process.env.ELECTRON_RUN_AS_NODE,
  undefined,
  "Launch the Electron fixture as Electron.",
);
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  run = randomUUID(),
  root = join(appRoot, ".cache", "clipboard-native", run),
  report = join(root, "result.json");
await mkdir(root, { recursive: true });
await copyFile(join(appRoot, "tests/fixtures/tiff/rgb-raw-1.png"), join(root, "image.png"));
await build({
  configFile: false,
  root: appRoot,
  publicDir: false,
  logLevel: "warn",
  build: {
    target: "node24",
    outDir: root,
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: join(appRoot, "scripts/fixtures/clipboard-main.mts"),
      formats: ["cjs"],
      fileName: () => "fixture.cjs",
    },
    rollupOptions: { external: [/^node:/, "electron", "koffi"] },
  },
});
const user = koffi.load("user32.dll"),
  kernel = koffi.load("kernel32.dll"),
  getStation = user.func("void * __stdcall GetProcessWindowStation(void)"),
  information = user.func(
    "int __stdcall GetUserObjectInformationW(void *handle, int index, _Out_ void *buffer, uint32_t length, _Out_ uint32_t *needed)",
  ),
  setStation = user.func("int __stdcall SetProcessWindowStation(void *station)"),
  createStation = user.func(
    "void * __stdcall CreateWindowStationW(str16 name, uint32_t flags, uint32_t access, void *security)",
  ),
  closeStation = user.func("int __stdcall CloseWindowStation(void *station)"),
  createDesktop = user.func(
    "void * __stdcall CreateDesktopW(str16 name, void *device, void *mode, uint32_t flags, uint32_t access, void *security)",
  ),
  closeDesktop = user.func("int __stdcall CloseDesktop(void *desktop)"),
  getError = kernel.func("uint32_t __stdcall GetLastError(void)"),
  closeHandle = kernel.func("int __stdcall CloseHandle(void *handle)"),
  wait = kernel.func("uint32_t __stdcall WaitForSingleObject(void *handle, uint32_t milliseconds)"),
  terminate = kernel.func("int __stdcall TerminateProcess(void *handle, uint32_t code)");
const startupType = koffi.struct("ClipboardProbeStartup", {
  cb: "uint32_t",
  lpReserved: "str16",
  lpDesktop: "str16",
  lpTitle: "str16",
  dwX: "uint32_t",
  dwY: "uint32_t",
  dwXSize: "uint32_t",
  dwYSize: "uint32_t",
  dwXCountChars: "uint32_t",
  dwYCountChars: "uint32_t",
  dwFillAttribute: "uint32_t",
  dwFlags: "uint32_t",
  wShowWindow: "uint16_t",
  cbReserved2: "uint16_t",
  lpReserved2: "void *",
  hStdInput: "void *",
  hStdOutput: "void *",
  hStdError: "void *",
});
koffi.struct("ClipboardProbeProcess", {
  hProcess: "void *",
  hThread: "void *",
  dwProcessId: "uint32_t",
  dwThreadId: "uint32_t",
});
const launch = kernel.func(
    "int __stdcall CreateProcessW(str16 application, _Inout_ uint16_t *command, void *processSecurity, void *threadSecurity, int inherit, uint32_t flags, void *environment, str16 directory, ClipboardProbeStartup *startup, _Out_ ClipboardProbeProcess *process)",
  ),
  getExit = kernel.func("int __stdcall GetExitCodeProcess(void *process, _Out_ uint32_t *code)");
// A unique named station requires a privileged Windows test environment. Never reuse a
// pre-existing unnamed station: its clipboard may belong to another process.
const original = getStation(),
  privateStation = createStation(`EdiPdfClipboard-${run}`, 1, 0x37f, null);
assert.ok(
  privateStation,
  `CreateWindowStationW failed: ${getError()}. An isolated named station requires a privileged Windows test environment; no clipboard content was accessed.`,
);
let desktop: unknown, processHandle: unknown, threadHandle: unknown;
const cleanup: unknown[] = [];
let failure: unknown;
try {
  const name = Buffer.alloc(2048),
    needed = [0];
  assert.notEqual(information(privateStation, 2, name, name.length, needed), 0);
  const stationName = name.toString("utf16le").split("\0")[0];
  assert.ok(
    /^[a-z\d$-]{1,256}$/i.test(stationName) && stationName.toLowerCase() !== "winsta0",
    "Refusing the interactive window station.",
  );
  assert.notEqual(setStation(privateStation), 0, `SetProcessWindowStation failed: ${getError()}`);
  try {
    desktop = createDesktop("Fixture", null, null, 0, 0x1ff, null);
    assert.ok(desktop, `CreateDesktopW failed: ${getError()}`);
  } finally {
    assert.notEqual(
      setStation(original),
      0,
      "The launcher must restore its original window station.",
    );
  }
  const require = createRequire(import.meta.url),
    executable: unknown = require("electron");
  assert.equal(typeof executable, "string");
  if (typeof executable !== "string") throw new Error("Missing Electron executable.");
  const argumentsList = [executable, join(root, "fixture.cjs"), stationName, report, root];
  assert.ok(
    argumentsList.every((argument) => !/["\r\n\0]/.test(argument) && !argument.endsWith("\\")),
  );
  const command = Buffer.from(
      `${argumentsList.map((argument) => `"${argument}"`).join(" ")}\0`,
      "utf16le",
    ),
    process: { hProcess?: unknown; hThread?: unknown; dwProcessId?: number; dwThreadId?: number } =
      {};
  assert.notEqual(
    launch(
      executable,
      command,
      null,
      null,
      0,
      0x08000000,
      null,
      appRoot,
      {
        cb: koffi.sizeof(startupType),
        lpDesktop: `${stationName}\\Fixture`,
        dwFlags: 1,
        wShowWindow: 0,
      },
      process,
    ),
    0,
    `CreateProcessW failed: ${getError()}`,
  );
  processHandle = process.hProcess;
  threadHandle = process.hThread;
  const waited: unknown = wait(processHandle, 30000);
  if (waited !== 0) {
    assert.notEqual(
      terminate(processHandle, 1),
      0,
      "Terminate only the owned fixture process on failure.",
    );
    wait(processHandle, 5000);
    throw new Error(`The isolated clipboard fixture did not finish: ${waited}. See ${root}`);
  }
  const exit = [0];
  assert.notEqual(getExit(processHandle, exit), 0);
  const result: unknown = JSON.parse(await readFile(report, "utf8"));
  assert.equal(exit[0], 0, JSON.stringify(result));
  console.log(JSON.stringify(result));
  console.log(`Artifacts: ${root}`);
} catch (error) {
  failure = error;
} finally {
  for (const [handle, close] of [
    [threadHandle, closeHandle],
    [processHandle, closeHandle],
    [desktop, closeDesktop],
    [privateStation, closeStation],
  ] as const)
    if (handle && close(handle) === 0)
      cleanup.push(`Closing an owned handle failed: ${getError()}`);
}
if (failure || cleanup.length)
  throw new AggregateError(
    [...(failure ? [failure] : []), ...cleanup],
    "The isolated clipboard journey failed.",
  );
