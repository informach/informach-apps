param([Parameter(Mandatory=$true)][string]$PidFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class EdiPrintWindowOwner {
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr window, uint command);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr window);
}
'@
function Test-FixtureWindow($window, [int]$fixtureProcessId) {
  if ($window.Current.ProcessId -eq $fixtureProcessId) { return $true }
  $nativeHandle = $window.Current.NativeWindowHandle
  if ($null -eq $nativeHandle) { return $false }
  $handle = [IntPtr]$nativeHandle
  for ($depth = 0; $depth -lt 12 -and $handle -ne [IntPtr]::Zero; $depth++) {
    $ownerProcess = [uint32]0
    [void][EdiPrintWindowOwner]::GetWindowThreadProcessId($handle, [ref]$ownerProcess)
    if ($ownerProcess -eq $fixtureProcessId) { return $true }
    $ownerHandle = [EdiPrintWindowOwner]::GetWindow($handle, 4)
    $handle = if ($ownerHandle -ne [IntPtr]::Zero) { $ownerHandle } else { [EdiPrintWindowOwner]::GetParent($handle) }
  }
  return $false
}
$deadline = [Diagnostics.Stopwatch]::StartNew()
while ($deadline.Elapsed.TotalSeconds -lt 25) {
  if (Test-Path -LiteralPath $PidFile) {
    $fixtureProcessId = [int](Get-Content -LiteralPath $PidFile -Raw)
    if ($fixtureProcessId -le 0) { throw 'Invalid isolated Electron PID.' }
    $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($window in $windows) {
      if (-not (Test-FixtureWindow $window $fixtureProcessId)) { continue }
      $buttons = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)))
      foreach ($button in $buttons) {
        if ($button.Current.Name -match '^(Cancel|Cancelar)(\b|$)' -and $button.Current.IsEnabled -and -not $button.Current.IsOffscreen) {
          $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
          $pattern.Invoke()
          Write-Output 'Cancelled the isolated system print dialog. No print button was invoked.'
          exit 0
        }
      }
    }
  }
  Start-Sleep -Milliseconds 100
}
if ($fixtureProcessId) {
  foreach ($window in $windows) {
    if (Test-FixtureWindow $window $fixtureProcessId) { Write-Output ('Owned isolated window: ' + $window.Current.Name + ', offscreen=' + $window.Current.IsOffscreen) }
  }
}
throw 'The isolated system print cancel button did not become available.'
