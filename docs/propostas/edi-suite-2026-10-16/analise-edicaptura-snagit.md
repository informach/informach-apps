# EdiCaptura: diagnóstico funcional e substituição do Snagit

Data: 18/10/2026. Base examinada: `main`, commit `88c1163`, manifest do EdiCaptura `0.2.2`. A versão do manifest do editor não deve ser confundida com a versão comercial da suíte, derivada da tag de release.

Solicitação: analisar ajustes, melhorias e funcionalidades ausentes para substituir completamente o Snagit com mais eficiência, simplicidade e inteligência. Este documento é um diagnóstico e uma recomendação de produto, não uma autorização de implementação, mudança de preços ou publicação.

## 1. Conclusão

**Atualização de escopo aprovada pelo titular em18/10/2026:** este diagnóstico permanece como histórico das lacunas. Após avaliar sobreposição com EdiAula/EdiPDF, o titular escolheu [Enxuto com vídeo rápido](edicaptura-lotes/foco-na-suite.md). Recursos futuros de vídeo avançado e edição geral de documentos não serão duplicados no Captura; a revisão final usa essa decisão junto do diagnóstico, sem declarar itens retirados como implementados nem prometer paridade individual irrestrita.

O EdiCaptura tem uma base útil de captura regional e anotação, com cuidados reais de isolamento, DPI, licença e preservação de gravações. Ainda não substitui o Snagit integralmente. Os maiores impedimentos são integridade de documentos em alguns fluxos, captura limitada a regiões de um monitor, vídeo sem áudio e sem edição, edição de imagem básica, ausência de OCR e de documentação automática de processos, biblioteca restrita e ausência de compartilhamento por link.

A prioridade recomendada é: proteger trabalhos; completar captura e edição cotidianas; entregar vídeo curto utilizável; organizar e distribuir o resultado; depois automatizar tarefas repetitivas. OCR, ocultação de dados e captura de passos devem integrar essa sequência, e não depender de um chat genérico de IA.

Não há medição comparativa que comprove que o EdiCaptura é mais rápido, leve ou simples que o Snagit. A arquitetura permite identificar custos e oportunidades; a superioridade precisa ser demonstrada em tarefas equivalentes, hardware representativo e testes com pessoas.

## 2. Método e limites

- Leitura dos arquivos de implementação: main, preload, editor, canvas, seleção, monitores, moldura, rolagem e gravação; inspeção dos testes, manifests, workflows e documentação aplicável.
- Pesquisa em páginas e tutoriais oficiais atuais da TechSmith. A referência inclui recursos atuais, e não apenas os do Snagit antigo.
- Execução dos 43 testes Node do app e das 13 verificações existentes do canvas em Chromium.
- Reprodução adicional de seis comportamentos problemáticos com código real do renderer e da biblioteca, imagens sintéticas, IPC substituído apenas na fronteira e dados locais isolados.
- Execução de `pnpm edi:test:native edicaptura`, com chaves efêmeras e perfis isolados, sem instalar ou publicar o produto.
- Inspeção visual do renderer em 1366 × 768. Não houve teste de usabilidade com pessoas, benchmark contra instalação do Snagit, teste funcional completo de captura de tela física, matriz de múltiplos monitores/HDR, captura de áudio ou homologação de instaladores nesta análise.

Legenda: **reproduzido** é comportamento observado nesta sessão; **código** é conclusão direta do fluxo implementado; **risco** é consequência possível que precisa de experimento específico. Funcionalidade ausente significa ausência no app examinado, não inexistência de recursos relacionados em outros produtos da suíte.

| Prioridade proposta | Significado |
| --- | --- |
| P0 | Integridade e preservação de trabalhos; corrigir antes de expandir o fluxo afetado. |
| P1 | Bloqueio relevante para adoção diária ou substituição do Snagit. |
| P2 | Produtividade, qualidade e cobertura de casos profissionais. |
| P3 | Alcance adicional a validar após os fluxos principais. |

## 3. O que existe e deve ser preservado

