# Incremento 5.9 — semântica configurável e interação acessível

Data: 18/10/2026. Estado: implementado e revisado no perfil descrito. Incremento anterior 5.8 revisado; não encerra lote 5, lote 6 ou full review final.

## Problema e contrato

O runtime já oferece foco, Enter/Espaço, foco/blur e setas para listeners. Falta permitir ao autor separar elementos decorativos, imagens com significado, grupos e botões, com nome e descrição independentes do nome interno. A configuração deve persistir no documento, passar por comandos transacionais e chegar ao desenho compartilhado, Testar, HTML e React.

Metadados são tipados, limitados e tratados como texto, nunca attrs/HTML livres. Um elemento decorativo não pode esconder uma interação; imagens e botões não podem achatar controles descendentes na árvore acessível. Botão declarado precisa de listener de ativação. A validação considera a árvore expandida dos componentes. Arquivo ainda incompleto pode ser editado e salvo; execução/export interativo recusa semântica contraditória antes de assumir o host. SVG estático não anuncia um botão que não pode ser ativado.

O perfil não promete leitor de tela/dispositivo homologado, acessibilidade integral do editor, controles de texto dentro do SVG ou tradução automática. Inputs externos e legendas de áudio existentes permanecem; controles textuais/semântica dinâmica avançada seguem no escopo restante.

## Gates obrigatórios

Schemas/limites, persistência/versionamento/migração, comandos/locks/history, árvore composta, montagem e descarte, UI real, SVG estático e HTML/React interativos; teclado e árvore de acessibilidade real do navegador, inspeção visual e jornada Electron. Regressão integrada e revisão antes do próximo incremento.

## Implementação e review em andamento

Projeto v19/blueprint v8 acrescentam `semantics` estrito, com quatro variantes. Nome de 1–500 e descrição de 1–2000 caracteres XML, sem normalização destrutiva; decorative não aceita rótulos/attrs adicionais. Persistência aceita v1–v18, e o player aceita v1–v7 sem reinterpretar contratos históricos. UI e MCP usam `scene semantics` em `edit_document`; `get_object` inclui o valor completo e limitado. O canvas de autoria não anuncia os controles da animação nem esconde objetos editáveis por sua classificação decorativa. Testar, HTML e React usam a mesma descrição; export SVG estático converte botões em grupos sem foco.

Nomes são `aria-label`; descrições são filhos SVG `desc`, sem IDs globais que colidam entre players. Chromium real confirmou nome e descrição na árvore AX, Enter/Espaço, dois players independentes e ausência de foco em decorativos. Validação da árvore expandida recusa interações sob decorative/image/botão, botões sem activate e grupos com activate; também considera botões implícitos por listener e artboard inteiro. Configurações ainda incompletas continuam editáveis/salváveis, inclusive backup JSON, mas não são executadas como controles funcionais.

Gates atuais: 157 testes do editor, 89 do núcleo, tipos app/núcleo/tooling, sintaxe e build passaram. Check focado em 384 arquivos: zero erros, 15 warnings/9 infos legados visíveis. Auditoria de produção sem vulnerabilidades conhecidas. As 50 jornadas de navegador e a prova Next.js produção/SSR/hidratação passaram, incluindo ZIP React com nome/descrição na árvore AX e compatibilidade real até v7. A rodada veio após a correção do transporte e separação da autoria. Refinamento posterior preserva nome/descrição no rascunho ao alternar o tipo antes de aplicar; rebuild e as duas jornadas focadas passaram novamente. Captura final de autoria inspecionada, com textarea alinhado aos tokens existentes.

A primeira rodada nativa 5.9 comprovou semântica/teclado/descarte sob file/CSP e os demais gráficos, arquivos e exportação, mas terminou **falha**, com erro não tratado `Cannot read properties of null (reading 'start')`. Investigação: a fixture de teclado não era modal e acionou também o transporte do editor; em presets sem ID, `range?.clipId === clip.id` considerava dois valores ausentes iguais e acessava `range.start` nulo. Correções: isolamento modal igual ao Testar real; resolução de faixa com existência e identidade explícitas, unitário dedicado e regressão real Space/play/pause sem alterar o documento. A repetição nativa ainda é obrigatória; não usar o sucesso anterior do 5.8 para aprovar estas mudanças.

Outros achados corrigidos: rótulo do textarea incluía seu conteúdo e foi explicitado; semântica de botões da animação aparecia no canvas sem comportamento correspondente e foi separada da autoria; descrição adicionada ao orçamento de células/texto; controles descendentes de botões implícitos também são recusados. O primeiro unitário de histórico usava método inexistente: corrigido para `createHistory(initial).commit/undo/redo`, sem alterar API de produção.

Repetição oficial `pnpm edi:test:native edisvg` finalizada com sucesso após as correções, sem erros JavaScript não tratados: semântica/Enter/Espaço/descarte, fontes/imagens/áudio/rig/gradientes/máscaras, Save/Open/Cancel/recuperação, React ZIP e gates de licença/expiração/IPC. Captura `.cache/edi-native-results/edisvg-semantics.png` inspecionada com o player modal ativo. O erro da rodada anterior permanece documentado, não foi ignorado ou suprimido. O refinamento de rascunho do painel passou na jornada focada e no rebuild final; a rodada completa 50 + Next precedeu somente esse refinamento de formulário, sem mudanças no contrato/runtime depois dela.

Próximo incremento: preservar os metadados suportados também na importação SVG, sem deixar títulos/descrições apenas na fonte original. Continuar o restante obrigatório do lote 5, lote 6 e full review final. Nenhuma publicação, instalador instalado, operação comercial, commit/merge/push nesta execução.

Referências primárias: [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/), [padrão de botão e teclado](https://www.w3.org/WAI/ARIA/apg/patterns/button/), [SVG Accessibility API Mappings](https://www.w3.org/TR/svg-aam-1.0/).
