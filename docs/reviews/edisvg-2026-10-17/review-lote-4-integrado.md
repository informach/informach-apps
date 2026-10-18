# Review do lote 4 — rig e deformação no perfil vetorial

18/10/2026, branch `feat/edisvg-evolution`, base `88c1163`. Revisão intermediária entre os lotes, não full review da evolução. Projeto v14/Rig v2/lógica v2 para bindings de parâmetros. Nenhum commit, push, deploy, release ou instalação de produto executados.

## Resultado e cobertura

O [incremento 4.1](review-lote-4-rig.md) entrega autoria de ossos, alvos, vínculo rígido, FK, IK analítico/CCD, limites, distância/cópia e prioridade. O [incremento 4.2](review-lote-4-canais-deformacao.md) acrescenta canais tipados, caminho, morph e solo. Esta rodada integra:

- Skin vetorial por matrizes de referência/inverse-bind e LBS, até quatro influências por âncora, carregando as alças anexas. Captura real em Design, pesos iniciais por distância aos segmentos, edição numérica explícita e soma 100% validada. O controle de Malha abre autoria funcional, com polígono de controle/vértices selecionáveis e alternativa por teclado; nenhum helper integra o projeto/export.
- Referências/locks, remapeamento de componentes/artboards e topologia de skins. Inserir/excluir vértices requer atualizar pesos ou remover/refazer o vínculo; não descartar pesos silenciosamente. Morph mantém correspondência de contornos/alças. Malha **raster triangulada** continua explicitamente no catálogo/render do lote 5, não confundida com esta deformação vetorial.
- Bindings numéricos para força, progresso, peso e solo, editáveis no workbench. Lógica v2 distingue destinos de parâmetros dos objetos SVG. Prioridade final após camadas, conversão reversa somente contínua/invertível. Inputs locais de componentes continuam independentes e podem sobrescrever valores iniciais sem alterar a origem.
- Um frame completo fornece TRS, geometria, visibilidade e diagnóstico. HTML/interativo/SVG amostrado e rig estático conservam o perfil suportado. O player de timeline prepara a solução antes de publicar busca/troca de clip/avanço. Movimento reduzido mostra a referência sem apagar o relógio da sessão.
- Budgets de geometria, controles, deformadores, canais e chaves contabilizados no projeto, na expansão e no runtime interativo. Limites agregados: 2000 objetos, 1000 ossos, 256 restrições/deformadores, 100 mil vértices/controles/chaves e 12 mil canais, conforme cada categoria. Pré-validação ocorre antes de clones/expansões potencialmente grandes.
- Layout mede geometria/poses de referência (texto dinâmico continua a provocar reflow), evitando realimentar fluxo com uma pose deformada. Viewport zero suspende a solução espacial, não a lógica, e restauração recalcula o rig.

## Achados revisados/corrigidos

Falhas não podem publicar relógios de player antes de uma solução válida; retorno de solo restaura `display` autoral; redução de movimento também abrange geometria/expressões; registro agregado de eventos tem rollback; reordenação de restrições respeita locks; foco de edição de chave segue o quadro movido; override `d` de componente atualiza a geometria usada na validação de rig, recusando topologia incompatível **antes** da publicação. Camada aditiva com solo discreto é recusada antecipadamente; peso zero fica inativo. O harness nativo carrega o grafo TypeScript de fixtures pela API escopada do tsx, e cada área é checada no seu próprio tsconfig, sem supressão ou enfraquecimento dos tipos globais.

## Evidências

- 53 testes do núcleo; rodada conjunta de **26 E2E** passou, mais consumidor React/Next 16.4.2 com build de produção/SSR/hidratação.
- Rodada integral ampliada de **133 testes do editor** passou, incluindo a regressão de componente/override.
- Sintaxe, tipos do editor/núcleo e build passaram. Tipos do tooling passaram após separar corretamente o driver nativo da configuração de tipos do orchestrator.
- Electron: ASAR/EXE/receipt adulterados recusados, GUI/gestor, Worker sob CSP, Yoga/WASM local, **rig/canais/IK/skin/morph/caminho/solo no módulo realmente distribuído**, Save/Open/Cancel/recovery/ZIP e expiração/negação IPC passaram. Chaves/perfis efêmeros; nenhum instalador instalado/publicado. Screenshot `.cache/edi-native-results/edisvg-rig-runtime.png` inspecionado visualmente, não versionado como evidência portátil.
- Testes adicionais de movimento reduzido e restauração de geometria passaram em interativo/HTML; fonte, dados e relógio preservados. Referência independente SVG confirmou morph, visibilidade discreta e skin nos quadros amostrados.
- Auditoria de dependências de produção: nenhuma vulnerabilidade conhecida encontrada nesta rodada. Check focado do EdiSVG/núcleo sem erros; warnings legados permanecem explícitos. Check **global** não aprovado: alterações concorrentes de EdiFoto/EdiPDF apresentaram formatação/imports/a11y/hooks ainda em evolução. Não modificar essas frentes para fabricar aprovação.

## Limites e continuidade

Não é equivalência integral com Rive. IK tem o perfil de escala uniforme positiva/juntas contíguas documentado; singularidades e geometrias incompatíveis geram erro claro. Caminho segue geometria estática/morph; caminho já skinned no pós-rig é recusado para evitar ciclo implícito. Solo não suporta composição aditiva discreta; alças usam o peso da âncora neste perfil. Chaves de rig são editadas no painel Rig, separado das operações em lote TRS da timeline. Desempenho comparativo ainda precisa das cenas/medidas do lote 6.

Próximo: lote 5, incluindo raster/triangulação, assets e refs tipadas, fontes/áudio, aparência/SVG/texto avançados pendentes de M03/M04/M05, nine-slice visual, formatos/semântica/scripting/render. Joystick bidimensional de autoria (I06) e consolidação dos canais de rig na timeline também devem ser integrados nesta continuidade; o listener de ponteiro existente não é declarado como joystick pronto. Depois lote 6 com React Native, bibliotecas/colaboração/acervo e full review final. Homologação RN/dispositivo e compatibilidade `.riv` não realizadas. Nenhuma capacidade ausente é tratada como pronta por existir um schema/helper.

Referências técnicas: [skinning LBS — curso da CMU](https://graphics.cs.cmu.edu/courses/15-466-f17/notes/skinning.html), [perfil raster de meshes do Rive](https://rive.app/docs/editor/manipulating-shapes/meshes), [API escopada tsImport](https://github.com/privatenumber/tsx/blob/master/docs/dev-api/ts-import.md). O uso de LBS não elimina suas limitações nem prova superioridade sobre outro produto.
