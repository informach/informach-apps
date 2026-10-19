# Incremento 5.22 — limites reais de geometria e gradientes relativos

Estado: implementado e revisado localmente em 18/10/2026. Perfil limitado abaixo, sem concluir o lote 5, lote 6 ou full review geral. Evidências próprias deste incremento, não inferidas do anterior.

## Lacuna e contrato proposto

O perfil 5.21 aceita preenchimento userSpaceOnUse, mas recusa objectBoundingBox. Esse modo precisa dos limites da geometria no instante amostrado, sem incluir stroke ou alças que não pertencem à curva. Usar o polígono de controle ou o tamanho inicial alteraria gradientes sob morph/skin.

Acrescentar cálculo puro de bounds no núcleo de geometria, com extremos analíticos de cúbicas, contornos abertos/fechados e orçamento compartilhado. Testes devem separar curva e hull, incluir raízes repetidas/quase lineares, múltiplos contornos, extremos numéricos, limites de trabalho e preservação da entrada. Nenhum DOM/getBBox no Worker ou no núcleo.

Resolver primeiro gradiente linear relativo: matriz efetiva bbox × gradientTransform, conservando o campo escalar já implementado. Pintura deve ser reavaliada pela geometria deformada do mesmo avaliador em cada amostra, incluindo inspeção antes de exportar. Bounds degenerados não podem virar uma pintura inventada ou apagar stroke sólido. Gradientes radiais elípticos, strokes em gradiente, repeat/reflect e outras capacidades sem prova continuam recusados. Não atualizar dependências nem formatos para armazenar artefatos calculados.

O writer continua com 8 MB, profundidade 128 e os limites de autoria/avaliação vigentes. Novos canais de pintura devem entrar no custo/registro de bytes; casos incompatíveis ou excessivos recusam sem saída parcial e sem mutar o projeto. Consentimentos de amostragem, precisão do consumidor e perda de lógica continuam separados e inicialmente falsos.

## Critérios de review e homologação

Provar bounds contra SVG real e pintura contra lottie-web instalado, com formas não quadradas, skew/reflexão, herança, alpha, morph e busca reversa; testar degeneração/restauração e bounds tardios. UI/MCP/Worker devem compartilhar o relatório. Repetir unidades/tipos/build, corpus anterior, regressão completa, Next e jornada Electron Save/Cancel. Registrar achados e resultados somente após execução.

## Implementação e achados em validação

O subpath /geometry agora expõe geometryBounds, GeometryBounds e GEOMETRY_BOUNDS_VERTEX_COST=64. Bounds incluem extremos analíticos de cúbicas, fechamento e posições degeneradas, não stroke/alças externas. Raízes da derivada usam diferenças reescaladas e a forma estável q da quadrática, sem descartar coeficientes quase lineares por um epsilon arbitrário. Avaliação usa De Casteljau traduzido. Até 4000 vértices e 4000 contornos, coordenadas ±1e7, contador compartilhado inteiro até dois milhões; excesso estrutural recusa antes de debitar trabalho, e cada vértice tem custo constante. Geometria transitória vazia retorna null, sem inventar posição; resultados não retêm/mutam a entrada.

Seis unidades passaram: extremos conhecidos, curvas que retornam, fechamento, contornos degenerados, posições grandes/quase lineares, posse, limites/custo máximo e um corpus independente de 96 curvas avaliado por Bernstein. A comparação real com getBBox cobriu 105 casos. O consumidor expõe diferenças float32 de até 3.04 unidades no intervalo de coordenadas do corpus; a comparação de coordenadas admite quatro dessas unidades e é separada das provas double do núcleo. A tolerância de pixels dos consumidores permanece exatamente um canal, sem alteração.

Primeiro achado: o navegador ignora um move-only desconectado ao calcular o bbox de uma forma também desenhada, diferindo da regra SVG 2 seguida pelo cálculo puro. O teste conserva a divergência como canário explícito. O perfil de exportação relativo recusa esse caso na inspeção de amostras, com diagnóstico do objeto; não exclui o subcaminho nem muda os bounds do documento.

O emissor separa definição validada/paleta de coordenadas. O estado relativo é uma união interna tipada, com resolução por geometria de cada quadro e sem coordenadas fictícias preparadas para publicação. A matriz bbox × gradientTransform usa o mesmo cálculo de campo escalar do 5.21. Canais s/e/o são gravados pelo registrador amostrado já existente; definição/cores/alpha ficam uma vez na saída. O preflight inclui 64 operações por vértice relativo em cada visita, além de transformações/gradientes/rig existentes. Bounds nulos/sem dimensão produzem somente opacidade zero do fill; o stroke sólido e a opacidade do objeto não são apagados. O último frame também é inspecionado. Nenhum segundo evaluator, formato novo ou dependência foi acrescentado.