| Área | Implementação atual | Limite relevante |
| --- | --- | --- |
| Imagem | Região por arraste, oito alças, largura/altura em pixels, Enter/Esc. | Sem seleção automática de janela ou captura entre monitores. |
| Monitores | Escolha explícita ou monitor do cursor; preferência persistida. | Uma captura fica em um monitor. Matriz física requer homologação funcional. |
| DPI e moldura | Conversão por dimensões reais, linha de um pixel físico, quatro janelas transparentes, passagem de cliques e exclusão da captura. | Necessário testar GPUs, escalas e versões do Windows. |
| Rolagem | Coleta após estabilidade, alinhamento vertical, foto manual, união e sobreposição manual. | Usuário movimenta a página; até 30 trechos, 30.000 pixels de altura e 100 megapixels. |
| Anotação | Setas, texto, retângulos, destaque, caneta, passos e pixelização. | Texto de uma linha; formas e manipulação de objetos básicas. |
| Edição | Mover/excluir anotações, recortar, restaurar recorte e desfazer/refazer. | Sem redimensionar/rotacionar objetos, camadas, composição ou redimensionar imagem. |
| Biblioteca | Original e JSON separados, busca por nome, recentes e projetos internos. | Sem excluir itens, tags, filtros, ações em lote ou projeto portátil. |
| Entrada/saída | Importa PNG/JPEG/WebP; copia imagem final; exporta PNG/JPEG e WebM. | Sem exportar WebP, PDF, GIF ou MP4; sem colar/arrastar arquivo. |
| Vídeo | Região a 30 fps, WebM VP9/VP8, bitrate solicitado de 6 Mbps, até cinco minutos. | Sem áudio, webcam, pausa ou edição. |
| Preservação | Autosave de imagens, fila de escrita, exportação atômica, recuperação de vídeo ao finalizar e preservação sob restrição comercial. | Sem recuperação automática após crash no meio da gravação/reinício. |
| Suíte | SDK comum de sessão/licença/atualização, sandbox, isolamento e autorização no main. | Integração comercial não equivale a paridade funcional. |

Referências: [main](../../../apps/edicaptura/src/main/main.cjs), [canvas](../../../apps/edicaptura/src/editor/canvas.js), [editor](../../../apps/edicaptura/src/editor/editor.js), [gravação](../../../apps/edicaptura/src/recording/recorder.js), [biblioteca](../../../apps/edicaptura/src/main/library.cjs).

## 4. Funcionalidades que precisam de ajustes

São defeitos ou incoerências em comportamentos já oferecidos.

### A01 — Abrir imagem deve preservar a identidade do documento em caso de falha — P0

**Reproduzido.** `open()` troca `current`, título e estado de salvamento antes de aguardar `engine.load()`. Se a decodificação falha, a imagem/anotações anteriores permanecem no engine, mas o documento ativo já é o novo. Abrir imagem inválida e clicar em Salvar gravou uma anotação vermelha do documento anterior no ID `broken-image`.

Correção: preparar e validar o próximo documento antes de substituir o atual; impedir que uma carga antiga termine por cima de outra. Em erro, manter imagem, nome, ID, histórico e estado pendente coerentes.

Aceite: imagem inválida, oversized ou carga concorrente não grava conteúdo sob o ID de outro projeto. Referências: [editor.js](../../../apps/edicaptura/src/editor/editor.js), `open`, linhas 211–226; [canvas.js](../../../apps/edicaptura/src/editor/canvas.js), `load`.

### A02 — Rolagem deve preservar trechos quando o monitor muda — P0

**Código.** `displaysChanged` interrompe vídeo solicitando salvamento, mas, para rolagem, chama `cleanup()`, que elimina a sessão e os trechos em memória. Alteração de resolução, escala/rotação ou desconexão pode descartar trabalho já fotografado. A preservação para expiração de licença não cobre esse caminho.

Correção: interromper novas fotos, finalizar ou persistir trechos obtidos e oferecer recuperação. Falha de disco deve manter uma tentativa explícita de salvamento. Cancelamento voluntário e interrupção do sistema precisam de tratamentos próprios.

