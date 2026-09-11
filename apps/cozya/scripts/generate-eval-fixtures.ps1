# Deterministic, original test artwork. Windows System.Drawing; no downloaded recipe content.
Add-Type -AssemblyName System.Drawing
$fixtureRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../src/ai/recipe-parser/evals/fixtures'))
[IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null
$pages = @(
  @{File='image-001-receita-livro.jpg'; Font='Georgia'; Text="OMELETE SIMPLES`nRendimento: 1 porção`n`nIngredientes`n2 ovos`n1 colher de chá de azeite`nsal a gosto`n`nPreparo`nBata os ovos com o sal.`nAqueça o azeite em uma frigideira.`nDespeje os ovos e cozinhe dos dois lados`naté ficarem firmes, sem partes líquidas."},
  @{File='image-002-manuscrito-caderno.jpg'; Font='Segoe Print'; Text="Panqueca de frigideira`nRende 2 porções`n`n1 xícara de farinha de trigo`n1/2 xícara de leite`n1 ovo`n1 colher de chá de óleo`n`nMisture farinha, leite e ovo.`nAqueça o óleo na frigideira.`nDespeje pequenas porções de massa.`nCozinhe dos dois lados até firmar."},
  @{File='image-003-screenshot-blog.png'; Font='Arial'; Text="CADERNO DE TESTES COZYA`nArroz do dia`n4 porções`n`nIngredientes`n1 xícara de arroz`n2 xícaras de água`n1 colher de chá de sal`n`nComo preparar`nColoque o arroz, a água e o sal na panela.`nLeve ao fogo e espere ferver.`nAbaixe o fogo e tampe parcialmente.`nCozinhe até a água secar e o arroz amaciar."},
  @{File='image-005-cortada.png'; Font='Georgia'; Text="BOLO - PÁGINA DANIFICADA`nIngredientes`n[quantidade cortada] g de farinha`n2 ovos`n100 ml de leite`n[quantidade cortada] g de açúcar`n`nMisture os ingredientes.`nAsse a 180 °C até firmar."}
)
foreach ($page in $pages) {
  $bitmap = [Drawing.Bitmap]::new(1200, 1300)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $font = [Drawing.Font]::new($page.Font, 25)
  try {
    $graphics.Clear([Drawing.Color]::FromArgb(251, 247, 236))
    $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.DrawString($page.Text, $font, [Drawing.Brushes]::MidnightBlue, [Drawing.RectangleF]::new(60, 60, 1080, 1160))
    $format = if ($page.File.EndsWith('.png')) { [Drawing.Imaging.ImageFormat]::Png } else { [Drawing.Imaging.ImageFormat]::Jpeg }
    $bitmap.Save((Join-Path $fixtureRoot $page.File), $format)
  } finally { $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
}
$landscape = [Drawing.Bitmap]::new(900, 600)
$canvas = [Drawing.Graphics]::FromImage($landscape)
try {
  $canvas.Clear([Drawing.Color]::SkyBlue)
  $canvas.FillEllipse([Drawing.Brushes]::Gold, 640, 40, 120, 120)
  $canvas.FillEllipse([Drawing.Brushes]::ForestGreen, -150, 300, 950, 600)
  $canvas.FillEllipse([Drawing.Brushes]::DarkGreen, 400, 340, 800, 600)
  $landscape.Save((Join-Path $fixtureRoot 'image-004-foto-paisagem.jpg'), [Drawing.Imaging.ImageFormat]::Jpeg)
} finally { $canvas.Dispose(); $landscape.Dispose() }
Write-Output 'Generated 5 original synthetic fixtures.'
