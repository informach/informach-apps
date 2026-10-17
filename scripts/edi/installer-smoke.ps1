param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][ValidateSet('edi-hub','ediaula','edicaptura','edifoto','edipdf','edisvg')][string]$AppId,[Parameter(Mandatory=$true)][string]$Version,[Parameter(Mandatory=$true)][string]$Sha512)
$ErrorActionPreference='Stop'
if ($env:CI -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Installer smoke is restricted to an isolated Windows CI runner.' }
$names=@{'edi-hub'='Edi Hub';ediaula='EdiAula';edicaptura='EdiCaptura';edifoto='EdiFoto';edipdf='EdiPDF';edisvg='EdiSVG'}
$name=$names[$AppId]
$hash=[System.Security.Cryptography.SHA512]::Create()
$stream=[IO.File]::OpenRead($Installer)
try { $actualHash=[Convert]::ToBase64String($hash.ComputeHash($stream)) } finally { $stream.Dispose(); $hash.Dispose() }
if ($actualHash -cne $Sha512) { throw 'Installer does not match the verified build artifact.' }
$setup=Start-Process -FilePath $Installer -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden
if ($setup.ExitCode -ne 0) { throw "Installer failed: $($setup.ExitCode)" }
$target=Join-Path $env:LOCALAPPDATA "Programs\Edi\$name\$name.exe"
$binary=Get-Item -LiteralPath $target
if ($binary.VersionInfo.ProductVersion.Split('+')[0] -ne $Version) { throw 'Installed version mismatch.' }
# Startup verifies our signed installation inventory before exposing any UI.
Add-Type -AssemblyName UIAutomationClient
$process=Start-Process -FilePath $target -ArgumentList '--force-renderer-accessibility' -PassThru -WindowStyle Hidden
try {
  if (!$process.WaitForInputIdle(60000)) { throw 'Application did not reach input readiness.' }
  $deadline=[DateTime]::UtcNow.AddSeconds(60)
  $ready=$false
  while ([DateTime]::UtcNow -lt $deadline) {
    $process.Refresh()
    if ($process.HasExited) { throw 'Application exited before access validation.' }
    if ($process.MainWindowHandle -ne 0) {
      $root=[System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
      $condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)
      $buttons=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition)
      foreach ($button in $buttons) { if ($button.Current.Name -match 'Conectar (conta|minha conta)') { $ready=$true; break } }
    }
    if ($ready) { break }
    # Condition-based UI Automation polling, not a guessed application-start delay.
    Start-Sleep -Milliseconds 200
  }
  if (!$ready) { throw 'The verified application did not display its account access gate.' }
} finally {
  $process.Refresh()
  if (!$process.HasExited) { [void]$process.CloseMainWindow(); [void]$process.WaitForExit(15000) }
}
Write-Output "Pilot installation and unauthenticated access gate verified: $AppId $Version"
