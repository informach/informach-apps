param([Parameter(Mandatory=$true)][int]$TestProcessId,[ValidateSet('Cancelar','Descartar','Recuperar')][string]$Choice='Descartar')
$ErrorActionPreference='Stop'
$owned=Get-CimInstance Win32_Process -Filter "ProcessId=$TestProcessId"
$fixture=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'fixtures/native-vault.cjs'))
$application=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../apps/edisvg'))
if (!$owned -or !$owned.CommandLine.Contains($fixture) -or !$owned.CommandLine.Contains($application)) {
  throw 'Refusing to interact with a process other than the owned EdiSVG test fixture.'
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EdiNativeTestButton {
  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
}
'@
$processCondition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$TestProcessId)
$nameCondition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$Choice)
$deadline=[DateTime]::UtcNow.AddSeconds(10)
$clicked=$false
while ([DateTime]::UtcNow -lt $deadline) {
  $window=[System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children,$processCondition)
  if ($window) {
    $control=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$nameCondition)
    if ($control -and $control.Current.ClassName -eq 'CCCommandLink' -and $control.Current.IsEnabled) {
      $handle=[IntPtr]$control.Current.NativeWindowHandle
      [uint32]$ownerId=0
      [void][EdiNativeTestButton]::GetWindowThreadProcessId($handle,[ref]$ownerId)
      if ($ownerId -ne $TestProcessId) { throw 'The discard control belongs to another process.' }
      # Electron's native command-link exposes no UIA InvokePattern. BM_CLICK is
      # the documented Windows button operation; never use screen coordinates.
      [void][EdiNativeTestButton]::SendMessage($handle,0x00F5,[IntPtr]::Zero,[IntPtr]::Zero)
      $clicked=$true
      break
    }
  }
  Start-Sleep -Milliseconds 100
}
if (!$clicked) { throw 'The owned test-draft prompt did not appear.' }
$testProcess=Get-Process -Id $TestProcessId -ErrorAction SilentlyContinue
if ($Choice -eq 'Descartar') {
  if ($testProcess -and !$testProcess.WaitForExit(15000)) { throw 'The test application did not close gracefully.' }
  Write-Output 'Discarded the isolated test draft and confirmed graceful application exit.'
} else {
  if (!$testProcess -or $testProcess.HasExited) { throw 'Canceling close did not preserve the test application.' }
  Write-Output 'Responded to the isolated test draft; application remained open.'
}
