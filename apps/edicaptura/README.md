# EdiCaptura

Foco vigente em18/10/2026: **capturar, explicar visualmente, proteger dados e enviar rapidamente**. Imagens, OCR, ocultação, guias simples e vídeo rápido permanecem no Captura; edição avançada de vídeo pertence ao EdiAula e trabalho geral de PDF ao EdiPDF. A [decisão de foco](../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/foco-na-suite.md) registra o escopo reduzido aprovado, sem passagem direta entre apps: a pessoa salva o arquivo e escolhe qual ferramenta abrir. Esta orientação não declara OCR ou vídeo rápido completo já implementados.

Aplicativo Electron para Windows com seleção de região e barra flutuante de captura. Interface em português e processamento local das capturas. Conta, licença e atualização usam os serviços da suíte Edi.

## Executar

Requisitos de desenvolvimento: Windows 10/11 x64, Node.js 24.15.0 e pnpm 9.15.0, conforme o workspace. Execute os comandos na raiz do monorepo.

```powershell
pnpm install --frozen-lockfile
pnpm --filter @informach/edicaptura dev
```

Use perfis isolados conforme o [guia Edi](../../docs/desenvolvimento-edi.md). `pnpm --filter @informach/edicaptura start` abre o último build; execute `build` antes desse comando.

## Helper nativo

As consultas Win32 da captura (janela em foco, bounds, controles, cursor, foco e roda da rolagem) e a cópia do arquivo exportado para a área de transferência rodam em `resources/native/edicaptura-helper.exe`, sem PowerShell. Ele é compilado com o C# do .NET Framework do Windows a partir de [`@informach/edi-native`](../../packages/edi-native/README.md) (módulos `window-capture` e `file-drop`) e de `native/helper/Program.cs`, por `scripts/build-native-helper.mjs`, que roda antes de `dev`, `build`, `test` e das jornadas `test:capture-native`, `test:scroll-native` e `test:capture-pixels-native`; sem mudança, não recompila. Se o EdiCaptura de desenvolvimento estiver aberto, o Windows bloqueia o executável e o build pede para fechá-lo. O main resolve o caminho em `src/main/native-helper.ts` (no app instalado, `resources/native` do próprio instalador; em desenvolvimento, `apps/edicaptura/resources/native`) e o entrega a `configureWindowsCapture`. `src/main/native-helper.test.cjs` exercita o helper real com o cliente de produção, sem foco, roda nem clipboard.

## Evolução em lotes — 18/10/2026

A implementação do [diagnóstico de substituição do Snagit](../../docs/propostas/edi-suite-2026-10-16/analise-edicaptura-snagit.md) é acompanhada no [plano](../../docs/superpowers/plans/2026-10-18-edicaptura-snagit.md), com review entre lotes. O primeiro lote protege a troca de documentos, renomeia vídeos sem alterar a mídia, sinaliza e recupera metadados danificados, mantém números de passos únicos, sincroniza propriedades e limita histórico. Projetos anteriores recebem versão e IDs de anotações; a primeira gravação mantém cópia dos metadados legados. Recuperar um item danificado guarda os metadados existentes e restaura a mídia original; não promete recuperar anotações ilegíveis.

O [lote 03](../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/lote-03.md) acrescenta biblioteca paginada e portabilidade. `typecheck` verifica domínio e infraestrutura TypeScript (`.ts`/`.mts`). `test:renderer` exercita o renderer real no Chromium, inclusive biblioteca com 130 projetos em filesystem isolado, saída final em lote, atalhos contextuais e trocas de raiz com leituras/decodificações atrasadas. `test:media-native` verifica PNG/JPEG/WebP no Electron real, inclusive encerramento do decoder após sucesso/falha, e constrói FileDrop com tipos reais do Windows, compilando o mesmo `FileDrop.cs` do helper, lido por um consumidor CF_HDROP/shell32. Tenta o ciclo de clipboard em estação Windows privada; se a criação for negada, registra a limitação e não acessa o clipboard do usuário. `test:e2e` usa o harness nativo licenciado da suíte; não equivale a homologação funcional completa de captura em múltiplos monitores.

As etapas 4a e 4b completas foram implementadas e aceitas após revisão independente: ativos imutáveis, modos/atraso/cancelamento, composição entre monitores e seleção precisa/presets/atalhos. A [ponte Windows compartilhada](../../packages/edi-desktop/README.md) fornece consultas e ações de foco/roda com contratos fechados. As etapas4c/4d e a cobertura completa do lote4 também foram aceitas: rolagem revisada nos dois eixos, worker, automação explícita, percurso licenciado controlado e diagnóstico. O [lote 04](../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/lote-04.md) e a matriz Windows mantêm os limites nativos/físicos e o incidente de fixture contido; não se declara homologação universal.

## Biblioteca e portabilidade

Abra **Biblioteca** para buscar por nome, tag, coleção ou app de origem. Os filtros de tipo, favorito, tag, coleção, app e intervalo de datas podem ser combinados. A biblioteca mostra até 60 capturas por página; recentes mostram até oito. O índice lê metadados uma vez ao abrir e se atualiza por captura salva. **Atualizar arquivos em disco** relê alterações feitas fora do app. Thumbnails são guardados no projeto e atualizados quando a imagem muda, sem reabrir os originais de toda a coleção a cada salvamento.

Selecione capturas para favoritar, definir tags/coleção, duplicar com todos os objetos e imagens de composição, exportar os arquivos finais ou mover para a **Lixeira local**. Essa lixeira preserva originais e objetos; marque o filtro e use **Restaurar** para recuperá-los. Não apaga o arquivo do disco nem usa a lixeira do Windows. Metadados danificados aparecem na biblioteca e podem recuperar o original mantendo uma cópia dos metadados; backup integral conserva também arquivos danificados.

