# Incremento 5.16 — trim paths

Estado: incremento revisado localmente no perfil limitado documentado, sem concluir os demais requisitos gráficos, lotes 5/6 ou full review final.

Revisão posterior no 5.17 encontrou um writer legado de restrição de caminho que ainda tentava rebaixar Rig v3 ao salvar. O parser bloqueava a edição, sem publicar perda. A correção monotônica e o teste combinado de path constraint/morph/solo/trim estão no [review 5.17](review-lote-5-duplicacao-rig.md). As afirmações abaixo sobre editores v2 correspondem aos caminhos cobertos no 5.16, não a uma certificação universal daquele painel. A recusa de duplicação parcial descrita neste marco também é histórica: o 5.17 implementa cópia de deformadores locais/subrigs fechados.

## Implementação e achados atuais

A revisão adicionou um limite global de geometria transitória no coordenador da cena: planos de todos os escopos, inclusive os que não avançam, são verificados antes de qualquer commit. Inputs/bindings e reset também não podem ultrapassar 100000 vértices somando componentes independentes. Não se repõe o teto por controlador ou instância. O orçamento de trabalho continua compartilhado. A autoria também recusa overrides de componentes que introduzam arcos nativos num master com trim, antes de publicar a transação; não depender somente da recusa tardia do exportador.

Contrato implementado Rig v3/projeto v21/blueprint v10, playback permanece v3. `trims` tipado tem IDs/owners únicos, orçamento agregado de deformadores, canais start/end/offset e bindings existentes; rigs antigos recusam inclusive trims vazio. Projetos até v20 migram pelo fluxo de backup existente; blueprint anterior a v10 recusa Rig v3. Arcos nativos em fontes de trim são recusados, exigindo conversão Bézier explícita com consentimento (não basta existir geometria canônica aproximada). Duplicação de prancheta remapeia owners e mantém animações compartilhadas; duplicação parcial de objetos/grupos com trim recusa antes de publicar enquanto não existir cópia integral de rig/canais/bindings.

Extração mantém linhas como linhas e controles cúbicos como curvas. Intervalos completos retornam identidade, vazios retornam geometria transitória vazia. Wrap de contorno fechado reúne a costura uma vez, sem caps extras; aberto fica em dois trechos desconectados. A medição/inversão usa tolerância explícita, memória/trabalho compartilhados e saída limitada; o teste de linha cúbica com velocidade não linear não assume t linear. A revisão corrigiu o reconhecimento de endpoints usando limites globais de segmentos, sem depender da igualdade de uma subtração de comprimentos arredondados.

O primeiro E2E integrado revelou um defeito real: os players desenhavam o vazio/parcial, mas não restauravam d quando o frame voltava à identidade completa. Corrigidos os dois adapters SVG/DOM na causa: preservam o d original do host e o restauram quando não há override geométrico. Não se converte identidade em uma reserialização aproximada. Clip/mask já tratam geometria transitória vazia com definição vazia/opacity 0 e restauram silhueta/alpha; geometria vazia persistente continua inválida.

UI React usa o padrão existente (skill React/interface-design), percentuais separados de graus, tolerância/mode explícitos, locks e transação compartilhada. Chaves de offset preservam graus e rigs v3 não sofrem downgrade nos editores v2 anteriores. Lottie e SVG/SMIL animado recusam trim explicitamente, pois a topologia pode variar; HTML e React usam o avaliador compartilhado.

Tipos app/núcleo/tooling, 120 testes do núcleo, 197 testes do app, 43 de tooling, sintaxe/build, 65 E2E seriais e Next produção passaram. O corpus inclui autoria/histórico/reabertura, vazio/completo em três players, máscaras com pixels, componentes com clocks/bindings independentes e ZIP React independente. Núcleo também prova skin antes do trim, blends/interrupção imediata/máscara de camada, excesso agregado de vértices e validação coordenada antes de commits/inputs/reset. Backup exato de v19 e v20 passou. Electron selecionado concluiu com exit 0; detalhes no fechamento abaixo. Contagens não equivalem ao full review final dos lotes.

## Contrato inicial de referência (histórico)

Recorte geométrico de caminhos com início/fim/offset animáveis, usando o avaliador e orçamento compartilhados. Operação de autoria persistente/reversível; não modificar o d original em cada quadro nem simular trim apenas com uma máscara estática. Caminhos Bézier devem continuar curvas, sem achatamento silencioso em milhares de segmentos. Comprimento pode ser aproximado com tolerância explícita; a subdivisão dos segmentos mantém os controles de Bézier.

