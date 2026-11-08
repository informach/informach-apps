# Hub de desenvolvimento da suíte Edi: uma janela com as ferramentas. "Abrir" compila o código
# deste computador e abre a ferramenta no modo de trabalho (abrir.ps1 -> `pnpm edi:work`), com
# os perfis e as pastas de sempre. Quando o código muda com a ferramenta aberta, o botão vira
# "Reiniciar" (abrir.ps1 -Reiniciar). Os atalhos vêm de `pnpm edi:work:instalar`.
. (Join-Path $PSScriptRoot "comum.ps1")
$abrirScript = Join-Path $PSScriptRoot "abrir.ps1"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$fonte = New-Object System.Drawing.Font("Segoe UI", 10)
$fonteNome = New-Object System.Drawing.Font("Segoe UI Semibold", 11)
$fontePequena = New-Object System.Drawing.Font("Segoe UI", 9)
$cinza = [System.Drawing.Color]::FromArgb(96, 96, 96)

$janela = New-Object System.Windows.Forms.Form
$janela.Text = "Edi Hub (desenvolvimento)"
$janela.StartPosition = "CenterScreen"
$janela.FormBorderStyle = "FixedSingle"
$janela.MaximizeBox = $false
$janela.ClientSize = New-Object System.Drawing.Size(600, 520)
$janela.BackColor = [System.Drawing.Color]::FromArgb(245, 243, 237)
$janela.Font = $fonte
$iconeHub = Get-EdiIcone "edi-hub"
if (Test-Path $iconeHub) { $janela.Icon = New-Object System.Drawing.Icon($iconeHub) }

$titulo = New-Object System.Windows.Forms.Label
$titulo.Text = "Ferramentas em modo de desenvolvimento"
$titulo.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 14)
$titulo.Location = New-Object System.Drawing.Point(20, 16)
$titulo.AutoSize = $true
$janela.Controls.Add($titulo)

$explicacao = New-Object System.Windows.Forms.Label
$explicacao.Text = "Cada abertura compila o código atual deste computador. Se o código mudar com uma ferramenta aberta, o botão dela vira Reiniciar. Os arquivos ficam nas pastas de sempre, com backup diário em $EdiBackups."
$explicacao.Location = New-Object System.Drawing.Point(20, 48)
$explicacao.Size = New-Object System.Drawing.Size(560, 58)
$explicacao.ForeColor = $cinza
$janela.Controls.Add($explicacao)

