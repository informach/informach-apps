# Incremento 5.18 — proteção da entrada SVG

Estado: incremento revisado localmente no perfil documentado. Não altera o formato v21/Rig v3/blueprint v10. Não conclui os demais requisitos dos lotes 5/6 nem full review final.

## Fechamento local

Passaram 203 testes do app, 121 do núcleo, 71 E2E seriais, Next 16.4.2 produção (build/SSR/hydration), tipos do app, sintaxe/build, Biome focado (448 arquivos, zero erros, 15 warnings/9 infos legados) e Electron completo. Auditorias de produção/desenvolvimento passaram com zero vulnerabilidades conhecidas; o gate de tipos do tooling ainda falha por 11 erros no arquivo concorrente EdiPDF descrito abaixo. Nenhum instalador/deploy/publicação. As rodadas em andamento descritas abaixo são históricas. Review conferiu captura/limpeza de listeners, alvos nativos/editáveis, atomicidade da importação, preservação dos fluxos de texto e ausência de parser paralelo/deps novas. Cursor físico do Explorer não homologado: não anunciar essa prova a partir de eventos sintéticos.

Próximo incremento: [5.19 — ciclo de animações e rig](review-lote-5-ciclo-animacoes-rig.md), para o defeito de duplicação de clips reproduzido no review. Consolidação da timeline, demais gráficos/tipografia/formatos/scripting, lote 6 e full review permanecem obrigatórios.

Electron completo concluiu com exit 0 após a última correção de código: drop ignorado sobre diálogo cancelado, URL/projeto intactos, seletor real/importação/Testar/undo, demais journeys de rig/assets/fontes/áudio, arquivos/recovery, ZIP React, três perfis Lottie Save/Cancel e licença/expiração/IPC. Nenhum instalador instalado/publicado. Regressão completa de navegador/Next em execução antes de fechar o perfil.

## Achado e contrato proposto

`bindSvgIngress` retorna antes de `preventDefault` quando o drop ocorre sobre campo editável ou com diálogo aberto. O importador não deve abrir nesses alvos, mas isso não pode liberar o comportamento padrão de abertura/navegação do navegador. A proteção Electron não substitui o contrato do renderer. O seletor atual também reconhece apenas `[contenteditable='true']`, deixando de tratar `contenteditable` vazio, plaintext-only e herança real.

Separar proteção de navegação da elegibilidade para importar. Drops de arquivos devem ser cancelados mesmo nos alvos ignorados; o cursor deve indicar `none`. Inputs nativos de arquivo habilitados mantêm seu próprio comportamento de seleção, sem disparar importação global. Texto/links sem arquivos e colagem em campos editáveis continuam com o comportamento normal. Usar `isContentEditable` para o estado efetivo, inclusive descendentes; não tratar atributo ancestral `true` como se anulasse `contenteditable=false` explícito.

Leitura/relatório SVG existente permanece como única autoridade: um arquivo por importação global, limite UTF-8 de 1,5 MB, recusa de documentos inseguros e confirmação “Importar nova prancheta”. Abrir o diálogo não publica edição. Cancelar preserva projeto/histórico; importar preserva pranchetas e fonte original. Não criar outro parser ou importar automaticamente durante drop.

## Verificações previstas

### Implementação e provas focadas

A proteção de drop/dragover roda na captura do window e cancela arquivos antes de avaliar a elegibilidade para importar, mesmo que um handler local interrompa bubbling. Inputs de arquivo nativos habilitados permanecem sob sua própria seleção/change; `:disabled` inclui fieldsets desabilitados. Editabilidade usa o estado efetivo do primeiro ancestral HTML, cobrindo SVG descendente, atributos vazios/plaintext-only, herança e override false explícito. O dispose remove os listeners com a mesma fase de captura. Não há novo parser nem nova autoridade de arquivos.

Tipos/build e três E2E focados passaram: matriz de alvos/proteção/limpeza, arraste de texto real confiável com edição nativa e fluxo do renderer compilado com drop→revisão→cancelar, seleção explícita→confirmar→undo/redo/reload. Reader real recusou extensão incompatível, UTF-8 inválido e excesso de 1,5 MB. Captura evita que stopPropagation no canvas burle a proteção. Nenhuma prova usa clipboard do sistema ou navega a arquivo pessoal.

Achado de teste: DataTransfer criado por script ignora writes de dropEffect no Chromium, mesmo antes de instalar o listener (canário independente). Um drag HTML confiável também não transportou o File adicionado por script como um arquivo do sistema. Não foi aplicado polyfill/monkey patch para fabricar esse comportamento. O teste confiável verifica a preservação do arraste de texto e o sintético verifica preventDefault/importação; cursor físico de arquivos do Explorer continua sem homologação. O código define copy/none conforme MDN, mas isso não se torna prova de UX física do Windows.

Jornada Electron completa em andamento. A importação semântica nativa agora verifica drop bloqueado sobre o diálogo, URL/draft intactos e depois usa o seletor real existente; o helper não altera o projeto para passar a proteção. Regressão completa, sintaxe/Biome e review final do incremento ainda pendentes.

Rodada CPU posterior: 203 testes do app, 121 do núcleo, tipos do app, sintaxe/build e Biome focado (448 arquivos, zero erros, 15 warnings/9 infos legados) passaram. Auditorias de produção e desenvolvimento foram repetidas e ambas retornaram exit 0/zero vulnerabilidades conhecidas, sem muted/exceções. Os dois alertas de image-size registrados nos marcos anteriores não constam mais no grafo concorrente atual; isso não é uma correção desta frente. Tooling transversal foi repetido e ainda falha com 11 erros no arquivo concorrente `apps/edipdf/src/shared/pdf-annotations.ts`. Preservado, sem supressão.

Eventos canceláveis reais em Chromium sobre canvas, input/textarea/select, conteúdo editável herdado/plaintext-only, diálogo aberto e input de arquivo habilitado/desabilitado; preservar texto/URI sem arquivos e clipboard. Drop SVG válido abre o importador, confirmação publica uma edição, undo/redo/reload conserva a fonte. Múltiplos arquivos, extensão incompatível, UTF-8 inválido e excesso recusam sem publicar. Electron file/CSP deve exercitar a proteção e o seletor, sem usar o clipboard do sistema ou arquivos pessoais. Eventos sintéticos verificam contrato de cancelamento, não constituem teste de arraste físico no Explorer.

Referências consultadas com context7: [MDN — File drag and drop](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop) e [isContentEditable](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/isContentEditable). A recomendação de cancelar drops fora dos alvos válidos orienta a separação; os testes do repositório devem comprovar o comportamento implementado.
