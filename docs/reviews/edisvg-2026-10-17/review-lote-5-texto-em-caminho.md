# Incremento 5.32 — texto em caminho

Estado: implementado e revisado localmente em 20/10/2026 (branch `feat/edisvg-lote-5-restante`). Fecha a frente de tipografia do [review integral](full-review-2026-10-18.md), depois do [5.31](review-lote-5-shaping-bidi.md). Entra no projeto v23 e no blueprint v12, ainda não publicados.

## Contrato

- **Modelo** (`textPathSchema` em `/visual`): um texto pode ter `textPath: {d, startOffset}`. `d` é a curva própria do texto, no espaço local dele (o mesmo das coordenadas x/y), com até 4000 vértices contados no orçamento de geometria da cena. `startOffset` é a porcentagem do comprimento total (0–100). O texto em caminho tem uma linha: `textLayout` e `textPath` são exclusivos.
- **Desenho**: o renderer compartilhado gera `<path id="edi-text-path-<objeto>">` nas definições e `<text><textPath href startOffset>texto</textPath></text>`. Como a curva fica no espaço do texto, mover, girar ou escalar o texto leva a curva junto. Vale para editor, Testar, HTML/React, SVG estático/animado e vídeo.
- **Player**: a marcação do host precisa trazer a curva tipada exatamente, sob o ID gerado (buscada no SVG mais externo, que guarda as definições também para viewports de componentes). Texto dinâmico substitui o conteúdo do `textPath` e continua na curva. A direção automática do 5.31 continua valendo.
- **Autoria**: no painel de texto, *Texto em caminho* oferece as formas do mesmo grupo. O contorno é copiado e convertido para o espaço local do texto (inversa da matriz do texto composta com a da forma), e editar a forma depois não move o texto. O painel também permite mudar só o início (%) e remover o caminho. Comando `scene text-path` com `{d, startOffset}` ou `null` (UI e MCP).
- **Importação SVG**: `text` com um único `textPath` de texto simples, `href`/`xlink:href` local para um `path` do documento (dentro ou fora de `defs`), `startOffset` em % ou comprimento sem unidade. O comprimento absoluto vira porcentagem pelo comprimento medido da curva. O `transform` do próprio path referenciado é aplicado (SVG 2). São recusados explicitamente: `tspan`, outro conteúdo no texto, referência ausente ou não-path, `pathLength`, outros atributos (`method`, `spacing`, `side`, `textLength`…) e unidades como `em`.
- **Lottie**: continua recusando texto.

## Achados durante a revisão

1. A primeira verificação de marcação buscava a curva dentro da raiz do player. Num componente, essa raiz é o viewport aninhado e as definições ficam no SVG mais externo, então a busca passou a ser feita nele. Também não se exige que a curva esteja dentro da raiz: duas cópias idênticas do mesmo artefato na página compartilham IDs, e o navegador usa a primeira definição de qualquer forma.
2. O teste unitário inicial só conferia que as coordenadas eram finitas. Foi trocado por uma verificação exata: o primeiro ponto da cópia, levado pela matriz do texto (deslocado e escalado), cai no ponto original da forma.

## Gates e evidências

- Núcleo: 157 testes (2 novos): saída do renderer (definição + `textPath`, escape do texto), validação, limite de vértices e comprimento medido.
- App: cópia da forma no espaço local de um texto transformado (verificação exata), comando, exclusividade com layout de linhas, gate v23, compilação interativa com a curva, remoção.
- E2E (`tests/e2e/text-path.test.ts`): três SVGs com `textPath` (percentual sobre path visível, `xlink:href` em `defs` com transform e `text-anchor="middle"`, offset absoluto num caminho dobrado dentro de grupo girado), comparados pixel a pixel com o desenho nativo do Chromium, com 0 diferenças acima de 2 por canal. Cinco recusas de importação com mensagem. No player, o texto dinâmico substitui o conteúdo do `textPath` e a linha de base acompanha o arco. O inspetor anexa a forma irmã com início 35%, e o projeto salvo e a prévia refletem isso.
- Regressão: app 278/278, E2E completo 108/108, consumidor Next 1/1, tipos de app e núcleo, Biome sem erros (avisos legados).

## Limites que permanecem

Uma linha por texto em caminho, sem `tspan` nem estilos por trecho. A curva é uma cópia: não acompanha edições posteriores da forma nem a animação dela. O offset é estático (não é um canal animável). `side`, `method` e `spacing` não estão no perfil, pois o suporte varia entre motores. Lottie recusa texto.