$linhas = @{}
$y = 112
foreach ($ferramenta in $EdiFerramentas) {
  $id = $ferramenta.Id
  $painel = New-Object System.Windows.Forms.Panel
  $painel.Location = New-Object System.Drawing.Point(20, $y)
  $painel.Size = New-Object System.Drawing.Size(560, 64)
  $painel.BackColor = [System.Drawing.Color]::White

  $imagem = New-Object System.Windows.Forms.PictureBox
  $imagem.Location = New-Object System.Drawing.Point(12, 12)
  $imagem.Size = New-Object System.Drawing.Size(40, 40)
  $imagem.SizeMode = "Zoom"
  # O PNG é mais nítido; alguns .ico guardam o tamanho grande em PNG e não convertem.
  $png = Join-Path $EdiRepo "apps\$id\resources\icon.png"
  $icone = Get-EdiIcone $id
  try {
    if (Test-Path $png) { $imagem.Image = [System.Drawing.Image]::FromFile($png) }
    elseif (Test-Path $icone) { $imagem.Image = (New-Object System.Drawing.Icon($icone, 32, 32)).ToBitmap() }
  }
  catch { }
  $painel.Controls.Add($imagem)

  $nome = New-Object System.Windows.Forms.Label
  $nome.Text = $ferramenta.Nome
  $nome.Font = $fonteNome
  $nome.Location = New-Object System.Drawing.Point(64, 10)
  $nome.AutoSize = $true
  $painel.Controls.Add($nome)

  $descricao = New-Object System.Windows.Forms.Label
  $descricao.Text = $ferramenta.Descricao
  $descricao.Font = $fontePequena
  $descricao.ForeColor = $cinza
  $descricao.Location = New-Object System.Drawing.Point(65, 36)
  $descricao.Size = New-Object System.Drawing.Size(270, 20)
  $painel.Controls.Add($descricao)

  $situacao = New-Object System.Windows.Forms.LinkLabel
  $situacao.Font = $fontePequena
  $situacao.Location = New-Object System.Drawing.Point(340, 22)
  $situacao.Size = New-Object System.Drawing.Size(120, 20)
  $situacao.TextAlign = "MiddleRight"
  $situacao.LinkBehavior = "HoverUnderline"
  $situacao.Tag = $id
  $situacao.Add_LinkClicked({
      param($origem)
      $arquivo = Get-EdiRegistro $origem.Tag
      if (Test-Path $arquivo) { Start-Process notepad.exe $arquivo }
    })
  $painel.Controls.Add($situacao)

  $botao = New-Object System.Windows.Forms.Button
  $botao.Text = "Abrir"
  $botao.Location = New-Object System.Drawing.Point(470, 16)
  $botao.Size = New-Object System.Drawing.Size(76, 32)
  $botao.Tag = $id
  $botao.Add_Click({
      param($origem)
      $alvo = $origem.Tag
      $linha = $linhas[$alvo]
      $argumentos = "-NoProfile -ExecutionPolicy Bypass -File `"$abrirScript`" -Ferramenta $alvo"
      if ($origem.Text -eq "Reiniciar") {
        $nomeAlvo = ($EdiFerramentas | Where-Object Id -eq $alvo).Nome
        $resposta = [System.Windows.Forms.MessageBox]::Show(
          "$nomeAlvo está aberto com o código de antes da última mudança ($(Get-EdiDesatualizada $alvo)).`r`n`r`nFechar e abrir de novo com o código atual? Se houver trabalho sem salvar, salve antes.",
          "Reiniciar", "YesNo", "Question")
        if ($resposta -ne "Yes") { return }
        $argumentos += " -Reiniciar"
        $linha.Reiniciando = $true
      }
      $linha.Processo = Start-Process powershell.exe -ArgumentList $argumentos -WindowStyle Hidden -PassThru
      # Sem guardar o handle agora, o ExitCode não fica disponível quando o processo termina.
      [void]$linha.Processo.Handle
      $linha.Resultado = $null
      $origem.Enabled = $false
    })
  $painel.Controls.Add($botao)

  $janela.Controls.Add($painel)
  $linhas[$id] = [pscustomobject]@{ Botao = $botao; Situacao = $situacao; Processo = $null; Resultado = $null; Reiniciando = $false }
  $y += 72
}

function Ler-FimDoRegistro([string]$Id) {
  $arquivo = Get-EdiRegistro $Id
  if (-not (Test-Path $arquivo)) { return "" }
  try {
    $fluxo = New-Object System.IO.FileStream($arquivo, "Open", "Read", "ReadWrite")
    try {
      $leitor = New-Object System.IO.StreamReader($fluxo, [System.Text.Encoding]::UTF8)
      $leitor.ReadToEnd()
    }
    finally { $fluxo.Dispose() }
  }
  catch { "" }
}

function Atualizar-Situacao {
  foreach ($id in $linhas.Keys) {
    $linha = $linhas[$id]
    $texto = ""
    $ocupada = $false
    if ($linha.Processo -and -not $linha.Processo.HasExited) {
      $ocupada = $true
      $registro = Ler-FimDoRegistro $id
      $texto = if ($registro -match "is open and licensed") { "Aberta" }
      elseif ($registro -match "\[edi:work\] building") { "Compilando..." }
      elseif ($registro -match "compilando e abrindo") { "Preparando..." }
      elseif ($registro -match "fazendo o backup") { "Fazendo backup..." }
      elseif ($registro -match "instalando depend") { "Instalando pacotes..." }
      else { "Preparando..." }
    }
    elseif ($linha.Processo) {
      $linha.Resultado = switch ($linha.Processo.ExitCode) {
        0 { "Fechada" }
        2 { "Já estava aberta" }
        3 { "Não fechou" }
        default { "Falhou: ver registro" }
      }
      $linha.Processo = $null
      $linha.Reiniciando = $false
    }
    if (-not $ocupada) {
      if (Get-EdiAberta $id) {
        $ocupada = $true
        # Um Reiniciar que não fechou a ferramenta fica avisado enquanto ela estiver aberta.
        $texto = if ($linha.Resultado -eq "Não fechou") { "Não fechou" } else { "Aberta" }
      }
      elseif ($linha.Resultado -eq "Não fechou") { $linha.Resultado = $null }
      elseif ($linha.Resultado) { $texto = $linha.Resultado }
    }
    # Aberta, mas compilada antes da última mudança no código: o botão reinicia. Ao fechar, a
    # marca de código antigo some e o andamento volta a vir do registro da nova abertura.
    $antiga = Get-EdiDesatualizada $id
    if ($linha.Reiniciando -and -not $antiga) { $linha.Reiniciando = $false }
    $reiniciar = $false
    if ($linha.Reiniciando) { $texto = "Reiniciando..."; $ocupada = $true }
    elseif ($antiga -and ($texto -eq "Aberta" -or $texto -eq "Não fechou")) {
      if ($texto -eq "Aberta") { $texto = "Código mudou" }
      $reiniciar = $true
    }
    $linha.Situacao.Text = $texto
    $linha.Botao.Text = if ($reiniciar) { "Reiniciar" } else { "Abrir" }
    $linha.Botao.Enabled = $reiniciar -or -not $ocupada
  }
}

$rodape = 112 + 72 * $EdiFerramentas.Count + 8
function Novo-Botao([string]$Texto, [int]$X, [int]$Largura) {
  $novo = New-Object System.Windows.Forms.Button
  $novo.Text = $Texto
  $novo.Location = New-Object System.Drawing.Point($X, $rodape)
  $novo.Size = New-Object System.Drawing.Size($Largura, 32)
  $janela.Controls.Add($novo)
  $novo
}

$puxar = Novo-Botao "Puxar atualizações" 20 170
$puxar.Add_Click({
    $puxar.Enabled = $false
    $janela.Cursor = "WaitCursor"
    try {
      $saida = & cmd.exe /d /c "cd /d `"$EdiRepo`" && git pull --ff-only 2>&1"
      $codigo = $LASTEXITCODE
    }
    finally {
      $janela.Cursor = "Default"
      $puxar.Enabled = $true
    }
    $texto = ($saida | Select-Object -Last 20) -join "`r`n"
    if ($codigo -eq 0) {
      [void][System.Windows.Forms.MessageBox]::Show(
        "$texto`r`n`r`nAs ferramentas abertas que mudaram mostram o botão Reiniciar. Se houver pacotes novos, a próxima abertura instala sozinha.",
        "Atualizações", "OK", "Information")
    }
    else {
      [void][System.Windows.Forms.MessageBox]::Show(
        "O git não conseguiu atualizar sem mesclar (há mudanças locais ou a branch divergiu). Nada foi alterado.`r`n`r`n$texto",
        "Atualizações", "OK", "Warning")
    }
  })

$verBackups = Novo-Botao "Backups" 200 100
$verBackups.Add_Click({
    New-Item -ItemType Directory -Force $EdiBackups | Out-Null
    Start-Process explorer.exe $EdiBackups
  })

$verRegistros = Novo-Botao "Registros" 310 100
$verRegistros.Add_Click({
    New-Item -ItemType Directory -Force $EdiRegistros | Out-Null
    Start-Process explorer.exe $EdiRegistros
  })

$janela.ClientSize = New-Object System.Drawing.Size(600, ($rodape + 52))

$relogio = New-Object System.Windows.Forms.Timer
$relogio.Interval = 1000
$relogio.Add_Tick({ Atualizar-Situacao })
$janela.Add_Shown({ Atualizar-Situacao; $relogio.Start() })
$janela.Add_FormClosed({ $relogio.Stop() })
[void]$janela.ShowDialog()