Aceite: a matriz de eventos de monitor comprova preservação dos trechos anteriores à interrupção. Referência: [main.cjs](../../../apps/edicaptura/src/main/main.cjs), `cleanup`, `preserveCapture` e `displaysChanged`, especialmente linhas 767–784. Não foi reproduzida desconexão física nesta sessão.

### A03 — Renomear vídeo precisa salvar de verdade — P1

**Reproduzido.** Nome fica habilitado para vídeo, mas `scheduleSave()` e `persist()` retornam sem salvar documentos que não são imagem. Renomear e trocar de documento restaura o nome anterior; nenhuma chamada de salvamento do vídeo é feita.

Correção: separar salvamento de metadados da edição de imagens. O handler `library:save` fixa `kind: "image"`; apenas remover a condição do renderer poderia corromper a classificação de um vídeo.

Aceite: nome persiste ao trocar, fechar e reabrir; bytes e tipo continuam WebM. Referências: [editor.js](../../../apps/edicaptura/src/editor/editor.js), linhas 182–208 e 338; [main.cjs](../../../apps/edicaptura/src/main/main.cjs), `library:save`.

### A04 — Numeração dos passos após exclusão — P1

**Reproduzido.** Próximo número é quantidade de passos + 1. Criar 1, 2, 3, excluir 2 e adicionar outro gera **1, 3, 3**.

Correção: numeração automática sem duplicatas, com renumeração e futura edição explícita. A identidade do objeto deve ser separada do rótulo.

Aceite: inserir, excluir, reordenar, desfazer e refazer não criam duplicatas involuntárias. Referência: [canvas.js](../../../apps/edicaptura/src/editor/canvas.js), linha 142.

### A05 — Painel de propriedades deve refletir a seleção — P1

**Reproduzido.** Selecionar retângulo vermelho mantém a cor azul da ferramenta no estado e na interface. A callback de seleção apenas habilita Excluir; não sincroniza cor, opacidade, espessura e tamanho de texto.

Correção: distinguir estilo padrão para novas anotações das propriedades do objeto selecionado. Mostrar propriedades compatíveis e valores sincronizados.

Aceite: selecionar objetos atualiza painel sem modificar imagem; editar propriedade altera somente objeto esperado. Referências: [editor.js](../../../apps/edicaptura/src/editor/editor.js), callback `selection`; [canvas.js](../../../apps/edicaptura/src/editor/canvas.js), `updateStyle`.

### A06 — Biblioteca não deve esconder arquivos problemáticos — P1

**Reproduzido.** JSON inválido faz `Library.list()` omitir item sem aviso. A reprodução preservou PNG no disco e retornou biblioteca vazia. Existe teste que aprova ignorar metadados corrompidos; o contrato atual precisa evoluir.

Correção: identificar registros danificados, avisar, preservar arquivos e permitir recuperação/reindexação. Validar versão, tipo de mídia, anotações, recorte e limites; hoje validação limita tamanho/quantidade, mas não define schema completo.

Aceite: registro corrompido não derruba nem desaparece silenciosamente da biblioteca; recuperação nunca sobrescreve o único original. Referências: [library.cjs](../../../apps/edicaptura/src/main/library.cjs), linhas 16–48; [library.test.cjs](../../../apps/edicaptura/src/main/library.test.cjs).

### A07 — Cronômetro e mensagens devem acompanhar gravação efetiva — P1

**Código.** Controle inicia contagem em `Date.now()` quando sua página carrega; não quando começa a gravação. `record:ready` não altera estado. Existe `RecordingClock`, com teste de pausa, mas não é usado pelo controle nem recorder; não existe pausa funcional na interface.

Correção: estados de preparando, gravando, pausado, finalizando, salvo e falhou, alimentados por eventos reais. Separar tempo de vídeo do tempo da sessão.

