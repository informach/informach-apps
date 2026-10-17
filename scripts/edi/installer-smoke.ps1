param(
  [Parameter(Mandatory=$true)][string]$Installer,
  [Parameter(Mandatory=$true)][string]$AppId,
  [Parameter(Mandatory=$true)][string]$ProductName,
  [Parameter(Mandatory=$true)][string]$Version,
  [Parameter(Mandatory=$true)][string]$Sha512
)
. (Join-Path $PSScriptRoot 'installer-test-common.ps1')
Assert-IsolatedInstallerRunner
Assert-InstallerDigest $Installer $Sha512
$target = Join-Path $env:LOCALAPPDATA "Programs/Edi/$ProductName/$ProductName.exe"
if (Test-Path -LiteralPath $target) { throw 'Initial-install smoke requires a fresh disposable runner profile.' }
$sentinels = New-PreservationSentinels $AppId
Invoke-TestInstaller $Installer
Assert-InstalledVersion $target $Version
$process = Start-VerifiedApplication $target
Stop-TestApplication $process
Assert-PreservedSentinels $sentinels
Uninstall-TestApplication $target $ProductName
Assert-PreservedSentinels $sentinels
Write-Output "Verified signed installation, anonymous access gate and uninstall preserving user files: $AppId $Version"
