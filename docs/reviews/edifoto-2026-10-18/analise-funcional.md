# Análise funcional do EdiFoto para substituir o Photoshop

> Escopo revisto pelo titular em 18/10/2026: editor simples para usuários sem formação em design, com professores como referência de uso e nomes genéricos na interface. IA exclusivamente pela assinatura pessoal. A implementação autorizada segue o [plano simplificado](../../../apps/edifoto/PLANO-DE-IMPLEMENTACAO.md); os sistemas profissionais abaixo permanecem como diagnóstico histórico, não como backlog obrigatório deste ciclo.

Data: 18/10/2026, America/Sao_Paulo. Checkout: `feat/edisvg-evolution`, HEAD `88c1163d9ca32f3310da77ac853dc71012d3fe7b`. Manifest do EdiFoto: 0.2.0. O checkout já continha alterações de EdiSVG e SDK; elas foram preservadas. A versão do editor é independente da versão comercial da suíte.

## Conclusão

O EdiFoto é uma base funcional de editor raster com camadas, ajustes, vetores e assistência por linguagem natural. Ainda não substitui o Photoshop para fotografia profissional, composição complexa, tratamento de arquivos de clientes, impressão ou ilustração avançada. Os principais bloqueios são confiabilidade do documento, fidelidade de composição, interoperabilidade, precisão de cor, edição não destrutiva completa e ausência de seleção semântica e retoque inteligente.

Há uma boa base a preservar: composição GPU, camadas de ajuste editáveis, desenho Bézier, formas, seleções combináveis, pintura em máscaras, histórico de pixels, chroma key local em worker, exportação raster e integração desktop da suíte. A inteligência existente é principalmente um agente que chama essas ferramentas. Não há hoje um sistema próprio de geração de imagens, seleção de pessoas/céu ou reconstrução de objetos.