Segundo achado: a ampliação com skin sobre linhas nativas revelou divergência de bordas/alpha. Probes em clones mediram um pixel divergente em sessão nova e 56 após o corpus, com tolerância original. Trocar apenas gradientUnits não corrigiu; usar a mesma sintaxe L do SVG de referência eliminou as divergências. Forçar leitura frequente de canvas também não corrigiu e não entrou no código. O consumidor Lottie serializa esses segmentos como C; não há uma saída L equivalente neste emissor. O perfil relativo agora exige fonte path cúbica e recusa linhas/primitivas/quadráticas/arcos antes da amostragem, indicando a conversão explícita com prévia/consentimento existente. Não se converte a fonte automaticamente, nem se altera o rig/bind pose para esconder o problema.

A fixture positiva de skin usa a transação real de conversão explícita sobre uma malha já ligada, verificando que pesos/matrizes do rig não mudam; a anterior com L é mantida como teste negativo de recusa/rollback. O corpus de 19 perfis (12 anteriores e sete relativos) passou também com essa conversão pelo pipeline real. A seleção de instantes foi corrigida para respeitar a duração de cada fixture: o rig tem dez quadros, não trinta. Nada do intervalo fora de ip/op é tratado como frame homologado. Cinco unidades de integração/limites do emissor e duas da pintura relativa passaram. App/núcleo/tipos/regressão completa foram repetidos após os últimos reforços.

UI real passou com consentimentos inicialmente falsos, download gf real e recusa de offset fino, hierarquia profunda, move-only composto e skin com linhas nativas, mantendo o projeto. Descrição e guia MCP explicam fonte cúbica, units e recusas. A quarta jornada Lottie Windows importou fills absolutos e relativos na mesma fonte, verificou os dois paints sobreviventes, comparou o JSON e aprovou Save/Cancel/undo. Destino temporário e guarda de PID não foram ampliados. Captura nativa edisvg-lottie-gradient.png inspecionada: descrição coerente com o relatório, opções/consentimentos e footer acessíveis na tela testada.

Terceiro achado, de orientação: a conversão cúbica não remove um move-only isolado. O diagnóstico não pode mandá-la executar como se resolvesse esse caso. A mensagem foi corrigida para revisão/remoção explícita do subcaminho ou HTML/React; linhas/primitivas recebem o caminho real Editar vértices + conversão com prévia/consentimento, também com alternativa HTML/React. Após essas últimas mudanças somente textuais, tipos/build, as 236 unidades e seis E2E focados foram repetidos e passaram. Não houve mudança no comportamento do emissor após a jornada Windows aprovada.

| Gate | Resultado local |
| --- | --- |
| App/núcleo | 236 unidades do app e 129 do núcleo em 39 arquivos passaram; tipos passaram |
| Sintaxe/build | Passaram; tipos/build e unidades do app repetidos após a revisão textual final |
| Navegador | 79 E2E passaram na repetição final; seis focados repetidos após mensagens finais |
| React/Next | Host independente/StrictMode na regressão; Next 16.4.2 produção, SSR e hidratação passaram |
| Electron/Windows | Jornada completa exit 0, incluindo quatro perfis Lottie e os dois paints no quarto |
| Tooling | 44 testes passaram; tipos bloqueados pelos 22 erros concorrentes listados abaixo |
| Biome | 480 arquivos, zero erros, 14 warnings e nove infos legados visíveis; 29 arquivos focados limpos |
| Auditorias | Produção/desenvolvimento repetidas sem vulnerabilidades conhecidas, muted vazio |
| Documentação/diff | Links locais conferidos; diff sem whitespace inválido, com aviso CRLF/LF do índice preservado |

Tipos transversais em 18/10 às 19:04 locais e repetidos após a jornada nativa: 22 erros concorrentes EdiPDF — dois em scripts/native-journey.mts, um em src/shared/page-decorations.ts, os 11 anteriores em pdf-annotations.ts e oito em pdf-navigation.ts. Nenhum erro EdiSVG/núcleo foi relatado. Essa frente foi preservada; não declarar o monorepo integralmente aprovado. Fragilidade histórica do launcher comum e compatibilidade do override major de image-size seguem para a revisão integral. Não chamar o lote 5/6 ou full review concluídos.

Base primária consultada: [SVG 2 — bounding boxes](https://www.w3.org/TR/SVG2/coords.html#BoundingBoxes), [unidades relativas](https://www.w3.org/TR/SVG2/coords.html#ObjectBoundingBox) e [gradientTransform](https://www.w3.org/TR/SVG2/pservers.html#LinearGradientElementGradientTransformAttribute). A especificação distingue bounds geométricos de stroke, exige o valor corrente e define a ordem da transformação. Isso orienta a implementação, não substitui testes no consumidor fixado.

Próximo incremento: [5.23 — joysticks 2D](review-lote-5-joysticks.md). Restante do lote 5, lote 6 e full review final permanecem obrigatórios. Sem homologação React Native/.riv, instaladores/publicação, commit/push/deploy ou operações comerciais.
