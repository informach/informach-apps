# Plano de implementação do EdiSVG

Data: 16/10/2026. Base de planejamento: código 0.5.4 e quatro pranchetas de `edisvg.pen`.

## Execução autorizada em 17/10/2026

Em 18/10 o titular determinou executar todos os lotes seguidos, mantendo revisão entre lotes e full review no final. Depois restringiu a entrega imediata a concluir o incremento em curso 5.23, documentar exatamente o restante, fazer o [review integral](../../docs/reviews/edisvg-2026-10-17/full-review-2026-10-18.md) e publicar; isso não cancela o backlog dos lotes 5–6 nem os declara concluídos. [Review de composição](../../docs/reviews/edisvg-2026-10-17/review-lote-2-composicao.md) registra um marco histórico, não o gate vigente.

O titular autorizou implementar o [diagnóstico funcional](../../docs/reviews/edisvg-2026-10-17/analise-funcional.md), em lotes com revisão intermediária e review integral ao final. O remoto foi atualizado de `189d998` para `b37105a` por fast-forward, preservando o diagnóstico local. Trabalho na branch `feat/edisvg-evolution`, sem publicação ou alteração de produção.

| Lote | Escopo e rastreabilidade | Estado |
| --- | --- | --- |
| 0 | A01–A10: recuperação, arquivos, fidelidade e capacidades honestas | Implementado e revisado localmente; gates abaixo |
| 1 | M06/M07, I01/I03/I10: documento extensível, comandos, migração, trilhas e runtime compartilhado | Implementado e revisado localmente |
| 2 | M01–M05/M08, I02/I03: timeline, curvas, seleção, grupos, artboards, componentes, vetores | Núcleo de autoria revisado em incrementos: vetores/importação/workspace/cores/texto básico implementados; aparência/texto/importação avançados dependem do catálogo do lote 5 |
| 3 | I04/I05/I08/I11: estados, camadas, dados, eventos, layouts, React | Implementado/revisado localmente, incluindo componentes independentes v12, ZIP React/Next, 16 E2E e jornada Electron; nine-slice e refs de recursos dependem explicitamente do lote 5 |
| 4 | I06/I07: rig, restrições, IK, malha, morph e expressões | Perfil vetorial integrado e revisado: canais, skin, morph, solo, bindings, 26 E2E e Electron; timeline consolidada no review 5.20. Joystick de alvo raiz entrou no 5.23; raster/triangulação permanece |
| 5 | I09/I12/I13/I16: assets, fontes, áudio, exportações, semântica e scripting | Execução do restante autorizada em 20/10 (branch `feat/edisvg-lote-5-restante`): [5.24 sequência PNG/GIF/MP4/WebM](../../docs/reviews/edisvg-2026-10-17/review-lote-5-exportacao-raster.md) , [5.25 use/symbol na importação](../../docs/reviews/edisvg-2026-10-17/review-lote-5-svg-use-symbol.md) , [5.26 padrões, projeto v23/blueprint v12](../../docs/reviews/edisvg-2026-10-17/review-lote-5-padroes.md) , [5.27 filtros](../../docs/reviews/edisvg-2026-10-17/review-lote-5-filtros.md) , [5.28 máscaras de luminância/pintadas](../../docs/reviews/edisvg-2026-10-17/review-lote-5-mascaras-pintadas.md) , [5.29 trim no SVG animado e na Lottie](../../docs/reviews/edisvg-2026-10-17/review-lote-5-trim-consumidores.md), [5.30 ordem de desenho animável](../../docs/reviews/edisvg-2026-10-17/review-lote-5-ordem-de-desenho.md), [5.31 shaping complexo verificável e direção automática](../../docs/reviews/edisvg-2026-10-17/review-lote-5-shaping-bidi.md), [5.32 texto em caminho](../../docs/reviews/edisvg-2026-10-17/review-lote-5-texto-em-caminho.md), [5.33 malha e deformação raster](../../docs/reviews/edisvg-2026-10-17/review-lote-5-malha-raster.md) e [5.34 texto semântico dinâmico](../../docs/reviews/edisvg-2026-10-17/review-lote-5-semantica-dinamica.md) revisados localmente. Incrementos 5.1–5.23 integrados nos perfis estritos dos reviews: recursos/fontes/áudio, semântica limitada, conversão cúbica consentida, timeline, trim, importação SVG protegida, Lottie com diagnóstico/consentimentos, gradientes/bounds e joystick 2D. O 5.23 passou núcleo/app/E2E/Next/Electron; publicação da suíte tem gate separado. Restante de gráficos/tipografia/raster, formatos, semântica dinâmica e scripting está aberto, sem promessa de suporte genérico |
| 6 | I11/I14/I15/I17: runtimes/plataformas, bibliotecas, colaboração e migração de acervo | Pendente |

Incremento seguinte do lote 2: [artboards e workspace](../../docs/reviews/edisvg-2026-10-17/review-lote-2-artboards.md), documento v5, painel React e exportação por prancheta; 92 testes do editor + 8 do núcleo + 3 E2E e jornada nativa passaram. Componentes aninhados e demais requisitos continuam em execução.

Os IDs remetem ao diagnóstico; esta ordenação reorganiza, não descarta, os 90 requisitos anteriores. M09 (testes) e M10 (assistente) acompanham todos os lotes. Não declarar equivalência ao Rive, compatibilidade `.riv`, superioridade de desempenho ou homologação de plataformas sem evidência correspondente. O acervo real ainda precisa ser definido para a homologação do lote 6.

