const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { join } = require("node:path");
const { createInterface } = require("node:readline");
const { ScrollAutomation } = require("../src/main/scroll-automation.ts");
const {
  nativeWindowBounds,
  prepareWindowsCapture,
} = require("@informach/edi-desktop/windows-capture");
const { windowsPowerShellEnvironment } = require("@informach/edi-desktop/windows-powershell");

// Native opaque content is owned by this fixture. No screenshots, global cursor movement or clipboard.
const script = String.raw`
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Windows.Forms;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
public class ScrollSurface:Panel {
 public int XOffset=0,YOffset=0;
 public ScrollSurface() { DoubleBuffered=true; BackColor=Color.Navy; }
 protected override void WndProc(ref Message m) {
  if(m.Msg==0x20A || m.Msg==0x20E) {
   int delta=(short)((m.WParam.ToInt64()>>16)&65535);
   if(m.Msg==0x20A) YOffset=Math.Max(0,Math.Min(600,YOffset-delta/3));
   else XOffset=Math.Max(0,Math.Min(600,XOffset+delta/3));
   Invalidate();Update();m.Result=IntPtr.Zero;return;
  }
  base.WndProc(ref m);
 }
 protected override void OnPaint(PaintEventArgs e) {
  base.OnPaint(e);
  for(int y=0;y<Height;y+=20) for(int x=0;x<Width;x+=20) using(var brush=new SolidBrush(Color.FromArgb((x+XOffset)%256,(y+YOffset)%256,100))) e.Graphics.FillRectangle(brush,x,y,20,20);
 }
}
public static class ScrollFixture {
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 public static void Run() {
  IntPtr old=SetThreadDpiAwarenessContext(new IntPtr(-4));
  var form=new Form();var other=new Form();var surface=new ScrollSurface();var outside=new Button();
  try {
   form.Text="Owned scrolling target";form.StartPosition=FormStartPosition.Manual;form.Bounds=new Rectangle(90,90,420,320);surface.Dock=DockStyle.Fill;form.Controls.Add(surface);
   outside.Bounds=new Rectangle(300,240,80,25);outside.Text="Own focus";form.Controls.Add(outside);outside.BringToFront();
   other.Text="Owned foreground switch";other.StartPosition=FormStartPosition.Manual;other.Bounds=new Rectangle(560,90,240,200);other.BackColor=Color.Maroon;
   form.Shown+=delegate {
    form.Activate();surface.Focus();
    Console.WriteLine("{\"handle\":\""+form.Handle.ToInt64()+"\",\"visible\":"+form.Visible.ToString().ToLower()+"}");
    Task.Run(delegate { while(true) { string command=Console.ReadLine();
     if(command==null || command=="close") { form.BeginInvoke(new Action(delegate {other.Close();form.Close();}));break; }
     form.BeginInvoke(new Action(delegate {
      if(command=="position") Console.WriteLine("{\"x\":"+surface.XOffset+",\"y\":"+surface.YOffset+"}");
      else if(command=="activate") {form.Activate();surface.Focus();Console.WriteLine(GetForegroundWindow()==form.Handle?"active":"denied");}
      else if(command=="focus-outside") {outside.Focus();Console.WriteLine(outside.Focused?"focus-outside":"denied");}
      else if(command=="switch") {other.Show();other.Activate();Console.WriteLine(GetForegroundWindow()==other.Handle?"switched":"denied");}
      else if(command=="move") {form.Left+=20;Console.WriteLine("moved");}
     }));
    }});
   };
   Application.Run(form);
   Console.WriteLine("fixture-cleanup-complete");
  } finally {outside.Dispose();surface.Dispose();other.Dispose();form.Dispose();SetThreadDpiAwarenessContext(old);}
 }
}
'@
[ScrollFixture]::Run()
`;
async function main() {
  assert.equal(process.platform, "win32");
  const child = spawn(
    join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-STA",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { windowsHide: false, stdio: ["pipe", "pipe", "pipe"], env: windowsPowerShellEnvironment() },
  );
  const lines = createInterface({ input: child.stdout }),
    queue = [];
  let pending,
    stage = "visible-launch",
    stderrBytes = 0;
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });
  const limit = setTimeout(() => child.kill(), 60000);
  child.stderr.on("data", (chunk) => {
    stderrBytes += chunk.length;
    if (stderrBytes > 65536) child.kill();
  });
  lines.on("line", (line) => {
    if (pending) {
      const done = pending;
      pending = null;
      done(line);
    } else queue.push(line);
  });
  const next = () =>
    new Promise((resolve, reject) => {
      if (queue.length) return resolve(queue.shift());
      const timer = setTimeout(() => {
        pending = null;
        reject(new Error("Owned fixture response timeout"));
      }, 15000);
      pending = (line) => {
        clearTimeout(timer);
        resolve(line);
      };
    });
  const command = async (name) => {
    child.stdin.write(`${name}\n`);
    return next();
  };
  const auto = new ScrollAutomation();
  let bridge;
  let focusInitiallyDenied = false;
  try {
    const source = JSON.parse(await next());
    assert.equal(source.visible, true);
    assert.equal(await command("activate"), "active");
    const target = await nativeWindowBounds(source.handle);
    const region = { x: target.bounds.x + 40, y: target.bounds.y + 60, width: 200, height: 140 };
    for (const axis of ["vertical", "horizontal"]) {
      stage = axis;
      const listed = await auto.list([source.handle], region);
      assert.equal(listed.length, 1);
      if (axis === "horizontal") assert.equal(await command("switch"), "switched");
      await auto.start({ token: listed[0].token, axis, authorized: true, maxSteps: 3 }, region);
      const before = JSON.parse(await command("position"));
      if (auto.waiting) {
        focusInitiallyDenied = true;
        await assert.rejects(auto.wheel(region), /encerrada/);
        // Foreground transitions can complete after the immediate focus result. Hold
        // the other owned window active to exercise the actual waiting boundary.
        assert.equal(await command("switch"), "switched");
        assert.equal(await auto.waitForTarget(), false);
        assert.deepEqual(JSON.parse(await command("position")), before);
        assert.equal(await command("activate"), "active");
        assert.equal(await auto.waitForTarget(), true);
      }
      await auto.wheel(region);
      const after = JSON.parse(await command("position"));
      assert.equal(
        after[axis === "vertical" ? "y" : "x"] - before[axis === "vertical" ? "y" : "x"],
        40,
      );
      assert.equal(after[axis === "vertical" ? "x" : "y"], before[axis === "vertical" ? "x" : "y"]);
      auto.stop();
      await assert.rejects(auto.wheel(region), /encerrada/);
      assert.deepEqual(JSON.parse(await command("position")), after);
    }
    stage = "cancel-waiting";
    const waitingTargets = await auto.list([source.handle], region);
    assert.equal(await command("switch"), "switched");
    await auto.start(
      { token: waitingTargets[0].token, axis: "vertical", authorized: true },
      region,
    );
    const cancelledPosition = JSON.parse(await command("position"));
    auto.stop();
    assert.equal(await command("activate"), "active");
    await assert.rejects(auto.wheel(region), /encerrada/);
    assert.deepEqual(JSON.parse(await command("position")), cancelledPosition);
    stage = "foreground-loss";
    const listed = await auto.list([source.handle], region);
    await auto.start({ token: listed[0].token, axis: "vertical", authorized: true }, region);
    assert.equal(await command("switch"), "switched");
    const before = JSON.parse(await command("position"));
    await assert.rejects(auto.wheel(region), /TARGET_CHANGED/);
    assert.equal(auto.running, false);
    assert.deepEqual(JSON.parse(await command("position")), before);
    assert.equal(await command("activate"), "active");
    stage = "outside-focused-control";
    assert.equal(await command("focus-outside"), "focus-outside");
    for (const axis of ["vertical", "horizontal"]) {
      bridge = await prepareWindowsCapture();
      await assert.rejects(
        bridge.query({
          op: "wheel",
          target,
          region,
          axis,
          delta: axis === "vertical" ? -120 : 120,
        }),
        /TARGET_CHANGED/,
      );
      assert.deepEqual(JSON.parse(await command("position")), before);
      bridge.close();
    }
    assert.equal(await command("activate"), "active");
    stage = "outside-region";
    bridge = await prepareWindowsCapture();
    await assert.rejects(
      bridge.query({
        op: "wheel",
        target,
        region: { ...region, x: target.bounds.x - 1 },
        axis: "vertical",
        delta: -120,
      }),
      /TARGET_CHANGED/,
    );
    bridge.close();
    stage = "moved-target";
    const current = await auto.list([source.handle], region);
    await auto.start({ token: current[0].token, axis: "horizontal", authorized: true }, region);
    assert.equal(await command("move"), "moved");
    await assert.rejects(auto.wheel(region), /TARGET_CHANGED/);
    assert.deepEqual(JSON.parse(await command("position")), before);
    stage = "cleanup";
    assert.equal(await command("close"), "fixture-cleanup-complete");
    assert.equal(await closed, 0);
    assert.equal(stderrBytes, 0);
    console.log(
      JSON.stringify({
        nativeVertical: true,
        nativeHorizontal: true,
        foregroundParent: "Node fixture (not Electron user gesture)",
        focusInitiallyDenied,
        explicitActivationFallback: focusInitiallyDenied,
        cancelledBeforeWheel: true,
        actualOffsets: true,
        immediateStop: true,
        foregroundLoss: true,
        outsideRegion: true,
        outsideFocusedControl: true,
        movedTarget: true,
        ownedOpaqueWindows: true,
        fixtureCleanupComplete: true,
        resultCode: 0,
      }),
    );
  } catch (error) {
    throw new Error(`${stage}: ${error.message}`, { cause: error });
  } finally {
    auto.stop();
    bridge?.close();
    clearTimeout(limit);
    lines.close();
    if (child.exitCode === null) {
      child.kill();
      await closed;
    }
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