**Projeto editável aberto → arquivo** grava `.edicapture`, ZIP versionado com documento, original e sidecars. **Importar projeto editável** mantém os objetos, recorte e transformações. Uma importação idêntica reutiliza o projeto; colisões de UUID com conteúdo diferente geram outro UUID determinístico, sem substituir arquivos locais. Duplicar gera um projeto independente.

Em **Biblioteca e preferências**, escolha destinos favoritos, salve backup `.edilibrary`, restaure em uma pasta vazia ou copie e passe a usar outra raiz. A cópia é verificada por SHA-256 antes da preferência ser trocada. A raiz anterior permanece intacta; uma falha na gravação da preferência retorna à raiz anterior. O backup não modifica a biblioteca e restauração não mescla nem substitui uma biblioteca existente. Limites por arquivo portátil: 800 MB de conteúdo, 20.000 arquivos e manifesto de até 10 MB; ZIPs divididos/ZIP64, paths, links e nomes conflitantes são recusados. A descompactação limita a saída real, inclusive quando o tamanho declarado é falso. Operações usam memória; grandes bibliotecas devem ser divididas em backups menores. Falhas de importação mostram um arquivo portátil local de recuperação `.edicapture`, quando gravado. Ele também entra no backup integral e pode ser aberto por **Importar projeto editável**; preserve-o antes de tentar limpar arquivos.

**Novo projeto** cria uma folha branca 1280×720. **Novo da área de transferência**, importação e arrastar um PNG/JPEG/WebP/WebM criam projetos após validação no main. Imagens aceitam até 50 MB / 100 megapixels; WebM, até 400 MB. O WebP é decodificado por Chromium em janela local oculta e isolada, pois NativeImage não o suporta; o mesmo codec valida exportações WebP. Importações que terminam depois de uma troca de documento ficam na biblioteca e não substituem o editor atual.