Aceite: demora na permissão/inicialização não aumenta duração exibida do vídeo; limite, relógio e resultado coerentes. Referências: [control.js](../../../apps/edicaptura/src/recording/control.js), linhas 47–54; [clock.mjs](../../../apps/edicaptura/src/recording/clock.mjs); [main.cjs](../../../apps/edicaptura/src/main/main.cjs), `record:ready`.

### A08 — Histórico deve respeitar limites em todas as operações — P2

**Reproduzido.** `checkpoint()` limita passado a 60 entradas, mas mover objetos usa `past.push()` diretamente. Reprodução terminou com 75 estados. Snapshots completos amplificam custo com traços extensos de caneta.

Correção: um mecanismo de histórico com limite de operações e orçamento de memória; agrupar eventos de gesto/ajuste contínuo.

Aceite: movimentos e sliders não crescem indefinidamente nem tornam desfazer imprevisível. Referência: [canvas.js](../../../apps/edicaptura/src/editor/canvas.js), linhas 54–58 e 207–213.

### A09 — Erro de autosave precisa deixar estado pendente explícito — P1

**Código.** Autosave mostra “Salvando alterações…” e, em falha, exibe toast, mas não muda status para “Não salvo”. Não há modelo explícito de dirty/error/retry. Fechamento aguarda `persist()`, o que é positivo; indicação permanente é insuficiente.

Correção: estado de salvamento por revisão, erro persistente e nova tentativa. Salvamento antigo não deve anunciar que revisão mais nova já foi salva.

Aceite: falha de disco fica visível até recuperação; abrir outro arquivo/fechar não perde alterações nem informa sucesso incorretamente. Referência: [editor.js](../../../apps/edicaptura/src/editor/editor.js), `scheduleSave`, `persist` e `onBeforeClose`.

### A10 — Documentação e testes devem corresponder ao app integrado — P1

**Código/documentação.** README orienta Node 22, `npm install` e `npm start`; workspace usa Node 24.15.0, pnpm 9.15.0 e desenvolvimento via `dev`. PLANO cita Electron 42 e falhas nativas históricas; manifest usa Electron 44.8.0 e integração nativa passou nesta sessão. README diz “sem serviços externos”, mas sessão/licença/atualização têm comunicação externa; processamento das capturas é local.

Smoke legado `test:e2e` não provisiona licença efêmera do harness da suíte e não isola explicitamente cofre compartilhado. Não foi executado nesta sessão. Workflow nativo verifica acesso/integração, mas não executa esse percurso completo de captura/anotação/vídeo/rolagem.

Correção: alinhar guias e incorporar fluxos funcionais ao harness isolado atual, sem bypass comercial. Identificar precisamente o que cada teste comprova.

Aceite: pessoa segue README em checkout limpo; CI detecta defeitos reproduzidos e exercita captura real em ambiente apropriado. Referências: [README](../../../apps/edicaptura/README.md), [PLANO](../../../apps/edicaptura/PLANO.md), [smoke](../../../apps/edicaptura/tests/smoke.cjs), [teste nativo](../../../scripts/edi/test-native.mts).

## 5. Funcionalidades existentes que precisam de melhorias

