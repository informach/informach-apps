# Análise funcional do EdiSVG para substituir o Rive

Data: 17/10/2026, America/Sao_Paulo. Base: `main`, commit `189d998f531669ef1f0e279e11addbed8f8fa80f`. Manifest do editor: 0.5.4. A versão do editor não deve ser confundida com a versão 0.1.1 da distribuição da suíte.

## Conclusão

O EdiSVG possui uma base real de edição vetorial e integração desktop, mas ainda não substitui o Rive. O principal trabalho não é terminar os botões: é construir um modelo de documento e um motor capazes de representar, avaliar e exportar animações e interações arbitrárias, com o mesmo resultado dentro e fora do editor.

Há recursos que merecem ser preservados: caneta Bézier, edição de vértices, IDs de objetos, transformações, bloqueio herdado, histórico, validação de cena, salvamento de projeto com escrita atômica, sandbox Electron e integração com os controles de licença da suíte. A interface pode evoluir sem uma reescrita visual integral.

As lacunas mais importantes são animação por objeto, máquina de estados editável, bindings de dados, artboards e componentes, rig e deformação, além de runtime independente. Existem também defeitos reproduzidos de recuperação e fidelidade da exportação que devem vir antes da expansão funcional.

Para ser melhor e mais rápido que o Rive, será necessário medir tarefas equivalentes, não apenas acrescentar IA. O Rive atual já documenta agente de IA e MCP com operações de cena, animação, dados e scripts. O diferencial Edi precisa estar na qualidade e velocidade da tarefa completa, com alterações editáveis, verificáveis e reversíveis. [Agente do Rive](https://rive.app/docs/editor/ai-agent/ai-agent), [MCP do Rive](https://rive.app/docs/editor/ai/mcp).

## Verificações executadas

| Verificação | Resultado e alcance |
| --- | --- |
| `pnpm --filter @informach/edisvg test` | 59 testes passaram; zero falhas, cancelamentos ou skips. Cobrem módulos de geometria, cena, arquivos, exportação, histórico, CLIs e MCP. |
| `pnpm --filter @informach/edisvg check` | Passou. Esse comando verifica sintaxe; não é typecheck nem substitui o Biome. |
| Biome no EdiSVG e JSON de evidências | Passou sem erros; 12 warnings e 9 infos existentes permaneceram visíveis. O JSON novo foi formatado, sem alterar código do app. |
| `pnpm edi:test:native edisvg` | Passou com chaves efêmeras e perfis isolados: inventário físico, inicialização GUI, abertura pelo gerenciador, licença offline assinada, expiração e bloqueio IPC. Não instalou nem publicou instaladores. |
| Renderer em navegador real | Playwright 1.59.1 com Microsoft Edge 154.0.4258.53, perfil descartável. Desenho, transformação, undo/redo, reprodução configurada, exportação, parser XML real e recarga. Zero erros JavaScript; sem overflow horizontal nas capturas 1600×960 e 980×680. |
| Probes de modelo | Restrições de animação, escala e geometria confirmadas contra os módulos originais. |
| Medição local | Caminho de edição do modelo medido em Node 24.15.0, Windows x64, com 100, 500 e 2.000 objetos. Não é medição de FPS nem comparação de desempenho com o Rive. |

Os [resultados estruturados](evidencias.json) preservam as observações. Capturas, exports e harnesses temporários estão em `.cache/edisvg-analysis-2026-10-17/`, ignorados pelo Git. O renderer foi testado em seu modo navegador, sem preload; o teste Electron separado cobre a integração nativa. Os downloads dos probes usam os módulos de exportação originais e o mecanismo real de download do navegador, sem substituir o parser, o motor ou o exportador por mocks.

Não foram usados projetos pessoais, contas de clientes, produção ou chamadas pagas de IA. Diálogos nativos de abrir/salvar, cada provedor de IA real, runtimes móveis e paridade visual com o Rive não foram homologados nesta análise. Nenhuma funcionalidade de produção foi alterada.

## O que existe hoje

| Área | Estado funcional |
| --- | --- |
| Novo projeto e cena | Documento vazio com uma cena e um `viewBox`; objetos com identidade, hierarquia e atributos validados. |
| Desenho | Retângulo, círculo, linha, texto básico e caneta com segmentos retos e curvas Bézier. |
| Vértices | Conversão de primitivas, âncoras e alças, quatro modos de vértice, inserção, exclusão, abertura e fechamento de contorno, inversão e cancelamento de gesto. |
| Objetos | Seleção simples, arraste, renomear, duplicar, excluir, ordem dentro do grupo, visibilidade, bloqueio e transformações. Grupos importados existem; criar e reorganizar grupos livremente ainda falta. |
| Arquivos | Projeto v2, leitura de v1/v2, salvar/salvar como, indicação de alterações e histórico limitado a 100 checkpoints. A recuperação da cópia local está quebrada no fluxo atual. |
| Animação | Três nomes fixos: Parado, Acenar e Pular. Poses matemáticas globais, marcadores de quadros e controle de reprodução. Não há trilhas animáveis por objeto. |
| Estados | Demonstração fixa do mascote. Projetos próprios não possuem máquina de estados funcional. |
| Exportação | HTML com interação fixa, SVG com CSS predefinido e JSON de projeto. Não há runtime genérico, componente React nem Lottie. |
| IA | Chat com clientes Claude Code/Codex e oito ferramentas MCP. Não cria objetos, trilhas, rigs ou estados. |
| Distribuição | Integração ao SDK, Hub e pipeline da suíte; isso não certifica a conclusão dos recursos de autoria. |

Referências: [scene.js](../../../apps/edisvg/src/shared/scene.js), [pathGeometry.js](../../../apps/edisvg/src/shared/pathGeometry.js), [project.js](../../../apps/edisvg/src/shared/project.js), [animation.js](../../../apps/edisvg/src/shared/animation.js), [aiTools.js](../../../apps/edisvg/src/shared/aiTools.js).

## Funcionalidades que precisam de ajustes

Prioridades propostas: P0 protege trabalhos e arquivos; P1 impede resultado fiel ou uso profissional; P2 melhora coerência e operação. Não são uma classificação de vulnerabilidades de segurança. “Reproduzido” identifica execução real; “inspeção” identifica um caminho de código, sem atribuir a ele um incidente que não ocorreu.

| Item | Problema e evidência | Correção e critério de aceite |
| --- | --- | --- |
| A01 · P0 · Recuperação | Reproduzido: desenhar e editar um objeto grava a cópia local; recarregar muda a cena de um objeto para zero e sobrescreve a cópia. `app.js:50` inicia sempre um projeto novo e `save(false)` grava esse estado. A perda é do rascunho recuperável, não de um arquivo já salvo. | Separar início em branco de recuperação. Oferecer recuperar ou descartar antes de substituir o último checkpoint, com cópias versionadas no main. Aceite: reinício após interrupção restaura o último rascunho íntegro; descarte é explícito; erro ou quota não apaga a versão anterior. |
| A02 · P1 · Exportação fiel | Reproduzido: Pular configurado em loop exporta CSS com uma única execução; o HTML inicializa Parado, mesmo com outra animação selecionada. Acrescentar um marcador não altera o SVG exportado. O exportador recria o movimento em CSS, separado de `poseAt`. | Um avaliador comum deve governar preview e runtime. SVG/CSS recebe somente conversões suportadas, com relatório de perdas. Aceite: mesmos valores, origem, duração, modos e estado inicial em instantes e entradas iguais. |
| A03 · P0 · Escrita de exportação | Inspeção: `index.js:303` usa `writeFile` diretamente no destino escolhido. Projetos usam escrita atômica, mas exports não. Uma falha após truncamento pode comprometer um export anterior; não foi induzida perda de arquivo nesta análise. | Aplicar helper compartilhado com staging e substituição segura, respeitando o destino autorizado. Aceite: erro de disco, cancelamento e falha de rename preservam a saída anterior e informam o resultado real. |
| A04 · P1 · Proporção importada | Reproduzido com DOMParser real: `preserveAspectRatio="none"` é aceito, mas desaparece na cena e na renderização. Isso altera o encaixe quando o viewport não tem a proporção do viewBox. | Modelar e preservar o atributo; se um valor não for suportado, recusá-lo com diagnóstico antes de substituir a arte. Aceite: referência SVG e reexportação têm o mesmo encaixe em dois viewports de proporções diferentes. |
| A05 · P1 · Geometria SVG | Reproduzido: o navegador aceita `M0 0L10 0ZL20 20` e calcula comprimento 48,28427; `parsePath` recusa a continuação após Z. A arte pode ser exibida pelo navegador e falhar ao entrar em edição de vértices. | Completar a semântica de comandos após fechamento e criar corpus de conformidade. Aceite: abrir, editar e reexportar preservam os subpaths e a geometria aceita pelo perfil SVG declarado. |
| A06 · P1 · Limites de leitura | Inspeção: projeto e SVG são lidos integralmente antes de conferir tamanho; os limites usam comprimento de string, não bytes. `projectFiles.js:94–95` e `index.js:276–277`. | Limite efetivo de bytes durante leitura, validação de UTF-8 e orçamento agregado de objetos/atributos. Aceite: excesso é recusado sem alocar o arquivo inteiro nem alterar o documento atual. |
| A07 · P2 · Histórico e navegação | Reproduzido: selecionar Pular cria um checkpoint; Undo volta a Parado e muda para Design, sem desfazer a transformação anterior. `selectAnimation` chama `save`, e `applyProject` força Design para cenas. | Separar seleção, transporte e modo de edição dos comandos que mudam conteúdo. Aceite: navegar não consome Undo; desfazer uma propriedade mantém o contexto de trabalho quando possível. |
| A08 · P1 · Controles sem efeito real | Reproduzido: com “Chave automática” selecionada, modificar X no modo Animar não cria chave. `state.auto` apenas alterna o botão. As curvas também são desenhos fixos; Testar recusa projetos próprios. | Até o motor existir, identificar ou desabilitar capacidades indisponíveis; depois ligá-las a operações reais. Aceite: autochave grava alvo, tempo e valor; curvas alteram a avaliação; Testar executa a cena do usuário. |
| A09 · P1 · Semântica de atributos | Reproduzido no modelo: `validAttributes` aceita `matrix(1e999 0 0 1 0 0)`. A validação atual verifica padrão textual, mas não a finitude de todos os coeficientes e a semântica completa da geometria. | Parser tipado de transformações, números e paths; singularidade tratada explicitamente nos gestos. Aceite: números não finitos e geometria inválida falham na entrada, sem produzir seleção ou desenho inconsistente. |
| A10 · P2 · Informações e diagnósticos | Reproduzido: o export de um retângulo ainda descreve “Zezé · máquina Interação · 3 animações”. Ajuda e README possuem limitações antigas; README recomenda npm/Node 22 e pacote portátil anterior à integração. O smoke legado exige `.mascot`, ausente na tela inicial atual. | Derivar textos e capacidades do documento; atualizar o guia e o smoke para projeto vazio e próprio. Aceite: documentação corresponde ao monorepo atual, menus não prometem recursos inexistentes e o smoke percorre o fluxo de início vigente. |

Fontes dos ajustes: [app.js](../../../apps/edisvg/src/renderer/src/app.js), [export.js](../../../apps/edisvg/src/renderer/src/export.js), [svgImport.js](../../../apps/edisvg/src/renderer/src/svgImport.js), [index.js](../../../apps/edisvg/src/main/index.js), [projectFiles.js](../../../apps/edisvg/src/main/projectFiles.js), [smoke.js](../../../apps/edisvg/src/main/smoke.js). A01–A10 não significam que as funcionalidades futuras abaixo já tenham sido prometidas como implementadas.

## Funcionalidades existentes que precisam de melhorias

| Item | Base existente | Evolução necessária |
| --- | --- | --- |
| M01 · Seleção e transformação | Seleção simples, arraste e campos numéricos | Multisseleção, marquee, seleção por hierarquia, alças reais de escala/rotação, pivô editável, alinhar/distribuir, guias, snapping, espelhamento e espaços local/global. A escala negativa hoje é recusada no modelo de transformação. |
| M02 · Caneta e vértices | Bézier, alças, inserir/remover e cancelar | Selecionar vários pontos, unir/separar caminhos, simplificar com tolerância, suavizar, edição de segmentos e operações booleanas. Preservar gesto como uma única edição e validar precisão após roundtrip. |
| M03 · Aparência | Preenchimento/contorno sólido e espessura | Seletor visual de cor, amostragem, paletas, valores herdados claros, estilos reutilizáveis e prévia consistente. Gradientes e efeitos requerem também a ampliação do modelo, não só um novo controle. |
| M04 · Texto | Conteúdo e tamanho básicos | Fonte, peso, alinhamento, múltiplas linhas, espaçamento, wrapping, texto em caminho, shaping, escrita bidirecional e fallback verificável. Converter em contorno deve ser opção explícita; texto dinâmico precisa permanecer texto no runtime. |
| M05 · Importação | Subconjunto seguro de SVG | Colar/arrastar, relatório por elemento e compatibilidade com arquivos de ferramentas reais. Gradientes, defs, máscaras, imagens e símbolos hoje são recusados. Ampliar por perfil seguro, sem liberar scripts ou URLs arbitrárias. |
| M06 · Histórico e persistência | Checkpoints integrais, arquivo atômico e indicação de alterações | Transações de comandos, orçamento de memória, autosave durável, backups e migrações testadas. Uma tarefa longa de IA precisa poder ser desfeita como uma unidade, sem perder edições concorrentes. |
| M07 · Desempenho | DOM SVG e transformações CSS | Índices de objetos, avaliação e renderização incremental, cache de geometria, updates de seleção sem reconstruir a tela e processamento pesado fora da UI. Decidir Canvas/GPU/WASM somente por requisitos e benchmarks. |
| M08 · Espaço de trabalho | Regiões principais e atalhos funcionais | Painéis redimensionáveis, busca de comandos, menus contextuais, atalhos descobríveis, navegação consistente e nomes acessíveis. As duas larguras verificadas não tiveram overflow horizontal; isso não homologa DPI, todos os estados e todos os tamanhos. |
| M09 · Testes de autoria | 59 testes e gate nativo da suíte | Jornadas Electron de projeto próprio: importar, desenhar, animar, salvar, fechar, recuperar e exportar. Acrescentar corpus SVG, referência de renderização, falhas de disco, limites e equivalência editor/runtime. Teste de licença não substitui teste de animação. |
| M10 · Assistente | Chat, streaming, cancelamento e oito ferramentas | Inspeção de geometria, pintura, texto e recursos; edição por ID; transações, revisão de mudanças e controle de revisão do documento. O `get_overview` atual lista objetos, mas não expõe todos os seus atributos e paths. A IA não pode criar as estruturas que ainda faltam no motor. |

O custo potencial de M06/M07 aparece no código: [history.js](../../../apps/edisvg/src/shared/history.js) copia snapshots e usa JSON para detectar mudanças; `render()` de [app.js](../../../apps/edisvg/src/renderer/src/app.js) recria a interface; [pathEditor.js](../../../apps/edisvg/src/renderer/src/pathEditor.js) copia geometria e reconstrói overlays durante gestos. Isso indica onde medir e otimizar, não justifica substituir toda a tecnologia de imediato.

## Funcionalidades ainda necessárias para a substituição completa

| Item | Sistema a implementar | Entrega funcional esperada |
| --- | --- | --- |
| I01 | Documento extensível e núcleo de comandos | Animações livres, trilhas, estados, bindings, artboards, rigs e recursos como entidades versionadas. IDs estáveis, referências válidas, migração v1/v2 e rejeição de ciclos/limites. Estado de UI separado do conteúdo. |
| I02 | Artboards e componentes | Criar, dimensionar, duplicar e organizar pranchetas; instâncias aninhadas, componentes reutilizáveis, overrides e bibliotecas. Reparenting mantém a pose global e não cria ciclos. |
| I03 | Animação e timeline reais | Trilhas por objeto/propriedade, chaves com tempo e valor, interpolação, easing e curvas editáveis, duração/FPS configuráveis, autochave, copiar/mover/excluir chaves, onion skin, scrubbing e mistura de animações. Propriedades discretas e numéricas têm regras próprias. |
| I04 | Máquina de estados editável | CRUD de estados e transições, condições, prioridade, tempo de saída, duração de blend, interrupção e camadas simultâneas. Grafo, debugger e histórico de execução devem operar sobre o mesmo modelo persistido. |
| I05 | Data binding | View models tipados, instâncias, strings, números, booleanos, cores, enums, listas, triggers e referências a recursos/componentes. Bindings uni/bidirecionais, conversões e observação de mudanças, com prevenção de loops. |
| I06 | Rig, FK, IK e restrições | Ossos reais, pose de referência, vínculos, pivôs e hierarquia; cinemática direta/inversa; joysticks, limites, influência, distância, transformação e seguir caminho. Ordem de avaliação explícita, detecção de dependências circulares e tratamento de alvos inalcançáveis. |
| I07 | Malhas, morph e solos | Triangulação, pesos, skinning, deformação e edição de bind pose; morph com correspondência de topologia; solos e troca de expressões. Separar deformação de paths vetoriais da deformação de imagens por malha. |
| I08 | Layouts responsivos | Containers, linhas/colunas/grids, hug/fill, alinhamento, padding, gaps, constraints, N-slicing e scrolling com física. Redimensionar a arte inteira por viewBox não equivale a reorganizar uma interface. |
| I09 | Recursos e gráficos avançados | Imagens, fontes, áudio, gradientes, clipping, máscaras, símbolos, múltiplas pinturas, suavização de bordas vetoriais, trim paths e ordem de desenho animável. Referências internas seguras, deduplicação, gestão de uso e políticas para assets externos. |
| I10 | Runtime web independente | Loader de formato próprio, avaliador determinístico, estados, eventos, bindings, assets, resize, limpeza e API pública tipada. Não depender de Electron, CLIs de IA nem da sessão do assinante que criou o arquivo. A política comercial do runtime precisa ser explícita. |
| I11 | Integrações e runtimes por plataforma | Componente React e exemplo Next.js; depois cobertura explícita de Apple, Android, Flutter, React Native, Unity, Unreal e integrações nativas necessárias. Uma WebView não comprova equivalência funcional ou de desempenho. |
| I12 | Publicação e formatos de saída | Pacote interativo fiel, HTML único e biblioteca; SVG estático/animado, Lottie com matriz de conversão e mídia PNG/sequência/GIF/MP4/WebM conforme escopo. Interatividade não pode ser silenciosamente convertida em vídeo ou descartada. |
| I13 | Scripting e gráficos procedurais | Extensões com API versionada e sandbox, orçamento de CPU/memória, diagnóstico, profiling e cancelamento. Incluir shaders e conteúdo GPU/3D na matriz de escopo, com prioridade pelos casos de uso. Não usar `eval` irrestrito ou dar ao documento acesso ao main/arquivos. |
| I14 | Colaboração e bibliotecas de equipe | Comentários, revisão, histórico, compartilhamento, permissões por arquivo/equipe, componentes entre projetos, presença e resolução de conflitos. Preservar edição local e sincronização recuperável; adoção de armazenamento e operação requer desenho próprio, sem presumir contratação de serviços. |
| I15 | Migração de acervo | Importação de Lottie e PSD com camadas, perfil de migração do Rive e compatibilidade SVG ampliada. Mapear animações, estados e recursos, produzir relatório de fidelidade e identificar dados não recuperáveis. Não prometer import/export `.riv` sem prova com corpus real. |
| I16 | Acessibilidade do conteúdo | Metadados semânticos, foco/teclado e entrada de texto, texto dinâmico acessível, movimento reduzido e alternativas para ações/áudio. A semântica deve atravessar o arquivo e chegar ao runtime, não ficar apenas no painel do editor. |
| I17 | Ambientes de autoria adicionais | Homologar editor macOS e, se o objetivo incluir autoria no navegador, separar adaptadores de arquivos, assistente e licença da UI web. O Windows atual não comprova portabilidade; não é necessário inventar um editor móvel para iniciar. |

As famílias I03/I04 correspondem à autoria de animação e lógica interativa documentada pelo Rive. [Máquinas de estados](https://rive.app/docs/editor/state-machine/state-machine). I05/I08 ampliam o escopo para interfaces conectadas a dados e responsivas. [Data binding](https://rive.app/docs/editor/data-binding/overview), [Layouts](https://rive.app/docs/editor/layouts/layouts-overview). I07 deve distinguir os modelos de deformação, inclusive malhas de imagens. [Meshes](https://rive.app/docs/editor/manipulating-shapes/meshes).

I10/I11 não são um detalhe de exportação: runtimes são o caminho pelo qual o conteúdo entra nos produtos finais. A cobertura varia por plataforma e renderer; uma promessa de substituição completa exige uma matriz de capacidades e versões, não apenas “funciona na web”. [Runtimes oficiais](https://rive.app/docs/runtimes/getting-started), [Feature Support](https://rive.app/docs/feature-support), [Exporting for Runtime](https://rive.app/docs/editor/exporting/exporting-for-runtime). Scripting e semântica também fazem parte do comparativo atual. [Scripting](https://rive.app/docs/scripting/getting-started), [Semantics](https://rive.app/docs/editor/accessibility/semantics). As famílias gráficas e de importação estão no [catálogo de recursos](https://rive.app/features); conteúdo GPU/3D também aparece na [matriz versionada de suporte](https://github.com/rive-app/rive-docs/blob/main/feature-support.mdx), sem equivalência automática entre plataformas.

O [plano existente](../../../apps/edisvg/PLANO-DE-IMPLEMENTACAO.md) já organiza 18 etapas e a [auditoria anterior](../../../apps/edisvg/audits/etapa-01/RELATORIO.md) mapeia 90 requisitos. Eles são bases úteis, não trabalho a descartar. Esta análise acrescenta reproduções, o comparativo atual e o escopo de runtimes/ecossistema. A instalação e a licença avançaram desde aquele diagnóstico; as limitações de autoria continuam no código.

## Como tornar o processo mais inteligente

Os diferenciais abaixo são propostas de produto, não capacidades presentes nem resultados já medidos.

1. **Assistente que entrega tarefas completas.** “Faça um botão com hover, foco e pressionado” deve criar objetos, animações, estados, bindings e exemplo de integração. Mostrar um diff visual e estrutural antes de aplicar; o resultado continua editável manualmente.
2. **Rig assistido com controle humano.** Sugerir partes, pivôs, ossos e pesos, indicando confiança e pontos ambíguos. Confirmar a pose antes de vincular. Não deformar destrutivamente a arte original.
3. **Animação orientada a intenção.** Gerar rascunhos de movimentos, retarget entre personagens e presets parametrizados, sempre convertidos em trilhas e chaves reais. Não produzir apenas vídeo ou código opaco.
4. **Diagnóstico automático do projeto.** Encontrar transições inalcançáveis, condições contraditórias, ciclos, assets ausentes, trilhas redundantes, custos altos e semântica incompleta. Apontar o objeto e oferecer correção reversível.
5. **Integração assistida e verificável.** Gerar contrato de dados e exemplo React/HTML, testar as entradas e comparar screenshots/poses entre editor e runtime. Falhar explicitamente se a plataforma escolhida não suportar um recurso.
6. **Fluxos reutilizáveis.** Templates de botões, ícones, mascotes, gráficos e aulas com parâmetros e semântica, não cópias soltas. Reutilizar desenho, rig e comportamento sem repetir configuração manual.

Cada operação nova deve entrar simultaneamente no comando de domínio usado pela interface e na ferramenta de IA correspondente. Cancelamento, conflito com edição manual, versão do documento e desfazer precisam funcionar antes de liberar automações em lote. Um agente pago pode ficar opcional: desenhar, animar e exportar não podem depender de ter Claude Code ou Codex instalados.

## Arquitetura necessária

O [padrão desktop](../../arquitetura-desktop.md) já separa main, preload, renderer e contratos. A evolução deve preservar essa fronteira e os controles de segurança/licença existentes.

- **Documento e comandos:** TypeScript estrito para o código novo, validação nas entradas, transações e migração. Não adicionar trilhas apenas ao estado de um painel.
- **Avaliador puro:** tempo e entradas produzem uma pose e eventos determinísticos. A mesma implementação atende preview, testes e runtime; nenhum segundo motor escondido no exportador.
- **Renderer com fronteira própria:** começar preservando o SVG funcional. Extrair um renderer alternativo quando medições e recursos como malhas justificarem, com corpus de fidelidade entre backends.
- **Runtime distribuível:** formato e API versionados, compatibilidade publicada e sem dependências server-only ou do ambiente de autoria. Separar dados de edição de dados necessários à execução quando isso trouxer benefício mensurável.
- **Editor e assistente:** UI, gestos e MCP são adaptadores dos comandos, não donos de regras independentes. Publicar packages de núcleo/runtime quando houver consumidores reais; apps não devem importar apps.

`app.js` tem 771 linhas e concentra estado, UI, transporte, demonstração, persistência, atalhos e comandos de IA. A divisão recomendada é por funcionalidades e contratos; não há justificativa para uma reescrita visual completa só por estar em JavaScript. Os módulos de geometria e testes próximos ao código são bons pontos de partida.

Também é necessário decidir a estratégia de compatibilidade: motor totalmente próprio, ou reaproveitamento seletivo de tecnologia aberta. Os runtimes oficiais do Rive são documentados como open source/MIT; reutilizá-los poderia substituir a ferramenta de autoria sem necessariamente tornar a tecnologia independente do ecossistema Rive. Isso exige uma prova técnica, verificação das licenças dos componentes escolhidos e uma decisão arquitetural explícita, não uma troca automática. [Licenciamento dos runtimes](https://rive.app/docs/runtimes/getting-started#licensing).

## Desempenho e eficiência

O caminho medido executa alteração de um objeto, validação do documento, commit do histórico e serialização SVG. São 20 iterações por tamanho numa execução local; valores são uma linha de base, sujeitos a variação de máquina e coleta.

| Objetos | Mediana por operação | P95 por operação | Documento serializado |
| --- | --- | --- | --- |
| 100 | 1,13 ms | 1,70 ms | 24.859 bytes |
| 500 | 7,93 ms | 10,22 ms | 124.299 bytes |
| 2.000 | 35,81 ms | 44,77 ms | 499.577 bytes |

Esses números não incluem DOM, GPU, importação, efeitos, malhas ou frames do player. O `tick` atual atualiza transformações CSS; portanto a duração de uma edição não deve ser apresentada como duração de todos os frames. “60 fps” na UI é um texto fixo, não um contador de desempenho medido.

Para sustentar a promessa de eficiência, medir quatro tarefas equivalentes no EdiSVG e no Rive: importar e preparar um personagem; criar uma interação com estados e dados; adaptar a diferentes tamanhos; integrar e revisar o resultado no app. Registrar tempo mediano, ações manuais, erros, retrabalho e intervenções exigidas da IA.

No runtime, comparar o mesmo conteúdo, dispositivo, resolução e qualidade: bytes comprimidos de runtime e assets, tempo até o primeiro frame, CPU/GPU, memória, P95 de frame, input até resposta e múltiplas instâncias. A meta de 60 Hz corresponde a aproximadamente 16,7 ms por frame, mas limites e perfis de complexidade devem ser definidos por hardware homologado. Não prometer superioridade antes de medir.

## Ordem recomendada de implementação

| Lote proposto | Entrega | Gate de saída |
| --- | --- | --- |
| 0 · Confiabilidade | Recuperação, saídas atômicas, limites de leitura, fidelidade básica da exportação e informação honesta das capacidades | Rascunho recuperado após interrupção; destino anterior preservado; reproduções A01/A02/A03/A06 fechadas com regressão. |
| 1 · Núcleo e primeira animação real | Documento extensível, comandos, migração, uma trilha numérica e um runtime web mínimo usando o mesmo avaliador | Dois objetos com animações independentes; salvar/reabrir; poses editor/runtime iguais nos tempos testados. |
| 2 · Autoria e composição | Timeline/curvas, seleção e grupos, artboards/componentes, importação e recursos vetoriais | Cena criada do zero, sem Zezé ou nomes fixos, com reutilização e edição reversível. |
| 3 · Interatividade | Estados, camadas, bindings, eventos, layouts e integração React | Botão/componente responsivo conectado a dados reais, exportado e controlado por uma aplicação exemplo. |
| 4 · Personagens | Rig, IK/restrições, malha, morph e expressões | Mascote livre com membros independentes, deformação consistente e controles interativos equivalentes no runtime. |
| 5 · Produção avançada | Assets/fontes/áudio, formatos adicionais, acessibilidade, scripting e renderer avançado quando necessário | Perfil de recursos documentado, conversões sem perdas silenciosas, sandbox e desempenho homologados. |
| 6 · Ecossistema | Runtimes/plataformas adicionais, autoria macOS/web conforme matriz, bibliotecas, colaboração e migração de acervo | Cada plataforma e cenário comercial declarado possui testes, limites e caminho de migração aceitos. |

IA e testes atravessam todos os lotes. O runtime começa no lote 1; deixá-lo somente para o fim criaria risco de descobrir tarde que o modelo do editor não pode ser reproduzido fora dele. O plano anterior pode ser reorganizado por esses marcos, mantendo seus requisitos e rastreabilidade.

Primeira fatia recomendada, no lote 1: usar dois objetos de um SVG próprio, criar uma animação livre com duas chaves por objeto, salvar/reabrir e reproduzir a mesma pose em um exemplo web mínimo. Edição gráfica de curvas e composição avançada entram no lote 2; hover/click, estados e integração React entram no lote 3. Essa sequência produz marcos demonstráveis de substituição em casos reais, não uma declaração antecipada de substituição completa do Rive.

Revisar cada lote antes de avançar e executar review integral nos marcos. Não há base nesta análise para estimar uma data de substituição completa: o prazo depende da matriz de plataformas, do acervo a migrar, dos recursos aceitos e da capacidade de execução.

## Critérios de conclusão

Uma funcionalidade só está concluída quando pode ser criada, editada, persistida, desfeita/refeita e executada fora do editor, com testes e limitações explícitas. Para a substituição completa:

- A matriz de autoria, runtime e plataformas precisa cobrir os usos acordados, sem tratar uma demonstração fixa como implementação genérica.
- Arquivos antigos, projetos grandes e falhas de leitura/gravação devem preservar trabalho e apresentar recuperação verificável.
- UI e IA devem chegar aos mesmos comandos, e preview/runtime aos mesmos resultados.
- O formato exportado deve declarar versões e capacidades, com falha ou diagnóstico para recursos incompatíveis.
- Cada melhoria de velocidade deve ter comparação reproduzível, incluindo erros e retrabalho, não só FPS isolado.
- Migração funcional do fluxo e compatibilidade binária `.riv` são objetivos distintos; o segundo exige validação específica e não pode ser presumido a partir de exportar SVG.

Próximo passo recomendado: aprovar a matriz de substituição e iniciar o lote de confiabilidade. Esta entrega é o diagnóstico; não iniciou implementação, commit, merge, push ou mudança de produção.
