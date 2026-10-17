# Windows icons for the Edi Hub and the five tools, in the suite's "bancada e
# marca-texto" family: one highlighter colour per tool, ink glyph, same corner.
# Colours and glyphs mirror packages/config/src/edi-brand.ts (24-unit SVG
# coordinates); change both together. Run from any folder:
#   pwsh -File scripts/edi/make-icons.ps1
Add-Type -AssemblyName System.Drawing
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$ink = '#1B1F24'
$designs = @(
  @{ Id = 'edi-hub'; Background = '#262C33' },
  @{ Id = 'ediaula'; Background = '#C8E64A' },
  @{ Id = 'edicaptura'; Background = '#5ED3B3' },
  @{ Id = 'edifoto'; Background = '#FF8F7E' },
  @{ Id = 'edipdf'; Background = '#8CB6FF' },
  @{ Id = 'edisvg'; Background = '#C2A5FF' }
)
$hubBars = @('#C8E64A', '#5ED3B3', '#FF8F7E', '#8CB6FF', '#C2A5FF')
$sizes = @(16, 24, 32, 48, 64, 128, 256)

function New-RoundedRectangle([single]$x, [single]$y, [single]$width, [single]$height, [single]$radius) {
  $path = New-Object Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}
function Point([single]$x, [single]$y) { return [Drawing.PointF]::new($x, $y) }
# One rounded corner of EdiCaptura: a straight leg, a 1.5-unit arc, another leg.
# GDI+ angles run clockwise from the x axis, as SVG's do with y pointing down.
function New-Corner([single[]]$from, [single[]]$arc, [single]$start, [single[]]$to) {
  $path = New-Object Drawing.Drawing2D.GraphicsPath
  $path.AddLine($from[0], $from[1], $from[2], $from[3])
  $path.AddArc($arc[0], $arc[1], 3, 3, $start, 90)
  $path.AddLine($to[0], $to[1], $to[2], $to[3])
  return $path
}
function Draw-Path($graphics, $pen, $path) {
  $graphics.DrawPath($pen, $path)
  $path.Dispose()
}

function Draw-Glyph($graphics, [string]$id) {
  # The glyph box is 24 units; 7.2 px per unit centres it in the 256 px tile.
  $graphics.TranslateTransform(41.6, 41.6)
  $graphics.ScaleTransform(7.2, 7.2)
  $pen = New-Object Drawing.Pen ([Drawing.ColorTranslator]::FromHtml($ink)), 2
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  switch ($id) {
    'ediaula' {
      $graphics.DrawPolygon($pen, [Drawing.PointF[]]@((Point 2 9.5), (Point 12 5), (Point 22 9.5), (Point 12 14)))
      $graphics.DrawLine($pen, 6, 11.5, 6, 15.7)
      $graphics.DrawBezier($pen, 6, 15.7, 6, 17.2, 8.7, 19, 12, 19)
      $graphics.DrawBezier($pen, 12, 19, 15.3, 19, 18, 17.2, 18, 15.7)
      $graphics.DrawLine($pen, 18, 15.7, 18, 11.5)
      $graphics.DrawLine($pen, 22, 9.5, 22, 14.5)
    }
    'edicaptura' {
      Draw-Path $graphics $pen (New-Corner @(4, 8.5, 4, 5.5) @(4, 4) 180 @(5.5, 4, 8.5, 4))
      Draw-Path $graphics $pen (New-Corner @(15.5, 4, 18.5, 4) @(17, 4) 270 @(20, 5.5, 20, 8.5))
      Draw-Path $graphics $pen (New-Corner @(20, 15.5, 20, 18.5) @(17, 17) 0 @(18.5, 20, 15.5, 20))
      Draw-Path $graphics $pen (New-Corner @(8.5, 20, 5.5, 20) @(4, 17) 90 @(4, 18.5, 4, 15.5))
      $graphics.DrawEllipse($pen, 9.2, 9.2, 5.6, 5.6)
    }
    'edifoto' {
      $graphics.DrawEllipse($pen, 3.5, 6.5, 11, 11)
      $graphics.DrawEllipse($pen, 9.5, 6.5, 11, 11)
    }
    'edipdf' {
      # Page with three 1.5-unit rounded corners and the folded one cut straight.
      $page = New-Object Drawing.Drawing2D.GraphicsPath
      $page.AddLine(14, 3, 7.5, 3)
      $page.AddArc(6, 3, 3, 3, 270, -90)
      $page.AddLine(6, 4.5, 6, 19.5)
      $page.AddArc(6, 18, 3, 3, 180, -90)
      $page.AddLine(7.5, 21, 16.5, 21)
      $page.AddArc(15, 18, 3, 3, 90, -90)
      $page.AddLine(18, 19.5, 18, 7)
      $page.CloseFigure()
      Draw-Path $graphics $pen $page
      $graphics.DrawLines($pen, [Drawing.PointF[]]@((Point 14 3), (Point 14 7), (Point 18 7)))
    }
    'edisvg' {
      $graphics.DrawBezier($pen, 5, 18, 5, 9, 19, 9, 19, 18)
      $graphics.DrawLine($pen, 5, 17, 7.3, 7.5)
      $graphics.DrawLine($pen, 19, 17, 16.7, 7.5)
      Draw-Path $graphics $pen (New-RoundedRectangle 3 17 4 4 1)
      Draw-Path $graphics $pen (New-RoundedRectangle 17 17 4 4 1)
      Draw-Path $graphics $pen (New-RoundedRectangle 6 4 3 3 0.8)
      Draw-Path $graphics $pen (New-RoundedRectangle 15 4 3 3 0.8)
    }
  }
  $pen.Dispose()
}

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
    $tile = New-RoundedRectangle 8 8 240 240 56
    $background = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml($design.Background))
    $graphics.FillPath($background, $tile)
    if ($design.Id -eq 'edi-hub') {
      for ($index = 0; $index -lt $hubBars.Count; $index++) {
        $bar = New-RoundedRectangle (33.5 + $index * 40.5) 77.5 27 101 6
        $brush = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml($hubBars[$index]))
        $graphics.FillPath($brush, $bar)
        $brush.Dispose(); $bar.Dispose()
      }
    } else {
      Draw-Glyph $graphics $design.Id
    }
    $stream = New-Object IO.MemoryStream
    $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
    $images += , $stream.ToArray()
    if ($size -eq 256) { $bitmap.Save((Join-Path $directory 'icon.png'), [Drawing.Imaging.ImageFormat]::Png) }
    $stream.Dispose(); $graphics.Dispose(); $bitmap.Dispose(); $tile.Dispose(); $background.Dispose()
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