| ID | Prioridade | Funcionalidade | Evolução e critério de resultado |
| --- | --- | --- | --- |
| M01 | P1 | Seleção de região | Lupa, ajuste por teclado, proporções/dimensões favoritas, repetir última região. Precisão não pode depender de acertar o arraste na primeira tentativa. |
| M02 | P1 | Rolagem assistida | Preview da união, desfazer/remover trecho, ajuste por emenda, confiança do alinhamento e aviso de limite. Sobreposição única não resolve deslocamentos diferentes. |
| M03 | P1 | Anotações | Editar texto existente, multilinha, seleção geométrica precisa, alças, rotação, duplicação e ajuste por teclado. Hoje muitos ajustes exigem excluir/recriar. |
| M04 | P1 | Espaço de trabalho | Painel contextual, recentes recolhíveis, modo compacto, zoom por roda/atalho e mão/espaço. Em 1366 × 768, cabeçalhos/ferramentas/recentes deixam pouca altura para imagem; medir tarefas antes de redesenhar. |
| M05 | P1 | Biblioteca | Miniaturas na criação, miniatura/duração de vídeo, paginação/virtualização, busca indexada e atualização incremental. Hoje lê todos os JSON, recria cards e refaz listagem após saves. |
| M06 | P1 | Vídeo/persistência | Gravar incrementalmente em disco, recuperar interrupções, estimar espaço e separar finalização da reprodução. Chunks ficam em memória até parada e vídeo reabre como data URL. |
| M07 | P1 | Exportação | Qualidade, dimensão e fundo configuráveis, tamanho estimado, destino/nome lembrados e presets. JPEG tem qualidade fixa 92; vídeo exporta WebM original. |
| M08 | P1 | Pixelização | Explicar no fluxo que original é recuperável, oferecer máscara opaca e saída saneada. README avisa, mas ferramenta não orienta quem compartilha projeto. Pixelização não é promessa de anonimização irreversível. |
| M09 | P2 | Estilos rápidos | Favoritos persistentes por ferramenta e temas de marca com bom contraste. Presets atuais são três setas de cores fixas, mesmo com outra ferramenta ativa. |
| M10 | P1 | Acessibilidade | Seleção/anotações por teclado, estado semântico da ferramenta, rótulos, foco e contraste. Canvas exige representação navegável de objetos. |
| M11 | P2 | Monitores | Homologar escalas mistas, coordenadas negativas, retrato, resolução, suspensão/retorno, docking e HDR. Testes de coordenadas não homologam suporte físico. |
| M12 | P1 | Processamento/manutenção | Workers para alinhamento/composição, evitar PNG completo por autosave, schema versionado/IDs persistentes e tipos do legado. Manifest não declara `typecheck`. Evoluir por fronteiras sem reescrita visual geral. |

Evidência de custo, sem benchmark: `canvas.draw()` recria bitmap inteiro a cada movimento; `persist()` gera PNG completo para preview; biblioteca relê todos os metadados; rolagem captura/compõe no main; vídeo captura monitor, copia para canvas e MediaRecorder, depois Blob/ArrayBuffer/IPC/base64. São candidatos a medição, não prova de lentidão em todo computador.

Uma imagem de 100 megapixels ocupa cerca de **400 MB por bitmap RGBA**, antes de originais, trechos, buffers, PNG e histórico. Limite de pixels precisa de orçamento agregado de memória. Gravação incremental é pré-requisito para aumentar duração com segurança.

## 6. Funcionalidades que ainda precisam ser implementadas

Agrupadas pelo trabalho que a pessoa precisa concluir; algumas agregam pequenos recursos necessários ao mesmo fluxo.

