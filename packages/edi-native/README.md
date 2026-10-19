# @informach/edi-native

Tecnologia nativa única da suíte Edi no Windows: fontes C# compartilhadas e o build que compila, para cada app, o seu próprio helper (`resources/native/<app>-helper.exe`) com o compilador C# do .NET Framework 4.x que vem com o Windows. Criado na etapa E8 da [base comum](../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/base-comum.md), no lugar de três mecanismos: o helper compilado do EdiAula, o C# compilado em tempo de execução por PowerShell `Add-Type` na ponte de captura e o PowerShell próprio do clipboard do EdiCaptura.

Consumido como TypeScript fonte, sem build próprio. Consumidores: EdiAula (`ediaula-helper.exe`) e EdiCaptura (`edicaptura-helper.exe`), como `devDependency` do build. Nada deste package roda dentro do Electron: o app usa o executável que o build deixou em `resources/native`.

## Conteúdo

| Caminho | Conteúdo |
| --- | --- |
| `csharp/HelperInfo.cs` | `HelperInfo.Version`: a versão gravada no assembly, que todo helper responde em `--version` |
| `csharp/Json.cs` | `Json` (leitura de pedidos com o serializador do framework, escrita manual de respostas, inteiros com cultura invariante) e `LineWriter` (linhas UTF-8 sem BOM, seguras entre threads). Veio do EdiAula |
| `csharp/WindowCapture.cs` | módulo `window-capture`: comandos `capture` e `capture --session` da ponte [`@informach/edi-desktop/windows-capture`](../edi-desktop/README.md) (janela em foco, bounds, HWNDs filhos, cursor, foco e roda) |
| `csharp/FileDrop.cs` | módulo `file-drop`: comando `filedrop`, um arquivo exportado na área de transferência como referência de arquivo |
| `csharp/app.manifest` | manifesto comum: `asInvoker`, Windows 10/11 e DPI per-monitor v2 (pixels físicos). O build grava a identidade `Informach.<Produto>.Helper` |
| `./sources` | `nativeSources(modules)`, `NATIVE_MODULES`, `nativeSourceDirectory` |
| `./build` | `buildNativeHelper(options)`, `runNativeHelperBuild(options)`, `helperVersion` |

`HelperInfo.cs` e `Json.cs` entram em todo helper. Os módulos entram só no helper do app que os despacha: o EdiAula não carrega captura nem clipboard. Cada app mantém o seu `Program.cs` (o `Main` e a lista de comandos) e os fontes que só ele usa, em `apps/<app>/native/helper`. No EdiAula ficam gancho de mouse e teclas, modo guiado, caret, listagem de telas, janelas que voltam para trás e o áudio do PC por WASAPI.

O cursor do EdiAula (`CursorImages.cs`, até 256 px, alfa reconstruído e hash para o diário) e o do EdiCaptura (`WindowCapture.cs`, até 512 px, dois PNGs sobre preto e branco para o compositor) continuam separados: os resultados e os limites são diferentes, e unificar mudaria o comportamento de um deles. As declarações P/Invoke da captura ficam privadas ao módulo, sem misturar com `Native.cs` do EdiAula.

## Build

O script de cada app é um wrapper fino (`apps/<app>/scripts/build-native-helper.mjs`) que chama `runNativeHelperBuild` com nome, produto, módulos, pasta de fontes do app, referências extras e a mensagem de arquivo em uso. Ele roda antes de `dev`, `build` e dos testes que usam o helper.

