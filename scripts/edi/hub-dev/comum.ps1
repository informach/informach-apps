# Partes compartilhadas pelo Hub de desenvolvimento (hub-dev.ps1), pela abertura de uma
# ferramenta (abrir.ps1) e pelo instalador dos atalhos (instalar.ps1). Tudo é calculado a
# partir de onde o repositório está clonado, então serve em qualquer máquina.

$EdiRepo = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$EdiWork = Join-Path $EdiRepo ".cache\edi-work"
$EdiRegistros = Join-Path $EdiWork "registros"
$EdiBackups = Join-Path $env:USERPROFILE "Edi-backups"

$EdiFerramentas = @(
  [pscustomobject]@{ Id = "ediaula"; Nome = "EdiAula"; Descricao = "Aulas em vídeo: gravação, edição e exportação" }
  [pscustomobject]@{ Id = "edicaptura"; Nome = "EdiCaptura"; Descricao = "Captura de tela, gravação e anotações" }
  [pscustomobject]@{ Id = "edifoto"; Nome = "EdiFoto"; Descricao = "Edição de imagens" }
  [pscustomobject]@{ Id = "edipdf"; Nome = "EdiPDF"; Descricao = "Edição e organização de PDFs" }
  [pscustomobject]@{ Id = "edisvg"; Nome = "EdiSVG"; Descricao = "Criação e animação vetorial" }
  [pscustomobject]@{ Id = "ediplayer"; Nome = "EdiPlayer"; Descricao = "Player de vídeo com cortes, junções e conversões" }
)

function Get-EdiIcone([string]$Id) {
  Join-Path $EdiRepo "apps\$Id\resources\icon.ico"
}

function Get-EdiRegistro([string]$Id) {
  Join-Path $EdiRegistros "$Id.log"
}

# Processo que está com a ferramenta aberta (trava do `pnpm edi:work`), ou $null.
function Get-EdiAberta([string]$Id) {
  $trava = Join-Path $EdiRepo ".cache\edi-open\$Id.pid"
  if (-not (Test-Path $trava)) { return $null }
  $processo = 0
  if (-not [int]::TryParse((Get-Content $trava -Raw).Trim(), [ref]$processo)) { return $null }
  Get-Process -Id $processo -ErrorAction SilentlyContinue
}

# Arquivo de código mudado depois que a ferramenta aberta foi compilada (o `pnpm edi:work`
# grava em .cache\edi-open\<ferramenta>.stale), ou $null quando ela está em dia.
function Get-EdiDesatualizada([string]$Id) {
  $marca = Join-Path $EdiRepo ".cache\edi-open\$Id.stale"
  if (-not (Test-Path $marca)) { return $null }
  try { (Get-Content $marca -Raw).Trim() } catch { $null }
}

# Pede ao `pnpm edi:work` que feche a ferramenta pelo caminho normal (app.quit) e espera até
# $Segundos. Devolve $false se ela continuar aberta: pedindo para salvar, por exemplo, ou aberta
# por uma versão do `edi:work` anterior a este pedido.
function Close-EdiFerramenta([string]$Id, [int]$Segundos = 60) {
  if (-not (Get-EdiAberta $Id)) { return $true }
  Set-Content -Path (Join-Path $EdiRepo ".cache\edi-open\$Id.stop") -Value "" -Encoding ascii
  $limite = (Get-Date).AddSeconds($Segundos)
  while ((Get-Date) -lt $limite) {
    if (-not (Get-EdiAberta $Id)) { return $true }
    Start-Sleep -Milliseconds 500
  }
  Remove-Item (Join-Path $EdiRepo ".cache\edi-open\$Id.stop") -ErrorAction SilentlyContinue
  $false
}

# Gravações e vídeos dos projetos do EdiAula: quase todo o tamanho da pasta, e não mudam
# depois de gravados.
$EdiMidia = @("*.wav", "*.mp4", "*.webm", "*.mov", "*.mkv", "*.mp3", "*.m4a", "*.aac", "*.ogg", "*.flac")

# Backup do perfil da ferramenta (e dos projetos do EdiAula), no máximo um por dia.
# - A pasta do dia (<ferramenta>\<data>) tem o perfil e os arquivos de projeto, sem a mídia:
#   guarda as 10 mais recentes.
# - A mídia do EdiAula vai para uma cópia só (<ferramenta>\midia), que recebe os arquivos novos ou
#   mudados e nunca apaga: um vídeo apagado do projeto continua lá. Copiar ~10 GB todo dia
#   segurava a abertura por minutos.
# - Ficam de fora os caches do Chromium, o motor de transcrição (baixado de novo) e arquivos acima
#   de 200 MB.
# Só conta como feito quando termina (o arquivo .concluido): um backup interrompido continua na
# próxima abertura, e o robocopy pula o que já foi copiado.
function Backup-EdiFerramenta([string]$Id) {
  $pasta = Join-Path $EdiBackups $Id
  $destino = Join-Path $pasta (Get-Date -Format "yyyy-MM-dd")
  $concluido = Join-Path $destino ".concluido"
  if (Test-Path $concluido) { return $null }
  $caches = @(
    "Cache", "Code Cache", "GPUCache", "GPUPersistentCache", "GrShaderCache", "ShaderCache",
    "DawnGraphiteCache", "DawnWebGPUCache", "Shared Dictionary", "VideoDecodeStats", "whisper",
    "Crashpad", "logs"
  )
  $comum = @("/E", "/MAX:209715200", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP")
  # Cada cópia: origem, destino, arquivos (vazio = todos) e opções a mais.
  $copias = @()
  $perfil = Join-Path $env:APPDATA $Id
  if (Test-Path $perfil) {
    $copias += , @($perfil, (Join-Path $destino "perfil"), @(), (@("/XD") + $caches))
  }
  if ($Id -eq "ediaula") {
    $projetos = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "EdiAula\Projetos"
    if (Test-Path $projetos) {
      $copias += , @($projetos, (Join-Path $destino "Projetos"), @(), (@("/XF") + $EdiMidia + @("/XD") + $caches))
      $copias += , @($projetos, (Join-Path $pasta "midia\Projetos"), $EdiMidia, (@("/XD") + $caches))
    }
  }
  if (-not $copias.Count) { return $null }
  foreach ($copia in $copias) {
    $argumentos = @($copia[0], $copia[1]) + $copia[2] + $comum + $copia[3]
    & robocopy @argumentos | Out-Null
    # Robocopy: 0 a 7 são sucesso; 8 ou mais, falha.
    if ($LASTEXITCODE -ge 8) { throw "o backup de $($copia[0]) falhou (robocopy $LASTEXITCODE)" }
  }
  New-Item -ItemType Directory -Force $destino | Out-Null
  Set-Content -Path $concluido -Value (Get-Date -Format "o") -Encoding ascii
  Get-ChildItem $pasta -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' } |
    Sort-Object Name -Descending | Select-Object -Skip 10 | Remove-Item -Recurse -Force
  $destino
}
