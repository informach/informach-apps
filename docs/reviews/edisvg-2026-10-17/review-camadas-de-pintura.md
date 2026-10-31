# EdiSVG — camadas de pintura (projeto v25, blueprint v14)

Data: 29/10/2026. Pedido do titular: preenchimentos e contornos em camadas, como no Rive. Branch `feat/edisvg-paint-layers`, depois do passo sem mudança de formato (`51f0de6b`: linhas de pintura no padrão do Rive e trim em Efeitos de caminho).

## Decisão de modelo

O preenchimento e o contorno do próprio objeto (`attrs.fill`/`attrs.stroke` e `gradients`) continuam sendo as camadas de base. As extras ficam numa lista nova e opcional, `paintLayers`: até 16 itens `{id, kind: fill|stroke, color, paint?, opacity, visible, width?, linecap?, linejoin?}`. Espessura, ponta e junção só valem em contorno. Projetos sem o campo desenham exatamente como antes e não precisam de migração.

Cada camada visível vira uma cópia da geometria da forma (mesmo elemento, mesmos atributos de geometria, `transform` local e `fill-rule`, com a pintura da camada). A cópia entra logo depois da forma, no wrapper do objeto, marcada com `data-edi-paint-layer`. Foi escolhida essa posição porque todos os consumidores supõem que a forma é o primeiro filho do wrapper (player, runtime de clips, layout, editor, ordem de desenho). Com as cópias depois dela, nenhum desses contratos muda. A consequência é que as camadas extras ficam sempre por cima da pintura base. Contorno por baixo do preenchimento continua possível: base só com contorno e uma camada de preenchimento por cima.

`<use>` foi descartado: um clone herda os atributos de pintura da forma referenciada, e não há como trocá-los por fora.

## Integração

- Núcleo (`edi-motion`): `graphics/paintLayers.ts` (schema, atributos, geometria, `paintLayerCopies`, `writeShapePath`). O descritor visual desenha as cópias e conta uma célula por camada visível. O pool de gradientes/padrões inclui os das camadas. Blueprint v14: campo em `content[]`, gate "Camadas de pintura requerem blueprint v14", recusa fora de formas/caminhos e com filtro. O player confere cópias e atributos na marcação do host e escreve a geometria nelas. O mesmo vale para o runtime de clips e para a medição do layout, que reseta as cópias com a forma. A validação de definições inclui os gradientes das camadas. Fonte de máscara pintada com camadas é recusada, como já acontecia com filtro.
- App: comando `scene paint-layers` (lista ou `null`), validação da cena (tags, filtro, orçamento de atributos e células, pool), custo de componente, gate "Camadas de pintura requerem projeto v25", emissão no blueprint, orientação do assistente atualizada para v25/v14.
- Editor: prévia de pose (Animar), linha de base do joystick, papel vegetal, prévia de trim no Design e edição de vértices passam por `writeShapePath`.
- SVG animado: cada cópia recebe o próprio `<animate attributeName="d">` (o da forma, o caminho inteiro ou o do trim da camada; ver abaixo).
- Lottie: recusa camadas visíveis com o código `paint-layers`, sem descartá-las.
- Painel: o **+** cria a pintura base que falta ou acrescenta uma camada extra. As linhas aparecem na ordem do desenho, com ajustes (Opções/Efeitos), amostra, hexadecimal, opacidade, olho (flag `visible`) e −, mais espessura nos contornos.

## Trim por linha (29/10/2026)

O titular testou com um braço de personagem: no Rive, um único caminho com três contornos, cada um com o próprio trim, desenha mão, braço e ombro. Na primeira versão das camadas, o trim recortava a forma e todas as cópias iam junto. Agora o efeito de caminho é de cada linha:

- `rig.trims[]` aceita `layerId` (id de uma camada do mesmo caminho). É um trim por forma e um por camada; o projeto v25 e o blueprint v14 conferem que a camada existe. Remover uma camada com trim é recusado, a não ser que o trim saia na mesma transação, e o painel faz isso.
- Todos os trims do objeto medem o mesmo caminho deformado e sem recorte, em qualquer ordem da lista. O de camada grava `objectId#layerId`. O da forma grava a forma e, em `objectId#`, o caminho inteiro, que as cópias sem trim próprio continuam mostrando (como no Rive). Trim completo não reescreve nada.
- Player interativo, runtime de clips, papel vegetal, prévia do Animar e prévia do Design escrevem cada cópia com `writeShapePath(shape, d, paintLayerPaths(geometry, id))`. O SVG animado amostra um `d` discreto por cópia com trim e o caminho inteiro para as demais, e o quadro estático de movimento reduzido aplica o mesmo.
- A Lottie ignora trims de camada no cálculo dos caminhos recortados da forma; as camadas visíveis já eram recusadas.
- Painel: o ícone de ajustes de cada linha abre Opções (ponta e junção do contorno) e Efeitos (trim). Os dois lados da pintura base dividem um trim, porque são o mesmo elemento SVG, e o painel avisa isso. A seção separada "Efeitos de caminho" saiu do inspetor.

## Evidências

- `edi-motion`: 5 testes novos (`graphics/paintLayers.test.ts`: schema, atributos, geometria sem pintura, cópias no wrapper, recusa em máscara pintada, `writeShapePath`); 188 no total.
- App: 5 testes novos (`src/shared/paintLayers.test.ts`: v25 e remoção, recusas de texto, campos de contorno em preenchimento, ids repetidos e filtro; marcação com ordem, camada oculta e gradiente em pool; blueprint v14 e Lottie; máscara pintada); 297 no total.
- E2E (`tests/e2e/paint-layers.test.ts`): trim animado com uma camada de contorno. O `d` da cópia é igual ao da forma no player a cada quadro, e o SVG animado, pausado em cada quadro, tem os mesmos pixels do player (tolerância 2, zero diferenças), com a camada visível. Painel: adicionar, editar hex e opacidade, base que falta primeiro, espessura, ocultar (a cópia some do canvas), remover e desfazer.
- Trim por linha: teste `edi-motion` (trim de camada antes do da forma, cópia sem trim inteira, trim completo sem reescrita, unicidade por camada); teste do app (validação de camada ausente, remoção recusada sem tirar o trim, blueprint carrega `layerId` e recusa camada ausente); E2E com uma forma de trim animado, uma cópia sem trim e outra com trim próprio: nos quadros 2, 5 e 10 a forma desenha, a cópia sem trim fica inteira e a outra fica no último quinto, e o SVG animado tem os mesmos pixels do player. E2E do painel: ponta e junção, trim da camada só na cópia, trim da forma separado, remover a camada leva o trim e desfazer devolve os dois.
- SVG estático e exportações raster usam o mesmo descritor do canvas e do player; não ganharam teste dedicado nesta etapa.

## Limites

Camadas não são animáveis nem ligáveis a dados: animações e links de cor seguem no preenchimento/contorno base. O painel não reordena camadas nem edita gradiente de camada (o documento e o assistente aceitam). Não há camadas em texto e grupos, nem com filtro ou em fonte de máscara pintada. Estilos de aparência e overrides de componente não carregam camadas. A Lottie recusa; o suporte nativo (vários `fl`/`st` no mesmo grupo, com as regras de contorno homologadas e comparação com o `lottie-web`) fica como próximo incremento.
