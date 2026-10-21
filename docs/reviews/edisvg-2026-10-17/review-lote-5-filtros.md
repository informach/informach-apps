# Incremento 5.27 — filtros

Estado: implementado e revisado localmente em 20/10/2026 (branch `feat/edisvg-lote-5-restante`). Usa o projeto **v23** e o blueprint **v12** introduzidos no 5.26: os dois formatos ainda não foram publicados e acumulam as capacidades do restante do lote 5 até a release. Terceira frente de "SVG avançado"; máscaras de luminância/pintadas seguem no 5.28.

## Lacuna e decisão de modelo

Filtros (`filter="url(#…)"`) eram recusados na importação e não existiam na autoria. Diferente de recorte/máscara — um grafo de fontes vivas avaliado a cada quadro —, um filtro é uma definição estática. Por isso entrou como **campo tipado próprio `filter`** no nó, deduplicado por conteúdo (`edi-filter-<sha256>`), com até 64 definições distintas por cena/documento.

O atributo vai no **elemento da forma**, dentro do wrapper que carrega o TRS e o recorte/máscara, e não no wrapper. Assim o filtro trabalha no espaço do elemento com o `transform` importado (um desfoque sob `scale(2)` continua 2×, como no SVG original), o TRS animado escala o resultado como qualquer arte, e recorte/máscara são aplicados depois do filtro, na ordem da especificação.

Perfil (`filterSchema`, estrito): `filterUnits`/`primitiveUnits`, região positiva, espaço `linearRGB` ou `sRGB` e uma cadeia de 1–16 primitivas — `blur` (desvio ≤ 200, `edgeMode`), `offset`, `dropShadow`, `colorMatrix` (`matrix` 20 valores, `saturate` 0–100, `hueRotate`, `luminanceToAlpha`), `flood`, `blend` (16 modos), `composite` (com `k1–k4` só no aritmético) e `merge`. Toda entrada é `SourceGraphic`, `SourceAlpha` ou o índice de uma primitiva **anterior**: o grafo é acíclico por construção e nunca lê o fundo da página nem outro elemento.

## Integração

- Núcleo: `graphics/filters.ts`; descritor visual (definição em `<defs>`, atributo na forma e na apresentação de imagem); documento interativo com `filter` em `content`, gate `Filtros requerem blueprint v12` e pool; o player legado e o validador do SVG do host conferem atributo e definição.
- Projeto: `filter` sob cabeçalho anterior a v23 é recusado; validação da cena, orçamento de atributos, pool e orçamento de expansão de componentes contam o filtro; cópia, duplicação e componentes o preservam.
- Autoria: seção **Filtros** no painel de efeitos com modelos (sombra projetada, desfoque, brilho externo, saturação, escala de cinza, rotação de matiz), resumo do filtro atual e remoção, cada ação numa transação. Os modelos geram filtros comuns em `sRGB` (como sombras e desfoques de CSS); o de brilho usa as mesmas primitivas que a importação aceita.
- Importação (`svg-filters.ts`): `<filter>` local com `result` nomeado mapeado para índices, `in` ausente como resultado anterior e `color-interpolation-filters` herdado dos ancestrais (também aceito na raiz e em estilos, só para resolver os filtros). Recusa: funções CSS (`blur()`, `drop-shadow()`), entradas de fundo/pintura, sub-região de primitiva, primitivas fora da lista (por exemplo `feTurbulence`), espaços de cor misturados, referência a resultado posterior, `in2` ausente, `href` em filtro, região `userSpaceOnUse` implícita, filtro vazio e URL externa.
- Consumidores: canvas, Testar, HTML interativo, React/Next, SVG e exportações raster recebem o mesmo filtro. Lottie recusa filtros em qualquer nó, grupos inclusive, sem descartar o efeito. MCP usa `scene filter`, o mesmo comando do painel.

## Achados corrigidos durante a revisão

1. A recusa na Lottie tinha ficado no trecho que só examina formas de caminho; um **grupo** com filtro passaria sem diagnóstico. A verificação foi para o laço que percorre todos os nós, com teste.
2. `color-interpolation-filters` na raiz (comum em SVGs exportados) recusava a importação inteira como atributo desconhecido. Ele agora é aceito com valor validado e consumido pela resolução dos filtros, sem ser gravado no nó.

Depois, o [full review do lote 5](full-review-2026-10-20.md) achou dois casos. B3: o teto de definições de filtro era contado por prancheta e não pelo projeto, que é o que o fechamento de componentes publica junto. Agora o teto vale para o projeto todo. B4: `color-interpolation-filters="auto"` era tratado como herdado e caía em linearRGB; o navegador desenha como sRGB, e a importação passou a fazer o mesmo (novo SVG com pixels comparados).

## Gates e evidências

- Núcleo: 3 testes (cadeia com entradas/resultados explícitos, recusas do schema, pool e teto de 64); 142 no total. App: 4 testes (modelos, projeto v23 e remoção por comando, filtro na forma dentro do `transform` e não no wrapper, blueprint v12 com recusa ao rebaixar, Lottie em grupo); 266 no total.
- E2E (`tests/e2e/filters.test.ts`): nove SVGs — desfoque sob `scale(2)`, `feDropShadow` em `linearRGB`, cadeia nomeada com `merge`, quatro `feColorMatrix`, brilho em texto, `multiply` e composite aritmético, filtro em grupo com recorte, região `userSpaceOnUse` com `primitiveUnits` relativos e espaço `sRGB` herdado da raiz — comparados com o desenho **nativo** do Chromium em 2400 pontos, tolerância 2: zero diferenças. Doze recusas. Player visual igual à cena estática. Painel: modelo aplicado, `feDropShadow` no canvas, remoção e desfazer exatos, Lottie bloqueado.
- Regressão: 95/95 E2E, consumidor Next de produção, tipos e build.

## Limites que permanecem

Filtros estáticos (parâmetros não animáveis), sem `feTurbulence`, iluminação, convolução, morfologia, `feImage`, `feTile`, `feDisplacementMap`, componentes de transferência e sem sub-regiões de primitiva. Funções CSS de filtro ainda não são convertidas. Estilos de aparência não carregam filtros. Desempenho depende do renderer: os tetos (16 primitivas, desvio 200, 64 filtros) limitam o custo, não o tornam constante.
