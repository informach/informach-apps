const { app, BrowserWindow, nativeImage } = require("electron");
const assert = require("node:assert/strict");
const { decodeRaster } = require("../src/main/raster-codec.mts");
const { Library } = require("../src/main/library.cjs");
const { registerLibraryIpc, readPreferences } = require("../src/main/library-ipc.ts");
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { windowsFileDropSource } = require("../src/main/windows-file-clipboard.mts");
function verifyNativeFileDrop(files) {
  // Read actual CF_HDROP, then write/read only a newly created private windowstation clipboard.
  const consumer = `
namespace EdiProbe {
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Windows.Forms;
using System.IO;
using System.Threading;
using System.Security.Cryptography;
public static class EdiFileConsumer {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  static extern uint DragQueryFileW(IntPtr drop, uint index, StringBuilder file, uint size);
  [DllImport("ole32.dll")] static extern void ReleaseStgMedium(ref STGMEDIUM medium);
  public static string Read(string file) {
    var data = EdiFileDrop.CreateDataObject(file);
    return ReadData(data, file);
  }
  public static string ReadClipboard(string file) {
    var data = new DataObject(Clipboard.GetDataObject());
    return ReadData(data, file);
  }
  static string ReadData(DataObject data, string file) {
    if (!File.Exists(file)) throw new Exception("Existing exported file required");
    if (!data.GetDataPresent(DataFormats.FileDrop, false) || data.GetDataPresent(DataFormats.UnicodeText, false))
      throw new Exception("Expected native file references, not text");
    var files = data.GetFileDropList();
    if (files.Count != 1 || files[0] != file) throw new Exception("Managed FileDrop mismatch");
    var format = new FORMATETC { cfFormat = 15, dwAspect = DVASPECT.DVASPECT_CONTENT, lindex = -1, tymed = TYMED.TYMED_HGLOBAL };
    STGMEDIUM medium;
    ((System.Runtime.InteropServices.ComTypes.IDataObject)data).GetData(ref format, out medium);
    try {
      if (DragQueryFileW(medium.unionmember, 0xffffffff, null, 0) != 1) throw new Exception("CF_HDROP count mismatch");
      var length = DragQueryFileW(medium.unionmember, 0, null, 0);
      var buffer = new StringBuilder((int)length + 1);
      DragQueryFileW(medium.unionmember, 0, buffer, length + 1);
      if (buffer.ToString() != file) throw new Exception("Native file reference mismatch");
      return buffer.ToString();
    } finally { ReleaseStgMedium(ref medium); }
  }
}
public static class EdiPrivateClipboard {
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern IntPtr CreateWindowStationW(string name, uint flags, uint access, IntPtr security);
  [DllImport("user32.dll", SetLastError = true)] static extern bool SetProcessWindowStation(IntPtr station);
  [DllImport("user32.dll")] static extern IntPtr GetProcessWindowStation();
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern IntPtr CreateDesktopW(string name, string device, IntPtr mode, uint flags, uint access, IntPtr security);
  [DllImport("user32.dll", SetLastError = true)] static extern bool SetThreadDesktop(IntPtr desktop);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("user32.dll")] static extern bool CloseWindowStation(IntPtr station);
  public static string[] RoundTrip(string[] files) {
    var previous = GetProcessWindowStation();
    var station = CreateWindowStationW("EdiTest-" + Guid.NewGuid().ToString("N"), 0, 0x37f, IntPtr.Zero);
    if (station == IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Private windowstation unavailable");
    IntPtr desktop = IntPtr.Zero;
    try {
      if (!SetProcessWindowStation(station)) throw new Exception("Private windowstation assignment failed");
      desktop = CreateDesktopW("EdiTest", null, IntPtr.Zero, 0, 0x1ff, IntPtr.Zero);
      if (desktop == IntPtr.Zero) throw new Exception("Private desktop unavailable");
      Exception failure = null;
      var results = new string[files.Length];
      var thread = new Thread(() => {
        try {
          if (!SetThreadDesktop(desktop)) throw new Exception("Private desktop assignment failed");
          for (int i = 0; i < files.Length; i++) {
            string hash;
            using (var stream = File.OpenRead(files[i])) using (var sha = SHA256.Create())
              hash = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
            EdiFileDrop.Copy(files[i], hash, new FileInfo(files[i]).Length);
            results[i] = EdiFileConsumer.ReadClipboard(files[i]);
          }
        } catch (Exception error) { failure = error; }
      });
      thread.SetApartmentState(ApartmentState.STA);
      thread.Start();
      thread.Join();
      if (failure != null) throw failure;
      return results;
    } finally {
      if (!SetProcessWindowStation(previous)) throw new Exception("Windowstation restoration failed");
      if (desktop != IntPtr.Zero) CloseDesktop(desktop);
      CloseWindowStation(station);
    }
  }
}}`;
  const script = `$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
${windowsFileDropSource}
${consumer}
'@
$inputFiles = [Console]::In.ReadToEnd() | ConvertFrom-Json
$construction = @($inputFiles | ForEach-Object { [EdiProbe.EdiFileConsumer]::Read([string]$_) })
try {
  $files = [EdiProbe.EdiPrivateClipboard]::RoundTrip([string[]]$inputFiles)
  $result = @{ files = $files; clipboard = 'private-windowstation-roundtrip' }
} catch {
  $cause = $_.Exception.InnerException
  if ($cause -is [System.ComponentModel.Win32Exception] -and $cause.NativeErrorCode -eq 5) {
    $result = @{ files = $construction; clipboard = 'not-exercised'; reason = 'CreateWindowStationW denied (5); no global clipboard fallback' }
  } else { throw }
}
[Console]::Out.Write((ConvertTo-Json -Compress -InputObject $result))`;
  const result = spawnSync(
    path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32/WindowsPowerShell/v1.0/powershell.exe",
    ),
    [
      "-NoProfile",
      "-NonInteractive",
      "-STA",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    {
      windowsHide: true,
      encoding: "utf8",
      input: JSON.stringify(files),
      timeout: 30_000,
      maxBuffer: 64_000,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const observed = JSON.parse(result.stdout);
  assert.deepEqual(observed.files, files);
  assert.ok(["private-windowstation-roundtrip", "not-exercised"].includes(observed.clipboard));
  if (observed.clipboard === "not-exercised") console.log(`CONCERN: ${observed.reason}`);
  return observed.clipboard;
}
const root = process.argv.find((value) => value.startsWith("--fixture-root="))?.slice(15);
assert(root && path.isAbsolute(root) && !app.isReady(), "Owned parent root required before ready");
const profile = path.join(root, "profile");
for (const name of ["userData", "sessionData", "logs", "crashDumps"]) {
  const directory = name === "userData" ? profile : path.join(profile, name);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
  assert.equal(app.getPath(name), directory);
}
console.log(JSON.stringify({ allFourProfilesOwned: true }));
app.on("window-all-closed", () => {});
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    try {
      assert(!process.argv.includes("--fixture-failure"), "OWNED_MEDIA_ASSERTION_FAILURE");
      await win.loadURL("data:text/html,<title>Synthetic media probe</title>");
      const urls = await win.webContents.executeJavaScript(
        `(() => { const c = document.createElement('canvas'); c.width = 30; c.height = 20; c.getContext('2d').fillRect(0,0,30,20); return ['image/png','image/jpeg','image/webp'].map(type => ({ type, url: c.toDataURL(type) })); })()`,
      );
      const library = new Library(path.join(profile, "captures"));
      await library.init();
      const handlers = new Map(),
        electron = require("electron");
      const output = path.join(profile, "exports");
      fs.mkdirSync(output);
      const workflows = registerLibraryIpc({
        handle: (name, _roles, fn) => handlers.set(name, fn),
        editor: () => win,
        library: () => library,
        preferences: await readPreferences(path.join(profile, "settings.json"), library.root),
        settingsPath: path.join(profile, "settings.json"),
        electron: {
          ...electron,
          dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [output] }) },
        },
        assertAccess() {},
        canSwitch: () => true,
        isSwitching: () => false,
        switching() {},
        replaceRoot: async () => {},
        applyPreferences() {},
        thumbnail: (image) => image.toDataURL(),
      });
      for (const { type, url } of urls) {
        const before = BrowserWindow.getAllWindows().length;
        const image = await decodeRaster(Buffer.from(url.split(",")[1], "base64"), {
          nativeImage,
          BrowserWindow,
        });
        assert.equal(image.isEmpty(), false, `${type} decoder`);
        assert.deepEqual(image.getSize(), { width: 30, height: 20 });
        assert.equal(
          BrowserWindow.getAllWindows().length,
          before,
          "decoder window is destroyed after success",
        );
        const imported = await handlers.get("media:import")({
          name: `Source.${type.split("/")[1]}`,
          bytes: new Uint8Array(Buffer.from(url.split(",")[1], "base64")),
        });
        assert.equal(imported.kind, "image");
        assert.ok(imported.dataUrl.startsWith("data:image/png;base64,"));
        assert.equal((await library.read(imported.id)).name, `Source.${type.split("/")[1]}`);
      }
      const malformed = Buffer.alloc(30);
      malformed.write("RIFF", 0);
      malformed.writeUInt32LE(22, 4);
      malformed.write("WEBP", 8);
      malformed.write("VP8X", 12);
      malformed.writeUInt32LE(10, 16);
      malformed.writeUIntLE(29, 24, 3);
      malformed.writeUIntLE(19, 27, 3);
      const beforeFailure = BrowserWindow.getAllWindows().length;
      await assert.rejects(decodeRaster(malformed, { nativeImage, BrowserWindow }));
      assert.equal(
        BrowserWindow.getAllWindows().length,
        beforeFailure,
        "decoder window is destroyed after failure",
      );
      await assert.rejects(
        handlers.get("media:import")({ name: "Invalid.png", bytes: new Uint8Array([1, 2, 3]) }),
      );
      assert.equal((await library.list({})).total, 3);
      const first = (await library.list({})).items[0];
      await library.updateMetadata({ id: first.id, name: "CON.txt" });
      const destination = await handlers.get("file:batch-destination")(-1);
      const item = {
        id: first.id,
        bytes: new Uint8Array(Buffer.from(urls[0].url.split(",")[1], "base64")),
      };
      const a = await handlers.get("file:batch-export")({ items: [item], destination });
      const b = await handlers.get("file:batch-export")({ items: [item], destination });
      assert.deepEqual(a.failed, []);
      assert.deepEqual(b.failed, []);
      assert.notEqual(a.succeeded[0], b.succeeded[0]);
      assert.ok(path.basename(a.succeeded[0]).startsWith("Captura-CON.txt"));
      assert.deepEqual(fs.readFileSync(a.succeeded[0]), fs.readFileSync(b.succeeded[0]));
      await handlers.get("file:batch-finish")(destination);
      const video = path.join(output, "Vídeo $(no-command) [final].webm");
      const namedPng = path.join(output, "Saída final [imagem].png");
      fs.copyFileSync(a.succeeded[0], namedPng);
      fs.writeFileSync(video, Buffer.from("1a45dfa342827765626d0000", "hex"));
      await workflows.rememberExport(video, "webm");
      // Exercise exactly the production Windows Forms construction, with both final file kinds,
      // and a real shell32 consumer, with clipboard publication isolated in a private windowstation.
      const fileClipboard = verifyNativeFileDrop([namedPng, video]);
      fs.unlinkSync(video);
      await assert.rejects(handlers.get("file:copy-final")(), /não está mais disponível/);
      console.log(
        `PASS: actual Electron PNG/JPEG/WebP import persistence, invalid bytes, decoder cleanup; batch export collisions and Windows reserved names; native PNG/WebM FileDrop IDataObject/CF_HDROP shell32 consumer, clipboard=${fileClipboard}, deleted-export guard; user clipboard untouched; isolated profile`,
      );
      win.destroy();
      console.log(JSON.stringify({ mediaFixtureResult: 0 }));
      app.exit(0);
    } catch (error) {
      console.error(error);
      win.destroy();
      console.log(JSON.stringify({ mediaFixtureResult: 1 }));
      app.exit(1);
    }
  })
  .catch((error) => {
    console.error(error);
    console.log(JSON.stringify({ mediaFixtureResult: 1 }));
    app.exit(1);
  });