Matriz confirmada pelo titular nesta execução: **web/React e React Native** para consumo das animações; Windows como autoria inicial já identificada. Flutter, Unity, Unreal e runtimes Apple/Android independentes não entram nesta implementação. React Native exige adapter próprio e testes de suas plataformas/dispositivos; WebView não será apresentada como runtime nativo equivalente. Autoria macOS/web permanece uma decisão posterior, não uma expansão implícita dessa resposta.

Revisão do lote 0 encontrou também colisão de contrato IPC: o SDK espera caminho em `project:open/save`, mas o SVG usa diálogos no main e envia um documento. O modo explícito `projectFileMode: "native-dialog"` mantém autorização/origem e a confirmação de recuperação no SDK; seleção de destinos e validação ficam no app. Os demais consumidores mantêm o modo por caminhos. Testar isso no Electron, não apenas no modelo.

Código novo de infraestrutura usa TypeScript estrito; o novo `typecheck` inclui esse código e suas dependências. O JavaScript legado ainda não tem `checkJs` integral: este gate não certifica todo o renderer como tipado. Recuperação nativa usa `userData/recovery-v1.json`, escrita atômica, validação e marcador durável de limpeza; cópia inválida é preservada e bloqueia edição, nunca substituída silenciosamente.

### Review do lote 0

72 testes unitários e 2 E2E passaram; sintaxe, tipos do app/SDK/tooling, 50 testes do SDK e typecheck transversal (22 tarefas) passaram. O runner Electron ampliado comprovou Save/Open reais, cancelamento de Save As, recuperação destacada do arquivo anterior e preservação dos bytes originais, além dos gates de licença, expiração e IPC. O helper Windows interage somente com o PID da fixture e com o destino exato descartável. A jornada válida usa uma lease de fixture de 300 segundos; a expiração continua sendo forçada/testada separadamente, sem mudar os prazos comerciais.

Achados corrigidos durante a revisão: colisão de contrato IPC do SDK; falta de bloqueio de IA durante inicialização/recuperação; concorrência entre descarte e novas edições; necessidade de permitir salvar em outro destino quando o checkpoint local não pode ser gravado; scheduler do HTML continuando a consumir frames pausado; transformação de preview em espaço diferente do SVG exportado. Mensagens de salvamento distinguem arquivo efetivamente gravado de checkpoint indisponível, sem ocultar a falha.

O E2E usa o renderer compilado, download real e execução do HTML; confirma undo sem perder modo/animação, recuperação na recarga, bloqueio de cópia inválida e movimento reduzido. Outro E2E compila o importador original em memória e usa DOMParser real: `preserveAspectRatio="none"` conserva as dimensões em viewports 200×100 e 100×200; scripts e números não finitos são recusados.

Limites: SVG animado predefinido é amostrado a 60 Hz com diagnóstico explícito; não se declara igualdade contínua exata nem runtime genérico. O teste nativo recupera após recarga e o teste de disco lê com uma instância nova do store; desligamento abrupto do sistema/hardware não foi simulado. Autoria e ecossistema dos lotes seguintes continuam pendentes; não houve commit, merge, push, instalador ou deploy nesta execução. Biome mantém warnings legados visíveis, sem supressões.

Atualização de execução — Etapa 01: inventário de 90 requisitos e baseline automatizada realizados (check, 59 testes e build aprovados). Referência visual principal: `i0JJ4Q`. A etapa permanece **em validação**, pois a inicialização Electron falhou sem relatório e a instância no navegador exibe 0.5.3. Homologação nativa e capacidade de equipe ainda pendentes. Entregáveis, evidências, decisões e backlog E02.1: [Relatório da etapa 01](audits/etapa-01/RELATORIO.md).

### Review do lote 1

Documento v3, migração com backup fiel, transações UI/MCP com sessão/revisão, animações livres, trilhas por objeto, autochave e player SVG offline integrados à interface existente. Contratos em [edi-motion](../../packages/edi-motion/README.md); evidências, achados corrigidos e limites no [review intermediário](../../docs/reviews/edisvg-2026-10-17/review-lote-1.md).

Gates finais: 81 testes do app, 5 do motor, 51 do SDK, 3 E2E reais, tipos/sintaxe/build, typecheck transversal (23 tarefas) e tooling aprovados; auditoria de produção sem vulnerabilidades conhecidas. `pnpm check` sem erros, com 431 warnings e 65 infos visíveis. Runner Electron repetido após a última revisão aprovou integridade, licença/expiração/IPC, Save/Open, cancelamento e recuperação; não instalou/publicou o produto. A revisão encontrou e corrigiu externalização indevida do package TS no main, perda de transformação global na exportação por objeto, XML inválido na alternativa estática, lacuna no glob de testes TS, limites de histórico e conflito de escalas. React/RN, autoria avançada e full review final continuam pendentes.

