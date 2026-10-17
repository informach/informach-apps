param(
  [Parameter(Mandatory=$true)][string]$Electron,
  [Parameter(Mandatory=$true)][string]$Fixture,
  [Parameter(Mandatory=$true)][string]$Profile
)
. (Join-Path $PSScriptRoot 'installer-test-common.ps1')
# Start-Process joins ArgumentList into a native command line. Quote each fixture
# path so profiles and checkouts containing spaces exercise the same launcher.
$process = Start-VerifiedApplication $Electron @("`"$Fixture`"", "`"$Profile`"")
Stop-TestApplication $process
Write-Output 'Verified visible GUI startup, account gate through UI Automation and normal close'