| ID | Prioridade | Funcionalidade ausente | Resultado esperado |
| --- | --- | --- | --- |
| N01 | P1 | Captura de janela/tela inteira em um clique | Detectar janela/controle, capturar janela ativa, oferecer monitor inteiro. Hoje monitor inteiro exige desenhar região. |
| N02 | P1 | Captura temporizada, menus e presets | Atraso, menus/tooltips, cursor opcional, tamanho fixo, última região e atalhos por preset. Documentar estados transitórios. |
| N03 | P1 | Rolagem automática | Controlar rolagem vertical/horizontal, páginas largas/planilhas e início/fim. Tratar cabeçalhos fixos, painéis e conteúdo dinâmico; manter fallback assistido. |
| N04 | P2 | Captura entre monitores/modos especiais | Área atravessando monitores, todos os monitores e, conforme demanda, forma livre. Escalas/coordenadas precisam acompanhar recurso. |
| N05 | P1 | OCR local | Selecionar/copiar texto, reconhecer português, preservar quebras, corrigir e indexar biblioteca por conteúdo com opção de desativação. |
| N06 | P2 | Edição inteligente de imagem | Alterar texto reconhecido, mover/remover componentes, preencher fundo e simplificar interfaces. Preview/desfazer e indicação de baixa confiança. |
| N07 | P1 | Ocultação segura de dados | Máscara opaca irreversível na saída, detecção assistida de e-mail/telefone/documentos/credenciais, revisão e cópia saneada. Detecção não garante ausência de outros dados sensíveis. |
| N08 | P1 | Editor de objetos completo | Balões, elipse, linha, preenchimento, sombras, setas configuráveis, seleção múltipla, grupos, alinhamento e ordem de camadas. Objetos continuam editáveis. |
| N09 | P2 | Composição/acabamento | Redimensionar/rotacionar/espelhar, ampliar canvas, combinar/colar imagens, remover faixa interna, borda/margem/fundo, lupa/spotlight e carimbos próprios/licenciados. |
| N10 | P1 | Áudio de microfone/sistema | Dispositivos, teste de nível, volume/mute e sincronização. Política atual rejeita áudio/câmera; requer captura/permissões/contratos, não só botões. |
| N11 | P1 | Pausa, webcam e MP4 | Pausar/retomar, contagem regressiva, webcam sobreposta reposicionável e duração configurável após gravação incremental. MP4 compatível com mensagens/apresentações. |
| N12 | P1 | Edição rápida de vídeo/GIF | Importar vídeos locais, cortar início/fim/trechos, juntar clips, extrair frame e GIF de intervalo. Não exigir outro editor para remover dois segundos. |
| N13 | P2 | Explicação em vídeo | Destacar cliques/cursor, desenhar durante gravação, narrar uma sequência de capturas, transcrever, revisar legendas e ocultar dados por intervalo. Avançados podem integrar EdiAula por contrato compartilhado. |
| N14 | P1 | Captura automática de passos | Capturar por interação relevante, agrupar cliques redundantes, produzir guia com imagens/setas/texto, reordenar/corrigir/ocultar. Passos atual só insere números em imagem. |
| N15 | P2 | Templates/documentos | Tutorial, comparação, checklist e ficha de problema; combinar capturas e exportar PDF/documento editável/HTML, com texto acessível. |
| N16 | P1 | Gestão da biblioteca | Excluir com lixeira/restauração, tags, favoritos, coleções, filtros por data/tipo/app, lote, duplicar e mostrar no Explorer. Excluir anotação não exclui captura. |
| N17 | P1 | Backup/projeto portátil/migração | Projeto editável com versão/assets, escolher/mover pasta e restaurar backup. Importar PNG/WebM/exportações do Snagit primeiro; investigar SNAGX e declarar limites de fidelidade. |
| N18 | P1 | Link controlado | Upload explícito, visualização sem app, revogação, expiração e controle de acesso. Comentários/versões depois. Reutilizar Railway/storage existente compatível; provedor no monorepo não comprova storage provisionado para mídia. |
| N19 | P2 | Entrada/saída rápidas | Colar, drag-and-drop, copiar arquivo/caminho, destinos favoritos, Office/navegador e lote. Avaliar bandeja/início com Windows com preferência explícita. |
| N20 | P2 | Automação inteligente por tarefa | Título, descrição acessível, passos, recorte e ocultação; “numere estes três botões” produz operações editáveis com preview. Regras/OCR local primeiro; IA remota opcional segue suíte. |
| N21 | P3 | Paridade de plataforma | Alvo atual é Windows. Se substituição abranger macOS, é escopo adicional com captura, permissões, pacote, atalhos, áudio e testes próprios. Não presumir aprovação. |

### Referência competitiva

