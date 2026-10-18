param(
  [Parameter(Mandatory=$true)][int]$LauncherProcessId,
  [Parameter(Mandatory=$true)][int]$RunnerProcessId,
  [Parameter(Mandatory=$true)][string]$SuiteProfile
)
$ErrorActionPreference='Stop'
$profilePath=[IO.Path]::GetFullPath($SuiteProfile)
$temporary=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
if (!$profilePath.StartsWith($temporary,[StringComparison]::OrdinalIgnoreCase) -or
    $profilePath.Substring($temporary.Length) -notmatch '^edi-native-[^\\]+\\edipdf\\suite$') {
  throw 'Refusing to terminate a process outside an isolated EdiPDF fixture profile.'
}
$owned=Get-CimInstance Win32_Process -Filter "ProcessId=$LauncherProcessId"
if (!$owned) { Write-Output 'Owned fixture launcher already exited.'; exit 0 }
$fixture=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'fixtures/native-vault.cjs'))
$application=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../apps/edipdf'))
if ($owned.Name -ne 'cmd.exe' -or $owned.ParentProcessId -ne $RunnerProcessId -or
    !$owned.CommandLine -or $owned.CommandLine.IndexOf($fixture,[StringComparison]::OrdinalIgnoreCase) -lt 0 -or
    $owned.CommandLine.IndexOf($application,[StringComparison]::OrdinalIgnoreCase) -lt 0) {
  throw "Refusing to terminate anything other than this runner's owned EdiPDF fixture launcher."
}
# Failure cleanup only. Preserve the original failure and all profile files for diagnosis.
& (Join-Path $env:SystemRoot 'System32/taskkill.exe') /PID $LauncherProcessId /T /F
if ($LASTEXITCODE -ne 0) { throw 'The owned EdiPDF fixture process tree could not be terminated.' }
