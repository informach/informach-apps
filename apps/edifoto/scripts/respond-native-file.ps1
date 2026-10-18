param(
  [Parameter(Mandatory=$true)][int]$TestProcessId,
  [Parameter(Mandatory=$true)][ValidateSet('Save','Open','Cancel')][string]$Action,
  [string]$SelectedPath
)
$ErrorActionPreference='Stop'
$owned=Get-CimInstance Win32_Process -Filter "ProcessId=$TestProcessId"
$fixture=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../scripts/edi/fixtures/native-vault.cjs'))
$application=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$owned -or !$owned.CommandLine.Contains($fixture) -or !$owned.CommandLine.Contains($application)) {
  throw 'Refusing to interact with a process other than the owned EdiFoto test fixture.'
}
if ($Action -ne 'Cancel') {
  $selected=[IO.Path]::GetFullPath($SelectedPath)
  $temporary=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
  if (!$selected.StartsWith($temporary,[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing a file outside the disposable test directory.'
  }
  $relative=$selected.Substring($temporary.Length)
  if ($relative -notmatch '^edi-native-[^\\]+\\(?:edifoto-test-project\.edifoto|edifoto-test-export\.png)$') {
    throw 'Refusing a file outside the exact disposable EdiFoto test destination.'
  }
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EdiNativeFileControl {
  [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")]
  public static extern IntPtr SetText(IntPtr window, uint message, IntPtr wparam, string text);
  [DllImport("user32.dll", EntryPoint="SendMessageW")]
  public static extern IntPtr Click(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)]
  public static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string className,string title);
  [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="SendMessageW")]
  public static extern IntPtr ReadText(IntPtr window,uint message,IntPtr capacity,System.Text.StringBuilder text);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
}
'@
$processCondition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$TestProcessId)
$dialogCondition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty,'#32770')
$combined=New-Object System.Windows.Automation.AndCondition($processCondition,$dialogCondition)
$deadline=[DateTime]::UtcNow.AddSeconds(15)
$completed=$false
while ([DateTime]::UtcNow -lt $deadline) {
  $windows=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants,$combined)
  foreach ($window in $windows) {
    $buttonId=if ($Action -eq 'Cancel') {'2'} else {'1'}
    $buttonIdentity=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,$buttonId)
    $buttonClass=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty,'Button')
    $buttonCondition=New-Object System.Windows.Automation.AndCondition($buttonIdentity,$buttonClass)
    $button=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$buttonCondition)
    $fileIdentity=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1148')
    $fileClass=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty,'ComboBox')
    $fileCondition=New-Object System.Windows.Automation.AndCondition($fileIdentity,$fileClass)
    $file=$null
    foreach ($candidate in $window.FindAll([System.Windows.Automation.TreeScope]::Descendants,$fileCondition)) {
      if (!$candidate.Current.IsOffscreen -and $candidate.Current.IsEnabled) { $file=$candidate; break }
    }
    if (!$file) {
      $fileIdentity=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1001')
      $fileClass=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty,'Edit')
      $fileCondition=New-Object System.Windows.Automation.AndCondition($fileIdentity,$fileClass)
      foreach ($candidate in $window.FindAll([System.Windows.Automation.TreeScope]::Descendants,$fileCondition)) {
        if (!$candidate.Current.IsOffscreen -and $candidate.Current.IsEnabled) { $file=$candidate; break }
      }
    }
    if ($button -and !$button.Current.IsOffscreen -and $button.Current.IsEnabled -and $file) {
      if ($Action -eq 'Save') {
        $editType=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit)
        $comboType=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::ComboBox)
        $inputTypes=New-Object System.Windows.Automation.OrCondition($editType,$comboType)
        foreach($inputControl in $window.FindAll([System.Windows.Automation.TreeScope]::Descendants,$inputTypes)) {
          Write-Output "Native input: id=$($inputControl.Current.AutomationId); class=$($inputControl.Current.ClassName); label=$($inputControl.Current.Name); offscreen=$($inputControl.Current.IsOffscreen); focusable=$($inputControl.Current.IsKeyboardFocusable)"
        }
      }
      Write-Output "Owned filename control: $($file.Current.ClassName) $($file.Current.AutomationId)"
      $fileHandle=[IntPtr]$file.Current.NativeWindowHandle
      $buttonHandle=[IntPtr]$button.Current.NativeWindowHandle
      foreach($handle in @($fileHandle,$buttonHandle)) {
        [uint32]$controlOwner=0
        [void][EdiNativeFileControl]::GetWindowThreadProcessId($handle,[ref]$controlOwner)
        if ($controlOwner -ne $TestProcessId) { throw 'The file control belongs to another process.' }
      }
      if ($Action -eq 'Save' -or $Action -eq 'Open') {
        if ($file.Current.ClassName -eq 'ComboBox') {
          $editHandle=[EdiNativeFileControl]::FindWindowEx($fileHandle,[IntPtr]::Zero,'Edit',$null)
          if($editHandle -eq [IntPtr]::Zero) {
            $combo=[EdiNativeFileControl]::FindWindowEx($fileHandle,[IntPtr]::Zero,'ComboBox',$null)
            if($combo -ne [IntPtr]::Zero){$editHandle=[EdiNativeFileControl]::FindWindowEx($combo,[IntPtr]::Zero,'Edit',$null)}
          }
          if($editHandle -eq [IntPtr]::Zero){throw 'Owned filename combo has no native edit control.'}
          $fileHandle=$editHandle
        } elseif($file.Current.ClassName -ne 'Edit'){throw 'Unexpected filename control.'}
        [uint32]$editOwner=0;[void][EdiNativeFileControl]::GetWindowThreadProcessId($fileHandle,[ref]$editOwner)
        if($editOwner -ne $TestProcessId){throw 'Filename edit belongs to another process.'}
        [void][EdiNativeFileControl]::SetText($fileHandle,0x000C,[IntPtr]::Zero,$selected)
        $readback=New-Object System.Text.StringBuilder 4096
        [void][EdiNativeFileControl]::ReadText($fileHandle,0x000D,[IntPtr]4096,$readback)
        if($readback.ToString() -ne $selected){throw 'Owned filename edit did not retain the exact disposable path.'}
      }
      # Only the exact disposable test path can be selected; the caller verifies its bytes.
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
Write-Output "Responded to the owned native file dialog using UI Automation: $Action"
