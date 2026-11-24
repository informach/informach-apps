# Backup do dia de uma ferramenta Edi (Backup-EdiFerramenta, em comum.ps1), em segundo plano:
# abrir.ps1 o começa junto com a abertura, sem esperar. Uma ferramenta aberta duas vezes no mesmo
# dia não faz dois backups ao mesmo tempo: o segundo desiste, e o que não terminou continua na
# próxima abertura. O andamento vai para .cache\edi-work\registros\<ferramenta>-backup.log.
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("ediaula", "edicaptura", "edifoto", "edipdf", "edisvg", "ediplayer")]
  [string]$Ferramenta
)
. (Join-Path $PSScriptRoot "comum.ps1")
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $EdiRegistros | Out-Null
$registro = Join-Path $EdiRegistros "$Ferramenta-backup.log"
function Registrar([string]$Mensagem) {
  [IO.File]::AppendAllText($registro, "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Mensagem`r`n")
}

$vez = New-Object System.Threading.Mutex($false, "Local\EdiBackup-$Ferramenta")
if (-not $vez.WaitOne(0)) {
  $vez.Dispose()
  exit 0
}
try {
  $inicio = Get-Date
  $feito = Backup-EdiFerramenta $Ferramenta
  if ($feito) {
    Registrar ("backup em {0} ({1:N0} s)" -f $feito, ((Get-Date) - $inicio).TotalSeconds)
  }
}
catch {
  Registrar "erro: $($_.Exception.Message)"
  exit 1
}
finally {
  $vez.ReleaseMutex()
  $vez.Dispose()
}
