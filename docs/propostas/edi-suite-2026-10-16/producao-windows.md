# Homologação de distribuição Windows — 17/10/2026

Esta frente complementa o [manual do piloto](distribuicao-piloto.md). Instalação no perfil pessoal não foi usada como atalho para homologação: os scripts de instalação exigem `CI=true`, `GITHUB_ACTIONS=true`, `RUNNER_OS=Windows` e `RUNNER_ENVIRONMENT=github-hosted`.

## Instaladores e atualização

O workflow `.github/workflows/edi-upgrade.yml` descobre os seis aplicativos pelo catálogo e gera duas versões NSIS com a mesma identidade Ed25519 efêmera. Cada build instala, verifica a abertura com inventário assinado e gate de conta, desinstala e confere sentinelas nos diretórios do perfil, da suíte e de documentos. Em seguida, `installer-upgrade.ps1` verifica a transição A→B:

- recusa da instalação manual com A aberto, código 32 e processo preservado;
- timeout de 30 segundos do handoff de atualização, mantendo A e seus dados intactos;
- espera pelo fechamento normal no handoff NSIS `/S --updated` usado pelo updater;
- versão B instalada e aberta com seu inventário assinado;
- rejeição de arquivo parcial, nova tentativa com os bytes completos e preservação dos sentinelas;
- uninstall que mantém os bytes preexistentes de perfil e documentos.

O resultado estruturado de cada app fica no artefato `edi-upgrade-<app>-<tentativa>`. O script exige perfil limpo para a instalação inicial. O registro desse workflow precisa apontar para a execução remota efetivamente aprovada; a existência do YAML não é evidência de instalação.

