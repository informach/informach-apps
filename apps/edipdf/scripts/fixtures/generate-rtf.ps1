$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$rtfFixtureRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../tests/fixtures/rtf'))
[IO.Directory]::CreateDirectory($rtfFixtureRoot) | Out-Null
$rtfControl=New-Object System.Windows.Forms.RichTextBox
try {
  $rtfControl.Font=New-Object System.Drawing.Font('Arial',11)
  $rtfControl.Text='RTF_LOCAL_'+[char]0x3b1+[char]0x3b2+[char]0x3b3+"`n"+'Jo'+[char]0xe3+'o e caf'+[char]0xe9+"`n"+'ULTIMA_LINHA'
  $rtfControl.Select(0,13)
  $rtfControl.SelectionFont=New-Object System.Drawing.Font('Arial',16,[System.Drawing.FontStyle]::Bold)
  $rtfControl.SelectionColor=[Drawing.Color]::Blue
  $rtfControl.SelectionAlignment=[System.Windows.Forms.HorizontalAlignment]::Center
  $rtfControl.Select($rtfControl.Text.IndexOf('ULTIMA'),$rtfControl.TextLength-$rtfControl.Text.IndexOf('ULTIMA'))
  $rtfControl.SelectionFont=New-Object System.Drawing.Font('Arial',11,[System.Drawing.FontStyle]::Italic)
  $rtfSource=$rtfControl.Rtf
  if (@($rtfSource.ToCharArray() | Where-Object { [int]$_ -gt 127 }).Count -gt 0) { throw 'Fixture writer returned a non-ASCII RTF source' }
  [IO.File]::WriteAllText((Join-Path $rtfFixtureRoot 'richedit.rtf'),$rtfSource,[Text.Encoding]::ASCII)
  [IO.File]::WriteAllText((Join-Path $rtfFixtureRoot 'richedit.txt'),$rtfControl.Text,(New-Object Text.UTF8Encoding($false)))
} finally { $rtfControl.Dispose() }
Write-Output 'Generated independent Windows RichEdit RTF and expected text without using the clipboard.'
