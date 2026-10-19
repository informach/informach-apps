import { spawn } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
import { windowsPowerShellEnvironment } from "../../packages/edi-desktop/src/windows-powershell.ts";
import { sanitizeNativeDiagnostic } from "./native-diagnostics.mts";

// Read-only metadata for the explicitly owned synthetic target. Never returns
// another window's identity, title, content or process information.
export async function ownedWheelFocus(handle: string, x: number, y: number) {
  const input = z
    .object({
      handle: z.string().regex(/^[1-9]\d{0,18}$/),
      x: z.number().int(),
      y: z.number().int(),
    })
    .parse({ handle, x, y });
  const source = `
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class OwnFocus {
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int l,t,r,b;}
 [StructLayout(LayoutKind.Sequential)] public struct Point {public int x,y;}
 [StructLayout(LayoutKind.Sequential)] public struct Info {public int size;public uint flags;public IntPtr active,focus,capture,menu,move,caret;public Rect rect;}
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint id,ref Info info);
 [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")] static extern bool IsChild(IntPtr p,IntPtr c);
 public static bool[] Read(long handle,int x,int y) {
  IntPtr own=new IntPtr(handle);uint process;uint thread=GetWindowThreadProcessId(own,out process);
  Info info=new Info();info.size=Marshal.SizeOf(typeof(Info));if(thread==0 || !GetGUIThreadInfo(thread,ref info)) throw new Exception("OWNED_FOCUS_UNAVAILABLE");
  IntPtr hit=WindowFromPoint(new Point{x=x,y=y});
  return new bool[]{info.focus==own,hit==own,info.focus==hit,info.focus==own||IsChild(own,info.focus),hit==own||IsChild(own,hit)};
 }
}
'@
$v=[Console]::In.ReadToEnd()|ConvertFrom-Json
[Console]::Out.Write((ConvertTo-Json -Compress -InputObject ([OwnFocus]::Read([long]$v.handle,[int]$v.x,[int]$v.y))))
`;
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      join(
        // biome-ignore lint/suspicious/noUndeclaredEnvVars: direct Windows diagnostic, not a Turbo task
        process.env.SystemRoot || "C:\\Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(source, "utf16le").toString("base64"),
      ],
      { windowsHide: true, env: windowsPowerShellEnvironment(), stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "",
      stderr = "";
    const timeout = setTimeout(() => child.kill(), 10000);
    child.once("error", reject);
    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 || stderr)
        reject(
          new Error(
            `Owned focus metadata probe failed (${code}): ${sanitizeNativeDiagnostic(stderr, []).slice(-2048)}`,
          ),
        );
      else resolve(stdout);
    });
    child.stdin.end(JSON.stringify(input));
  });
  const [focusIsRoot, hitIsRoot, sameRecipient, focusOwned, hitOwned] = z
    .tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean()])
    .parse(JSON.parse(output));
  return { focusIsRoot, hitIsRoot, sameRecipient, focusOwned, hitOwned };
}
