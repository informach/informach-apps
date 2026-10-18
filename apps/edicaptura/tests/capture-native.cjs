// Read-only production bridge exercised against an owned synthetic WinForms fixture.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { join } = require("node:path");
const { createInterface } = require("node:readline");
const {
  prepareWindowsCapture,
  nativeWindowBounds,
  nativeControls,
  nativeCursor,
  nativeEligibleWindows,
  nativeForeground,
  queryWindowsCapture,
  assertNativeTarget,
} = require("@informach/edi-desktop/windows-capture");
const { windowsPowerShellEnvironment } = require("@informach/edi-desktop/windows-powershell");
const fixtureScript = String.raw`
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Windows.Forms;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
public static class CaptureFixture {
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr w,int command);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 public static void Run() {
  IntPtr previous=SetThreadDpiAwarenessContext(new IntPtr(-4));
  try {
   var form=new Form();form.Text="Edi capture owned fixture";form.StartPosition=FormStartPosition.Manual;form.Bounds=new Rectangle(80,80,400,280);
   var button=new Button();button.Bounds=new Rectangle(30,40,160,35);button.Text="Synthetic control";form.Controls.Add(button);
   var panel=new Panel();panel.Bounds=new Rectangle(220,90,100,60);form.Controls.Add(panel);
   var clipped=new Button();clipped.Bounds=new Rectangle(-20,-10,160,100);panel.Controls.Add(clipped);
   form.Shown+=delegate { ShowWindow(form.Handle,8); Console.WriteLine("{\"handle\":\""+form.Handle.ToInt64()+"\",\"control\":\""+button.Handle.ToInt64()+"\",\"clipped\":\""+clipped.Handle.ToInt64()+"\"}");
    Task.Run(delegate {while(true){string command=Console.ReadLine();if(command=="move")form.BeginInvoke(new Action(delegate {form.Left+=20;Console.WriteLine("moved");}));else if(command=="activate")form.BeginInvoke(new Action(delegate {form.Activate();Console.WriteLine(GetForegroundWindow()==form.Handle?"active":"activation-denied");}));else {form.BeginInvoke(new Action(delegate {form.Close();}));break;}}});
   };
   Application.Run(form);form.Dispose();
  } finally {SetThreadDpiAwarenessContext(previous);}
 }
}
'@
[CaptureFixture]::Run()
`;
let stage = "launch";
async function main() {
  assert.equal(process.platform, "win32", "Native fixture requires Windows; no silent skip.");
  const fixture = spawn(
    join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-STA",
      "-EncodedCommand",
      Buffer.from(fixtureScript, "utf16le").toString("base64"),
    ],
    { windowsHide: false, stdio: ["pipe", "pipe", "pipe"], env: windowsPowerShellEnvironment() },
  );
  const lines = createInterface({ input: fixture.stdout });
  const queue = [];
  let pending;
  lines.on("line", (line) => {
    if (pending) {
      const resolve = pending;
      pending = null;
      resolve(line);
    } else queue.push(line);
  });
  const next = () =>
    new Promise((resolve, reject) => {
      if (queue.length) return resolve(queue.shift());
      const timer = setTimeout(() => {
        pending = null;
        reject(new Error("Fixture response timeout"));
      }, 20000);
      pending = (line) => {
        clearTimeout(timer);
        resolve(line);
      };
    });
  let stderrBytes = 0,
    fixtureDiagnostic = "";
  fixture.stderr.on("data", (data) => {
    stderrBytes += data.length;
    if (stderrBytes < 8192) fixtureDiagnostic += data.toString();
  });
  try {
    const { handle, control, clipped } = JSON.parse(await next());
    stage = "foreground";
    fixture.stdin.write("activate\n");
    assert.equal(
      await next(),
      "active",
      "Windows must allow activating this owned fixture to verify foreground.",
    );
    assert.equal((await nativeForeground()).handle, handle);
    stage = "initial-bounds";
    const initial = await nativeWindowBounds(handle);
    assert.equal(initial.handle, handle);
    assert(initial.bounds.width > 300 && initial.bounds.width <= 400);
    assert(initial.bounds.height > 200 && initial.bounds.height <= 280);
    stage = "child-bounds";
    const controls = await nativeControls(handle);
    const button = controls.find((c) => c.handle === control);
    assert(button);
    assert.equal(button.bounds.width, 160);
    assert.equal(button.bounds.height, 35);
    assert(button.bounds.x >= initial.bounds.x && button.bounds.y >= initial.bounds.y);
    assert(
      controls.some(
        (c) => c.handle === clipped && c.bounds.width === 100 && c.bounds.height === 60,
      ),
      "Ancestor client clipping must bound the oversized child",
    );
    stage = "prepared-session";
    const sessionAbort = new AbortController();
    const prepared = await prepareWindowsCapture(sessionAbort.signal);
    const queryStart = performance.now();
    const preparedWindow = await prepared.query({ op: "bounds", handle });
    assert.equal(preparedWindow.identity, initial.identity);
    const queryMs = performance.now() - queryStart;
    const pendingPrepared = prepared.query({ op: "controls", handle });
    await assert.rejects(prepared.query({ op: "bounds", handle }), /NATIVE_BUSY/);
    await pendingPrepared;
    sessionAbort.abort();
    await assert.rejects(prepared.query({ op: "bounds", handle }), /CANCELLED/);
    stage = "eligible-source";
    assert.equal((await nativeEligibleWindows([handle])).length, 1);
    stage = "cursor";
    const cursor = await nativeCursor();
    if (cursor.visible) {
      for (const encoded of [cursor.blackPng, cursor.whitePng]) {
        const bytes = Buffer.from(encoded, "base64");
        assert.equal(bytes.subarray(1, 4).toString(), "PNG");
        assert.equal(bytes.readUInt32BE(16), cursor.width);
        assert.equal(bytes.readUInt32BE(20), cursor.height);
      }
    }
    stage = "move";
    fixture.stdin.write("move\n");
    assert.equal(await next(), "moved");
    const moved = await nativeWindowBounds(handle);
    assert.equal(moved.bounds.x - initial.bounds.x, 20);
    assert.throws(() => assertNativeTarget(initial, moved), /TARGET_CHANGED/);
    const cancel = new AbortController();
    const pendingQuery = queryWindowsCapture({ op: "bounds", handle }, { signal: cancel.signal });
    cancel.abort();
    await assert.rejects(pendingQuery, /CANCELLED/);
    await assert.rejects(
      () => queryWindowsCapture({ op: "bounds", handle }, { timeoutMs: 1 }),
      /TIMEOUT/,
    );
    fixture.stdin.write("close\n");
    await new Promise((resolve) => fixture.once("close", resolve));
    await assert.rejects(() => nativeWindowBounds(handle), /WINDOW_UNAVAILABLE/);
    stage = "fixture-close";
    assert.equal(
      stderrBytes,
      0,
      `Fixture stderr bytes ${stderrBytes}; categories ${JSON.stringify([...new Set(fixtureDiagnostic.match(/[A-Za-z]+Exception|CLIXML|Preparing modules|progress|error/gi) || [])])}`,
    );
    console.log(
      JSON.stringify({
        preparationMs: Math.round(prepared.preparationMs),
        preparedQueryMs: Math.round(queryMs),
        ancestorClipping: true,
        preparedSessionClosed: true,
        ownedWindowBounds: true,
        ownedChildBounds: true,
        eligibleSource: true,
        ownedForeground: true,
        cursorVisible: cursor.visible,
        cursorPairedBitmaps: cursor.visible,
        movedTargetRejected: true,
        cancelled: true,
        timeout: true,
        closedTargetRejected: true,
      }),
    );
  } finally {
    lines.close();
    if (fixture.exitCode === null) fixture.kill();
  }
}
main().catch((error) => {
  console.error(`${stage}: ${error.message}`);
  process.exitCode = 1;
});