Para superar o Photoshop, a prioridade deve ser entregar tarefas completas com menos decisões manuais e resultado profissional previsível. Acrescentar um chat ou reduzir a quantidade de controles não comprova superioridade. A Adobe já oferece preenchimento generativo e filtros não destrutivos; esses recursos constituem referência de comparação, não um diferencial exclusivo do EdiFoto. [Generative Fill](https://helpx.adobe.com/photoshop/desktop/create-open-import-images/create-images/edit-images-with-generative-fill.html), [Smart Filters](https://helpx.adobe.com/photoshop/desktop/effects-filters/smart-filters/apply-and-manage-smart-filters.html).

Este diagnóstico contém **18 ajustes/correções, 16 melhorias de recursos existentes e 24 funcionalidades/sistemas a implementar**. Os números representam itens de backlog, não esforço, percentual de conclusão ou paridade funcional. Não foi iniciada implementação funcional.

## Método, evidências e limites

Foram examinados os manifests e scripts, documentos atuais e históricos, modelo de documento, estado e histórico, importação/exportação, armazenamento de bitmaps, compositor e shaders, pintura, seleções, vetores, chroma, painéis, atalhos, agentes, MCP, preload, main e integração de arquivos/licença. A referência externa usa documentação oficial Adobe e MDN. A ausência de recursos foi confrontada com modelo, operações, ferramentas expostas, dependências e interface; um nome de botão não foi tratado como implementação completa.

| Verificação executada | Resultado e alcance |
| --- | --- |
| Ambiente | Node 24.15.0 e pnpm 9.15.0, conforme configuração do repositório. |
| `pnpm --filter @informach/edifoto test` | 21 testes passaram, sem falhas/skips. Warnings `MODULE_TYPELESS_PACKAGE_JSON` permaneceram visíveis. |
| `pnpm --filter @informach/edifoto typecheck` | Passou. |
| `pnpm edi:test:native edifoto` | Passou: inventário ASAR físico, rejeição de adulterações, GUI, abertura pelo gerenciador, licença offline de fixture, modal Novo documento, expiração, restauração de modal e bloqueio IPC. Usa perfis/chaves descartáveis; não instala nem publica instalador. O runner também compila o app. |
| Harness web original | Falhou nas três entradas verificadas: falta `window.ediSuite.onRecovery`, o App desmonta e os testes passam a procurar controles ausentes. Não é falha da inicialização Electron. |
| Harness com fixture de diagnóstico | Acrescentando apenas `ediSuite.onRecovery` no ambiente descartável, passaram 68 verificações da sequência padrão: 12 vetoriais, 14 raster, 14 de paridade, 13 de seleção e 15 de novo documento. A entrada isolada Novo documento também passou suas 15 verificações; é repetição, não cobertura adicional. |
| Chroma no harness | Mesmo com a ponte completada, a suíte falhou em um seletor desatualizado: procura `aria-label="Remover fundo com chroma key"`, enquanto o diálogo usa `Remover fundo`. A prévia estava pronta. |
| Chroma por jornada independente | Prévia por worker, cancelamento, aplicação, transparência do fundo, opacidade do objeto, preservação da máscara, undo/redo e roundtrip foram exercitados com imagem sintética de 640×480. Passaram; não comprovam qualidade universal em cabelos/fundos reais. |
| Probes direcionados | Reproduzidas perdas de edição por abertura/drop, concorrência de salvamento, parser permissivo, bitmap ausente, merge divergente, resize, bloqueio, alteração parcial pela IA, retenção de bitmaps, máscara fixa, agrupamento de histórico e estado salvo. |
| Contrato de saída | `createFileAuthority` autoriza `chosen.jpeg`, mas rejeita `chosen.jpg`, caminho para o qual `exportTo` normaliza a saída. Verificação de módulos; não foi um diálogo Windows de exportação ponta a ponta. |
| Interface | Capturas inspecionadas em 1440×900 e 1100×680, com assistente aberto e fixture `praia.jpg` do repositório. Dock cortado no tamanho mínimo. |

O navegador integrado não inicializou por erro de metadados de sandbox da ferramenta; foi utilizado Playwright 1.59.1 com o Chromium instalado em `chromium-1223`, headless e perfil descartável. A revisão funcional web usa as funções reais do app e do compositor; arquivos e provedores são simulados. A fixture adicional não altera a aplicação nem torna verde o harness versionado. Uma primeira tentativa da jornada independente falhou por ausência do preâmbulo React no HTML de teste; o HTML de diagnóstico foi corrigido antes das verificações válidas.

Os [resultados estruturados](evidencias.json) preservam valores observados. Harnesses, saídas brutas e capturas ficam em `.cache/edifoto-review/`, ignorado pelo Git; o runner nativo guarda suas capturas em `.cache/edi-native-results/`. Não foram usados projetos pessoais, produção, compras ou chamadas pagas de IA. Não houve benchmark comparativo com Photoshop, homologação de todos os drivers/tablets, fluxo nativo completo de salvar/abrir/exportar, revisão de modelos comerciais de IA ou nova publicação.

Os bloqueios Electron/ACL citados em `ENTREGA-0.2.0.md` e `IMPLEMENTACAO.md` são históricos: não se reproduziram no smoke nativo atual. Isso não encerra a homologação funcional desses documentos. A escrita final já usa `atomicWrite` do SDK; os problemas de salvamento encontrados são de snapshot/estado e validação, não ausência de escrita atômica.

## Funcionalidades existentes

| Área | Implementação atual | Limite relevante |
| --- | --- | --- |
| Documentos | Novo documento, presets, abrir imagem/projeto, recentes, `.edifoto` v1, salvar e salvar como. | Um documento por vez; formato sem validação estrutural/migração efetiva; sem autosave durável próprio. |
| Importação | PNG, JPEG, WebP, GIF, BMP e AVIF por decodificação do navegador. | Sem PSD/PSB, TIFF, RAW ou HEIF; GIF não possui timeline de edição. |
| Camadas | Raster, cor sólida, gradiente, texto, ajuste e vetor; nome, busca/tipo, ordem, duplicação, visibilidade, bloqueio. | Lista plana e uma camada ativa; sem grupos, clipping, objetos inteligentes e estilos. |
| Composição | WebGL2, 27 modos, prévia por hover, favoritos, comparação, opacidade/preenchimento. | Preenchimento global e opacidade viram um único produto; os nomes dos modos não certificam paridade Adobe. |
| Ajustes | Exposição, brilho, contraste, sombras/realces, temperatura/tint, vibração, saturação, matiz, níveis RGB, curvas, P&B e inversão. | Curvas em cinco pontos fixos com interpolação linear; interface de níveis principalmente conjunta. |
| Máscaras | Uma máscara raster por camada, pintura, gradiente, inversão, ativação e seleção para máscara. | Coordenadas do documento; sem vínculo/unlink com transformação da camada e sem refinamento profissional. |
| Seleções | Retângulo, laço, varinha conectada, soma/subtração/interseção, inverter, máscara e apagar pixels. | Sem sujeito/objeto/céu, canais salvos, feather/expand/contract completos ou transformação da seleção. |
| Pintura e retoque | Pincel/borracha com tamanho, dureza, fluxo, opacidade e modos; carimbo e desfoque local. | Sem pressão/tilt, motor de pontas avançado ou healing/inpainting; carimbo amostra a própria camada. |
| Vetores | Seis formas, caneta Bézier, pontos/alças, preenchimento/contorno e transformação. | Sem booleanas, compound paths e conjunto completo de ferramentas de alinhamento. |
| Geometria | Mover, escala uniforme, girar, espelhar, cortar e redimensionar documento. | Sem skew, perspectiva, warp ou matriz afim completa. |
| Texto | Conteúdo multilinha, fonte, tamanho, peso, itálico, cor, alinhamento, entrelinha e espaçamento. | Sem editor de texto de área/runs tipográficos, fontes empacotadas ou fluxo editorial avançado. |
| Chroma | Fundo verde/azul, detecção/conta-gotas, despill, choke, prévia original/resultado/máscara e worker. | Recorte por cor, não segmentação semântica; resultado troca o bitmap da imagem. |
| Histórico | Undo/redo, patches de pintura, lista de passos, agrupamento de pedidos de IA. | 80 entradas, sem orçamento por bytes, checkpoints duráveis ou isolamento de autor. |
| Exportação | PNG, JPEG/WebP, qualidade, escalas predefinidas, JPEG branco, copiar composição. | Sem gestão explícita de perfis/metadados, presets múltiplos ou export em lote. |
| IA | Painel, Claude Code/Codex locais, API Anthropic, 25 ferramentas MCP, preview/análise e operações de edição. | Não gera pixels nem possui segmentação; não expõe pincel, carimbo e seleção manual em todo seu alcance. |
| Desktop | Sandbox, preload isolado, licença/atualização/integridade pelo SDK e capabilities de arquivos. | O smoke de acesso não equivale a homologação de todas as jornadas editoriais. |

Referências de código: [modelo](../../../apps/edifoto/src/shared/doc.ts), [operações](../../../apps/edifoto/src/renderer/src/lib/ops.ts), [compositor](../../../apps/edifoto/src/renderer/src/engine/compositor.ts), [ferramentas IA](../../../apps/edifoto/src/shared/aiTools.ts).

## Prioridade e classificação

- **P0:** risco direto de perder trabalho, associar arquivo ao documento errado ou salvar projeto incompleto. Corrigir antes de ampliar funcionalidades.
- **P1:** resultado visual incorreto, tarefa essencial impedida ou fundamento para substituição profissional. Vem na sequência imediata; dentro dela há dependências.
- **P2:** produtividade, acabamento e expansão de fluxos após estabilizar os fundamentos.
- **P3:** necessidades especializadas e extensibilidade depois de comprovar os fluxos principais.

**Reproduzido** significa observação executada nesta análise. **Código** significa comportamento/ausência confirmado pela implementação, sem reprodução completa do fluxo final. **Proposta** identifica evolução de produto, e não defeito comprovado. Prioridades abaixo são propostas de ordenação, não cronograma aprovado.

## Funcionalidades que precisam de ajustes ou correções

### C01 — Proteger todos os caminhos de substituição de documento — P0, reproduzido

Arrastar um `.edifoto` sobre o viewport ou receber um projeto por `app:openFiles` substitui a edição atual sem confirmação. Os menus usam `canDiscard`; esses caminhos chamam diretamente `openPath`. Em ambos os probes, o documento mudou sem diálogo. No drop, o novo estado ficou limpo, eliminando também o aviso de saída.

**Correção:** uma operação de abertura/substituição deve arbitrar salvar, descartar e cancelar para menu, recentes, drop, abertura do sistema e IA. Preservar o documento até leitura/validação/decodificação concluírem. **Aceite:** cancelar ou falhar em qualquer entrada conserva documento, pixels, histórico, caminho e estado de alterações. Fontes: `App.tsx:48`, `Viewport.tsx:416`, `actions.ts` e `files.ts:73`.

### C02 — Salvar o snapshot correto e marcar somente essa revisão como salva — P0, reproduzido

`writeDocument` captura o `doc`, aguarda serialização/gravação e chama `markSaved` no estado atual, sem conferir documento/revisão. Editar durante a gravação resultou em `dirty=false` apesar da edição posterior. Trocar de documento durante a gravação associou o novo documento ao caminho do anterior. Os bitmaps são mutáveis fora do JSON, então também precisam de snapshot coerente.

**Correção:** operação identificada por documento e revisão, snapshot consistente de modelo/pixels, coordenação de gravações e marcação de savepoint condicional. Não basta desabilitar um botão. **Aceite:** editar/trocar documento, pintar ou disparar dois saves não limpa uma revisão não gravada nem troca a associação de caminhos. Fontes: `files.ts:136`, `files.ts:200`, `state/doc.ts:204`.

### C03 — Validar integralmente o formato de projeto — P0, reproduzido

O parser confere magic e faz cast do JSON, mas não valida `format`, `version`, dimensões, tipos de camada, IDs, referências, faixas ou limites do índice binário. Um projeto com `version=999` e largura `-10` foi aceito. Arquivos truncados podem produzir erros técnicos pouco acionáveis.

**Correção:** schema na leitura/escrita, versão suportada explícita, migração e backup quando houver evolução, limites de tamanho/contagens, verificação de offsets e invariantes de cada camada. **Aceite:** rejeitar versões futuras, dimensões inválidas, IDs duplicados, referências quebradas, payloads truncados e índices fora do arquivo, sem alterar o trabalho aberto. Fonte: `files.ts:163`.

### C04 — Impedir salvamento incompleto por bitmap ausente — P0, reproduzido

`serializeDocument` faz `continue` quando um bitmap referenciado não existe. Foi possível gerar e reabrir um arquivo com camada raster e zero bitmaps. Isso converte inconsistência interna em projeto incompleto apresentado como salvo.

**Correção:** validar referências e dimensões antes de serializar; interromper sem substituir a saída anterior. **Aceite:** bitmap ou máscara ausente bloqueia a gravação com erro claro; roundtrip de projeto válido conserva pixels e referências. Fontes: `files.ts:126`, `files.ts:136`.

### C05 — Mesclar camadas sem alterar a aparência — P1, reproduzido

`mergeDown` renderiza só as duas camadas sobre transparência e reaplica o blend da camada inferior. Essa rasterização não representa corretamente a dependência do backdrop abaixo. No probe, um pixel passou de `[64,0,127,255]` para `[64,0,64,255]` após mesclar.

**Correção:** definir semântica de merge por tipo/blend/ajuste/máscara e preservar a composição real; quando a operação não puder conservar a aparência, explicar a restrição ou oferecer composição visível em nova camada. **Aceite:** comparação por pixels antes/depois em pilhas de três ou mais camadas, alfas, ajustes e modos não normais; undo restaura a pilha. Fontes: `ops.ts:339`, `actions.ts`.

### C06 — Corrigir redimensionamento sem proporção — P1, reproduzido

Para 100×100 → 200×100, o conteúdo recebe escala uniforme `sqrt(2)=1,4142`; não recebe largura ×2 e altura ×1. O documento muda de tamanho, mas camadas e máscaras passam a ter relações geométricas incompatíveis. A interface permite desligar a proporção.

**Correção:** transformação com eixos independentes ou matriz afim, atualizando renderização, interação, máscaras, vetores, texto e persistência. **Aceite:** redimensionar de forma não uniforme com camadas giradas/espelhadas preserva a geometria pedida; salvar/reabrir e undo/redo conservam o resultado. Fonte: `ops.ts:595`.

### C07 — Definir vínculo entre máscara e camada — P1, reproduzido

Máscaras estão no espaço do documento e o compositor as amostra por `uv` global. Ao mover a imagem, o recorte fica no lugar. No probe, a metade revelada não acompanhou uma translação de 25 px. Não há opção de vincular/desvincular para tornar esse comportamento uma escolha explícita.

**Correção:** espaço da máscara e estado de vínculo persistidos; padrão apropriado ao recorte, com transformação independente opcional. **Aceite:** mover/escalar/girar a camada com máscara vinculada conserva o recorte; desvincular permite mover só o conteúdo ou a máscara. Fontes: `shared/doc.ts` (`Mask`), `compositor.ts:282`, `shaders.ts` (`uMask`).

### C08 — Aplicar bloqueio de camada consistentemente — P1, reproduzido

Pintura, transformação e edição vetorial verificam bloqueio, mas `editLayer`, exclusão e várias operações de máscara não seguem o mesmo contrato. Foi possível apagar uma camada bloqueada e alterar a exposição de um ajuste bloqueado.

**Correção:** política central de bloqueio por operação, com desbloqueio explícito; decidir quais metadados/visibilidade continuam editáveis. **Aceite:** a mesma ação é impedida por botão, atalho e IA, independentemente do tipo de camada. Fontes: `ops.ts:220`, `ops.ts:248`, `ops.ts:293`, operações de máscara.

### C09 — Evitar alteração parcial em ferramentas de IA — P1, reproduzido

`set_layer` altera propriedades antes de validar a transformação. Pedir opacidade 50% e movimento em camada bloqueada retorna erro de bloqueio, mas mantém opacidade 50%. Uma resposta de erro pode portanto esconder uma mudança real.

**Correção:** validar toda a operação antes do commit e usar transação única com resultado e revisão explícitos. **Aceite:** erro, cancelamento ou parâmetro incompatível deixa documento/pixels/histórico intactos; sucesso produz um passo consistente. Fonte: `lib/aiTools.ts:253`.

### C10 — Isolar histórico, documento e concorrência da IA — P1, reproduzido/código

O agrupamento de um pedido é global no store. Uma edição manual feita durante esse grupo foi marcada `byAi=true` e recebeu o rótulo do assistente. A IA pode desfazer trabalho manual junto com o pedido. As chamadas também não carregam identidade/revisão esperada do documento; operações sem ID de camada podem atingir a imagem que estiver aberta quando chegarem. Isso último é risco de código, não execução com provedor real nesta análise.

**Correção:** operações atribuídas a autor/run/documento, fila ou transações compatíveis, cancelamento de respostas obsoletas e política para troca de documento. **Aceite:** trabalho manual permanece separado; chamada de documento A nunca altera B; dois agentes e confirmação pendente não cruzam resultados. Fontes: `state/doc.ts:122`, `state/doc.ts:201`, `state/assistant.ts`, `main/aiBridge.ts`, `lib/aiTools.ts:502`.

### C11 — Liberar bitmaps sem referência e limitar memória por bytes — P1, reproduzido

O store de bitmaps só tem remoção total. Após 90 duplicações/exclusões de uma camada de 100×100, havia 91 bitmaps, uma camada viva e 80 entradas no histórico. Criar outro documento pelo diálogo também manteve bitmap do documento anterior. GPU coleta algumas texturas, mas isso não libera os canvases CPU.

**Correção:** rastrear referências do documento, histórico, seleção e operações; coletar buffers não usados; impor orçamento por bytes e considerar armazenamento temporário para projetos grandes. **Aceite:** uso de memória estabiliza após ciclos longos, sem quebrar undo ou jobs ativos; fechar/substituir libera recursos antigos. Fontes: `engine/bitmaps.ts`, `state/doc.ts:65`, `actions.ts:createDocument`, `compositor.ts:429`.

### C12 — Unificar limites de resolução e tratar falhas de GPU — P1, código

Importação reduz pixels quando a imagem excede `MAX_TEXTURE_SIZE`, com aviso posterior à redução. Novo documento usa 8192/32 MP; resize aceita valores diferentes e o MCP também permite escala percentual/exportação que podem ultrapassar os limites finais. O compositor não valida completude de framebuffer nem restaura contexto perdido. Não foi provocada falta de VRAM no teste.

**Correção:** política única de capacidade e tamanho final antes da alocação, sem redução automática do original; imagem de trabalho/proxy separada da fonte; tratamento de contexto perdido; progressão para composição por blocos. **Aceite:** arquivo maior que a GPU é preservado ou recusado de forma clara; falhas não geram export vazio, travamento silencioso ou perda de documento. Fontes: `files.ts:33`, `actions.ts:createDocument`, `ExportDialog.tsx`, `compositor.ts:73/140`, `shared/aiTools.ts`. [Completude de framebuffer](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/checkFramebufferStatus), [boas práticas WebGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

### C13 — Corrigir layout no tamanho mínimo com assistente aberto — P1, reproduzido

Em 1100×680, o workspace mede 348 px; o dock tem aproximadamente 672 px e começa em x=-110. Comandos ficam cortados, a imagem é muito comprimida e a barra de opções perde espaço. A janela nativa permite exatamente esse tamanho mínimo.

**Correção:** dock adaptável, grupos recolhíveis, painéis redimensionáveis e limites de largura útil. **Aceite:** todos os comandos essenciais acessíveis por mouse/teclado em 1100×680 e escalas de Windows representativas, com/sem assistente. Fontes: `main/index.ts:80`, `styles/editor.css`, `styles/ai.css`, `QuickDock.tsx`.

### C14 — Reparar o harness e automatizar a cobertura editorial — P1, reproduzido

O harness web não representa a ponte de recuperação da integração atual. Após completar essa fixture externamente, o teste de chroma ainda falha pelo seletor antigo. O CI geral executa unitários e build; não há etapa equivalente aos E2E editoriais do EdiFoto. O smoke nativo cobre acesso/diálogo, não a sequência completa de arquivos e ferramentas.

**Correção:** fixtures atualizadas, runner de integração com resultado/exit code, seletores alinhados e cobertura de regressão dos defeitos desta análise. **Aceite:** suíte versionada passa sem intervenções externas e roda no CI; erros de teste retornam falha real. Fontes: `tests/browser/main.js`, `tests/app/chroma.js:35`, `scripts/browser-check.mjs`, manifest, `.github/workflows/ci.yml`, `scripts/edi/test-native.mts`.

### C15 — Manter o destino exportado coerente com o diálogo nativo — P1, reproduzido em módulos

O filtro permite `.jpeg`, mas `exportTo` troca a extensão para `.jpg` depois de o SDK autorizar o caminho escolhido. O contrato real rejeitou esse novo caminho. Exportações normais com `.jpg` não são afetadas pelo caso específico.

**Correção:** resolver e confirmar o caminho final antes de conceder capability; respeitar `.jpg`/`.jpeg` equivalentes e tratamento explícito de extensões conflitantes. Não ampliar permissões de diretório para ocultar o erro. **Aceite:** salvar escolhendo `.jpeg`, `.jpg`, maiúsculas e extensão automática usa exatamente o destino confirmado. Fontes: `files.ts:243`, `main/index.ts:SAVE_FILTERS`, `packages/edi-desktop/src/main.ts:312`, `packages/edi-desktop/src/files.ts:259`.

### C16 — Tornar o estado salvo e o início do histórico verdadeiros — P2, reproduzido/código

Salvar, editar e desfazer até o estado salvo mantém `dirty=true`. Presets da Home criam um documento ainda sem arquivo como limpo. Após descartar entradas pelo limite de 80, o botão “Abertura” só volta ao primeiro estado ainda retido, e não necessariamente à abertura original.

**Correção:** savepoint por revisão, identificação de documento novo, rótulo de checkpoint verdadeiro e política clara de retenção. **Aceite:** avisos aparecem apenas quando há conteúdo não salvo; voltar ao savepoint limpa o indicador; a interface não promete histórico que já foi descartado. Fontes: `state/doc.ts`, `home/Home.tsx:38`, `HistoryList.tsx`.

### C17 — Alinhar promessa dos controles ao processamento real — P2, código/probe

“Preenchimento” global e opacidade são multiplicados antes da mesclagem, sem semânticas independentes. No probe de Color Dodge, fill 50% e opacity 50% produziram exatamente `[184,128,96,255]`; isso comprova a equivalência interna, não uma comparação executada com Photoshop. A opacidade própria do preenchimento vetorial é outro recurso e funciona separadamente do contorno.

O atalho “Céu mais dramático” pede não alterar o restante, mas usa uma máscara em degradê sem seleção de céu; objetos na mesma região podem ser afetados. “Remover fundo” abre chroma limitado a cores saturadas; não resolve fundos arbitrários. O exemplo de suavizar pele no chat não possui uma ferramenta específica de retoque de pele.

**Correção:** contratos de controles compatíveis com seu nome, exemplos condicionados às capacidades e avisos curtos no ponto certo; evoluir a implementação de fill e segmentação quando prometidas. **Aceite:** uma ação apresenta o que realmente consegue fazer e suas alternativas; compatibilidade de blend/fill é validada com fixtures independentes. Fontes: `compositor.ts:281`, `AssistantPanel.tsx:30`, `QuickDock.tsx`, `ChromaKeyDialog.tsx`. [Opacidade e preenchimento na Adobe](https://helpx.adobe.com/photoshop/using/layer-opacity-blending.html).

### C18 — Completar preservação e cancelamento de operações longas — P1, código

A suíte já oferece recuperação por salvamento e bloqueio de licença, mas salvar/exportar/rodadas de IA do EdiFoto não integram um ciclo próprio com `desktopJobs`. Há janela para expiração enquanto uma operação assíncrona está em curso. Parar a IA aborta processo/request, mas uma ferramenta já entregue ao renderer, esperando confirmação, não recebe token de cancelamento; timeout também não cancela seu efeito tardio. Não foi executado um provedor real expirando no meio de um pedido.

**Correção:** run identificado, cancelamento propagado, checagem antes de commit e integração dos jobs com as políticas de preservação existentes. **Aceite:** expirar/cancelar durante save/export/IA preserva trabalho e saída anterior, não confirma sucesso inexistente nem aplica ferramenta antiga após Stop. Fontes: `main/index.ts`, `main/assistant.ts`, `main/aiBridge.ts`, `main/engines.ts`, `lib/files.ts`, `lib/aiTools.ts`, `packages/edi-desktop/src/jobs.ts`.

## Funcionalidades existentes que precisam de melhorias

Os itens abaixo ampliam utilidade/qualidade de recursos que já existem. Os sistemas ausentes completos ficam na seção seguinte.

| ID e prioridade | Funcionalidade | Melhoria proposta e resultado esperado |
| --- | --- | --- |
| M01 · P1 | Espaço de trabalho | Modos por tarefa: tratar foto, recortar, montar e desenhar; painel e ações relevantes à seleção. Manter controles avançados acessíveis e preferências persistidas. Usuário novo completa tarefas sem entender a pilha inteira. |
| M02 · P1 | Painel de camadas/propriedades | Reduzir a área sempre ocupada pelas seis prévias de mesclagem; apresentar propriedades e camada ativa sem alternância excessiva de abas. Preservar busca, filtros e prévias, tornando-os sob demanda. |
| M03 · P1 | Seleção manual | Feather, suavização, expandir/contrair, mover/transformar seleção, salvar/recarregar e overlay legível em qualquer imagem. Varinha com fonte atual/todas as camadas e contiguidade configurável. |
| M04 · P1 | Máscaras | Editor dedicado, densidade, feather, overlay, mostrar máscara isolada, copiar/combinar e refinar bordas sem substituir a máscara anterior inadvertidamente. Separar recorte de correção de spill de cor. |
| M05 · P1 | Pincel, carimbo e desfoque | Presets, espaçamento, estabilização, cursor/origem claros, carimbo alinhado e amostragem de camadas visíveis. Desfoque local com raio/intensidade próprios e proteção de bordas. Operações de retoque em camada separada. |
| M06 · P1 | Curvas, níveis e cor | Curva gráfica editável com pontos livres, interpolação suave, canais RGB, histograma, clipping e conta-gotas preto/cinza/branco. Tornar controles por canal acessíveis manualmente, além de via IA. |
| M07 · P1 | Ajuste automático | Prévia e intensidade numa ação; intenção por retrato/produto/paisagem, preservando pele e contraste intencional. Evitar adicionar repetidamente camadas neutras ou empilhar autoajuste inadvertidamente. |
| M08 · P2 | Texto | Edição direta no canvas, caixa com quebra automática, estilos por trecho, controles de parágrafo e aviso/substituição de fonte ausente. Conservar fontes e layout em salvar/reabrir/exportar. |
| M09 · P2 | Caneta e formas | Snapping, guias, alinhamento/distribuição, inserir ponto no segmento, fechamento previsível e feedback de alças. Melhorar precisão sem exigir digitação constante de coordenadas. |
| M10 · P1 | Corte e transformação | Horizonte/endireitar, proporções favoritas, dimensões precisas, ponto de ancoragem, gesto com confirmar/cancelar e opção de preservar pixels fora do canvas. Tratar gradientes/máscaras coerentemente. |
| M11 · P1 | Exportação | Prévia de compressão/tamanho, dimensões livres, presets, escolha de fundo e formato conforme transparência, exportar seleção/camada e política de metadados. Conservar configurações utilizadas. |
| M12 · P1 | Histórico e comparação | Antes/depois por original imutável ou checkpoint escolhido, comparação sincronizada e snapshots nomeados. O “Antes” atual mostra somente a camada inferior atual, com suas edições; não é um original preservado. |
| M13 · P1 | Experiência do assistente | Mostrar intenção, prévia e opções antes de alterações amplas; oferecer aceitar, refinar e desfazer, com progresso e custos quando aplicáveis. Chat simples por padrão e configuração técnica em área avançada. |
| M14 · P1 | Cobertura do MCP/IA | Expor capacidades existentes com contratos seguros: seleção, pincel/máscaras, chroma, retoque, merge, criar/salvar projeto. Há 25 ferramentas, mas paridade entre o que o usuário e o agente conseguem fazer ainda é parcial. |
| M15 · P1 | Desempenho interativo | Cache por região/resultado, composição incremental, trabalho pesado em workers e atualização de miniaturas proporcional à área. Pan/zoom já evita recompor tudo; preservar esse acerto. Medir com projetos reais copiados para fixtures. |
| M16 · P2 | Acesso por teclado, orientação e documentação | Navegação/foco de menus, nomes acessíveis de botões, atalhos pesquisáveis, escala de interface, onboarding por tarefa e comandos pnpm atuais no README. Remover orientação operacional antiga como `npm install` e caminhos `APPS/EDIFOTO`, mantendo históricos identificados. |

Fontes principais: `RightPanel.tsx`, `BlendSection.tsx`, `Properties.tsx`, `OptionsBar.tsx`, `LayersList.tsx`, `Viewport.tsx`, `lib/analyze.ts`, `lib/render.ts`, `lib/paint.ts`, `engine/text.ts`, `lib/aiTools.ts` e README. Para retoque não destrutivo, a referência Adobe já inclui amostragem de todas as camadas em camada separada. [Edição não destrutiva](https://helpx.adobe.com/photoshop/using/nondestructive-editing.html).

## Funcionalidades e sistemas que precisam ser implementados

Estas ausências foram verificadas no escopo do EdiFoto. A ordem interna depende do segmento e dos fundamentos; “P1” não significa que todas devam ser construídas simultaneamente.

| ID e prioridade | Sistema ausente | Escopo mínimo útil e critério de aceite |
| --- | --- | --- |
| N01 · P1 | Interoperabilidade PSD/PSB | Abrir e exportar camadas, máscaras, texto, grupos, blends e efeitos suportados; relatório de incompatibilidades e preview de referência. Nunca achatar silenciosamente. Corpus independente e comparação com renders do aplicativo de origem. |
| N02 · P1 | Formatos profissionais | TIFF de alta precisão; HEIF/HEIC de câmeras/celulares; PDF/SVG para inserção quando fizerem parte da montagem; export adequado aos formatos prometidos. Decodificação, licenças e empacotamento verificados no Windows. |
| N03 · P1 | Revelação RAW | DNG e formatos de câmera definidos por matriz: demosaic, WB, exposição, realces, perfis, lente e ruído, com receita separada do original. Reabrir e refazer parâmetros sem degradar a fonte. |
| N04 · P1 | Documento de 16/32 bits e HDR | Precisão no modelo, armazenamento, operações, máscaras, compositor e codecs; testes de gradiente/extremos. Targets intermediários RGBA16F existentes não tornam os bitmaps RGBA8 e o save/export de 8 bits um fluxo de 16/32 bits. |
| N05 · P1 | Gestão profissional de cor | Perfil ICC de origem/trabalho/saída, atribuir/converter, sRGB/Display P3/Adobe RGB conforme suporte real, soft proof e gamut; CMYK/Lab e impressão quando necessários. Conferir consistência entre arquivo, tela e saída. |
| N06 · P1 | Modelo escalável e recuperação durável | Composição/armazenamento por blocos, orçamento de RAM/VRAM, scratch, autosave, crash recovery, checksums e checkpoints. Abrir arquivo maior que uma textura sem reduzir o original. Recuperar após encerramento forçado sem sobrescrever a versão salva. |
| N07 · P1 | Grupos e composição hierárquica | Grupos aninhados, seleção múltipla, transformações/opacidade/máscaras de grupo, vínculo de camadas e operações em conjunto. Ordem e blends documentados, mesma aparência em exportação. |
| N08 · P1 | Clipping, canais e mesclagem avançada | Ajuste recortado à camada/grupo, canais alfa, máscaras de luminosidade/faixa de cor e equivalente a Blend If. Editar só o objeto pretendido, sem afetar os demais. |
| N09 · P1 | Objetos inteligentes e filtros editáveis | Fonte incorporada/vinculada, substituição/relink, transformação sem perda e pilha ordenável de filtros com máscara/opacidade. Salvar/reabrir e trocar a fonte preservam a receita. |
| N10 · P1 | Estilos de camada | Sombra, contorno, brilho, relevo e overlays, com controles editáveis, presets e escala. Texto/objetos permanecem editáveis; export tem a mesma aparência. |
| N11 · P1 | Seleção e segmentação semântica | Pessoas, cabelo, objetos, céu e fundo por modelo, local quando viável, com correção manual e resultado em máscara. Avaliar em corpus diverso, com modelo/licença/versão claros. |
| N12 · P1 | Healing, patch e remoção de objetos | Corrigir manchas/imperfeições e reconstruir área mantendo textura/luz; ferramenta rápida e amostragem explícita. Resultado em camada separada, comparação e undo. Carimbo/desfoque não substituem esse sistema. |
| N13 · P1 | Preenchimento e expansão generativos | Inpainting/outpainting com seleção, referência, variações e preservação do entorno. Resultado como camada/variante, sem alterar original; resolução, privacidade, latência e custo claros. |
| N14 · P1 | Transformação afim, perspectiva e deformação | Escalas X/Y, skew, perspectiva, warp e deformação localizada com malha. Renderização, hit testing, pincel, máscara, persistência e export compartilham a mesma transformação. |
| N15 · P1 | Nitidez, redução de ruído e restauração | Filtros clássicos e/ou modelos para ruído, sharpening, deblur e super-resolução. Preservar textura e identidade, comparar a 100% e não apresentar detalhe inventado como recuperado. |
| N16 · P2 | Pintura com tablet | Pressão, tilt, dinâmica de ponta, textura/dispersão, mistura de cores, rotação da tela e presets compartilháveis. Testar latência e traço em dispositivos reais, não apenas eventos sintéticos. |
| N17 · P2 | Múltiplos documentos e versões de entrega | Abas reais, copiar/mover camadas entre projetos, comparação sincronizada, artboards/variantes de formatos e export independente. Salvar/fechar um documento não altera outro. |
| N18 · P2 | Automação em lote | Receitas/ações graváveis, processamento de pasta, redimensionar/recortar/marcar/exportar e retomar fila. Prévia de amostra, cancelamento e política de conflitos sem sobrescrita silenciosa. |
| N19 · P2 | Biblioteca de recursos e presets | Pincéis, ajustes, máscaras, estilos, paletas e templates, com busca, favoritos, versionamento e recursos vinculados. Reuso entre projetos sem depender de caminhos pessoais. |
| N20 · P2 | Montagem inteligente | Harmonizar luz/cor/escala, estimar sombra e perspectiva, substituir fundo/céu e manter recorte fino. Usuário aprova componentes editáveis e refináveis, em vez de receber uma montagem achatada. |
| N21 · P1 | IA integrada ao contrato comercial da suíte | Para IA vendida pelo Edi: execução de servidor, reserva/confirmação/liberação de créditos com mesmo `runId`, idempotência, cancelamento e recuperação. Preservar BYOK/assinaturas externas como modalidades distintas; não cobrar de novo um uso pago diretamente pelo usuário. |
| N22 · P2 | Assistência visual orientada à intenção | Marcar uma região e pedir “só aqui”, comparar referência e imagem, propor alternativas e explicar limitações. Plano de operações verificável, contexto por documento e validação visual após agir. |
| N23 · P3 | Extensibilidade controlada | SDK/plugin de efeitos, importadores e comandos com permissões, isolamento, orçamento e versão compatível. MCP é uma integração útil, mas não constitui sozinho uma API de filtros/formatos. |
| N24 · P3 | Fluxos especializados de fotografia | Focus stacking, panorama, fusão de exposições/HDR e alinhamento automático, com correção e saída editável. Priorizar apenas após pesquisa de demanda dos públicos atendidos. |

A documentação Adobe confirma formatos profissionais e precisões superiores como parte do fluxo de trabalho, assim como prova de cor e objetos/filtros inteligentes. Esses sistemas sustentam a substituição profissional, mesmo que a interface do EdiFoto esconda sua complexidade até que sejam necessários. [Formatos e profundidades](https://helpx.adobe.com/photoshop/desktop/save-and-export/export-files-to-different-formats/photoshop-file-formats-overview.html), [especificação PSD/PSB](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/), [prova de cor](https://helpx.adobe.com/photoshop/using/proofing-colors.html), [Smart Filters](https://helpx.adobe.com/photoshop/desktop/effects-filters/smart-filters/apply-and-manage-smart-filters.html).

## Direção para ser mais simples, eficiente e inteligente

O usuário deve começar pela tarefa: “tirar o fundo”, “corrigir a foto”, “retirar este objeto”, “montar uma arte” ou “preparar para imprimir”. O editor oferece um caminho recomendado, mostra o resultado e permite refinamento. Camadas, máscaras e parâmetros continuam disponíveis para controle e retomada posterior.

| Tarefa | Caminho proposto | O que diferencia uma entrega completa |
| --- | --- | --- |
| Retirar fundo | Selecionar sujeito → prévia → refinar bordas → exportar transparente. | Funciona fora de chroma; preserva cabelo, máscara e fonte. |
| Melhorar retrato | Diagnosticar luz/cor → intensidade → regiões → comparação. | Respeita textura/pele e não mistura retoque com alteração de identidade. |
| Remover objeto | Marcar/indicar → reconstruir → escolher variação → aceitar. | Preenche coerentemente, é editável e não afeta o resto. |
| Criar montagem | Inserir imagem → recortar → encaixar → harmonizar luz/sombra. | Mantém fontes, transformações e máscaras separadas. |
| Entregar para web/impressão | Escolher destino → perfil/dimensões/formato → prévia → exportar. | Cor previsível, transparência correta e saída no caminho escolhido. |
| Editar série | Ajustar exemplar → salvar receita → aplicar amostra → processar lote. | Retomada, cancelamento e consistência, com redução real de tempo. |

A IA deve apoiar três níveis: **entender** imagem/seleção/intenção, **agir** por operações confiáveis e **verificar** o que mudou. O agente atual fornece parte do segundo nível e previews/análise básica; faltam sistemas essenciais dos outros dois. A melhor experiência combina processamento local rápido para tarefas determinísticas com modelos quando agregarem qualidade. Cada resultado precisa ser editável, reversível e atribuível à operação que o criou.

Não é necessário reproduzir a organização dos menus Adobe. É necessário preservar as capacidades e os resultados esperados nos fluxos escolhidos. Também não é necessário implementar vídeo, animação ou 3D neste primeiro caminho; a suíte já tem fronteiras de produto que devem ser respeitadas. Uma promessa de substituição universal exigiria uma matriz maior do que os fluxos fotográficos e gráficos listados aqui.

## Sequência de implementação recomendada

| Lote proposto | Escopo principal | Condição de saída |
| --- | --- | --- |
| 0 — Documento confiável | C01–C04, C09–C11, C14–C16, coordenação C18 e início de autosave. | Nenhuma perda silenciosa nos probes; saves e cancelamentos corretos; harness e fluxo nativo de arquivos automatizados. |
| 1 — Fidelidade e base técnica | C05–C08, C12, C17; transformações/máscaras; orçamento/tiles; desenho do formato para N04/N05/N06/N07/N09. | Editor/export/save/reopen equivalentes nas fixtures; nenhuma conversão destrutiva escondida. |
| 2 — Fluxo diário simples | C13; M01–M07, M10–M13, M16; N07/N08 e N11/N12 iniciais. | Recortar sujeito, ajustar e retocar com controle manual e comparação; usabilidade válida no tamanho mínimo. |
| 3 — Substituição profissional | N01–N05, N09/N10/N14/N15; tipografia e exportação profissional. | Projetos de referência abrem/editam/exportam com incompatibilidades explícitas e cor verificável. |
| 4 — Inteligência integrada | N13, N20–N22; M14 e isolamento transacional final. | Pedidos completos com prévia, custos quando aplicáveis, cancelamento, resultado editável e verificação. |
| 5 — Escala e especialização | N16–N19, N23/N24; desempenho e biblioteca. | Ganho de produtividade comprovado em lotes/projetos representativos; dispositivos e plugins homologados no escopo. |

Os sistemas de precisão, formato, transformações e composição precisam de desenho conjunto antes de multiplicar ferramentas. A proposta de lotes não autoriza atualização de dependências, release, deploy, alteração comercial ou execução automática de todos os itens. Não foram estimados prazos: faltam delimitação da compatibilidade PSD, corpus de aceite, seleção de modelos e medidas em hardware representativo.

## Como comprovar que o EdiFoto ficou melhor

Definir jornadas equivalentes e medir **tempo até resultado aceito**, quantidade de ações/decisões, taxa de sucesso sem ajuda, qualidade visual avaliada sem identificar a ferramenta, consumo máximo de RAM/VRAM, latência de pincel/transformação, custo de IA e sucesso de recuperação. A mesma fonte, resolução, tarefa e máquina devem ser usadas na comparação; não comparar preview reduzido com export original de outro editor.

Corpus proposto: retratos com cabelos/pele/iluminações variadas, produtos transparentes/reflexivos, paisagens, fotos de celular, RAW, PSDs com camadas/efeitos/fontes, transparência e impressão. Projetos de teste pequenos, 24–48 MP e pilhas de 10/50/100 camadas servem como categorias iniciais, a ajustar ao hardware e público. São metas de teste, não capacidades já homologadas.

Gates mínimos: roundtrip e migração, bytes truncados e bitmaps ausentes, falha de gravação, concorrência, cancelar cada diálogo, encerrar/recuperar, GPU/contexto perdido, licença expirando em job, máscara transformada, merge visual, fonte ausente, erros/cancelamento de IA e desempenho prolongado. Projetos reais só entram como cópias autorizadas em ambiente isolado.

## Próximo passo

Transformar primeiro os itens P0 e os defeitos de fidelidade reproduzidos em um plano de implementação com fixtures permanentes. Em paralelo ao planejamento, definir o público inicial e a matriz de PSD/RAW/cor que sustenta a primeira promessa de substituição. Este relatório encerra a análise solicitada; código funcional, dependências e configuração de produção permanecem sem alterações desta tarefa.
