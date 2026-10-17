param(
  [Parameter(Mandatory=$true)][string]$InstallerA,
  [Parameter(Mandatory=$true)][string]$InstallerB,
  [Parameter(Mandatory=$true)][string]$AppId,
  [Parameter(Mandatory=$true)][string]$ProductName,
  [Parameter(Mandatory=$true)][string]$VersionA,
  [Parameter(Mandatory=$true)][string]$VersionB,
  [Parameter(Mandatory=$true)][string]$Sha512A,
  [Parameter(Mandatory=$true)][string]$Sha512B,
  [Parameter(Mandatory=$true)][string]$ResultFile
)
. (Join-Path $PSScriptRoot 'installer-test-common.ps1')
Assert-IsolatedInstallerRunner
Assert-InstallerDigest $InstallerA $Sha512A
Assert-InstallerDigest $InstallerB $Sha512B
$target = Join-Path $env:LOCALAPPDATA "Programs/Edi/$ProductName/$ProductName.exe"
if (Test-Path -LiteralPath $target) { throw 'Upgrade verification requires a fresh disposable runner profile.' }
$sentinels = New-PreservationSentinels $AppId
$checks = @()
$process = $null
try {
  Invoke-TestInstaller $InstallerA
  Assert-InstalledVersion $target $VersionA
  $process = Start-VerifiedApplication $target
  $checks += 'version-a-installed-and-signed-startup'

  $blocked = Start-Process -FilePath $InstallerB -ArgumentList '/S' -PassThru -WindowStyle Hidden
  if (!$blocked.WaitForExit(60000) -or $blocked.ExitCode -ne 32) { throw 'Manual upgrade did not refuse the running application with exit code 32.' }
  $process.Refresh()
  if ($process.HasExited) { throw 'Manual installer terminated the running application.' }
  Assert-InstalledVersion $target $VersionA
  Assert-PreservedSentinels $sentinels
  $checks += 'manual-upgrade-refused-open-app-without-termination'

  # Prove the --updated wait branch reaches its timeout with the process still
  # open. A short launch delay alone cannot distinguish a wait from unpacking.
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $timedOut = Start-Process -FilePath $InstallerB -ArgumentList @('/S', '--updated') -PassThru -WindowStyle Hidden
  if (!$timedOut.WaitForExit(60000) -or $timedOut.ExitCode -ne 32 -or $timer.Elapsed.TotalSeconds -lt 29) {
    throw 'Updater handoff did not wait for its bounded process-exit timeout.'
  }
  $process.Refresh()
  if ($process.HasExited) { throw 'Timed-out updater terminated the running application.' }
  Assert-InstalledVersion $target $VersionA
  Assert-PreservedSentinels $sentinels
  $checks += 'updater-timeout-preserves-open-application'

  # Use the exact NSIS handoff arguments used by electron-updater. This verifies
  # its wait-for-exit behavior without enabling debug hooks in a packaged app.
  $handoff = Start-Process -FilePath $InstallerB -ArgumentList @('/S', '--updated') -PassThru -WindowStyle Hidden
  if ($handoff.WaitForExit(1500)) { throw 'Updater handoff did not wait for the application to close.' }
  $process.Refresh()
  if ($process.HasExited) { throw 'Updater handoff terminated the running application.' }
  Assert-InstalledVersion $target $VersionA
  Stop-TestApplication $process
  $process = $null
  if (!$handoff.WaitForExit(120000) -or $handoff.ExitCode -ne 0) { throw 'Updater handoff failed after the application closed.' }
  Assert-InstalledVersion $target $VersionB
  Assert-PreservedSentinels $sentinels
  $process = Start-VerifiedApplication $target
  Stop-TestApplication $process
  $process = $null
  $checks += 'version-a-to-b-nsis-updater-handoff-and-signed-startup'

  # A truncated transfer must never be considered executable. Retrying the exact
  # complete artifact below proves recovery without accepting partial bytes.
  $partial = Join-Path $env:RUNNER_TEMP "$AppId-partial-download.exe"
  $sourceStream = [IO.File]::OpenRead($InstallerB)
  try {
    $bytes = New-Object byte[] 65536
    $length = $sourceStream.Read($bytes, 0, $bytes.Length)
    [IO.File]::WriteAllBytes($partial, $bytes[0..($length - 1)])
  } finally { $sourceStream.Dispose() }
  $rejected = $false
  try { Assert-InstallerDigest $partial $Sha512B } catch { $rejected = $true }
  if (!$rejected) { throw 'Truncated download unexpectedly passed verification.' }
  Assert-InstallerDigest $InstallerB $Sha512B
  Invoke-TestInstaller $InstallerB
  Assert-InstalledVersion $target $VersionB
  Assert-PreservedSentinels $sentinels
  $process = Start-VerifiedApplication $target
  Stop-TestApplication $process
  $process = $null
  $checks += 'partial-artifact-rejected-complete-retry-preserves-data'

  Uninstall-TestApplication $target $ProductName
  Assert-PreservedSentinels $sentinels
  $checks += 'uninstall-preserves-profile-shared-vault-and-project-bytes'
  [void][IO.Directory]::CreateDirectory((Split-Path -Parent $ResultFile))
  @{ appId = $AppId; versionA = $VersionA; versionB = $VersionB; checks = $checks; passed = $true } |
    ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ResultFile -Encoding utf8
  Write-Output "Verified Windows installer A-to-B lifecycle: $AppId ($VersionA -> $VersionB)"
} finally {
  if ($null -ne $process) { Stop-TestApplication $process }
}