Atualização adicional: durante a execução, `origin/main` avançou novamente para `e15de57` (PR #14, infraestrutura/Bastidores/auth/e-mails/publicação GitHub). Integrado por fast-forward com preservação do trabalho. O único conflito foi no índice documental: mantida a remoção remota dos parágrafos históricos e a nova seção EdiSVG local. Lockfile conciliado, instalação congelada aprovada, typecheck geral (23 tarefas + tooling) e 43 testes de tooling aprovados após a integração. Nenhum apply Railway, migration ou publicação foi executado.

### Incremento 2.1 — chaves e curvas

Edição de quadro/valor/easing, prévia gráfica real, arraste reversível, duplicação de clips e transações de flags/renomeação implementados. 84 testes do app, 6 do motor e 3 E2E ampliados passaram, além de tipos/build e nova jornada Electron. O lote 2 não está concluído: seleção múltipla, grupos/reparenting, artboards/componentes, vetores/importação e evolução de timeline permanecem. [Review incremental](../../docs/reviews/edisvg-2026-10-17/review-lote-2-parcial.md).

### Incremento 2.5 — timeline e manipulação

Documento v7/movimento v2, seleção/gestos em lote, pivôs/skew/espelhamento, organização da seleção, timeline virtualizada, retiming/cópia/exclusão, alças Bézier e elástico real, onion skin e área de prévia. HTML usa bundle offline explícito, sem serializar funções. [Review e pendências](../../docs/reviews/edisvg-2026-10-17/review-lote-2-manipulacao.md). Gates atuais: 103 testes do editor, 18 do núcleo, 4 E2E e typecheck transversal aprovados; nova repetição nativa do bundle offline pendente. Não conclui lote 2/3–6/full review.

### Incremento 2.6 — vetores, importação, workspace, cores e texto

Documento v8, cálculos em Worker cancelável, booleanas com consentimento, vértices múltiplos, relatório SVG por elemento e nova prancheta sem perda da arte anterior. Paletas/estilos, texto multilinha e controles tipográficos, busca de comandos e divisores acessíveis. [Review incremental e gates](../../docs/reviews/edisvg-2026-10-17/review-lote-2-vetores.md). Os recursos avançados de M03/M04/M05 dependem do catálogo seguro do lote 5; continuam obrigatórios e rastreados, não descartados. A próxima frente é o núcleo de estados/dados/eventos do lote 3, com retorno às dependências de assets antes do full review final. Não marcar toda a proposta concluída.

### Incremento 3.1 — estados, dados, eventos e consumo React

Contrato de lógica por prancheta no documento v9, evaluator puro, editor React, sessão Testar, runtime interativo e HTML completo com confirmação de conversões apenas de animação. Adapter React 19 separado do núcleo, inputs em lote e callbacks atuais; React Native permanece no lote 6. [Review incremental](../../docs/reviews/edisvg-2026-10-17/review-lote-3-estados.md). Layouts, modelos compostos e lógica independente de componentes ainda em execução; não concluir lote 3 ou full review final.

### Incremento 3.2 — layouts e modelos compostos

Documento v11, Yoga/WASM local, layout real no canvas/Testar/HTML, modelos compostos/listas de IDs estáveis/links input↔campo e formulários estruturados. API pública de dados e inspeção MCP paginada. Evidências e limites no [review incremental](../../docs/reviews/edisvg-2026-10-17/review-lote-3-layout-dados.md); a distribuição React/Next passou na prova isolada e os componentes independentes avançaram no incremento 3.3. Não conclui todos os lotes ou o full review final.

### Incremento 3.3 — componentes independentes

Documento v12, blueprint interativo v2, sessões locais de estados/inputs/dados por componente e um único relógio da cena. Máquina inicial e inputs locais, layout responsivo de viewports aninhados, inspeção de sessão no Testar e leituras MCP limitadas. [Review e gates](../../docs/reviews/edisvg-2026-10-17/review-lote-3-componentes.md). Rodada de 127 testes do editor, 35 do núcleo, 16 E2E, Next.js e jornada Electron passou. Check focado limpo; check global tem um erro documental de outra frente, preservado. Próxima frente: lote 4. Nine-slice/refs de assets seguem com as dependências explícitas do lote 5, sem serem declarados concluídos.

## Objetivo e limites

Perfil atual: [5.23 — joysticks 2D](../../docs/reviews/edisvg-2026-10-17/review-lote-5-joysticks.md), projeto v22/Rig v4/blueprint v11, painel/cópia/dependências/migração integrados; 136 testes do núcleo, 245 do app, 82 E2E, tipos/build, Next, pixel Lottie e jornada Electron/ASAR passaram. Publicação da suíte tem gate separado e bloqueio de voz EdiAula registrado no review. Referências incompletas de rig e Lottie/SVG-SMIL com trim continuam recusadas. Auditorias atuais sem vulnerabilidades conhecidas; tipos transversais do checkout de trabalho têm bloqueio concorrente EdiPDF registrado. [Review integral e backlog](../../docs/reviews/edisvg-2026-10-17/full-review-2026-10-18.md) são a fonte vigente; lotes 5 restante e 6 continuam obrigatórios. Os marcos seguintes são históricos.

Marco anterior: [5.14 — conversão vetorial explícita e precisão Lottie](../../docs/reviews/edisvg-2026-10-17/review-lote-5-conversao-vetorial.md). Acrescenta operação reversível com prévia geométrica e consentimento. A comparação ampliada expôs uma limitação do consumidor float32; novo consentimento independente, inicialmente falso, impede exportar sem ciência das possíveis diferenças de bordas nos próprios quadros amostrados. Os gates do marco 5.13 abaixo não significam identidade universal de pixels. Cinco unidades específicas, 185 testes do app, 98 do núcleo, tipos/build, 43 de tooling, 61 E2E, Next produção e Electron passaram. Próxima frente 5.15: tracejados Lottie. Manter restantes do lote 5/6/full review.

Último perfil revisado: [contornos Lottie 5.13](../../docs/reviews/edisvg-2026-10-17/review-lote-5-lottie-contornos.md), paths C explícitos/matriz conforme, com inspeção de todas as amostras, geometria local, correção de alpha legado e gates completos, incluindo Electron. [SVG clip/mask 5.12](../../docs/reviews/edisvg-2026-10-17/review-lote-5-svg-efeitos.md) preservado; projeto v20/blueprint v9/playback v3, migração/backup e contratos históricos mantidos. Auditoria global de produção tem dois alertas altos via dependência concorrente do EdiPDF, fora do grafo EdiSVG, sem exceção. Frente seguinte 5.14: conversão explícita de caminhos, ainda sem nova capacidade homologada. Marcos abaixo são históricos; demais recursos do lote 5, lote 6 e full review continuam obrigatórios.

Marco atual: [incremento 5.6 — recortes/máscaras alpha](../../docs/reviews/edisvg-2026-10-17/review-lote-5-recortes.md), projeto v17/blueprint v5, revisado com 146 testes do editor, 73 do núcleo, 42 E2E, Next e Electron. Autoria com prévia de gestos, referências/remapeamento, cálculo compartilhado e players isolados no perfil publicado. Próximo incremento centraliza o contrato gráfico portátil para ampliar o render sem regras concorrentes. Importação clip/mask, outras pinturas/efeitos, tipografia/raster/formatos/semântica/scripting e lote 6/full review permanecem obrigatórios.

Marco anterior: [review 5.5 — gradientes/importação](../../docs/reviews/edisvg-2026-10-17/review-lote-5-gradientes.md), gradientes tipados com herança/estilos/overrides, importador SVG limitado e render offline. 143 testes do editor, 66 do núcleo, 38 E2E, Next e jornada Electron passaram; repetições focadas após review também passaram. Não encerra lote 5/6/full review.

Marco atual: [review 5.4 — imagens/nine-slice](../../docs/reviews/edisvg-2026-10-17/review-lote-5-imagens-slice.md), projeto v16/blueprint v4, render compartilhado e layout visual com cantos preservados no perfil documentado. 140 testes do editor, 64 do núcleo, 35 E2E e Next passaram; jornada nativa ampliada aprovada. Próxima frente: recursos vetoriais/gráficos avançados. Lote 5/6/full review continuam obrigatórios.

Marco atual: [review 5.3 — áudio por eventos](../../docs/reviews/edisvg-2026-10-17/review-lote-5-audio.md), mixer Web Audio, alternativas textuais e controles em Testar/HTML/React. 139 testes do editor, 62 do núcleo, 33 E2E e Next passaram; o probe Electron de áudio passou. Não é trilha sonora contínua. Próxima frente: gráficos/render de recursos e dependências avançadas pendentes; lote 5/6/full review continuam obrigatórios.

Marco atual posterior ao 5.1: [review 5.2 de fontes](../../docs/reviews/edisvg-2026-10-17/review-lote-5-fontes.md), TTF/OTF com consentimento, referências e carga efetiva, gates conjuntos e nova jornada Electron. Próximo incremento: áudio funcional. M04 avançado/fallback de glifos e demais dependências permanecem obrigatórios; o lote 5 não está encerrado.

Marco atual: [review incremental 5.1](../../docs/reviews/edisvg-2026-10-17/review-lote-5-recursos.md), documento v15/blueprint interativo v3 para imagens. Catálogo deduplicado, importação/cancelamento/normalização explícita, referências tipadas, persistência/histórico e exportação SVG/HTML/React testados. Próxima frente: fontes/áudio e demais dependências do lote 5. Não encerra o lote ou a tarefa de todos os lotes.

Estado posterior: [incremento 4.1](../../docs/reviews/edisvg-2026-10-17/review-lote-4-rig.md), documento v13/playback v3, em execução. Testes atuais: 130 do editor/41 do núcleo e três novas jornadas de rig passaram separadamente. Rodada conjunta ampliada e fechamento do lote ainda pendentes; não substituir os gates históricos do lote 3 por uma alegação de nova homologação nativa.

Transformar os recursos apresentados nas pranchetas em funcionalidades editáveis, persistentes e reproduzíveis no player. A presença de uma tela, botão ou demonstração não significa conclusão funcional.

Referências inspecionadas pelo MCP pen.dev:

- `i0JJ4Q`: EdiSVG — Animar.
- `uHqQn`: EdiSVG — Máquina de estados.
- `gbxz9`: EdiSVG — Exportar para web.
- `zg8Qe`: EdiSVG — Animar · modelo padronizado.

As duas pranchetas de animação apresentam o mesmo conjunto de textos funcionais. Consolidar seus requisitos; decidir na etapa 1 qual composição visual será a referência de cada área. Não implementar duas interfaces independentes.

Este documento é planejamento, não certificação do produto. Foram lidos o documento de design, README, manifesto e trechos do modelo, animação, interface, ferramentas de IA e exportação. Não foram executados testes nem homologação visual/nativa nesta atividade. Itens descritos como existentes ainda precisam de validação.

## Diagnóstico inicial

| Área | Evidência atual | Trabalho restante |
| --- | --- | --- |
| Desktop e arquivos | Electron, projeto versão 2, abrir/salvar, histórico e testes existentes | Homologação nativa, política de recuperação e migrações futuras |
| Design | Importação SVG limitada, objetos, transformações, ferramentas e vértices | Completar seleção/manipulação, grupos, recursos e artboards |
| Animação | Três animações fixas, poses globais calculadas e marcadores | Animações livres, trilhas e interpolação por objeto/propriedade |
| Rig | Sobreposição visual e ferramentas indisponíveis | Ossos, vínculos, restrições, IK e malha reais |
| Estados | Fluxos predefinidos para o mascote | Grafo editável, camadas, blends, condições e listeners configuráveis |
| Exportação | HTML, SVG animado e dados do projeto | Player compartilhado, pacote, React, Lottie e equivalência de execução |
| Assistente | Integração básica e ferramentas limitadas | Operações de objetos, animações, rig, estados e exportação com validação |

O README contém descrições históricas que se contradizem com incrementos posteriores. O diagnóstico da etapa 1 deve prevalecer sobre status antigos. O código atual confirma que `poseAt` usa movimentos predefinidos e que o formato restringe as animações a Parado, Acenar e Pular.

## Regras de execução

Atualização 18/10: [componentes aninhados](../../docs/reviews/edisvg-2026-10-17/review-lote-2-componentes.md) implementados e revisados localmente, documento v6/runtime v2, com overrides, clocks compartilhados e preflight de expansão. Gates: 97 testes do editor, 12 do motor, 3 E2E ampliados, jornada nativa e tipos gerais passaram. Lote 2 continua em execução por manipulação múltipla, timeline e vetores; lotes 3–6/full review final não certificados.

1. Trabalhar em uma etapa ativa por vez, dividida em incrementos demonstráveis. Investigações futuras podem ser registradas sem expandir a entrega atual.
2. Cada tarefa terá ID, referência de design, responsável, dependência, critério de aceite, evidência e situação.
3. Situações: A fazer → Em andamento → Em validação → Concluído; usar Bloqueado com motivo e ação necessária.
4. Preservar os recursos existentes. Toda alteração de formato exige migração, arquivos de exemplo e testes de leitura/gravação.
5. UI e IA devem usar as mesmas operações do documento, com validação e histórico. Reprodução e seleção não devem poluir o histórico de edição.
6. Editor e player devem compartilhar a avaliação da cena. Construir essa base antes das exportações avançadas.
7. Fechar cada etapa com demonstração, testes relevantes, registro de limitações e revisão do plano restante. Empacotar marcos homologáveis.
8. Aprovação de produto valida decisões e resultado; atividades técnicas reversíveis dentro da etapa não precisam parar a cada operação.

## Etapas sequenciais

### 01 — Inventário, baseline e decisões de produto

- Mapear todos os comandos das pranchetas, incluindo ícones, menus e abas sem comportamento especificado.
- Classificar cada requisito como existente a validar, parcial, demonstrativo ou ausente, vinculando evidências de código e de execução.
- Comparar visualmente as duas pranchetas Animar e fixar referência de layout, espaçamentos, seleção e estados de controles.
- Rodar verificações existentes e registrar falhas anteriores ao trabalho; homologar abrir, salvar, fechar, cancelar, desfazer e refazer no Windows.
- Definir projetos de referência: desenho simples, SVG importado, Zezé completo e documento com múltiplas pranchetas.
- Definir equipe, capacidade, plataformas/navegadores de aceite e orçamento de desempenho antes de assumir datas.

Dependência: nenhuma. Aceite: backlog rastreável, baseline verificável e decisões pendentes com responsável. Primeira entrega: relatório de lacunas e tarefas do próximo incremento.

### 02 — Documento extensível e integridade dos projetos

- Definir entidades e IDs estáveis para artboards, objetos, recursos, animações, trilhas, chaves, rig, máquinas, inputs, bindings e eventos.
- Separar dados persistentes de estado de sessão e de reprodução.
- Introduzir migrações incrementais a partir das versões 1 e 2; preservar poses/movimentos antigos quando possível e explicitar conversões sem equivalência.
- Consolidar operações reversíveis, edição agrupada, cancelamento de gestos e validação de referências.
- Validar escrita atômica, proteção contra perda de alterações, erros de disco e recuperação optativa. Manter a abertura em branco como comportamento atual até decisão explícita.

Dependência: 01. Aceite: documentos antigos e novos reabrem sem perda; ações manuais e por IA são reversíveis; nenhuma referência quebrada passa silenciosamente.

### 03 — Completar edição vetorial e hierarquia

- Validar seleção, Caneta, formas, texto, edição de vértices, pintura, contorno, duplicação, exclusão, ordenação, visibilidade e bloqueio existentes.
- Completar seleção múltipla, agrupamento/desagrupamento e movimentação na hierarquia preservando a pose mundial.
- Completar alças de escala/rotação, pivôs e sincronização entre canvas e inspetor; respeitar transformações e bloqueios herdados.
- Definir matriz de SVG aceito, ampliar importação conforme os projetos de referência e mostrar incompatibilidades sem destruir a arte atual.
- Consolidar modos Design/Animar, navegação, zoom, mão, menus, atalhos e Ajuda com comportamento real.

Dependência: 02. Aceite: criar e importar arte, editar um membro isoladamente, desfazer e reabrir preservando geometria e hierarquia.

### 04 — Artboards, recursos e composição aninhada

- Implementar abas Artboards e Recursos, criação/renomeação/duplicação/remoção de artboards e configuração de dimensões.
- Definir catálogo inicial de recursos com importação, referências, uso e política de exclusão.
- Instanciar artboards aninhados, como o Balão, com transformações locais, recorte e referências estáveis.
- Impedir ciclos de composição; definir propriedade dos dados, sincronização temporal e seleção da instância versus origem.

Dependência: 03. Aceite: dois artboards e um Balão aninhado persistem corretamente; alterações e exclusões têm efeitos previsíveis.

### 05 — Motor de animação por objeto

- Criar, renomear, duplicar e remover animações livres; configurar duração, FPS e reprodução loop, ping-pong e uma vez.
- Criar trilhas por objeto/propriedade e chaves com tempo e valor: X, Y, rotação, opacidade, escala X/Y.
- Definir comportamento entre chaves, fora do intervalo, em tempo fracionário e nos limites de ciclo.
- Implementar avaliação determinística compartilhável com o player, sem dependência da interface.

Dependência: 04. Aceite: duas animações de nomes novos movimentam objetos diferentes; uma mesma amostra temporal sempre produz a mesma pose; salvar/reabrir mantém resultados.

### 06 — Timeline, curvas e recursos de visualização

- Implementar seleção e edição de chaves, mover/copiar/excluir, zoom temporal, régua, playhead e área de trabalho.
- Integrar transporte, navegação quadro a quadro, timecode, duração e gravação por chave automática e diamantes no inspetor.
- Implementar Linear, Suave, Elástico e Degrau; curva Bézier editável e cópia da representação quando aplicável.
- Integrar modos Chaves/Curvas a dados reais; curva elástica deve ter representação coerente com o motor, sem fingir equivalência com uma única Bézier.
- Implementar onion skin com poses reais, prévia limpa e controles de sobreposição de ossos/malha conforme disponibilidade.

Dependência: 05. Aceite: editar uma curva altera o movimento; alternar animações mantém chaves independentes; autochave, undo e cancelamento são consistentes.

### 07 — Ossos, pivôs e vínculos

- Criar, selecionar, nomear e remover ossos, hierarquias e pose de referência.
- Vincular objetos aos ossos e animar transformações locais, distinguindo ajuste do rig e pose animada.
- Mostrar ossos reais e integrar seleção na hierarquia, canvas, inspetor e timeline.

Dependência: 06. Aceite: animar Braço D e Antebraço D move apenas a cadeia esperada; rig, vínculos e pose de referência sobrevivem ao salvamento.

### 08 — Restrições e IK

- Implementar alvo de mão, cadeia IK, limites, força/influência e comportamento para alvos inalcançáveis.
- Implementar restrições Distância, Transformar e Seguir caminho, definindo espaço local/global e ordem de avaliação.
- Detectar dependências circulares e definir quais parâmetros serão animáveis.

Dependência: 07. Aceite: arrastar o alvo move o membro; 0%, 80% e 100% de força têm efeitos corretos; restrições convivem com animação sem instabilidade.

### 09 — Malha e deformação

- Provar primeiro a abordagem de deformação/renderização e seu custo em cena representativa.
- Criar/editar malha, vínculos e pesos, pose de referência e visualização da malha.
- Integrar deformação aos ossos, animação, seleção e persistência; prever tratamento de topologia inválida.

Dependência: 08. Aceite: torso e braços deformam de forma controlada; reabrir mantém pesos; resultados são reproduzíveis pelo núcleo de execução.

### 10 — Morph, solo e eventos de timeline

- Animar vértices, inclusive alças, para morph da boca; validar compatibilidade de topologia entre chaves.
- Implementar grupos solo de expressões e trilha discreta de filho ativo.
- Criar eventos nomeados, como `acenou`, posicionados na timeline e com dados de evento definidos.
- Especificar disparo ao avançar, retroceder, buscar, repetir e fazer ping-pong; evitar duplicações acidentais.

Dependência: 09. Aceite: boca faz morph, expressão solo muda no quadro esperado e eventos chegam uma vez conforme a política definida.

### 11 — Máquina de estados editável

- Criar/remover/renomear máquinas, estados e transições; desenhar e reorganizar o grafo.
- Implementar Entry e Any State; associar animações livres aos estados.
- Criar inputs booleanos, numéricos e gatilhos; editar condições, prioridade, duração, easing, saída e interrupção.
- Suportar saída imediata e ao terminar, com transição de 200 ms suave no exemplo.
- Definir consumo de gatilhos e conflitos de transições; persistir o grafo e sua disposição visual.

Dependência: 10. Aceite: criar uma máquina diferente da demonstração sem editar código; testar transições, interrupção e retorno após uma animação única.

### 12 — Camadas simultâneas e blend 1D

- Executar Corpo, Rosto e Piscar simultaneamente, com escopo de objetos/propriedades definido.
- Implementar blend 1D de expressões Triste/Feliz pelo input humor de 0 a 1.
- Definir prioridade, composição e pesos quando duas camadas atuam sobre a mesma propriedade.
- Garantir loop independente de Piscar e comportamento consistente durante transições do Corpo.

Dependência: 11. Aceite: Zezé acena, pisca e muda expressão simultaneamente sem sobrescritas inesperadas.

### 13 — Dados, listeners e teste de interação

- Criar view model com número, booleano e texto, valores iniciais, bindings e validação de tipos.
- Separar nome do projeto do campo textual `nome` do personagem; ligar humor e acenando aos destinos apropriados.
- Configurar listeners: entrar/sair do Corpo, clique que dispara clicar e movimento no Artboard para olhos seguirem cursor.
- Definir coordenadas sob zoom/escala e hit testing; oferecer operação equivalente por teclado/toque onde aplicável.
- Implementar Testar com reset, inputs ao vivo, destaque de estado/transição e log temporal de eventos, isolado da edição.

Dependência: 12. Aceite: os quatro listeners são configurados pelo usuário e funcionam com bindings; encerrar teste não modifica a arte original.

### 14 — Runtime web e pacote interativo

- Extrair a camada pública de execução usando o mesmo núcleo de avaliação do editor.
- Carregar `.edisvg`, selecionar artboard/máquina, reproduzir e destruir instâncias sem vazamentos.
- Implementar o componente `edisvg-player`, acesso a inputs e inscrição/remoção de callbacks de eventos.
- Entregar pacote com documento, player, recursos e página de exemplo opcional; documentar carregamento via servidor local e hospedagem.
- Comparar poses, morph, malha, ossos, estados, blends, listeners, artboards aninhados e eventos com a prévia do editor.

Dependência: 13. Aceite: pacote funciona em hospedagem estática sem serviços remotos; testes de equivalência passam nos navegadores definidos. Funcionamento sem rede não implica abertura direta por `file://`; este fluxo será atendido pelo HTML único.

### 15 — Modal de exportação, HTML único e componente React

- Implementar opções de máquina inicial, ajuste proporcional, texto alternativo e página de exemplo.
- Respeitar reduzir movimento: usar Parado quando disponível e fallback configurado para projetos sem esse estado. Pausar fora da tela e definir retomada.
- Mostrar resumo real de animações/listeners, destino, progresso, cancelar, falhas e tamanhos medidos.
- Gerar HTML único com recursos embutidos e o mesmo runtime, validado sem conexão e por abertura direta.
- Gerar componente React com props ligadas a inputs, callbacks de eventos e limpeza de recursos ao desmontar.
- Produzir pacote interativo, React e HTML a partir de um projeto real, sem dependência oculta do mascote de demonstração.

Dependência: 14. Aceite: três formatos reproduzem o mesmo projeto; opções têm efeito observável; exportações canceladas/falhas são tratadas corretamente.

### 16 — SVG animado e Lottie JSON

- Definir matriz de compatibilidade por propriedade e técnica; identificar conversões diretas, amostragem e limitações.
- Gerar SVG animado por CSS, sem JavaScript ou estados, usando a animação selecionada e movimentos reais.
- Gerar Lottie JSON válido, uma animação por arquivo e sem máquina de estados; verificar em renderizador independente.
- Investigar antecipadamente a viabilidade de converter malha, rig e morph. Quando necessário, oferecer conversão explícita ou recusar a exportação com diagnóstico claro.
- Nunca omitir silenciosamente um recurso nem considerar um JSON de projeto uma exportação Lottie.

Dependência: 15. Aceite: exemplos suportados reproduzem o resultado esperado; incompatibilidades são identificadas antes da conclusão. Cobertura parcial exige decisão explícita de escopo e pendência registrada.

### 17 — Assistente integrado às novas capacidades

- Evoluir ferramentas para objetos, artboards, recursos, animações, chaves, rig, estados, bindings e exportação.
- Implementar leitura antes de editar, operações agrupadas, progresso, cancelamento, erros claros e histórico compartilhado.
- Atualizar instruções do assistente conforme capacidades efetivas; verificar pedidos reais com cada provedor disponível.
- Preservar o isolamento e limites existentes da integração.

Dependência: 16. Aceite: assistente executa uma tarefa completa sobre projeto criado pelo usuário, com resultado verificável e desfazer. Integrar operações pequenas durante etapas anteriores; esta etapa faz a homologação completa.

### 18 — Homologação final e entrega

- Comparar as telas implementadas com as quatro pranchetas; conferir menus, ícones, tooltips, foco, atalhos e estados vazios/de erro.
- Executar regressão de documentos antigos, edição, persistência, IA e cinco formatos de exportação.
- Medir desempenho em cenas pequenas/médias/grandes, estabilidade de memória e responsividade; definir limites publicados a partir dos resultados.
- Validar acessibilidade, contraste, leitura por teclado e reduzir movimento no editor e nas saídas.
- Atualizar Ajuda, exemplos, matriz de compatibilidade e notas de versão; gerar pacote desktop e validar em ambiente Windows limpo.

Dependência: 17. Aceite: matriz de requisitos sem itens prometidos silenciosamente ausentes, zero defeitos críticos conhecidos e evidências de homologação anexadas. Instalador e assinatura são decisões adicionais de distribuição, não requisitos expressos nas pranchetas.

## Rastreabilidade das pranchetas

| Origem | Conjunto funcional | Etapas |
| --- | --- | --- |
| Animar + modelo padronizado | Menus, modos, arquivo, ferramentas, seleção, transformação, hierarquia | 01–03, 18 |
| Animar + modelo padronizado | Artboards, Recursos, Balão aninhado | 04, 14 |
| Animar + modelo padronizado | Animações, FPS, transporte, chaves, curvas, autochave e onion skin | 05–06 |
| Animar + modelo padronizado | Ossos, alvo, IK/força, distância, transformar e seguir caminho | 07–08 |
| Animar + modelo padronizado | Malha, morph de vértices, solo e eventos | 09–10 |
| Animar + modelo padronizado | View model, Testar, Assistente e Exportar | 13–17 |
| Máquina de estados | Grafo, Entry, Any State, inputs e transições | 11 |
| Máquina de estados | Corpo/Rosto/Piscar e blend 1D | 12 |
| Máquina de estados | Quatro listeners, olhos seguem cursor, teste e log | 13 |
| Máquina de estados | Componente web, API de inputs e callbacks | 14 |
| Exportar para web | Pacote, React, HTML, SVG CSS e Lottie | 14–16 |
| Exportar para web | Máquina inicial, ajuste, movimento reduzido, pausa, texto alternativo, exemplo, destino e tamanho | 15–16 |

## Marcos de produto

| Marco | Após etapa | Demonstração obrigatória |
| --- | --- | --- |
| M1 — Editor estruturado | 04 | Criar/importar arte, organizar objetos e artboards, salvar e reabrir |
| M2 — Animação real | 06 | Criar movimento com chaves e curvas por objeto |
| M3 — Personagem articulado | 10 | Rig, IK, malha, boca, expressões e evento de timeline |
| M4 — Interação configurável | 13 | Corpo, Rosto e Piscar simultâneos com os quatro listeners |
| M5 — Publicação web | 16 | Cinco formatos disponíveis com compatibilidade explícita |
| M6 — Entrega homologada | 18 | Assistente, documentação e pacote final validados |

## Prazos e responsabilidades

Não assumir data de conclusão antes do inventário e da capacidade da equipe. Estimar cada incremento após detalhar critérios de aceite, usando cenário otimista, provável e pessimista. Reestimar ao final de cada marco. Malha, composição de animações e exportação Lottie exigem investigação técnica antes de prazo comprometido.

- Produto/usuário: prioridades, decisões de comportamento e aceite dos marcos.
- Gestão do projeto: backlog, dependências, riscos, evidências e atualização de previsão.
- Desenvolvimento: contratos de dados, implementação, migrações e testes.
- Design e qualidade: fidelidade visual, usabilidade, acessibilidade e homologação.

Uma mesma pessoa pode acumular papéis. Os nomes e a disponibilidade serão registrados na etapa 01. Planejar incrementos de poucos dias quando possível, sem converter essa preferência em promessa de prazo.

## Riscos e ações

| Risco | Ação de controle |
| --- | --- |
| UI demonstrativa confundida com recurso pronto | Critérios baseados em criar, editar, salvar e reproduzir dados novos |
| Migração perde dados ou altera movimentos antigos | Fixtures de cada versão, migrações explícitas e testes de equivalência |
| Editor e player divergem | Núcleo compartilhado desde a etapa 05 e comparação temporal automatizada |
| Custo ou inviabilidade de malha/Lottie | Provas de viabilidade antes da entrega; matriz pública de suporte |
| Camadas, bindings e restrições entram em conflito | Ordem determinística, escopos e validação de ciclos |
| Crescimento indefinido do escopo | Registrar solicitações novas com impacto; não incluí-las silenciosamente |
| Tamanhos 22 KB/38 KB da prancheta viram promessa | Tratar como valores ilustrativos até medição; revisar orçamento real |
| Importação SVG executa conteúdo externo | Manter validação, sanitização e rejeições explícitas |
| Testes automatizados substituem homologação nativa | Exigir evidência Windows e navegador nos marcos pertinentes |

## Checklist de conclusão de cada etapa

- [ ] Requisitos e dependências identificados por ID.
- [ ] Fluxo funciona com projeto novo e com arquivo importado aplicável.
- [ ] Interface e comportamento conferidos com a referência.
- [ ] Persistência, desfazer/refazer e cancelamento verificados.
- [ ] Testes pertinentes, check e build aprovados para alterações de código.
- [ ] Verificação visual/nativa realizada ou pendência explícita; etapa não marcada concluída prematuramente.
- [ ] Migrações e compatibilidade verificadas quando houver mudança de formato.
- [ ] Editor e player equivalentes para recursos já expostos no runtime.
- [ ] Limitações, erros conhecidos e evidências registrados.
- [ ] Próximo incremento delimitado e previsão atualizada.

## Modelo de tarefa

`E05-01 — Criar animação com nome e duração livres`

- Situação: A fazer.
- Responsável: a atribuir.
- Origem: painel ANIMAÇÕES das pranchetas Animar.
- Dependências: documento extensível e artboard selecionável.
- Entrega: operação de criação, interface e persistência.
- Aceite: criar duas animações, alternar entre elas, desfazer/refazer e reabrir sem perda.
- Evidências: teste relevante e demonstração no aplicativo.
- Estimativa e riscos: preencher após detalhamento.

## Próxima ação

Executar lote 5 e suas dependências gráficas pendentes de 2–4. O [review integrado do lote 4](../../docs/reviews/edisvg-2026-10-17/review-lote-4-integrado.md) registra documento v14/Rig v2, skin/morph/solo, canais/bindings, 133 testes do editor, 53 do núcleo, 26 E2E, Next e jornada Electron. Catálogo seguro de assets e timeline unificada foram revisados nos incrementos seguintes; retomar M03/M04/M05 avançados, raster/triangulação e joystick. Bounds reais e gradientes relativos foram revisados no 5.22; a frente atual é o controlador joystick 2D do 5.23. A referência vigente de execução está no início deste plano e nos reviews incrementais; os marcos antigos não substituem esses registros. Não houve full review final nem homologação React Native/acervo real.
