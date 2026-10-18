# Review intermediário — composição

18/10/2026, `feat/edisvg-evolution`, remoto conferido em `e15de57`. Continuação expressamente autorizada de todos os lotes, com reviews intermediários e full review final; este registro não encerra a execução nem certifica os lotes seguintes.

## Incremento verificado

- Seleção múltipla por Shift/Ctrl/Meta nas camadas e no canvas; seleção permanece fora do documento/histórico.
- Agrupar/desagrupar e escolher grupo pai pela interface e pela mesma transação MCP. Filhos mantêm IDs e trilhas. Agrupamento exige irmãos contíguos para não alterar silenciosamente a ordem de pintura.
- Álgebra afim DOM-free no núcleo, com parser SVG compartilhado. Reorganização conserva uma matriz `basis` exterior ao TRS animável: não reamostra curvas nem destrói geometria para conservar a pose.
- O formato passa temporariamente a v4 para a capacidade `basis`; v1/v2/v3 continuam migráveis, com backup original no primeiro salvamento. A evolução de artboards será documentada junto ao próximo formato, não como campo ignorado por leitores antigos.

## Achados corrigidos antes de prosseguir

1. Retirar apenas o wrapper do grupo perderia transformações estáticas e a origem das trilhas. A matriz anterior às transformações animáveis preserva o sistema de coordenadas em todos os quadros testados.
2. Copiar apenas transformações perderia herança de pintura/fontes. Reparenting congela os valores herdados, inclusive `inherit`, `initial` e `unset`; tamanhos de fonte relativos são recusados quando a mudança de contexto impedir preservação exata.
3. Transparência composta de grupo não equivale a opacidade individual dos filhos. A operação incompatível é recusada antes do commit, preservando o documento.
4. Atravessar um ancestral animado exigiria representar dependência temporal ou retargeting sem perdas; não se finge fidelidade com uma matriz capturada no quadro atual. A operação é recusada explicitamente, assim como ciclos, locks, espaços singulares e grupos de destino ocultos.
5. O parser de transformações da importação e o de composição não podem divergir. A validação passou a usar a mesma implementação do núcleo.

## Evidências

87 testes unitários do editor, 8 do núcleo, typecheck dos dois workspaces e build passaram. Os 3 E2E passaram em Edge isolado, incluindo seleção múltipla, agrupamento, rotação, desagrupamento com limites visuais iguais, undo/redo e recarga de `basis`. Não é homologação de instalador, RN ou superioridade frente ao Rive.

Lote 2 ainda aberto: manipulação múltipla/marquee/alças/pivô, timeline múltipla/zoom/onion skin, artboards/componentes e ampliação vetorial/importação. As restrições explícitas acima não são contabilizadas como suporte irrestrito a reparenting animado.
