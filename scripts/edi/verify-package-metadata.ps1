param(
  [Parameter(Mandatory=$true)][string]$Target,
  [Parameter(Mandatory=$true)][string]$Version
)
. (Join-Path $PSScriptRoot 'installer-test-common.ps1')
# Read-only preflight on the already inventoried package; no EXE is executed.
Assert-InstalledVersion $Target $Version
Write-Output "Verified executable version and packaged notices: $Version"
