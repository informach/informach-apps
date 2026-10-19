# CI eligibility only: query the default render endpoint without playing/recording sound,
# opening an audio stream, or logging device names/IDs. A present endpoint is not a pass:
# the sound tests must still prove their controls and exclusions on that runner.
param([Parameter(Mandatory = $true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace EdiSoundTestEligibility {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  public class Enumerator {}
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int flow, uint state, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IDevice {
    [PreserveSig] int Activate(ref Guid iid, uint context, IntPtr parameters, out IntPtr instance);
    [PreserveSig] int OpenPropertyStore(uint access, out IntPtr properties);
    [PreserveSig] int GetId(out IntPtr id);
    [PreserveSig] int GetState(out uint state);
  }
  public static class Probe {
    public static string Reason() {
      IEnumerator enumerator = (IEnumerator)new Enumerator();
      IDevice device = null;
      try {
        // eRender=0, eMultimedia=1: the default output used by the controls.
        int result = enumerator.GetDefaultAudioEndpoint(0, 1, out device);
        if (result == unchecked((int)0x80070490)) return "no-default-render-endpoint";
        Marshal.ThrowExceptionForHR(result);
        uint state;
        Marshal.ThrowExceptionForHR(device.GetState(out state));
        return state == 1 ? "active-default-render-endpoint" : "default-render-endpoint-not-active";
      } finally {
        if (device != null) Marshal.ReleaseComObject(device);
        Marshal.ReleaseComObject(enumerator);
      }
    }
  }
}
'@
$reason = [EdiSoundTestEligibility.Probe]::Reason()
$eligible = $reason -eq 'active-default-render-endpoint'
$flag = if ($eligible) { '1' } else { '0' }
$record = [ordered]@{ eligible = $eligible; reason = $reason; acquisitionPerformed = $false }
$json = $record | ConvertTo-Json -Compress
$parent = Split-Path -Parent $OutputPath
if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
[System.IO.File]::WriteAllText($OutputPath, $json)
Write-Output $json
if ($env:GITHUB_OUTPUT) { Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "sound_tests=$flag" }
if ($env:GITHUB_STEP_SUMMARY) {
  $selection = if ($eligible) { 'enabled; control assertions must still pass' } else { 'not exercised; five explicit sound skips expected' }
  Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Value "Physical sound tests: $selection ($reason). Eligibility probe performed no audio acquisition."
}
