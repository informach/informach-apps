$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$exe = Join-Path $projectRoot "release\EdiSVG-$($package.version)-win32-x64\EdiSVG.exe"
if (-not (Test-Path -LiteralPath $exe)) { throw 'Execute npm run package antes de criar o atalho.' }
$shortcutPath = Join-Path $projectRoot 'EdiSVG.lnk'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
$shortcut.TargetPath = $exe
$shortcut.WorkingDirectory = Split-Path -Parent $exe
$shortcut.Description = 'EdiSVG — estúdio de animação SVG'
$shortcut.Save()
Write-Output "Atalho criado no projeto: $shortcutPath"
