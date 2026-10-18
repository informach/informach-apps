import { spawn } from "node:child_process";
import path from "node:path";

// Fixed native implementation. File names and expected contents only arrive through stdin JSON.
// DataObject emits the standard CF_HDROP format, rather than a registered text/custom format.
export const windowsFileDropSource = `
using System;
using System.IO;
using System.Collections.Specialized;
using System.Security.Cryptography;
using System.Windows.Forms;
public static class EdiFileDrop {
  public static DataObject CreateDataObject(string file) {
    if (!Path.IsPathRooted(file)) throw new ArgumentException("Absolute file required");
    var files = new StringCollection();
    files.Add(file);
    var data = new DataObject();
    data.SetFileDropList(files);
    data.SetData("Preferred DropEffect", new MemoryStream(new byte[] {1, 0, 0, 0}));
    return data;
  }
  public static void Copy(string file, string expectedHash, long expectedSize) {
    // No write/delete sharing while validating and handing the reference to Windows.
    using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read)) {
      if (stream.Length != expectedSize || stream.Length <= 0 || stream.Length > 400000000)
        throw new IOException("Export changed");
      using (var sha = SHA256.Create()) {
        var hash = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
        if (hash != expectedHash) throw new IOException("Export changed");
      }
      Clipboard.SetDataObject(CreateDataObject(file), true, 0, 0);
    }
  }
}`;

const script = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
${windowsFileDropSource}
'@
  $inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
  [EdiFileDrop]::Copy([string]$inputData.file, [string]$inputData.sha256, [long]$inputData.size)
  [Console]::Out.Write('OK')
} catch { [Console]::Error.Write('File clipboard unavailable or export changed.'); exit 1 }
`;

export function writeWindowsFileDrop(file: string, sha256: string, size: number): Promise<void> {
  if (process.platform !== "win32")
    return Promise.reject(new Error("Copiar arquivo está disponível no Windows."));
  return new Promise((resolve, reject) => {
    const child = spawn(
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
      { windowsHide: true, stdio: ["pipe", "ignore", "ignore"], timeout: 30_000 },
    );
    child.on("error", () =>
      reject(new Error("Não foi possível iniciar a cópia do arquivo no Windows.")),
    );
    child.stdin.on("error", () =>
      reject(new Error("Não foi possível enviar o arquivo ao Windows.")),
    );
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              "Não foi possível copiar o arquivo. Verifique se ele existe e tente novamente; a área de transferência pode estar ocupada.",
            ),
          ),
    );
    child.stdin.end(JSON.stringify({ file, sha256, size }));
  });
}
