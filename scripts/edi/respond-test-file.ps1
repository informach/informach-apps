param(
  [Parameter(Mandatory=$true)][int]$TestProcessId,
  [Parameter(Mandatory=$true)][ValidateSet('Save','Open','Cancel')][string]$Action,
  [string]$SelectedPath
)
$ErrorActionPreference='Stop'
$owned=Get-CimInstance Win32_Process -Filter "ProcessId=$TestProcessId"
$fixture=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'fixtures/native-vault.cjs'))
$application=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../apps/edisvg'))
if (!$owned -or !$owned.CommandLine.Contains($fixture) -or !$owned.CommandLine.Contains($application)) {
  throw 'Refusing to interact with a process other than the owned EdiSVG test fixture.'
}
if ($Action -ne 'Cancel') {
  $selected=[IO.Path]::GetFullPath($SelectedPath)
  $temporary=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
  if (!$selected.StartsWith($temporary,[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing a file outside the disposable test directory.'
  }
  $relative=$selected.Substring($temporary.Length)
  if ($relative -notmatch '^edi-native-[^\\]+\\(?:edisvg-test-project\.edisvg|edisvg-react-test\.react\.zip|edisvg-lottie-test\.lottie\.json|edisvg-lottie-stroke-test\.lottie\.json|edisvg-lottie-conversion-test\.lottie\.json|edisvg-lottie-gradient-test\.lottie\.json)$') {
    throw 'Refusing a file outside the exact disposable EdiSVG test destination.'
  }
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class EdiNativeFileControl {
  public delegate bool WindowVisitor(IntPtr window, IntPtr context);
  [DllImport("user32.dll", EntryPoint="EnumWindows")]
  private static extern bool EnumerateWindows(WindowVisitor visitor, IntPtr context);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="GetClassNameW")]
  private static extern int GetWindowClass(IntPtr window, StringBuilder name, int capacity);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")]
  public static extern IntPtr SetText(IntPtr window, uint message, IntPtr wparam, string text);
  [DllImport("user32.dll", EntryPoint="SendMessageW")]
  public static extern IntPtr Click(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  public static IntPtr[] OwnedDialogs(int targetProcess) {
    var dialogs = new List<IntPtr>();
    EnumerateWindows((window, context) => {
      uint process;
      GetWindowThreadProcessId(window, out process);
      if (process != (uint)targetProcess) return true;
      var name = new StringBuilder(128);
      if (GetWindowClass(window, name, name.Capacity) > 0 && name.ToString() == "#32770")
        dialogs.Add(window);
      return true;
    }, IntPtr.Zero);
    return dialogs.ToArray();
  }
}
'@
$deadline=[DateTime]::UtcNow.AddSeconds(15)
$completed=$false
while ([DateTime]::UtcNow -lt $deadline) {
  # Enumerate only top-level HWNDs owned by the exact fixture PID. UIA's
  # desktop-wide descendant search can fail on unrelated protected processes.
  foreach ($handle in [EdiNativeFileControl]::OwnedDialogs($TestProcessId)) {
    $window=[System.Windows.Automation.AutomationElement]::FromHandle($handle)
    $buttonId=if ($Action -eq 'Cancel') {'2'} else {'1'}
    $buttonIdentity=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,$buttonId)
    $buttonClass=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty,'Button')
    $buttonCondition=New-Object System.Windows.Automation.AndCondition($buttonIdentity,$buttonClass)
    $button=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$buttonCondition)
    $fileIdentity=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1001')
    $fileClass=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty,'Edit')
    $fileCondition=New-Object System.Windows.Automation.AndCondition($fileIdentity,$fileClass)
    $file=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$fileCondition)
    if (!$file) {
      $fileIdentity=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1148')
      $fileClass=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty,'ComboBox')
      $fileCondition=New-Object System.Windows.Automation.AndCondition($fileIdentity,$fileClass)
      $file=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$fileCondition)
    }
    if ($button -and $button.Current.IsEnabled -and $file) {
      $fileHandle=[IntPtr]$file.Current.NativeWindowHandle
      $fileValue=$null
      $hasValue=$file.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$fileValue)
      $buttonHandle=[IntPtr]$button.Current.NativeWindowHandle
      foreach($handle in @($fileHandle,$buttonHandle)) {
        [uint32]$controlOwner=0
        [void][EdiNativeFileControl]::GetWindowThreadProcessId($handle,[ref]$controlOwner)
        if ($controlOwner -ne $TestProcessId) { throw 'The file control belongs to another process.' }
      }
      if ($Action -eq 'Save') {
        if ($file.Current.ClassName -ne 'Edit') { throw 'The native Save dialog must expose its filename edit control.' }
        # Common-dialog controls do not consistently expose UIA Value/Invoke.
        # Use their documented Win32 edit/button operations, on verified handles.
        if ($hasValue) { $fileValue.SetValue($selected) }
        else {
          $set=[EdiNativeFileControl]::SetText($fileHandle,0x000C,[IntPtr]::Zero,$selected)
          if ($set.ToInt64() -le 0) { throw 'The owned filename control rejected the test destination.' }
        }
      }
      # Open verifies the existing file preselected by the app's current-file
      # default. The caller asserts the returned full path and bytes; no list
      # item or filename in a personal directory is selected by this helper.
      $buttonInvoke=$null
      if ($button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$buttonInvoke)) { $buttonInvoke.Invoke() }
      else { [void][EdiNativeFileControl]::Click($buttonHandle,0x00F5,[IntPtr]::Zero,[IntPtr]::Zero) }
      $completed=$true
      break
    }
  }
  if ($completed) { break }
  Start-Sleep -Milliseconds 100
}
if (!$completed) { throw 'The owned native file dialog did not appear or did not expose its filename control.' }
Write-Output 'Responded to the owned native file dialog using UI Automation.'
