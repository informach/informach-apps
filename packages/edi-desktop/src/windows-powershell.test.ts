import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { windowsPowerShellEnvironment } from "./windows-powershell";

describe("Windows PowerShell child environment", () => {
  it("preserves unrelated variables and the caller environment while removing every module path casing", () => {
    const environment = {
      Path: "C:\\Windows\\System32",
      PSModulePath: "C:\\Program Files\\PowerShell\\7\\Modules",
      psModulePath: "C:\\custom-modules",
      EDI_VERIFY_TARGET: "C:\\application.exe",
    };
    expect(windowsPowerShellEnvironment(environment)).toEqual({
      Path: environment.Path,
      EDI_VERIFY_TARGET: environment.EDI_VERIFY_TARGET,
    });
    expect(environment.PSModulePath).toBe("C:\\Program Files\\PowerShell\\7\\Modules");
    expect(environment.psModulePath).toBe("C:\\custom-modules");
  });

  it.skipIf(process.platform !== "win32")(
    "loads Windows inbox commands and UI Automation through the real Node child process",
    () => {
      const result = execFileSync(
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          '$ErrorActionPreference="Stop"; Add-Type -AssemblyName UIAutomationClient; Get-Command Get-FileHash,Add-Type,New-Object,Start-Process,Get-AuthenticodeSignature,ConvertTo-SecureString | Select-Object -ExpandProperty Name',
        ],
        {
          windowsHide: true,
          timeout: 15000,
          encoding: "utf8",
          env: windowsPowerShellEnvironment(),
        },
      );
      expect(result.trim().split(/\r?\n/)).toEqual([
        "Get-FileHash",
        "Add-Type",
        "New-Object",
        "Start-Process",
        "Get-AuthenticodeSignature",
        "ConvertTo-SecureString",
      ]);
    },
  );
});