Subprocessos `powershell.exe` recebem o ambiente preparado por `@informach/edi-desktop/windows-powershell`. O helper remove somente `PSModulePath`, sem alterar o ambiente do processo pai, para que o Windows PowerShell reconstrua seus caminhos de módulos. Node/Electron iniciado por PowerShell 7 pode herdar caminhos incompatíveis e perder comandos como `Get-FileHash` e `Add-Type`; esse comportamento e a preparação do processo filho estão [documentados pela Microsoft](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_psmodulepath#starting-windows-powershell). O contrato cobre instalação/upgrade, automação nativa, DPAPI, assinatura Windows e os dois helpers do EdiAula. A descoberta do executável pelo `PATH` e as demais variáveis são preservadas.

`packages/edi-desktop/src/installations.test.ts` exercita o downloader real do Hub com resposta HTTP interrompida e bytes adulterados, verificando hashes, remoção dos temporários, liberação do lock e possibilidade de retry. Somente a execução do EXE é substituída nesse teste; o NSIS real pertence ao runner. O handoff NSIS e esses testes separados não são uma simulação de rede completa do `electron-updater` rodando dentro de um editor instalado.

## Ícones e avisos de terceiros

Os seis instaladores/executáveis usam explicitamente seus recursos `resources/icon.ico`. EdiAula, EdiFoto e EdiPDF conservaram seus ícones; Hub, Captura e SVG receberam glifos geométricos originais nas paletas existentes, regeneráveis por `scripts/edi/make-icons.ps1`.

`third-party-notices.mts` inclui os textos LICENSE/NOTICE/README distribuídos pelas dependências de produção, inclusive transitivas e fontes incorporadas pelo Vite. O arquivo gerado fica em `resources/THIRD-PARTY-NOTICES.txt` e integra o inventário assinado. As licenças do Electron e do Chromium permanecem ao lado do executável; o smoke exige esses três arquivos.

Os 34 TTFs de exportação do EdiAula têm copyrights, nomes reservados, versões e SHA-256 registrados em `resources/fonts/LICENSES.txt`, reproduzidos dos metadados dos próprios arquivos, junto do [texto oficial OFL 1.1](https://openfontlicense.org/open-font-license-official-text/). Os TTFs existentes não foram alterados nesta correção.

Fontes, `cursor-hook.ps1` e `guided-input.ps1` são recursos externos usados por FFmpeg/PowerShell. O empacotamento os coloca em `resources/`, fora do ASAR e sem cópia duplicada dentro dele; `nativeResourcePath` seleciona esse caminho quando instalado. Todos continuam no inventário assinado. A busca dos subprocessos dos cinco editores encontrou esses três caminhos no EdiAula; os demais caminhos de recursos identificados eram lidos pelo Electron ou apontavam para executáveis externos já fora do ASAR.

## FFmpeg e fontes correspondentes

A inspeção Windows identificou FFmpeg 6.1.1 e FFprobe 4.0.2, ambos GPLv3, nos pacotes anteriores. O wrapper MIT de `ffprobe-static` não representava a licença do programa nativo. O FFprobe de desenvolvimento Windows foi alinhado ao mesmo fornecedor/versão do FFmpeg com `@derhuerst/ffprobe-static@5.3.0`. Os dois wrappers agora são dependências de desenvolvimento; o build instalado usa exclusivamente `resources/native-media/bin`, sem override por ambiente. O pacote `ffmpeg-static@5.3.0` fornece versões distintas por plataforma: no Linux do CI, o executável verificado foi 7.0.2; no Windows de desenvolvimento, 6.1.1.

Para a distribuição, `scripts/edi/media/` define build próprio do FFmpeg/FFprobe 9.0.2 com compilador MinGW em imagem Ubuntu fixada por digest. `sources.lock.json` fixa URL, versão/commit e SHA-256 de cada fonte. A receita inclui os codecs e filtros exigidos pelos argumentos atuais do editor: x264, VP9, MP3, ASS/fontes, AV1 e as interfaces de captura/aceleração Windows. Não há download de binários nativos durante o uso instalado.

A composição detecta a versão do executável de forma assíncrona e cacheada: FFmpeg 6 recebe `-filter_complex_script`; FFmpeg 7 ou superior usa `-/filter_complex`, mantendo o grafo em arquivo. A suíte nativa identificou também que comandos `sendcmd` de trajetória no ramo principal podiam ser lidos antes do overlay do frame correspondente. Os comandos agora acompanham o ramo do sprite, preservando a posição/curva do cursor e o zoom verificados por pixels, sem limitar o paralelismo.

O preenchimento de silêncio usa `apad=whole_dur=<duração do projeto>`. Antes, o produtor infinito de áudio podia continuar executando no FFmpeg 9 apesar do limite na saída. O diagnóstico reproduziu quatro travamentos em 60 renders paralelos do mesmo projeto; com a fonte limitada à duração real, os mesmos 60 terminaram. Os testes de duração, mixagem e silêncio continuam verificando o resultado renderizado.

O CI Linux revelou perda da cauda das transições quando o arquivo de origem terminava: `tpad` vinha depois de `fps`, cujo tratamento de EOF nessa versão encerrava a fonte antes da extensão. A extensão agora ocorre antes de `fps`/`setpts`, em segundos da fonte, incluindo o fator de velocidade. As asserções de pixels existentes foram preservadas e um novo caso verifica velocidades 0,5× e 2×.

O pacote gerado contém os EXEs, licenças e `Corresponding-Source.tar.xz`, com todas as fontes originais das bibliotecas, receitas, configuração FFmpeg e inventário do compilador. Esses arquivos seguem dentro do instalador EdiAula e do seu inventário assinado, preservando os sete assets públicos da suíte. A construção segue a orientação do projeto para [distribuir fontes correspondentes aos binários](https://ffmpeg.org/legal.html); o registro documenta os artefatos e não declara uma revisão jurídica externa.

Comandos:

```powershell
pnpm edi:media:build
pnpm edi:media:test
pnpm edi:test:package --installer ediaula
```

O primeiro requer Docker Linux e compila as fontes. O segundo exige Windows, confere identidade/integridade e capacidades dos EXEs e roda toda a suíte de testes EdiAula usando esses binários. `edi-media.yml` faz a mesma compilação em Linux e verificação em Windows, preservando `edi-native-media-windows-x64` e `edi-native-media-verification`. O workflow de upgrade espera essa homologação e usa o mesmo artefato para o EdiAula.

## Evidência local desta rodada

- Typecheck do tooling, EdiAula e SDK desktop passou após os novos contratos.
- Os 31 testes do tooling passaram na rodada atual. A suíte completa EdiAula passou com 172 testes, sem skips, após corrigir o carregamento de dependências de desenvolvimento em módulos ESM; os wrappers não são carregados pelo app instalado.
- Dois testes do downloader do Hub passaram; três testes do inventário de mídia rejeitaram fontes ausentes/adulteradas, receita divergente e arquivos adicionais.
- Onze testes reais de formatos/exportação passaram com FFprobe de desenvolvimento 6.1.1; `pnpm audit --prod` permaneceu sem alertas após essa alteração. Isso não é uma auditoria de CVEs dos executáveis nativos.
- `pnpm edi:test:package --installer edi-hub` gerou e verificou o NSIS `0.0.0-beta.32504`, 113.235.274 bytes, com ícone próprio e notices. Chaves efêmeras; não instalado nem publicado.
- `pnpm edi:test:package --installer ediaula` gerou e verificou o NSIS `0.0.0-beta.36228`, 200.364.039 bytes. Esta evidência cobre o layout de recursos anterior à última alteração do grafo de exportação; o instalador do commit final será refeito no workflow. Chaves efêmeras; não instalado nem publicado.
- A inspeção do ASAR confirmou ausência de duplicatas das 34 fontes e dos dois PS1; os recursos externos, avisos e fontes correspondentes estão no inventário assinado. O FFmpeg do diretório empacotado renderizou ASS e selecionou `PlusJakartaSans-Regular` das fontes distribuídas. Os dois PS1 empacotados passaram pelo parser PowerShell.
- Os quatro scripts PowerShell foram analisados pelo parser; o bloqueio de execução local do instalador foi exercitado e recusou este perfil.
- O build próprio terminou com receita `4e50132f011d239065c9b9a9c288515528386b45ab7f2511d06b89f08345b9bb`. Os EXEs Windows executaram e atenderam às verificações de versão 9.0.2, licença e capacidades. `Corresponding-Source.tar.xz` tem 54.216.152 bytes e contém as 13 fontes originais, receitas, configuração e inventário do compilador.
- `pnpm edi:media:test` passou após as correções finais do grafo: 172 testes EdiAula usando os EXEs próprios 9.0.2, sem falhas, skips ou cancelamentos; 50,5 segundos. Resultado em `.cache/edi-media-verification.json`. O teste de cursor/zoom também passou com o binário de desenvolvimento 6.1.1; a rodada geral do repositório verifica novamente esse ambiente no snapshot final.
- Após reproduzir as sete falhas de transição do CI Linux, os 16 testes de transições passaram com Node 24.15.0/FFmpeg 7.0.2 em Docker e com FFmpeg 6.1.1 Windows. O typecheck da EdiAula passou. A suíte própria 9.0.2 foi repetida no grafo corrigido: **173/173**, sem falhas, skips ou cancelamentos, em 57,5 segundos (`.cache/edi-own-media-transition-fixed.log`).

A homologação remota A→B ainda precisa de execução aprovada dos seis apps no workflow Windows. O build próprio e os testes locais acima estão concluídos; não substituem instalação/upgrade no runner. Também permanece separado o aceite em hardware representativo de captura/GPU e com projetos reais copiados para ambiente descartável.

## Evidência remota e correção de execução PowerShell

- No [run 39025609108](https://github.com/informach/informach-apps/actions/runs/39025609108), PR com head `3c90cdc`, a compilação própria Linux e a homologação Windows da mídia passaram. O job `117380603380` executou **172/172** testes EdiAula com os EXEs próprios; esse resultado pertence àquele snapshot, anterior à correção de cauda de transições.
- No [run 39026445710](https://github.com/informach/informach-apps/actions/runs/39026445710), PR com head `89b84fa`, o job de verificação Windows `117382197140` também passou: **173/173**, agora com a regressão de velocidade/cauda incluída. Esse resultado não inclui a correção PowerShell posterior.
- No run `39025609108`, os seis jobs de upgrade geraram seus instaladores A, mas falharam antes de instalar: `Get-FileHash` não carregou na criação dos sentinelas. A causa foi o `PSModulePath` herdado de PowerShell 7 → Node → Windows PowerShell 5.1; o mesmo erro foi confirmado nos logs dos seis aplicativos.
- A reprodução local segura falhou com ambiente herdado e passou com o ambiente do filho corrigido, sem executar instaladores. Após a correção, **45/45 testes do SDK**, **31/31 testes do tooling** e os typechecks SDK/EdiAula/tooling passaram. O teste nativo do helper carregou UI Automation e os seis comandos Windows necessários; um roundtrip DPAPI com valor sem segredo também passou. `guided-input.ps1 -Check` compilou e `cursor-hook.ps1 -List` enumerou monitores pelo Node com o ambiente corrigido, sem instalar aplicativo ou ativar gravação.
- `pnpm edi:test:native edisvg` passou no checkout isolado após o build geral: gate, licença offline válida, expiração, bloqueio IPC e diálogo nativo de fechamento com rascunho preservado. Executado diretamente por Node/PowerShell 7, sem shim de `PATH`, com chaves efêmeras e perfil isolado; a limpeza terminou com sucesso. Log local: `.cache/edi-production/native-edisvg-powershell-fixed.log`.
- Os resultados acima não aprovam a transição A→B. A próxima execução Windows deve confirmar o ciclo completo dos seis instaladores no commit que contém esta correção.
