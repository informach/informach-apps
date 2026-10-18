# Review incremental 5.6 — recortes e máscaras de silhueta alpha

18/10/2026. Incremento do lote 5 revisado no perfil abaixo; não encerra lote 5, lote 6 ou full review final.

## Contrato

Projeto v17 (aceita v1–v16 pelo migrador/backup existente), blueprint interativo v5 (aceita v1–v4) e playback espacial v3. `effects:{clip?:{sourceId,rule},mask?:{sourceId,rule,opacity}}` referencia outro caminho vetorial não vazio da mesma prancheta/viewport, sem efeito próprio. Regras `nonzero`/`evenodd`; intensidade alpha 0–1. A fonte pode ficar oculta; a aplicação não altera sua visibilidade silenciosamente. Máscara usa silhueta de preenchimento e opacidade TRS da própria fonte, independentemente de pintura, visibilidade e opacidade dos pais. Não há alegação de máscara de luminância, raster ou pintura composta.

Referências são remapeadas em duplicação de subárvore, seleção de irmãos, prancheta e expansão de componentes. Exclusão de fonte em uso é recusada até retirar dependências explicitamente. Desagrupar grupo com efeito, atravessar grupos recortados em reparenting e booleanas de operandos recortados são recusados para evitar perda de composição. Comandos UI/MCP passam pela mesma transação/histórico/locks; efeitos locais aparecem na inspeção do objeto.

Até 256 referências no projeto/cena expandida; dois elementos adicionais por efeito entram no orçamento de 2000 células. Avaliação pura usa matrizes de basis/TRS/attrs, prefixes do layout e geometria resultante de morph/skin no mesmo frame, com orçamento compartilhado de dois milhões de operações. Caminhos e alças delimitam uma região conservadora da máscara pelo casco convexo. Alvo singular tem efeito vazio e recupera sem tentar inverter matriz inválida.

Cada player recebe definições mutáveis com IDs próprios; as definições autorais imutáveis são verificadas contra o conteúdo tipado antes da posse. Transformações acima do viewport comum são canceladas explicitamente, evitando resíduos numéricos na identidade ao extrair escopos independentes. Limpeza restaura referências e remove apenas definições próprias. Não há leitura de CTM por frame, nova RAF, URL livre ou código de projeto. Canvas, Testar, HTML interativo e React geram os mesmos descritores.

## Review e gates

- 146 testes do editor e 73 do núcleo passaram após integração, incluindo idempotência do playback v3 sem rigs, referências, duplicações, locks, recusa atômica, matrizes/layout, geometria deformada, escala zero e limites/ciclos de hierarquia independentemente da ordem do mapa. Caminhos vazios não usados como fonte continuam válidos; não são tratados como uma geometria de rig/máscara não vazia.
- Jornadas focadas de pixels e autoria passaram: máscara alpha com valor esperado 64/255, recorte móvel, dois players isolados, dois componentes com clocks independentes, reset/descarte e recusa de definição alterada antes da posse. Painel compilado comprovou aplicar/undo/redo/recuperação e posição do recorte no último frame.
- ZIP React independente passou com PNG/fontes/áudio/nine-slice/gradientes e novos efeitos, tipos e runtime efetivo sem imports de workspace/rede. Captura `.cache/edisvg-review/vector-effects-authoring.png` inspecionada.
- Tipos editor/núcleo/tooling, build e check focado passaram. Rodada completa de 41 E2E, Next produção/SSR/hidratação e jornada Electron ampliada aprovou pixels de recorte/máscara sob file/CSP, arquivos, integridade e licença. Após o refinamento de gestos, a repetição passou com 42 E2E, Next e jornada Electron completa; o caso adicional de caminho vazio também passou nos testes do compilador/editor. Auditoria de produção sem vulnerabilidades conhecidas. Não houve instalação/publicação comercial.

A prévia de autoria acompanha arrastes de objeto/rotação/escala e vértices antes do commit. Captura matrizes locais transitórias em um grafo descartável, sem decomposição TRS, CTM por frame ou escrita no documento. Escape/cancelamento restaura o efeito e não publica histórico. Jornada real de mouse/vértices confirmou movimento intermediário e rollback com os bytes do checkpoint preservados.

Achados corrigidos: remapeamento entre irmãos duplicados; campos `rigScopes:[]` omitidos pelo parser v3 impedindo revalidação; diferença numérica de identidade ao extrair viewport de componente; ciclo/depth de hierarquia escondido por cache/fronteira SVG; composição perdida ao desagrupar/reparent/booleanas; teste de pixel React presumindo um único defs, agora coleta o conjunto real sem mudar o pixel esperado.

## Continuidade

Importação SVG de defs clip/mask, máscaras raster/luminância/paints compostos e SVG animado amostrado permanecem pendentes. Exportador de clips recusa o perfil mesmo com consentimento genérico, em vez de gerar animação incorreta. Múltiplas pinturas, efeitos/filtros, symbols/patterns, tipografia avançada, rastermesh, joystick/timeline, demais exportações, semântica/scripting e lote 6 continuam obrigatórios. React Native e equivalência/superioridade ao Rive não foram certificados.

Referência primária consultada: [CSS Masking — clipping, máscaras e composição](https://www.w3.org/TR/css-masking-1/). APIs Zod conferidas na documentação oficial/Context7 e na versão instalada; interfaces novas preservam tokens/densidade do inspetor existente.