A TechSmith documenta captura rolável automática/manual, anotação/acabamento, OCR, edição de elementos, biblioteca com filtros/tags, formatos e compartilhamento. Justifica lacunas de captura, imagem e organização. Não exige copiar cada comando: comparar tarefas concluídas. [Recursos oficiais](https://www.techsmith.com/snagit/features/), [rolagem](https://www.techsmith.com/learn/tutorials/snagit/scrolling-capture/).

Microfone, áudio do sistema, webcam e edição curta fazem parte da referência. Cortes, combinação de vídeos, GIF e quadros completam o fluxo. EdiCaptura precisa produzir vídeo pronto para envio sem transferências manuais obrigatórias. [Gravação](https://www.techsmith.com/learn/tutorials/snagit/how-to-capture-video/), [edição de vídeo](https://www.techsmith.com/learn/tutorials/snagit/editing-video/).

Step Capture gera guia a partir de interações; círculos numerados numa imagem são outra capacidade. Smart Redact já é referência competitiva. Recursos variam por plataforma/versão/produto; não atribuir toda edição avançada do Camtasia ao Snagit. [Step Capture](https://www.techsmith.com/learn/tutorials/snagit/step-capture/), [saídas](https://www.techsmith.com/learn/tutorials/snagit/step-capture-outputs/), [Smart Redact](https://www.techsmith.com/snagit/features/smart-redact/).

## 7. Como ficar mais simples e mais inteligente

Apresentar objetivos **Capturar**, **Explicar**, **Proteger dados**, **Criar guia** e **Compartilhar**, oferecendo detalhes quando necessários. É proposta a validar, não revisão visual aprovada.

1. **Captura cotidiana:** atalho → região/janela detectada → anotação rápida → copiar. Editor completo é escolha quando a tarefa pede mais trabalho.
2. **Dado sensível:** captura → detecção local → revisão das máscaras → saída saneada. Compartilhar somente saída revisada; preservar original local conforme decisão explícita.
3. **Tutorial:** iniciar guia → executar processo → revisar imagens/passos/ocultações → exportar/compartilhar. Pedir descrições onde contexto não basta.
4. **Vídeo curto:** selecionar → testar áudio → gravar/pausar → aparar → copiar arquivo/compartilhar. Evitar complexidade de timeline profissional neste percurso.

| Camada de inteligência | Exemplos | Motivo |
| --- | --- | --- |
| Regras/contexto local | Janela/última região, presets, nome pelo app, sugestão de ferramentas. | Baixa latência, sem upload/gasto por inferência. |
| OCR/análise local | Busca, extração, caixas de ocultação e identificação de áreas úteis. | Tarefas recorrentes e privacidade. |
| Modelos opcionais | Redação de guia, descrição acessível, resumo e tradução. | Valor quando contexto exige interpretação. |

Decisão posterior do titular em 18/10/2026: a IA remota opcional do EdiCaptura usará somente a assinatura do próprio usuário no Claude Code ou Codex, seguindo a integração já existente no EdiAula por cliente oficial e MCP local. Isso substitui a proposta inicial de IA paga por créditos para este app. Não implementar opção de chave de API, cobrança por créditos Edi ou fallback pago. Capturas não entram em logs/telemetria. Mostrar o conteúdo exato a disponibilizar ao assistente, permitir revisão e manter edição/exportação local utilizável sem IA. Credenciais dos provedores permanecem nos clientes oficiais. Contratos, limites e referências estão na [decisão de integração](edicaptura-lotes/decisao-ia-assinatura.md).

## 8. Sequência de entrega recomendada

| Etapa | Entrega | Gate |
| --- | --- | --- |
| 1. Confiança | A01–A10; recuperação de sessão; schema/testes. | Falhas de abertura/disco/monitor/licença preservam trabalhos; defeitos têm regressão. |
| 2. Captura e imagem diárias | Janela/timer, OCR básico, máscara opaca, objetos/texto, colar/arrastar e seleção/exportação. | Capturar/anotar/proteger/copiar sem recriar objetos ou outro programa. |
| 3. Vídeo utilizável | Disco incremental, áudio, pausa, MP4, corte/GIF e webcam. | Demonstração narrada recuperável e arquivo compatível. |
| 4. Documentação/biblioteca | Rolagem automática, passos, templates, gestão/backup, projeto portátil/migração. | Processo vira guia revisado; material localizável/restaurável. |
| 5. Distribuição/diferenciação | Link privado, integrações, edição inteligente e automações. | Compartilhar com privacidade e redução mensurável de esforço. |

OCR e ocultação básica entram cedo. Edição inteligente sofisticada e colaboração não devem atrasar integridade. Link pode ser antecipado se pesquisa indicar requisito imediato de migração.

## 9. Critérios para afirmar que substitui o Snagit

1. Capturar região, janela, tela inteira, menu e conteúdo rolável nas aplicações do público-alvo.
2. Editar setas, textos, formas, chamadas e passos existentes sem recriar; reabrir com fidelidade.
3. Extrair texto e gerar saída com ocultação opaca revisada, sem vazar original, preview ou metadados no compartilhamento.
4. Gravar com microfone/sistema/webcam, pausar, aparar e produzir MP4/GIF utilizáveis.
5. Criar guia de processo, editar etapas e exportar documento útil/acessível.
6. Localizar, organizar, excluir/restaurar, fazer backup/migrar com formatos declarados.
7. Compartilhar arquivo/link e revogar acesso quando aplicável.
8. Preservar trabalhos em falhas, suspensão, monitor, expiração comercial e atualização.
9. Passar matriz funcional Windows com escalas distintas e hardware representativo; macOS requer gate próprio.
10. Demonstrar melhora em tempo até resultado, ações, erros e recuperação, com memória/CPU aceitáveis. Medir abertura quente/fria, captura até copiar, arraste de imagem grande, rolagem longa, vídeo e busca com 1.000/10.000 itens. Definir metas após medir base/concorrente.

São critérios de paridade de trabalho. Recursos históricos sem uso validado podem ser substituídos por soluções diretas, declarando diferenças/limites.

## 10. Evidências da sessão

| Verificação | Resultado e alcance |
| --- | --- |
| `pnpm --filter @informach/edicaptura test` | Código 0; `tests 43`, `pass 43`, `fail 0`, `cancelled 0`, `skipped 0`. |
| `node .cache/edicaptura-analysis/verify.cjs` | Código 0; 13 verificações existentes do canvas e seis comportamentos adicionais reproduzidos. Harness/fixtures em cache ignorado. |
| `pnpm edi:test:native edicaptura` | Código 0; inventário físico/ASAR, rejeição de adulteração, launcher GUI, gerenciador, gate, licença offline, expiração e bloqueio IPC. Sem instalar/publicar. |

Reproduções: passos `[1, 3, 3]`; histórico com 75 entradas; objeto `#ff0000` selecionado mantendo estilo `#0062ff`; vídeo sem save de novo nome; imagem inválida recebendo anotação do documento anterior; metadados inválidos omitidos com PNG existente.

Artefatos: `.cache/edicaptura-analysis/results.json`, `editor-1366.png` e `verify.cjs`. Captura visual contém apenas fixtures sintéticas. Teste nativo grava evidências em `.cache/edi-native-results/`.

VERIFICATION REPORT
-------------------
Claim: testes atuais, reproduções focadas e gate nativo de integração executados; sem homologação funcional completa.
Command: `pnpm --filter @informach/edicaptura test`; `node .cache/edicaptura-analysis/verify.cjs`; `pnpm edi:test:native edicaptura`.
Executed: 18/10/2026, nesta sessão, contra o código examinado.
Exit code: 0 nos três comandos.
Output summary: `tests 43; pass 43; fail 0`; `Existing renderer checks: count 13, passed true`; `Verified gate, valid signed offline lease, expiration and IPC denial: edicaptura`.
Warnings: electron-builder informou fallback de detecção pnpm, rebuild desativado e edição/assinatura do executável omitida na fixture portátil. Não comprovam assinatura Windows do produto.
Errors: nenhum na execução final dos três comandos; comportamentos problemáticos permanecem no código.
Verdict: PASS para executar verificações descritas. Não aprova defeitos nem paridade com Snagit.

## 11. Próximo passo

Após este diagnóstico inicial, o titular autorizou a implementação completa em lotes com review entre entregas e full review final. O [plano de execução](../../superpowers/plans/2026-10-18-edicaptura-snagit.md) e os [registros dos lotes](edicaptura-lotes/) acompanham a frente. As evidências e defeitos acima descrevem a base examinada antes da implementação; o estado vigente fica nos registros de execução. Operação/publicação/comercialização seguem gates existentes.
