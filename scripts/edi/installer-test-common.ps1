Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-IsolatedInstallerRunner {
  if ($env:CI -ne 'true' -or $env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'Installer verification is restricted to disposable GitHub-hosted Windows runners.'
  }
}

function Assert-InstallerDigest([string]$Installer, [string]$Sha512) {
  $hash = [System.Security.Cryptography.SHA512]::Create()
  $stream = [IO.File]::OpenRead($Installer)
  try { $actual = [Convert]::ToBase64String($hash.ComputeHash($stream)) } finally { $stream.Dispose(); $hash.Dispose() }
  if ($actual -cne $Sha512) { throw 'Installer does not match the verified build artifact.' }
}

function Invoke-TestInstaller([string]$Installer) {
  $setup = Start-Process -FilePath $Installer -ArgumentList '/S' -PassThru -WindowStyle Hidden
  if (!$setup.WaitForExit(120000)) { throw 'Installer did not exit within two minutes.' }
  if ($setup.ExitCode -ne 0) { throw "Installer failed: $($setup.ExitCode)" }
}

function Assert-InstalledVersion([string]$Target, [string]$Version) {
  $binary = Get-Item -LiteralPath $Target
  # electron-builder preserves the complete SemVer in FileVersion. ProductVersion
  # is the numeric Windows resource (e.g. 0.0.0.0 for both beta.1 and beta.2).
  if ($binary.VersionInfo.FileVersion -cne $Version) {
    throw "Installed version mismatch: expected $Version, found $($binary.VersionInfo.FileVersion)."
  }
  $directory = Split-Path -Parent $Target
  foreach ($notice in @('LICENSE.electron.txt', 'LICENSES.chromium.html', 'resources/THIRD-PARTY-NOTICES.txt')) {
    $path = Join-Path $directory $notice
    if (!(Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item -LiteralPath $path).Length -eq 0) {
      throw "Packaged notice is missing: $notice"
    }
  }
}

function Start-VerifiedApplication([string]$Target) {
  Add-Type -AssemblyName UIAutomationClient
  $process = Start-Process -FilePath $Target -ArgumentList '--force-renderer-accessibility' -PassThru -WindowStyle Hidden
  try {
    if (!$process.WaitForInputIdle(60000)) { throw 'Application did not reach input readiness.' }
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while ([DateTime]::UtcNow -lt $deadline) {
      $process.Refresh()
      if ($process.HasExited) { throw 'Application exited before access validation.' }
      if ($process.MainWindowHandle -ne 0) {
        $root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
        $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
        $buttons = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
        foreach ($button in $buttons) {
          if ($button.Current.Name -match 'Conectar (conta|minha conta)') { return $process }
        }
      }
      # Poll the actual accessibility condition instead of assuming a startup delay.
      Start-Sleep -Milliseconds 200
    }
    throw 'The verified application did not display its account access gate.'
  } catch {
    $startupFailure = $_
    [Console]::Error.WriteLine("Application startup failed: $($startupFailure.Exception.Message)")
    Write-ApplicationDiagnostics $process
    try { Stop-TestApplication $process } catch {
      [Console]::Error.WriteLine("Application cleanup also failed: $($_.Exception.Message)")
    }
    throw $startupFailure
  }
}

function Write-ApplicationDiagnostics([System.Diagnostics.Process]$Process) {
  try {
    $Process.Refresh()
    [Console]::Error.WriteLine("Application process: id=$($Process.Id), exited=$($Process.HasExited), mainWindow=$($Process.MainWindowHandle), title=$($Process.MainWindowTitle)")
    if ($Process.HasExited) { return }
    Add-Type -AssemblyName UIAutomationClient
    $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $Process.Id)
    $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
    $remaining = 30
    foreach ($window in $windows) {
      $nodes = $window.FindAll([System.Windows.Automation.TreeScope]::Subtree, [System.Windows.Automation.Condition]::TrueCondition)
      foreach ($node in $nodes) {
        if ($remaining -le 0) { break }
        $current = $node.Current
        $name = $current.Name
        if ($name.Length -gt 240) { $name = $name.Substring(0, 240) }
        [Console]::Error.WriteLine("Application UI: type=$($current.ControlType.ProgrammaticName), enabled=$($current.IsEnabled), offscreen=$($current.IsOffscreen), name=$name")
        $remaining--
      }
    }
  } catch {
    [Console]::Error.WriteLine("Application diagnostics failed: $($_.Exception.Message)")
  }
}

function Stop-TestApplication([System.Diagnostics.Process]$Process) {
  $Process.Refresh()
  if (!$Process.HasExited) {
    $requested = $Process.CloseMainWindow()
    if (!$Process.WaitForExit(30000)) {
      Write-ApplicationDiagnostics $Process
      throw "Application refused a normal close (request accepted: $requested); no process was terminated."
    }
  }
}

function New-PreservationSentinels([string]$AppId) {
  $profileDirectory = if ($AppId -eq 'edi-hub') { Join-Path $env:APPDATA 'Informach/Edi/hub' } else { Join-Path $env:APPDATA $AppId }
  $directories = @($profileDirectory, (Join-Path $env:APPDATA 'Informach/Edi/production'), (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Edi upgrade verification'))
  $sentinels = @()
  foreach ($directory in $directories) {
    [void][IO.Directory]::CreateDirectory($directory)
    $path = Join-Path $directory "upgrade-$AppId-$([guid]::NewGuid()).sentinel"
    [IO.File]::WriteAllText($path, "Preserve existing user bytes $([guid]::NewGuid())", [Text.Encoding]::UTF8)
    $sentinels += @{ Path = $path; Hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }
  }
  return $sentinels
}

function Assert-PreservedSentinels($Sentinels) {
  foreach ($sentinel in $Sentinels) {
    if (!(Test-Path -LiteralPath $sentinel.Path -PathType Leaf) -or (Get-FileHash -LiteralPath $sentinel.Path -Algorithm SHA256).Hash -cne $sentinel.Hash) {
      throw 'Installer changed or deleted a preexisting profile/project sentinel.'
    }
  }
}

function Uninstall-TestApplication([string]$Target, [string]$ProductName) {
  $directory = Split-Path -Parent $Target
  $uninstaller = Join-Path $directory "Uninstall $ProductName.exe"
  if (!(Test-Path -LiteralPath $uninstaller -PathType Leaf)) { throw 'Installed uninstaller is missing.' }
  Invoke-TestInstaller $uninstaller
  # NSIS delegates to a temporary executable. Wait for the whole installation
  # directory so a subsequent installer cannot race the old resource cleanup.
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  while (Test-Path -LiteralPath $directory) {
    if ([DateTime]::UtcNow -gt $deadline) { throw 'Uninstall did not remove the installation directory.' }
    Start-Sleep -Milliseconds 200
  }
}
