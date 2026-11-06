# Instala o Hub de desenvolvimento da suíte Edi neste computador: `pnpm edi:work:instalar`.
#
# Cria na Área de Trabalho e no menu Iniciar (pasta "Edi (desenvolvimento)") o atalho do Hub e
# um atalho por ferramenta, apontando para este clone do repositório. Pode rodar de novo a
# qualquer momento (por exemplo, depois de mover o repositório): os atalhos são refeitos.
# Faz também o primeiro backup dos perfis e dos projetos. `-Remover` apaga só os atalhos que
# este script cria; perfis, projetos e backups ficam.
param([switch]$Remover)
. (Join-Path $PSScriptRoot "comum.ps1")
$ErrorActionPreference = "Stop"

$areaDeTrabalho = [Environment]::GetFolderPath("Desktop")
$menu = Join-Path ([Environment]::GetFolderPath("Programs")) "Edi (desenvolvimento)"
$hubNome = "Edi Hub (desenvolvimento).lnk"
$nomes = @($hubNome) + ($EdiFerramentas | ForEach-Object { "$($_.Nome) (dev).lnk" })

if ($Remover) {
  foreach ($nome in $nomes) {
    $atalho = Join-Path $areaDeTrabalho $nome
    if (Test-Path $atalho) { Remove-Item $atalho; Write-Host "Removido: $atalho" }
  }
  if (Test-Path $menu) { Remove-Item $menu -Recurse; Write-Host "Removido: $menu" }
  return
}

foreach ($comando in "node", "pnpm", "git") {
  if (-not (Get-Command $comando -ErrorAction SilentlyContinue)) {
    throw "$comando não foi encontrado. Instale Node 24.15.0, pnpm 9.15.0 e Git (veja docs/desenvolvimento-edi.md) e rode de novo."
  }
}
if (-not (Test-Path (Join-Path $EdiRepo "node_modules"))) {
  Write-Host "Instalando as dependências do repositório (pnpm install)..."
  Push-Location $EdiRepo
  try { & pnpm install --frozen-lockfile; if ($LASTEXITCODE) { throw "pnpm install falhou" } }
  finally { Pop-Location }
}

Write-Host "Fazendo o primeiro backup dos perfis e projetos em $EdiBackups..."
foreach ($ferramenta in $EdiFerramentas) {
  $backup = Backup-EdiFerramenta $ferramenta.Id
  if ($backup) { Write-Host "  $($ferramenta.Nome): $backup" }
}

$shell = New-Object -ComObject WScript.Shell
$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
function Novo-Atalho([string]$Pasta, [string]$Nome, [string]$Script, [string]$Argumentos, [string]$Icone, [string]$Descricao) {
  New-Item -ItemType Directory -Force $Pasta | Out-Null
  $caminho = Join-Path $Pasta $Nome
  $atalho = $shell.CreateShortcut($caminho)
  $atalho.TargetPath = $powershell
  $atalho.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Script`" $Argumentos".Trim()
  $atalho.WorkingDirectory = $EdiRepo
  $atalho.WindowStyle = 7
  $atalho.Description = $Descricao
  if (Test-Path $Icone) { $atalho.IconLocation = "$Icone,0" }
  $atalho.Save()
  $caminho
}

$criados = @()
foreach ($pasta in $areaDeTrabalho, $menu) {
  $criados += Novo-Atalho $pasta $hubNome (Join-Path $PSScriptRoot "hub-dev.ps1") "" (Get-EdiIcone "edi-hub") "Ferramentas Edi compiladas do código deste computador"
  foreach ($ferramenta in $EdiFerramentas) {
    $criados += Novo-Atalho $pasta "$($ferramenta.Nome) (dev).lnk" (Join-Path $PSScriptRoot "abrir.ps1") "-Ferramenta $($ferramenta.Id) -Avisar" (Get-EdiIcone $ferramenta.Id) "$($ferramenta.Nome) compilado do código deste computador"
  }
}
Write-Host ""
Write-Host "Atalhos criados:"
$criados | ForEach-Object { Write-Host "  $_" }

# Atalhos antigos que abrem outra cópia das ferramentas usam os mesmos perfis.
$antigos = Get-ChildItem $areaDeTrabalho -Filter *.lnk | Where-Object { $nomes -notcontains $_.Name } | ForEach-Object {
  $alvo = $shell.CreateShortcut($_.FullName)
  if ("$($alvo.TargetPath) $($alvo.Arguments)" -match "(?i)edi(aula|captura|foto|pdf|svg|player)") { $_.FullName }
}
if ($antigos) {
  Write-Host ""
  Write-Host "Atenção: estes atalhos abrem outra cópia das ferramentas, que usa os mesmos perfis. Prefira os novos e não abra as duas versões da mesma ferramenta ao mesmo tempo:"
  $antigos | ForEach-Object { Write-Host "  $_" }
}
Write-Host ""
Write-Host "Para fixar na barra de tarefas: abra o menu Iniciar, procure 'Edi Hub (desenvolvimento)' (ou a ferramenta), clique com o botão direito e escolha 'Fixar na barra de tarefas'."
