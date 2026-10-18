param([Parameter(Mandatory=$true)][int]$TestProcessId)
$ErrorActionPreference='Stop'
$fixture=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../scripts/edi/fixtures/native-vault.cjs'))
$application=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Add-Type -AssemblyName UIAutomationClient
Add-Type 'using System; using System.Runtime.InteropServices; public class FotoOwnedClose { [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr handle,uint msg,IntPtr w,IntPtr l); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle,out uint process); }'
$deadline=[DateTime]::UtcNow.AddSeconds(15)
while([DateTime]::UtcNow -lt $deadline) {
 $owned=Get-CimInstance Win32_Process -Filter "ProcessId=$TestProcessId"
 if(!$owned){exit 0}
 if(!$owned.CommandLine.Contains($fixture)-or !$owned.CommandLine.Contains($application)){throw 'Unexpected process; refusing to close.'}
 $a=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$TestProcessId)
 $b=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'CommandLink_101')
 $condition=New-Object System.Windows.Automation.AndCondition($a,$b)
 $button=[System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
 if($button) {
   $handle=[IntPtr]$button.Current.NativeWindowHandle;[uint32]$owner=0;[void][FotoOwnedClose]::GetWindowThreadProcessId($handle,[ref]$owner)
   if($owner -ne $TestProcessId){throw 'Unexpected close control owner.'}
   if(![FotoOwnedClose]::PostMessage($handle,0x00F5,[IntPtr]::Zero,[IntPtr]::Zero)){throw 'Owned close control rejected click.'}
   exit 0
 }
 Start-Sleep -Milliseconds 100
}
throw 'Owned native application did not close.'
