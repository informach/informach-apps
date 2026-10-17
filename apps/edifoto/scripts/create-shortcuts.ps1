# Creates "EdiFoto" shortcuts (Desktop and Start Menu) that open the built app directly,
# without a terminal. Run `npm run build` first; `npm run shortcut` does both.
$root = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$icon = Join-Path $root 'resources\icon.ico'
if (-not (Test-Path $electron)) { throw "Electron não encontrado em $electron. Rode npm install." }
if (-not (Test-Path (Join-Path $root 'out\main\index.js'))) { throw 'App ainda não compilado. Rode npm run build.' }

# Sets the AppUserModelID on a shortcut, so the running window groups with it on the taskbar.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ShortcutId {
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    int GetCount(out uint c); int GetAt(uint i, out PropertyKey k); int GetValue(ref PropertyKey k, out PropVariant v);
    int SetValue(ref PropertyKey k, ref PropVariant v); int Commit();
  }
  [StructLayout(LayoutKind.Sequential, Pack = 4)] struct PropertyKey { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Explicit)] struct PropVariant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }
  [DllImport("shell32.dll", PreserveSig = false)]
  static extern void SHGetPropertyStoreFromParsingName([MarshalAs(UnmanagedType.LPWStr)] string path, IntPtr bc, int flags, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
  public static void Set(string lnk, string id) {
    Guid iid = typeof(IPropertyStore).GUID;
    IPropertyStore store;
    SHGetPropertyStoreFromParsingName(lnk, IntPtr.Zero, 2 /* GPS_READWRITE */, ref iid, out store);
    PropertyKey key = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
    PropVariant v = new PropVariant { vt = 31 /* VT_LPWSTR */, p = Marshal.StringToCoTaskMemUni(id) };
    store.SetValue(ref key, ref v);
    store.Commit();
    Marshal.FreeCoTaskMem(v.p);
    Marshal.ReleaseComObject(store);
  }
}
'@

$shell = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'EdiFoto.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'EdiFoto.lnk')
)
foreach ($lnk in $targets) {
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath = $electron
  $s.Arguments = '"' + $root + '"'
  $s.WorkingDirectory = $root
  $s.IconLocation = "$icon,0"
  $s.Description = 'EdiFoto: editor de fotos'
  $s.WindowStyle = 1
  $s.Save()
  [ShortcutId]::Set($lnk, 'CrieComHelenaEJulio.EdiFoto')
  Write-Output "Atalho criado: $lnk"
}
