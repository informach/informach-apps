# Abre uma ferramenta Edi no modo de trabalho (`pnpm edi:work`), a partir do código deste
# computador. Antes: instala as dependências se o pnpm-lock.yaml mudou desde a última vez (um
# `git pull` com pacote novo) e faz o backup do dia do perfil da ferramenta. Tudo vai para o
# registro em .cache\edi-work\registros\<ferramenta>.log.
#
# Usado pelo Hub de desenvolvimento e, com -Avisar, pelos atalhos de cada ferramenta: sem o
# Hub aberto, uma falha aparece numa caixa de mensagem.
#
# Códigos de saída: 0 fechou normalmente, 2 a ferramenta já estava aberta, outro valor falhou.
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("ediaula", "edicaptura", "edifoto", "edipdf", "edisvg")]
  [string]$Ferramenta,
  [switch]$Avisar,
  # Repassa --oculto: o EdiCaptura com a bandeja ligada abre escondido, esperando o Print Screen
  # (usado pelo atalho da pasta Inicializar do Windows).
  [switch]$Oculto
)
. (Join-Path $PSScriptRoot "comum.ps1")
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $EdiRegistros | Out-Null
$registro = Get-EdiRegistro $Ferramenta
[IO.File]::WriteAllText($registro, "")
function Registrar([string]$Mensagem) {
  [IO.File]::AppendAllText($registro, "[hub] $Mensagem`r`n")
}
# Comandos externos pelo cmd: ele grava a saída do Node como está (UTF-8) no registro.
function Executar([string]$Comando) {
  & cmd.exe /d /c "$Comando >> `"$registro`" 2>&1"
  $LASTEXITCODE
}

Set-Location $EdiRepo
$codigo = 1
try {
  if (Get-EdiAberta $Ferramenta) {
    Registrar "a ferramenta já está aberta"
    $codigo = 2
  }
  else {
    # Uma instalação por vez, mesmo com duas ferramentas abrindo juntas.
    $exclusao = New-Object System.Threading.Mutex($false, "Local\EdiHubDesenvolvimentoInstalacao")
    [void]$exclusao.WaitOne()
    try {
      $marca = Join-Path $EdiWork "dependencias.sha256"
      $atual = (Get-FileHash (Join-Path $EdiRepo "pnpm-lock.yaml") -Algorithm SHA256).Hash
      $anterior = if (Test-Path $marca) { (Get-Content $marca -Raw).Trim() } else { "" }
      if (-not (Test-Path (Join-Path $EdiRepo "node_modules")) -or $anterior -ne $atual) {
        Registrar "instalando dependências"
        if ((Executar "pnpm install --frozen-lockfile") -ne 0) { throw "pnpm install falhou" }
        Set-Content -Path $marca -Value $atual -Encoding ascii
      }
    }
    finally {
      $exclusao.ReleaseMutex()
      $exclusao.Dispose()
    }
    Registrar "fazendo o backup do dia"
    $backup = Backup-EdiFerramenta $Ferramenta
    if ($backup) { Registrar "backup em $backup" }
    Registrar "compilando e abrindo"
    $argumentos = if ($Oculto) { " --oculto" } else { "" }
    $codigo = Executar "pnpm edi:work $Ferramenta$argumentos"
  }
}
catch {
  Registrar "erro: $($_.Exception.Message)"
  $codigo = 1
}

if ($Avisar -and $codigo -ne 0) {
  Add-Type -AssemblyName System.Windows.Forms
  $nome = ($EdiFerramentas | Where-Object Id -eq $Ferramenta).Nome
  if ($codigo -eq 2) {
    [void][System.Windows.Forms.MessageBox]::Show("$nome já está aberto.", "Edi (desenvolvimento)")
  }
  else {
    $fim = (Get-Content $registro -Tail 15 -Encoding UTF8) -join "`r`n"
    $resposta = [System.Windows.Forms.MessageBox]::Show(
      "$nome não abriu. Final do registro:`r`n`r`n$fim`r`n`r`nAbrir o registro completo?",
      "Edi (desenvolvimento)", "YesNo", "Warning")
    if ($resposta -eq "Yes") { Start-Process notepad.exe $registro }
  }
}
exit $codigo