Arquivos padrão exportados do Snagit entram como imagem final, sem os objetos editáveis do SNAGX. Não há parser SNAGX: use a exportação/Batch Convert Images no Snagit e preserve seus projetos de origem, conforme [orientação oficial](https://support.techsmith.com/hc/en-us/articles/27142747345805-How-Do-I-Export-My-Snagit-Library-if-I-No-Longer-Plan-to-Use-Snagit). Vídeo importado permanece WebM como original. Ao abrir, a leitura local por FFprobe extrai duração/dimensões/áudio e FFmpeg gera a miniatura; a interface distingue pendente, pronto e falha com repetição explícita. O contrato `media` registra `status` (`pending`, `ready`, `failed`), `durationSeconds`, `width`, `height` e `error`; `preview` recebe a thumbnail PNG extraída. Não se inventa duração a partir do tamanho do arquivo.

**Copiar arquivo exportado** coloca uma referência ao último arquivo final (PNG/JPEG/WebP/WebM/MP4/GIF) na área de transferência do Windows, no formato de arquivos aceito pelo Explorer e por aplicativos que permitem colar anexos. **Copiar caminho exportado** copia o endereço como texto; **Copiar imagem** copia os pixels da imagem aberta. O arquivo final precisa existir, manter a identidade e o conteúdo registrados na exportação e ter até 400 MB; se foi apagado ou substituído, exporte novamente. A cópia de arquivo usa o comando `filedrop` do helper do próprio app (`resources/native/edicaptura-helper.exe`, ver abaixo), sem PowerShell e sem nada vindo do renderer além do pedido validado no main; se o serviço de área de transferência estiver ocupado ou indisponível, a interface mostra o erro. O aplicativo de destino define se aceita colar arquivos. A referência deixa de funcionar se o arquivo for movido/apagado depois da cópia.

A exportação em lote renderiza um projeto por vez, incluindo objetos e ocultação, sem alterar a captura aberta; nomes existentes recebem sufixo. Atalhos de seleção, duplicação, colagem, exclusão, movimentação e histórico atuam somente no editor, sem modificar a captura oculta ao usar a biblioteca ou um diálogo. Trocar de raiz cancela ativações antigas e aguarda a gravação na raiz anterior; um documento dessa raiz não pode reaparecer nem ser salvo na nova biblioteca. Durante a troca, as preferências permanecem abertas e a edição fica bloqueada até concluir, cancelar ou informar uma falha. Edições já aceitas são gravadas na biblioteca anterior; inserções de imagem/texto ainda pendentes são canceladas. Se a troca for cancelada ou falhar, a captura anterior permanece aberta e pode ser editada normalmente. Bandeja e início com Windows ficam desligados até a preferência explícita. O início automático é habilitado somente no aplicativo instalado; o ícone da bandeja existe enquanto o app está aberto.

Imagens inseridas usam um ativo imutável por identidade: duplicar e mover objetos guarda apenas referências no histórico, inclusive para rasters de 25 MB. A gravação envia cada ativo pendente uma vez; falhas conservam a fonte para repetir e somente o sucesso confirma o salvamento. Reabrir, duplicar e transportar projetos mantém os sidecars e os pixels. Renomear usa a gravação de metadados e reutiliza a miniatura; alterações visuais, inclusive desfazer/refazer, atualizam a miniatura. Fontes e imagens decodificadas ficam retidas enquanto o documento estiver aberto para preservar histórico e gravações pendentes, dentro de 70 milhões de caracteres de fontes únicas/metadados e 100 megapixels de composição; trocar ou fechar o documento libera essa coleção. O histórico continua limitado a 60 estados e 8 milhões de caracteres de metadados. Evidências e próximas etapas de captura/rolagem estão no [lote 4](../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/lote-04.md).

## Recursos

- **Modos de imagem**: monitor inteiro, todos os monitores, janela por prévia, janela ativa anterior, controles HWND expostos pela janela e regiões entre monitores. Janela/controle têm tokens locais revalidados; uma janela movida/fechada deve ser listada novamente.
- Capture a região do monitor em que está o cursor, com oito alças e campos de largura/altura em pixels.
- Em **Tela / monitor**, escolha um monitor específico ou o monitor onde está o cursor. A escolha é lembrada e também vale para os atalhos globais.
- A moldura azul fina permanece visível durante vídeo e rolagem, deixa passar cliques e é excluída da captura pelo Windows 10 2004 ou superior. Na imagem estática, fica visível até a captura ser concluída.
- Os controles mostram o monitor e as dimensões. Quando possível, ficam fora da região ou no outro monitor. Desconectar o monitor ou alterar sua resolução encerra a captura para evitar gravar a área errada.
- Use os botões da barra flutuante para imagem, vídeo ou rolagem assistida.
- Anote com setas, texto, retângulos, marca-texto, caneta e passos numerados.
- Pixelize uma região, recorte, mova ou exclua anotações e desfaça/refaça alterações.
- Copie a imagem final ou exporte PNG/JPEG. Projetos permanecem editáveis na biblioteca.
- Grave a região em WebM por até uma hora de gravação ativa, reduzida conforme espaço livre, com microfone e áudio do PC opcionais (veja **Som, contagem e pausa**). A janela de controle e Ctrl+Shift+F10 encerram a gravação; **Pausar** e Ctrl+Shift+F9 pausam e retomam. O contador exclui a espera por permissão, as pausas pedidas e as pausas automáticas enquanto o disco confirma os trechos.
- Na captura com rolagem, escolha **Vertical** ou **Horizontal** e **Aplicar área e eixo**. Selecione apenas o conteúdo móvel ou exclua cabeçalho, rodapé e barras laterais pelas quatro margens em pixels. No modo assistido, role em passos menores que uma tela e espere duas amostras estáveis; **Fotografar trecho** e Ctrl+Shift+PageDown registram manualmente. O campo Sobreposição vale para o próximo trecho; cada emenda também pode ser editada separadamente na revisão.
- **Revisar imagem e emendas** pausa a coleta e apresenta a imagem inteira reduzida, dimensões, orçamento e marcadores de emenda. Cada emenda informa sobreposição/confiança, permite corte manual, remoção de trecho e desfazer da última alteração. Remover recalcula os alinhamentos vizinhos. Conteúdo dinâmico/repetido provoca pausa e aviso; a alternativa manual conserva os pixels mesmo quando não há correspondência segura.
- **Escolher janela atual → Autorizar e iniciar automático** permite rolar somente uma janela que contenha a área móvel. O início usa a posição atual após estabilidade; não navega automaticamente para o topo/início do documento. Escolha o eixo antes da autorização. O início tenta ativar a janela uma vez. Se o Windows ainda não confirmar o foco, a interface pede que você ative a janela escolhida e aguarda até 30 segundos, sem enviar roda nem capturar novos trechos. Parar cancela a espera; ao expirar, ative a janela e autorize novamente ou use o modo assistido. Depois da ativação, a janela precisa conservar foreground, identidade e bounds em cada roda. Mudança de foco, janela movida/fechada, ponto coberto por outra janela, erro, limite ou **Parar agora · preservar** interrompem as ações. Ctrl+Shift+Esc também interrompe quando o atalho está disponível. Duas amostras estáveis sem avanço após a roda indicam fim provável, sempre sujeito à revisão.
- O automático emite uma mensagem Win32 de roda por passo, dirigida ao HWND elegível, sem deslocar globalmente o mouse. Aplicativos que usam entrada bruta, bloqueiam mensagens, estão elevados ou não aceitam roda horizontal podem não responder; use o modo assistido. A resposta síncrona tem limite de 200 ms. Cancelar não desfaz uma mensagem já entregue, mas aborta o helper e impede novas ações. Limites: até 30 trechos, 120 passos e 2 minutos por autorização, 30000 pixels por dimensão, 100 megapixels e 512 MiB no modelo agregado de representações. O orçamento conta originais/desfazer/amostra, scratch de bitmap, cópias transferíveis, recortes do worker, saída BGRA/NativeImage/PNG e reserva de 64 MiB para prévia/encoding. Antes de publicar, uma segunda admissão usa o tamanho real do PNG, contando releitura, strings base64 UTF-16 main/IPC/renderer e decode; a aquisição faz preflight de todos os thumbnails de tela solicitados junto ao trabalho retido, valida identidades/dimensões agregadas de todos os retornos e cobra PNG/normalização/crop antes de continuar. Isso não mede RSS nem limita rigidamente buffers internos do Electron/GC.
- **Pausar · preservar** conserva a sessão e seus trechos; **Pronto · unir imagem** salva. O worker faz assinaturas/alinhamento/composição com buffers transferíveis dedicados e tokens de sessão/solicitação. Originais nunca são destacados: falha/timeout/cancelamento do worker conserva a recuperação. Cancelar durante remover/configurar/cortar restaura a edição anterior e publica o estado pausado e livre, com revisão e salvamento disponíveis. Falha de disco mantém os trechos; uma gravação que termina após pausa não abre documento tardiamente e o retry reutiliza a entrada já publicada. Mantenha o aplicativo aberto para recuperar trabalho ainda em memória.

## Atalhos

| Ação | Atalho |
|---|---|
| Nova captura | Print Screen ou Ctrl+Shift+S |
| Confirmar região como imagem | Enter |
| Cancelar seleção | Esc |
| Cancelar uma nova captura de imagem, inclusive contagem/composição | Ctrl+Shift+Esc |
| Abrir imagem | Ctrl+O |
| Salvar projeto | Ctrl+S |
| Desfazer / refazer | Ctrl+Z / Ctrl+Shift+Z |
| Excluir anotação selecionada | Delete |
| Pausar / retomar gravação | Ctrl+Shift+F9 |
| Parar gravação | Ctrl+Shift+F10 |
| Próximo trecho da rolagem | Ctrl+Shift+PageDown |

O Windows ou outro aplicativo pode reservar Print Screen; nesse caso a interface mostra o atalho alternativo disponível.

## Dados e segurança

Os projetos ficam por padrão em `%APPDATA%/edicaptura/captures`; `library-settings.json` no perfil registra a raiz escolhida e preferências locais. PNGs originais e anotações JSON são armazenados separadamente; vídeos são WebM. **Pixelizar protege a exportação visual, mas não elimina o original da biblioteca**: compartilhe a imagem exportada, não os arquivos do projeto, quando houver dados sensíveis. O app usa `contextIsolation`, sandbox, preload restrito e validação de origem no IPC. Não carrega conteúdo remoto.

Quando a licença deixa de autorizar o uso, vídeo e rolagem em andamento são encerrados e salvos; nenhuma nova captura começa. Vídeo grava partes ordenadas de até 1 MiB em `%APPDATA%/edicaptura/recordings/<sessão>`, com journal e SHA-256 sincronizados antes da confirmação. Se o disco falhar, mantenha a janela aberta, libere espaço e repita **Parar e salvar** para reenviar a parte pendente. Ao reabrir, **Gravações interrompidas neste computador** oferece recuperação explícita na biblioteca original. Partes confirmadas só são removidas após a publicação e leitura bem-sucedida na biblioteca. Bytes ainda não confirmados não sobrevivem à perda do processo.

A fila de vídeo admitida tem teto de 32 MiB, pausa automaticamente a partir de 4 MiB e envia um pacote de cada vez. Um evento excepcional do codificador acima do orçamento interrompe a gravação e informa que o excedente não foi salvo; os trechos confirmados permanecem recuperáveis. O limite também considera disco, duração e 100.000 partes. Arquivos gravados e exportados admitem até 32 GiB, com reprodução local por intervalos autorizados, sem carregar o vídeo inteiro em base64. Importação legada/clipboard continuam limitados a 400 MB e projetos portáteis a 800 MB. Exportações individuais usam substituição atômica; a saída em lote preserva nomes existentes e recebe sufixos. Contrato e limites no [lote 5](../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/lote-05.md); som opcional e pausa manual estão em **Som, contagem e pausa**.

Parar e salvar aguarda todos os trechos finais, inclusive ao parar durante uma retomada automática. Repetir um salvamento verifica e reutiliza as cópias completas já gravadas; não monta outra cópia inteira apenas para repetir a leitura da biblioteca. O app confere novamente o espaço na origem/destino antes de alocar arquivos, mantendo a reserva de disco e o espaço dos metadados; erro conserva os originais para nova tentativa.

## Testar e distribuir

```powershell
pnpm --filter @informach/edicaptura test
pnpm --filter @informach/edicaptura test:renderer
pnpm --filter @informach/edicaptura test:media-native
pnpm --filter @informach/edicaptura test:capture-native
pnpm --filter @informach/edicaptura test:scroll-native
pnpm --filter @informach/edicaptura test:capture-pixels-native
pnpm --filter @informach/edicaptura exec node tests/capture-pixels-runner.cjs --verify-failure-exits
pnpm --filter @informach/edicaptura test:library-benchmark
pnpm --filter @informach/edicaptura typecheck
pnpm --filter @informach/edicaptura build
pnpm edi:test:native
pnpm edi:test:package --installer
```

EdiCaptura integra o release da suíte pela tag `edi-v*`, usando instalador, inventário e manifesto assinados Ed25519 e atualização pelo SDK compartilhado. Os antigos scripts `pack`/`dist` não são o canal comercial. Siga a [distribuição do piloto](../../docs/propostas/edi-suite-2026-10-16/distribuicao-piloto.md); as assinaturas próprias não equivalem a certificado Authenticode reconhecido pelo Windows.

O runner `test:renderer` inclui `tests/raster-history.cjs`: PNG válido de mais de 25 MB, fila/falha de gravação, duplicação, histórico, reabertura real/portátil e contagem de exportações por cobertura V8. Usa perfis e arquivos isolados, sem área de transferência pessoal. O plano e os limites da versão estão em [PLANO.md](PLANO.md).

## Validação histórica da versão importada

Versão 0.2.2: 36 testes passaram. Verificam linha de um pixel físico em escalas de 100% a 250%, janelas transparentes, tolerância a pequenas diferenças de renderização, captura manual sem alinhamento, união dos pixels e confirmação sonora somente para fotos novas. O teste nativo voltou a encerrar com Target crashed antes da interação; aparência e som no Windows real ainda precisam de confirmação. O sandbox permanece ativo.

## Modos de imagem — etapa 4b2

O diálogo **Modos de imagem** preserva primeiro o documento aberto. Monitor/todos/janela/ativa e controle são capturados com um clique no botão correspondente. Para regiões, a prévia mantém a proporção do desktop virtual e permite atravessar telas; a opção **Nova imagem** adquire novamente depois da confirmação e do atraso. **Congelada** salva o instante em que a seleção abriu, inclusive o cursor daquele momento, sem aplicar o atraso. Vídeo e rolagem continuam no fluxo de um monitor do botão Capturar/Print Screen.

A preparação nativa termina antes da contagem. Use um atraso para abrir menus/tooltips e **Cancelar** na janela da contagem ou Ctrl+Shift+Esc. A imagem é solicitada depois do prazo; aquisição e cursor têm instantes distintos e latência do sistema. O cursor opcional é amostrado após adquirir, antes de compor. Monitores compartilham a maior escala real dos bitmaps participantes; lacunas permanecem transparentes e limites de dimensões/pixels/512 MiB agregados continuam ativos. Composição cede o event loop a cada aproximadamente 65 mil pixels para cancelar e revalidar a sessão. Esse orçamento não mede RSS nem limita rigidamente a alocação interna do Electron.

O destino inicial é a biblioteca atual; escolha abrir a imagem no editor ou mantê-la somente na biblioteca. Falha de disco mantém os pixels em memória e oferece **Salvar imagem preservada** ou descarte explícito. A perda da licença permite salvar esses pixels existentes sem adquirir outros. Cancelamento impede ativação de respostas tardias; uma gravação já iniciada pode terminar na biblioteca. Mantenha o aplicativo aberto para recuperar uma imagem ainda não salva.

Controles são filhos HWND visíveis, recortados contra ancestrais/client areas, com destaque da área na prévia ao focar/apontar o botão. Canvas/Chromium pode não expor controles individuais. A aquisição do controle recorta o bitmap da janela autorizada. Isso não é detecção semântica UI Automation. HWND/PID/TID não garantem identidade persistente contra reutilização pelo mesmo processo/thread.

`test:capture-pixels-native` usa Electron real e uma janela própria com quadrantes conhecidos, muda a cor durante o atraso e confere o projeto salvo. Para monitores, cobre todas as telas com janelas próprias opacas e verifica cada pixel antes de aceitar a composição; não persiste screenshots pessoais. Também verifica pixels da região repetida na escala salva e conflito/rollback de atalhos próprios. `test:renderer` inclui os controles dos modos, tokens, retry, seleção virtual e precisão/presets. Esses testes não homologam mixed-DPI físico/HDR/dock/suspensão, não substituem o harness licenciado de4d nem resolvem o histórico3221226505. A rolagem4c/fix1 foi aceita na revisão006; as correções de integração4d e a cobertura completa4 foram aceitas pela revisão independente, com limites explícitos.

O marcador `src/package.json` declara os módulos fonte ESM; main/preload e testes CommonJS continuam com extensão `.cjs`. Isso permite executar os contratos TypeScript diretamente no Node/Electron homologados sem inferência ambígua de módulo, sem mudar o formato do bundle. Fechar o aplicativo exige cancelar a aquisição ou salvar/descartar uma imagem preservada.

Cancelar imagem usa uma operação própria no main: uma foto ausente não encerra vídeo/rolagem. O cancelamento autorizado do controlador de vídeo iniciado solicita stop/finalização, conservando o renderer e seus trechos para salvar/repetir em caso de falha.

O runner Node de pixels cria uma raiz temporária exclusiva e lança a fixture GUI visível. Antes de Electron ficar pronto, a fixture define e verifica `userData`, `sessionData`, logs e crash dumps dentro dessa raiz; a biblioteca fica em um subdiretório. O pai remove somente a raiz própria depois do encerramento do filho. Não use `windowsHide:true` para a fixture visual: no Windows isso pode impedir a exibição inicial da superfície que precisa ser capturada. O runner exige o resultado explícito e os marcadores de assertions/limpeza, além do código de saída. `--verify-failure-exits` confere assertion, exceção, rejeição e falha de limpeza, todas com exit1 após limpeza assíncrona. A mudança de cor durante o atraso exige confirmação DOM e pixels da apresentação antes da aquisição, mantendo o prazo original.

## Precisão e presets — etapa 4b3

A seleção oferece lupa sem interpolação, setas para mover um pixel do bitmap e Shift para dez. **Criar região** permite começar só pelo teclado. X/Y são coordenadas globais DIP, incluindo valores negativos; largura/altura são pixels da saída. Proporções 1:1, 4:3 e 16:9, tamanhos 640×480/1280×720 e tamanho fixo personalizado ajudam a repetir enquadramentos. Dimensões que não cabem são recusadas. A lupa lê o bitmap original da prévia; em uma composição entre monitores, essa grade usa a escala comum da saída, não inventa uma origem física Windows.

Em **Modos de imagem → Precisão, padrões e presets**, salve atraso, cursor, destino (editor ou biblioteca atual), temporização e precisão. Cada preset tem nome, modo e atalho opcional. É possível guardar a última região confirmada nos modos de imagem. Repetir conserva coordenadas/escala e exige a mesma topologia (IDs, bounds, escala e rotação). Topologia alterada exige nova seleção. Repetição obtém uma imagem nova: com temporização nova aplica o atraso salvo; com congelamento captura ao invocar, sem atraso. O bitmap anterior nunca é persistido como preset.

O arquivo versionado `photo-presets.json` fica no userData, separado das preferências de biblioteca e monitor, com escrita atômica. Não contém tokens de fontes, HWNDs nem títulos de janelas. Presets de janela/controle abrem uma nova escolha entre fontes atuais. Arquivo inválido é preservado e informado; não é substituído silenciosamente. Atalhos aceitam Ctrl/Alt, Shift opcional e letra/número/F1–F24. Conflito de registro ou falha de escrita preserva o preset e os atalhos anteriores; atalhos alheios ao registro de presets não são removidos. Ao reabrir, conflitos externos são exibidos no diálogo. O atalho passa pela mesma barreira de salvamento do editor; cancelamento ou troca de biblioteca durante essa espera impede a captura tardia.

O runner `tests/capture-precision-renderer.cjs`, incluído em `test:renderer`, exercita a interface real em 1366×768, pixels conhecidos da lupa, teclado, números, proporção/tamanho, persistência real em arquivo temporário, conflitos, repetição, topologia inválida e resposta de preset cancelada. A captura nativa usa somente superfícies próprias. Os diagnósticos WGC sem fonte/causa identificada registrados no re-review de 4b2 continuam um limite histórico; um passe posterior sem esse diagnóstico não comprova sua resolução.

Esse runner também executa `tests/capture-selection-service.cjs`: a seleção real do Chromium confirma no serviço `PhotoCapture`, com bitmaps sintéticos conhecidos, escalas 1/1,25/1,5/1,75/2, origens negativas inteiras/fracionárias e regiões nas bordas. Confere dimensões e todos os pixels em modo novo/congelado e após recarregar a última região do arquivo. A contenção compara os limites diretamente, sem reconstruir/comparar textos JSON das dimensões fracionárias, arredondar DIP ou admitir recortes fora da seleção. Essa evidência não substitui a matriz física de monitores.


A verificação de rolagem inclui testes de pixels e workers reais e `tests/scroll-renderer.cjs`, com o controlador Chromium em 410×720 ligado à sessão de produção e ao worker do build. `test:scroll-native` usa duas janelas WinForms opacas próprias, sem screenshots, clipboard ou movimento global do mouse: verifica offsets verticais/horizontais, parada, perda de foco, bounds e saída/limpeza explícitas. WinForms não usa perfil Electron; as fixtures Electron existentes continuam isolando userData/sessionData/logs/crashes antes do ready. Essa evidência não homologa todos os aplicativos nem substitui 4d.

O percurso `pnpm edi:test:native edicaptura` agora exercita o editor licenciado com fotos, anotação e rolagem em alvo Chromium externo próprio. Rode gates GUI em sequência. Uma roda endereçada exige foco elegível dentro da janela ativa autorizada e a região inteira dentro desse destinatário; caso contrário, a automação interrompe sem enviar entrada. Isso evita duplicação pelo encaminhamento de mensagens de filhos Chromium e conserva o modo assistido para aplicativos incompatíveis. A prova WinForms também recusa um controle focado fora da região.

Fechar após expiração salva o documento pela operação de recuperação permitida e fecha somente após confirmação da escrita. Não consulta a biblioteca durante esse fechamento; erro de gravação mantém o editor aberto para retry. Salvar normalmente continua atualizando a biblioteca. Os testes reais de renderer cobrem as duas respostas, além do histórico/raster25MB e zero exportação em renomeação.

Modo ativo nativo permanece não verificado no harness controlado: pedir foco da fixture não demonstrou a origem autoritativa de uma aquisição; a raiz descartável foi removida após os filhos fecharem, sem inspeção posterior, e esse caso foi retirado. A funcionalidade do produto permanece. Consulte a [matriz Windows](../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/matriz-windows.md) para separar evidência licenciada sintética, limitações de clipboard, monitores observados e cenários físicos pendentes.

## Vídeo rápido — fase 5b

Ao abrir uma gravação ou WebM legado, o painel mostra metadados reais. A duração ausente no cabeçalho é calculada pelos timestamps dos pacotes, nunca pelo tamanho em bytes. Aparar início/fim preserva o WebM e salva uma receita versionada no projeto: desfazer/refazer nesta sessão, reabrir e transportar o projeto mantêm o intervalo. A reprodução limita esse intervalo. Não há cortes internos nem união de clipes.

**Exportar / Salvar MP4** gera H.264/yuv420p com AAC se o original contém áudio, largura máxima escolhida até1920px, qualidade padrão ou compacta. **Salvar quadro atual** produz PNG da posição selecionada. GIF aceita intervalo até30s, largura até960px e5–20fps; mostra estimativa sem compressão e prévia do GIF efetivamente codificado. Progresso/cancelamento são locais; cancelamento e expiração encerram o processo antes de remover staging. Falhas preservam a fonte. Metadados da origem, capítulos e faixas não selecionadas são excluídos da saída. A exportação antiga WebM/em lote continua para vídeos sem receita; vídeos aparados orientam exportar MP4/GIF pelo editor para não compartilhar acidentalmente o original inteiro. Clipboard continua com400MB e os mesmos checks de identidade/hash; arquivos maiores podem ser salvos.

O Captura funciona sem instalar EdiAula, EdiPDF ou outra ferramenta. Código comum é consumido de `@informach/edi-desktop/native-media` no build; seu instalador inclui seu próprio `resources/native-media` com executáveis, licenças, fonte e rebuild. Não busca binários nas instalações de outros apps. Em desenvolvimento usa `.cache/edi-native-media/windows-x64/bin` do workspace; preparar/verificar pelo fluxo compartilhado `pnpm edi:media:build` / `pnpm edi:media:test`, sem download próprio. O teste de resolver usa uma raiz isolada somente do Captura; o gate de pacote verifica inventário assinado e NSIS dos dois consumidores com chaves efêmeras. Isso é construção/verificação local, não instalação ou publicação. Evidências exatas e limites estão no relatório5b.

Apenas uma operação rápida por vez; executor comum até4processos, stdout acumulado2MiB, cauda de stderr8KB e prazo máximo1h. Probe até5min e10milhões de timestamps quando necessário; vídeos até24h/100megapixels, saída até32GiB sujeita a espaço e reserva256MiB. MP4/GIF limitam altura a4096px. A prévia GIF guarda somente o resultado atual, revogado/removido antes da próxima saída e no fechamento normal; crash pode deixar cache próprio no perfil. Não se homologa hardware/áudio ambiente, clipboard global, longas gravações ou instalação no usuário por esses testes. Gravações com microfone ou áudio do PC trazem uma faixa Opus misturada no WebM, que a exportação MP4 converte para AAC.

O teste de receita é portátil e integra `test`; os testes reais Windows ficam no script obrigatório `test:video-native`, selecionado pela capacidade do catálogo em `edi:media:test`. O workflow `edi-native` aguarda `edi-media`, baixa o mesmo bundle verificado e só então executa o renderer. Release e upgrade consultam a capacidade no catálogo; os upgrades dos consumidores de mídia aguardam sua construção/verificação. Não há skip por ausência de binário nem download de outro app.

A fase 5c (som, contagem e pausa), a fase 6 (texto da imagem, dados sensíveis e passos) a fase 7 (guias simples) e o assistente da fase 8 foram implementados em 19/10/2026 sobre a [base comum](../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/base-comum.md). As demais fases seguem a ordem registrada lá.

## Som, contagem e pausa — fase 5c

Ao começar um vídeo, a janela de controle mostra o painel de som antes do primeiro quadro:

- **Microfone**: liga/desliga, escolha do dispositivo (vazio é o padrão do Windows), volume de 0 a 200 %, **Mudo** e medidor. O microfone abre já na contagem, para conferir o nível antes de gravar. Sem cancelamento de eco, supressão de ruído ou ganho automático: é a voz como o microfone entrega. Um microfone escolhido que não está conectado volta ao padrão e a interface avisa; falha ao abrir mostra o motivo e a gravação segue sem ele.
- **Áudio do PC**: liga/desliga, volume, **Mudo** e medidor. Vem do loopback do Windows pelo Chromium, pedindo para deixar de fora o som da própria janela de controle (`restrictOwnAudio`). Se o Windows não separar esse som, a interface avisa que o áudio do PC pode incluí-lo; se não entregar áudio, a gravação segue sem ele.
- **Contagem**: 0, 3, 5 ou 10 s (padrão 3). **Gravar agora** pula a contagem e **Cancelar** encerra a captura sem gravar.

As duas fontes passam cada uma por seu ganho e medidor e viram uma faixa única no WebM (Opus, 160 kbit/s); não há edição de faixas. Volume e mudo podem mudar durante a gravação; ligar/desligar fontes e trocar de microfone, só antes de começar. O medidor mostra o nível depois do volume, avisa quando a fonte estoura e quando o microfone fica mais de 10 s em silêncio. As opções ficam em `video-options.json` no perfil, gravado de forma atômica; um arquivo ilegível é informado e preservado até a pessoa salvar novas opções.

**Pausar** (ou Ctrl+Shift+F9) para o gravador e o relógio: nada é gravado durante a pausa, e a duração salva é só a ativa. Retomar continua no mesmo arquivo. Se o disco ainda estiver segurando a gravação, a retomada acontece quando os trechos forem confirmados. Parar durante a pausa salva normalmente.

A permissão segue as opções: o microfone só abre para a janela de controle de um vídeo com microfone ligado, e o áudio do PC só junto com a captura da tela já iniciada e com a opção ligada. Câmera e qualquer outra janela continuam negadas.

Os medidores, o loopback e a regra de exclusão do som do app vêm de `@informach/edi-desktop/audio`, os mesmos do EdiAula. `tests/recording-renderer.cjs` cobre som e pausa no Chromium real com microfone simulado e tom sintético no lugar do áudio do PC: os dois medidores registram sinal, a faixa é Opus, nada é emitido durante a pausa, o relógio para e a duração ativa exclui a pausa. Isso não homologa microfones, placas de som, Bluetooth nem o loopback físico do Windows; esses casos continuam na [matriz Windows](../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/matriz-windows.md).

## Texto da imagem, dados sensíveis e passos — fase 6

Em **Texto da imagem** (painel lateral do editor), **Reconhecer texto** lê a captura aberta neste computador, com o OCR local da suíte (`@informach/edi-ocr`: Tesseract e modelos em português, inglês e espanhol, que vão dentro do instalador do Captura). Nada é baixado nem enviado. Escolha de um a três idiomas. Capturas com rolagem maiores que 8192 px são lidas em blocos sobrepostos, até 32 767 px por lado; o resultado volta às coordenadas da imagem original. **Cancelar** encerra o motor, e um resultado que termina depois de trocar de captura é descartado.

- O resultado fica em `<id>.ocr`, ao lado do projeto, e acompanha backup, duplicação, projeto portátil e importação. Ele vale para o original daquele momento: guarda o SHA-256 e o tamanho de `<id>.png`, e um arquivo cujo original mudou não é mostrado (a interface pede para reconhecer de novo). "Nenhum texto encontrado" é diferente de "reconhecimento indisponível", que mostra o motivo.
- Cada linha pode ser corrigida. A correção fica separada do que foi lido (o original aparece como dica), vale para a cópia e a busca e não muda a imagem. Linha esvaziada sai do texto.
- **Copiar texto visível** copia só as linhas que a imagem final mostra: linhas sob **Ocultar** ou **Pixelizar** (também girados: vale toda a área que os cantos cobrem), ou fora do recorte, ficam de fora, porque podem ser justamente o que a pessoa cobriu. A interface diz quantas ficaram de fora.
- **Apagar texto reconhecido** remove `<id>.ocr` e o tira da busca; a imagem continua igual.

**Procurar dados sensíveis** sugere e-mail, telefone, CPF e CNPJ (com dígito verificador) e credenciais no texto lido. Sugestões confirmadas por dígito ou formato vêm marcadas; as outras aparecem como "conferir". Passar o mouse destaca a área na imagem. **Ocultar selecionados** cria máscaras opacas (**Ocultar**) com 3 px de margem, numa única alteração que um **Desfazer** remove inteira. É heurística: pode deixar passar ou marcar a mais, e a interface pede para conferir a imagem antes de compartilhar.

Na biblioteca, **Texto das imagens** inclui o texto reconhecido (com correções) na busca. É opcional e só local; o texto é lido na primeira busca desse tipo e não é truncado. Medido em `src/main/ocr-library.test.cjs`: 10.000 capturas com cerca de 3.800 caracteres cada, cerca de 20 ms por busca nesta máquina.

**Passos numerados** (A04): **Renumerar pela posição na imagem** (de cima para baixo, da esquerda para a direita) ou **Renumerar mantendo a ordem atual** (fecha lacunas e repetições). O painel mostra antes o que muda (`3→1, 3→2…`) e cada renumeração é uma alteração desfazível. Números repetidos de projetos antigos só mudam por essa ação. **Número do passo selecionado** troca o número; se outro passo já o usa, os dois trocam entre si.

Verificação: `src/domain/ocr.test.ts` (ordem de leitura, correções e texto oculto por máscara, pixelização e recorte), `src/main/ocr-library.test.cjs` (arquivo ao lado do projeto, original alterado, correções, busca opcional, apagar, duplicar, projeto portátil e a medição de 10.000 capturas) e `tests/ocr-renderer.cjs`, incluído em `test:renderer`. Este último roda o worker e os modelos reais no Chromium sobre imagens sintéticas: três linhas lidas, CPF e e-mail sugeridos, duas máscaras desfeitas de uma vez, texto mascarado fora da cópia, captura de 12.000 px em blocos, cancelamento, resultado tardio descartado e renumeração/troca de passos. Não substitui medir a qualidade do OCR em telas reais variadas (fontes pequenas, temas escuros, escalas de DPI).

## Guias simples — fase 7

**Guias** (barra superior do editor) abre a lista de guias e o editor de um guia: título, descrição, layout (**Tutorial**, um passo abaixo do outro, ou **Comparação**, dois por linha) e os passos. Cada passo tem imagem, título, descrição e texto alternativo, e pode subir, descer ou ser removido. Tudo é salvo sozinho, cerca de meio segundo depois de cada alteração; se a gravação falhar, a interface avisa e mantém as alterações abertas para tentar de novo.

- **Adicionar da biblioteca** e **Adicionar captura aberta** guardam a imagem final da captura, com máscaras, pixelização, recorte e transformações, como sai na exportação. O original e os objetos editáveis nunca entram no guia; o passo guarda só uma referência à captura de origem.
- **Capturar passos** fecha o editor do guia e mostra uma faixa na parte de baixo da tela. Cada nova captura de imagem (Capturar, Print Screen, modos de imagem) entra como o próximo passo do guia, além de ficar na biblioteca, e o editor não muda de captura. **Concluir passos** volta ao guia. Vídeos abrem normalmente.
- **Exportar HTML** grava um arquivo único, com as imagens embutidas, sem script e sem nenhum recurso remoto (a própria página declara isso na política de conteúdo). Textos são escapados. **Exportar PDF** imprime esse mesmo HTML no Chromium do app, numa janela oculta, sem JavaScript e numa sessão só em memória. O arquivo temporário é apagado em seguida. Não há segunda biblioteca de PDF no Captura; editar, juntar ou assinar o PDF é trabalho do EdiPDF.
- **Mover para a lixeira** e **Restaurar** mantêm os arquivos. O guia fica em `<id>.guide` (JSON) e `<id>.<imagem>.png` na pasta da biblioteca, de modo que o backup integral da biblioteca leva os guias junto. O índice de capturas não lê esses arquivos.

Limites: 200 passos por guia, 25 MB por imagem de passo e 300 MB de imagens por guia (embutidas em base64 num único HTML, que precisa caber no limite de texto do JavaScript). Uma captura com rolagem muito alta pode passar de 25 MB como PNG; nesse caso o passo não entra, a interface mostra o erro e o guia continua como estava salvo. No modo **Capturar passos**, uma captura que não entra no guia é aberta normalmente no editor. Não há DOCX, modelos nem editor geral de documentos.

Verificação: `src/main/guides.test.cjs` (passos e imagens, reordenação, imagens ausentes, inválidas ou de outro tamanho, lixeira, índice e backup; HTML escapado, sem script e autocontido), `tests/guides-renderer.cjs` no Chromium com o armazenamento real (a imagem do passo mostra a máscara e não o que estava por baixo, texto alternativo e ordem salvos, captura de passos, exportações, lixeira) e `tests/guide-pdf-native.cjs`, que imprime um guia de três passos no Electron real e confere o PDF de várias páginas e a remoção do arquivo temporário. Os dois últimos estão em `test:renderer`.

## Assistente pela sua assinatura — fase 8

O assistente é opcional e usa o **Claude Code** ou o **Codex** instalados no computador, com a conta da própria pessoa. O EdiCaptura não pede chave, não guarda credenciais, não usa créditos Edi e não oferece API paga ([decisão](../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/decisao-ia-assinatura.md)). Não é um chat: há duas tarefas delimitadas.

- **Assistente (sua assinatura) → Sugerir título e etiquetas**, no painel lateral do editor, para a captura aberta.
- **Sugerir textos com o assistente**, no editor de guias, que propõe título, descrição e texto alternativo de cada passo (até 20 passos por vez).

Antes de enviar, **Conferir antes de enviar** mostra exatamente o que vai: a imagem final já saneada (com máscaras, pixelização e recorte, em JPEG de até 1280 px) e, só se a pessoa marcar, o texto visível reconhecido. Texto sob máscara ou fora do recorte nunca entra. O assistente recebe apenas uma ferramenta para ler a tarefa e outra para propor. Não há arquivos, terminal, biblioteca, originais nem outras capturas. O servidor MCP local do Captura responde só ao token da tarefa em curso, com escopos de leitura e proposta; qualquer outro token não vê ferramenta nenhuma. Não há botão Conectar para clientes externos.

A proposta aparece para revisão. **Aplicar** usa a mesma atualização de nome e etiquetas da biblioteca (ou os campos do guia) e **Desfazer sugestão aplicada** volta ao que era. **Parar**, trocar de captura, sair da conta (aqui ou em outra ferramenta) ou fechar o app encerram a tarefa e o token, e uma resposta que chegue depois é descartada. Sem Claude Code ou Codex instalado, a revisão explica como instalar e o trabalho continua igual. Cada execução tem prazo de 10 minutos.

Verificação: `src/main/assistant.test.cjs` usa o servidor MCP real e tokens de execução reais, com um motor substituto que age como o modelo pela rede local: só o token da tarefa vê as ferramentas, a proposta errada é recusada, a válida chega, e depois de **Parar** as chamadas tardias são recusadas sem entregar nada. `tests/assistant-renderer.cjs` cobre no Chromium a imagem conferida (com a máscara), o texto só quando marcado, aplicar/desfazer, a proposta tardia ignorada após trocar de captura, a falta de cliente e os textos do guia. Nenhum teste inicia Claude Code ou Codex reais nem consome assinatura.

**Compartilhamento por link continua pendente.** Ele exige armazenamento privado no servidor, expiração, revogação e cotas, e esse armazenamento ainda não foi escolhido. Até lá, compartilhe os arquivos exportados (imagem, MP4/GIF, HTML ou PDF do guia).