O desenho deve contemplar contornos abertos/fechados, múltiplos subpaths, intervalos vazios/completos e wrap de offset negativo/positivo, seguindo perfil publicado. [Lottie Trim Path](https://lottie.github.io/lottie-spec/latest/specs/shapes/#trim-path) é referência de semântica para início/fim/offset e modos; não implica que o emissor Lottie atual já consiga representar topologia variável. Não descartar trim em uma exportação que não o suporte: recusar ou exigir uma conversão realmente implementada/testada.

Ordem proposta: deformação vetorial (morph/skin) antes do recorte visual; restrições espaciais continuam usando o seu contrato de referência. Recortes/máscaras dependentes usam a geometria efetivamente avaliada. O arquivo mantém âncoras/controles de autoria; a geometria transitória pode variar de topologia, inclusive ficar vazia. Planejar essa distinção explicitamente em efeitos, render, semântica e exportações.

## Questões levantadas na investigação inicial

- `arcTable` atual serve follow-path: guarda posição/comprimento, sem parâmetros de cada segmento. Adicionar t por interpolação simples não é suficiente: uma cúbica reta com controles coincidentes tem parametrização não linear. Preservar seu locus não equivale a preservar distância em função de t.
- Medição/inversão de arclength devem ter erro e trabalho limitados, inclusive backtracking, cusp/loop, curva degenerada e extremos. Considerar brackets por polígono de controle + subdivisão e busca limitada no segmento; reutilizar operadores geométricos do núcleo, sem outro parser/evaluator.
- Necessita desenho de contrato versionado (candidato Rig v3/projeto v21/blueprint v10), canais/bindings tipados e guardas contra capability em cabeçalhos antigos. Não liberar campos novos silenciosamente, nem alterar versões sem todas as migrações/backups e compatibilidade correspondente.
- Remapeamento de IDs/duplicação/componentes, locks, exclusão de dependências, readonly/MCP, edição em lote e timeline devem usar a transação compartilhada. Não forçar downgrade de rigs v3 nos editores existentes.
- Examinar como geometria vazia/variável atravessa máscaras, comparação espacial/visual e players; não relaxar schema de geometria de autoria só para aceitar um resultado transitório.
- UI preserva o editor existente, com início/fim/offset/tolerância explícitos e controles reais. Não mostrar controles que não afetem o runtime/exportação.

## Gates previstos

Medição/subdivisão adversarial e prova de erro, ida/volta/offset, estados/blends/bindings e restauração determinística; histórico e atomicidade; formatos/migração fiel; desenho e efeitos em dois players isolados, HTML/React/Next, UI real e Electron; orçamento/cancelamento; validação de exportações incompatíveis; check/tipos/auditoria e documentação antes de homologar.

## Fechamento do perfil 5.16

Gates acima coletados. Electron completo passou na repetição após corrigir a expectativa histórica de versão 20 em `native-svg-effect-import.mts` para conferir a versão canônica do projeto original. A primeira execução já tinha passado o runtime trim, mas não deve ser chamada de jornada completa. A repetição passou integridade física/abertura visível, licença/expiração/IPC, Worker/Yoga, assets/fontes/áudio/semântica/importações, arquivos/Save/Open/Save As cancelado/recuperação, ZIP React Save/Cancel e os três perfis Lottie anteriores. O novo teste nativo compara comprimento real da cúbica não linear, vazio/completo e retorno de tempo no módulo embarcado sob file/CSP, preservando o draft; captura `.cache/edi-native-results/edisvg-trim.png` inspecionada. Não houve instalação/publicação/deploy/cobrança.

Check em 443 arquivos sem erros, com 15 warnings/nove infos legados ainda visíveis. Auditoria dev sem alertas conhecidos; produção falha com dois alertas altos de image-size 1.2.1 via pptxgenjs do EdiPDF concorrente, sem mudança/override/exceção. Nenhuma dependência nova no 5.16. O aviso de diretiva/module type e a fragilidade histórica do launcher comum continuam para full review, não declarados resolvidos porque uma rodada passou.

Review de contrato, orçamento, integridade, precisão, ownership e consumidor concluído neste perfil: sem parser/clock/rig paralelo, achatamento da geometria salva, conversão automática de arcos, perda silenciosa de trim, cast/supressão/delay para ocultar falhas. As recusas Lottie/SVG-SMIL e duplicação parcial são limitações explícitas, não capacidades concluídas. Próxima frente 5.17: duplicação de deformadores/canais/bindings. Demais gráficos/tipografia/raster/formatos/semântica/scripting, lote 6 e full review seguem obrigatórios.

## Histórico: primeiro gate geométrico

Módulos e testes colocados em `packages/edi-motion/src/geometry/`, conforme a skill project-structure: operações de Bézier e medição junto dos consumidores do domínio, sem utilitário genérico ou outro parser. Naquela etapa, ainda não estavam integrados ao formato/editor/runtime; a integração atual está registrada acima. `splitCubic`/`sliceCubic` mantêm controles de De Casteljau e entradas intactas; endpoints 0/1 são cópias exatas para evitar cancelamento numérico em coordenadas extremas.

`measureCubic` mede brackets por corda/polígono de controle e translada coordenadas antes de subdividir. A primeira estratégia distribuía tolerância por metades em cada ramo e recusou cedo uma curva collinear que vai e volta, mesmo com trabalho disponível. Foi corrigida na causa: fila de maior incerteza global, refinamento adaptativo, residual positivo recomputado antes de aceitar e erro final verificado. Não foi aumentado o limite de profundidade nem afrouxada a tolerância. Limites de 20 níveis/16.384 folhas e dois milhões de operações, incluindo fila/ordenação, recusam excesso sem saída parcial.

Inversão usa comprimento do trecho cúbico verdadeiro, não interpolação linear de t na corda. Cúbica reta com alças coincidentes tem velocidade não linear; a prova de 25% de comprimento encontra x=25 sem assumir t=0.25. Brackets foram comparados com comprimento analítico de backtracking e quadratura numérica independente de uma curva, além de translação em coordenadas grandes, memória/trabalho e parâmetros inválidos. Tipos e 105 testes do núcleo passaram após essa correção (99 anteriores + seis específicos). Esse primeiro gate não homologava trim paths: extração, contrato, UI e runtime estavam pendentes naquela etapa; foram implementados e verificados depois, conforme os registros atuais acima.
