# Incremento 5.25 — importação de `use` e `symbol`

Estado: implementado e revisado localmente em 20/10/2026 (branch `feat/edisvg-lote-5-restante`). Sem mudança de formato: projeto v22, Rig v4 e blueprint v11 permanecem. É a primeira das quatro frentes de "SVG avançado" do [review integral](full-review-2026-10-18.md); padrões, filtros e máscaras de luminância/pintadas seguem em incrementos próprios.

## Lacuna e perfil

A importação recusava `<use>` e `<symbol>`, o formato mais comum de sprites e ícones exportados por ferramentas de desenho. O perfil 5.25 aceita referências **locais** (`href="#id"` ou `xlink:href="#id"`) e as converte em cópias editáveis independentes, antes de qualquer outro catálogo ler o documento:

- `use` vira um grupo com os atributos do `use` (apresentação, transform, semântica, clip/mask) e `transform` seguido de `translate(x y)`, como no SVG 2. Filhos permitidos: só `title`, `desc` e `metadata`, que passam para o grupo.
- O alvo é copiado (`cloneNode`) sem os `id` originais — os nomes vão para o mapa de nomes da importação ("Uso de leaf" para o grupo, "leaf" para a cópia). Referências internas a gradientes e efeitos em `defs` continuam valendo.
- `symbol` gera o transform viewBox→viewport do SVG 2 (`none`, `x{Min,Mid,Max}Y{Min,Mid,Max}`, `meet`/`slice`) e, com o `overflow` oculto padrão, um `clipPath` retangular gerado e deduplicado por tamanho. Esse recorte entra pelo perfil de recorte já existente (5.12) e aparece como recorte editável.
- `use` aninhado em cópias é expandido também; a profundidade de referência é guardada por grupo e herdada pelas cópias, então o limite de 8 níveis vale em qualquer ordem de expansão. Até 2000 elementos gerados, o que barra crescimento exponencial (um nível referenciando o anterior duas vezes).
- `symbol` sem uso não é desenhado e não é importado (aviso). Os `symbol` usados são removidos depois da expansão.

Recusas atômicas (nada é importado): referência externa ou URL, alvo ausente, ciclo (próprio ou mútuo), `href` e `xlink:href` juntos, filho de `use` que não seja metadado, `style` em `symbol`, `x`/`y` não nulos em `symbol`, `symbol` com viewBox ou overflow oculto sem `width`/`height` numéricos, porcentagens, `preserveAspectRatio` com `defer`, IDs duplicados, profundidade > 8, orçamento e conteúdo não suportado dentro da referência (por exemplo `image`), que agora é validado pelo mesmo caminho do SVG escrito à mão.

Avisos na revisão da importação: quantas referências viraram cópias independentes (editar uma não altera as demais; para reutilização viva, componentes), quantos viewports viraram recorte retangular e quantos `symbol` ficaram sem uso.

## Arquitetura

`src/renderer/src/svg-use-expansion.ts` reescreve o DOM do parser (nunca o texto `source`, que continua preservado no projeto) e devolve os nomes das cópias. `svgImport.js` chama o expansor logo depois de validar a raiz; sem `use`/`symbol` ele não toca o documento (o teste unitário com DOM simulado continua passando). Nada é buscado na rede e nenhuma regra de CSS é avaliada.

## Achado corrigido durante a revisão

O limite de profundidade dependia da ordem: como cada `use` é expandido no lugar, uma cadeia de dez grupos ia sendo achatada nível a nível e nunca chegava a oito. A profundidade agora é um atributo de cada grupo expandido, copiado junto com as cópias.

## Gates e evidências

- E2E novos (`tests/e2e/svg-use-import.test.ts`): quatro SVGs — reuso de `defs` com `xlink:href`, rotação e contorno; `symbol` com `slice` e círculo maior que o viewport; `meet` com viewBox negativo e `none`; `use` aninhado em `symbol` com gradiente e skew — comparados com o desenho **nativo** do Chromium em 2400 pontos por imagem, tolerância de 2 por canal: zero diferenças. Quinze recusas com mensagem específica e cena nula. Importação pelo diálogo real: nomes, três cópias com IDs distintos, opacidade e ordem de transformação preservadas.
- Regressão: 258 unitários do app e 87/87 E2E; build e tipos do app.

## Limites que permanecem

As cópias não mantêm vínculo com o `symbol` original; reutilização viva continua sendo por componentes. `use` de `svg` aninhado, `symbol` com `style`, porcentagens relativas ao viewport e `use` dentro de `clipPath`/`mask` (definições de uma geometria) ficam fora do perfil. A exportação SVG não recria `symbol`/`use`.