- Compilador: `csc.exe` de `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319` (C# 5), ou o indicado em `CSC`. Opções fixas: `/target:exe /platform:x64 /optimize+ /unsafe /warnaserror+ /codepage:65001 /utf8output`, sem `csc.rsp` (`/noconfig`).
- Versão: a do `package.json` do app ou, em release, a da tag `EDI_RELEASE_TAG` (`edi-vX.Y.Z[-beta.N]`); `AssemblyVersion`/`FileVersion` numéricos e `InformationalVersion` com o texto. O instalador compara `--version` com a release.
- Sem mudança, não compila: o carimbo `resources/native/<nome>.json` guarda o SHA-256 de versão, compilador, opções, referências, manifesto, fontes e do próprio build.
- Compila numa pasta temporária em `<app>/.cache` (mesmo disco da saída) e só então substitui o executável. Se o Windows mantiver o anterior bloqueado (app aberto em desenvolvimento), falha com a mensagem do app.
- Fora do Windows só avisa e não gera nada.

## Protocolo

Os helpers não têm shell, não executam comandos recebidos e não leem variáveis de ambiente para decidir o que fazer. Os argumentos são fixos por modo e os dados chegam por stdin em JSON UTF-8.

- `capture`: um pedido, uma resposta, saída 0 (ou 1 depois de uma falha). `capture --session`: escreve `READY`, responde uma linha por pedido e termina quando o stdin fecha; a primeira falha responde e encerra a sessão. Respostas: `{"ok":true,"result":...}` ou `{"ok":false,"error":"CÓDIGO"}`, com os códigos `WINDOW_UNAVAILABLE`, `BOUNDS_UNAVAILABLE`, `CURSOR_UNAVAILABLE`, `CURSOR_LIMIT`, `CONTROL_LIMIT`, `TARGET_CHANGED`, `DPI_UNAVAILABLE`, `INVALID_ACTION` e `NATIVE_FAILURE`. Pedido acima de 64 KiB, JSON inválido, ação desconhecida, handle fora de `^[1-9]\d{0,18}$`, mais de 128 handles, identidade ou roda fora do contrato viram `INVALID_ACTION`. Cada pedido roda no contexto DPI per-monitor v2, restaurado ao fim. Exceções nunca atravessam a enumeração nativa de filhos: a primeira interrompe a enumeração e é relançada depois.
- `filedrop`: stdin `{"file","sha256","size"}` (até 64 KiB). Abre o arquivo sem compartilhar escrita nem exclusão, confere tamanho (1 byte a 400 MB) e SHA-256 em minúsculas e só então publica `CF_HDROP` com "Preferred DropEffect" de cópia, numa thread STA. Imprime `OK` e sai com 0; qualquer falha sai com 1, sem caminho nem mensagem do sistema.
- `--version`: a versão gravada, terminada por `\n`.

## Testes

`pnpm --filter @informach/edi-native test`: versão, escolha de módulos e, no Windows, compilação real de um helper de teste com todos os módulos (carimbo, pular sem mudança, recompilar com a versão da release e erro de compilação). Os comandos são exercitados pelos consumidores: `pnpm --filter @informach/edicaptura test` (consultas reais pelo cliente de produção, protocolo e recusas do `filedrop`, sem tocar o clipboard), `test:media-native` do EdiCaptura (o mesmo `FileDrop.cs` num clipboard de estação Windows privada), as jornadas nativas de captura e rolagem, e os testes do helper do EdiAula.

## Distribuição

O catálogo `packages/config/src/edi-tools.ts` declara `nativeHelper: { executable }` por ferramenta. `scripts/edi/installer-config.mts` deriva disso: o helper fica fora do ASAR (`resources/native`), entra no inventário assinado como os demais arquivos, cada instalador leva só o seu, e o `beforePack` recusa executável ausente ou de outra versão. Sem certificado Authenticode, AppLocker e antivírus ainda podem barrar o executável; a decisão de distribuição está em [`docs/arquitetura-desktop.md`](../../docs/arquitetura-desktop.md).

## Fora daqui

O scanner WIA do EdiPDF e ferramentas de teste/release ainda usam Windows PowerShell por `@informach/edi-desktop/windows-powershell`. Fixtures de testes nativos (janelas WinForms próprias, sonda de foco da roda) também continuam em PowerShell, por serem só de teste.
