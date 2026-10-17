# Original geometric app glyphs, using each existing UI palette. Existing editor
# icons are preserved. No font glyph or external artwork is required.
Add-Type -AssemblyName System.Drawing
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$designs = @(
  @{ Id='edi-hub'; Background='#20272c'; Foreground='#f1b95b' },
  @{ Id='edicaptura'; Background='#18212b'; Foreground='#5fd0b0' },
  @{ Id='edisvg'; Background='#15171c'; Foreground='#4fe3c1' }
)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
foreach ($design in $designs) {
  $directory = Join-Path $repository "apps/$($design.Id)/resources"
  [void][IO.Directory]::CreateDirectory($directory)
  $images = @()
  foreach ($size in $sizes) {
    $bitmap = New-Object Drawing.Bitmap $size, $size
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = 'AntiAlias'
    $graphics.Clear([Drawing.Color]::Transparent)
    $graphics.ScaleTransform($size / 256, $size / 256)
    $background = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml($design.Background))
    $foreground = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml($design.Foreground))
    $pen = New-Object Drawing.Pen ([Drawing.ColorTranslator]::FromHtml($design.Foreground)), 14
    $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
    $path = New-Object Drawing.Drawing2D.GraphicsPath
    $path.AddArc(8, 8, 72, 72, 180, 90); $path.AddArc(176, 8, 72, 72, 270, 90)
    $path.AddArc(176, 176, 72, 72, 0, 90); $path.AddArc(8, 176, 72, 72, 90, 90); $path.CloseFigure()
    $graphics.FillPath($background, $path)
    if ($design.Id -eq 'edi-hub') {
      foreach ($x in @(60, 138)) { foreach ($y in @(60, 138)) { $graphics.FillRectangle($foreground, $x, $y, 58, 58) } }
    } elseif ($design.Id -eq 'edicaptura') {
      $graphics.DrawLines($pen, [Drawing.PointF[]]@([Drawing.PointF]::new(92, 60), [Drawing.PointF]::new(60, 60), [Drawing.PointF]::new(60, 92)))
      $graphics.DrawLines($pen, [Drawing.PointF[]]@([Drawing.PointF]::new(164, 60), [Drawing.PointF]::new(196, 60), [Drawing.PointF]::new(196, 92)))
      $graphics.DrawLines($pen, [Drawing.PointF[]]@([Drawing.PointF]::new(60, 164), [Drawing.PointF]::new(60, 196), [Drawing.PointF]::new(92, 196)))
      $graphics.DrawLines($pen, [Drawing.PointF[]]@([Drawing.PointF]::new(164, 196), [Drawing.PointF]::new(196, 196), [Drawing.PointF]::new(196, 164)))
      $graphics.FillEllipse($foreground, 100, 100, 56, 56)
    } else {
      $graphics.DrawBezier($pen, 56, 178, 68, 44, 188, 44, 200, 178)
      $pen.Width = 5
      $graphics.DrawLine($pen, 56, 178, 68, 64); $graphics.DrawLine($pen, 200, 178, 188, 64)
      foreach ($point in @(@(44,166), @(188,166), @(56,52), @(176,52))) { $graphics.FillRectangle($foreground, $point[0], $point[1], 24, 24) }
    }
    $stream = New-Object IO.MemoryStream
    $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
    $images += ,$stream.ToArray()
    if ($size -eq 256) { $bitmap.Save((Join-Path $directory 'icon.png'), [Drawing.Imaging.ImageFormat]::Png) }
    $stream.Dispose(); $graphics.Dispose(); $bitmap.Dispose(); $pen.Dispose(); $path.Dispose(); $background.Dispose(); $foreground.Dispose()
  }
  $stream = [IO.File]::Create((Join-Path $directory 'icon.ico'))
  $writer = New-Object IO.BinaryWriter $stream
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
  $offset = 6 + 16 * $sizes.Count
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
    $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
    $offset += $images[$i].Length
  }
  foreach ($imageBytes in $images) { $writer.Write($imageBytes) }
  $writer.Dispose()
  Write-Output "Generated application icon: $($design.Id)"
}
