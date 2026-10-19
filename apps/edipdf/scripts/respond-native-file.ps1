param(
  [Parameter(Mandatory=$true)][int]$TestProcessId,
  [Parameter(Mandatory=$true)][ValidateSet('Save','Open','Folder','Cancel')][string]$Action,
  [string]$SelectedPath
)
$ErrorActionPreference='Stop'
$owned=Get-CimInstance Win32_Process -Filter "ProcessId=$TestProcessId"
$fixture=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../scripts/edi/fixtures/native-vault.cjs'))
$application=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$owned -or !$owned.CommandLine.Contains($fixture) -or !$owned.CommandLine.Contains($application)) {
  throw 'Refusing to interact with a process other than the owned EdiPDF test fixture.'
}
if ($Action -ne 'Cancel') {
  $selected=[IO.Path]::GetFullPath($SelectedPath)
  $temporary=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
  if (!$selected.StartsWith($temporary,[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing a file outside the disposable test directory.'
  }
  $relative=$selected.Substring($temporary.Length)
  $allowed=if ($Action -eq 'Folder') { '^edi-native-[^\\]+\\edipdf-output$' } elseif ($Action -eq 'Open') { '^edi-native-[^\\]+\\edipdf\\user-data\\documents\\(?:audit\.pdf|font-editor\.pdf|group-editor\.pdf|redact-search\.pdf|forms-(?:authoring|choice)\.pdf|paragraph-(?:editor|reopen)\.pdf|local-font\.ttf|batch-many\.pdf|split-strategies\.pdf|decorations(?:-reopen)?\.pdf|signature-editor\.pdf|signature-image\.png|readonly(?:-denied|-many)?\.pdf|office\.docx|scan\.tif|rich\.rtf|open\.(?:odt|ods|pptx|odp))$' } else { '^edi-native-[^\\]+\\edipdf-(?:(?:compressed|recovered|merged|custom-font|form-objects|passwords|decorations|signature|textbox|cropped|redacted-search|forms-(?:font-order|choice)|booklet|tiff-import|rtf-import|odt-import|ods-import|pptx-import|odp-import)\.pdf|converted\.(?:pdf|docx|txt)|exported\.(?:tif|rtf|odt|xlsx|ods|csv|json|pptx|odp))$' }
  if ($relative -notmatch $allowed) {
    throw 'Refusing a file outside the exact disposable EdiPDF test destination.'
  }
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public static class EdiNativeFileControl {
  [StructLayout(LayoutKind.Sequential)] private struct Rect { public int left,top,right,bottom; }
  [StructLayout(LayoutKind.Sequential)] private struct ComboInfo { public uint cbSize; public Rect item,button; public uint state; public IntPtr combo,edit,list; }
  [DllImport("user32.dll")] private static extern bool GetComboBoxInfo(IntPtr combo,ref ComboInfo info);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")] private static extern IntPtr GetText(IntPtr edit,uint message,IntPtr count,StringBuilder value);
  public static string ReadText(IntPtr edit) { var value=new StringBuilder(32768);GetText(edit,0x000D,(IntPtr)32768,value);return value.ToString(); }
  public static IntPtr EditablePart(IntPtr combo,uint process) {
    var info=new ComboInfo();info.cbSize=(uint)Marshal.SizeOf(typeof(ComboInfo));
    if(!GetComboBoxInfo(combo,ref info))return IntPtr.Zero;
    uint owner;GetWindowThreadProcessId(info.edit,out owner);var name=new StringBuilder(256);GetClassName(info.edit,name,256);
    return owner==process&&name.ToString()=="Edit"?info.edit:IntPtr.Zero;
  }

  [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumWindow callback, IntPtr parameter);
  [DllImport("user32.dll")] private static extern int GetDlgCtrlID(IntPtr handle);
  private delegate bool EnumWindow(IntPtr handle, IntPtr parameter);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindow callback, IntPtr parameter);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr handle, StringBuilder value, int maximum);
  public static IntPtr FilenameEdit(IntPtr parent,uint process,int id) {
    IntPtr found=IntPtr.Zero;
    EnumChildWindows(parent,(handle,parameter)=>{uint owner;GetWindowThreadProcessId(handle,out owner);var name=new StringBuilder(256);GetClassName(handle,name,256);if(owner==process&&GetDlgCtrlID(handle)==id&&name.ToString()=="Edit"){found=handle;return false;}return true;},IntPtr.Zero);
    return found;
  }
  public static string[] OwnedControls(uint process) {
    var results=new List<string>();
    EnumWindows((handle,parameter)=>{uint owner;GetWindowThreadProcessId(handle,out owner);if(owner==process){var text=new StringBuilder(256);GetClassName(handle,text,256);results.Add(text.ToString()+":"+GetDlgCtrlID(handle));EnumChildWindows(handle,(child,p)=>{uint childOwner;GetWindowThreadProcessId(child,out childOwner);if(childOwner==process){var name=new StringBuilder(256);GetClassName(child,name,256);results.Add(name.ToString()+":"+GetDlgCtrlID(child));}return true;},IntPtr.Zero);}return true;},IntPtr.Zero);
    return results.ToArray();
  }
  public static IntPtr[] Dialogs(uint process) {
    var results=new List<IntPtr>();
    EnumWindows((handle,parameter)=>{uint owner;GetWindowThreadProcessId(handle,out owner);var text=new StringBuilder(256);GetClassName(handle,text,256);if(owner==process&&text.ToString()=="#32770")results.Add(handle);return true;},IntPtr.Zero);
    return results.ToArray();
  }

  [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")]
  public static extern IntPtr SetText(IntPtr window, uint message, IntPtr wparam, string text);
  [DllImport("user32.dll", EntryPoint="SendMessageW")]
  public static extern IntPtr Click(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
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
  $windows=[EdiNativeFileControl]::Dialogs($TestProcessId)
  foreach ($windowHandle in $windows) {
    $window=[System.Windows.Automation.AutomationElement]::FromHandle($windowHandle)
    $buttonId=if ($Action -eq 'Cancel') {'2'} else {'1'}
    $buttonIdentity=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,$buttonId)
    $buttonClass=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty,'Button')
    $buttonCondition=New-Object System.Windows.Automation.AndCondition($buttonIdentity,$buttonClass)
    $button=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$buttonCondition)
    $fileId=if ($Action -eq 'Folder') {'1152'} else {'1001'}
    $fileIdentity=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,$fileId)
    $fileClass=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty,'Edit')
    $fileCondition=New-Object System.Windows.Automation.AndCondition($fileIdentity,$fileClass)
    $file=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$fileCondition)
    if (!$file) {
      $fileIdentity=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1148')
      $fileClass=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty,'ComboBox')
      $fileCondition=New-Object System.Windows.Automation.AndCondition($fileIdentity,$fileClass)
      $file=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$fileCondition)
    }
    $nativeEdit=[EdiNativeFileControl]::FilenameEdit($windowHandle,$TestProcessId,[int]$fileId)
    if ($nativeEdit -eq [IntPtr]::Zero) { $nativeEdit=[EdiNativeFileControl]::FilenameEdit($windowHandle,$TestProcessId,1148) }
    if ($nativeEdit -ne [IntPtr]::Zero) { $file=[System.Windows.Automation.AutomationElement]::FromHandle($nativeEdit) }
    if ($file -and $file.Current.ClassName -eq 'ComboBox') {
      $editable=[EdiNativeFileControl]::EditablePart([IntPtr]$file.Current.NativeWindowHandle,$TestProcessId)
      if ($editable -ne [IntPtr]::Zero) { $file=[System.Windows.Automation.AutomationElement]::FromHandle($editable) }
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
      if ($Action -ne 'Cancel') {
        if ($file.Current.ClassName -ne 'Edit' -and (!$hasValue -or $Action -eq 'Save')) { [EdiNativeFileControl]::OwnedControls($TestProcessId) | ConvertTo-Json -Compress | Write-Output; throw 'The owned filename control does not support a verified selection.' }
        # Common-dialog controls do not consistently expose UIA Value/Invoke.
        # Use their documented Win32 edit/button operations, on verified handles.
        if ($hasValue) { $fileValue.SetValue($selected) }
        else {
          $set=[EdiNativeFileControl]::SetText($fileHandle,0x000C,[IntPtr]::Zero,$selected)
          if ($set.ToInt64() -le 0) { throw 'The owned filename control rejected the test destination.' }
        }
        if (![string]::Equals([EdiNativeFileControl]::ReadText($fileHandle),$selected,[StringComparison]::OrdinalIgnoreCase)) { throw 'The filename control did not retain the exact temporary destination.' }
        Write-Output "Owned EdiPDF filename selection: $([EdiNativeFileControl]::ReadText($fileHandle))"
      }
      # Only exact disposable paths are selected; the caller verifies output bytes.
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
if (!$completed) { [EdiNativeFileControl]::OwnedControls($TestProcessId) | ConvertTo-Json -Compress | Write-Output; throw 'The owned native file dialog did not appear or did not expose its filename control.' }
Write-Output 'Responded to the owned native file dialog using UI Automation.'
