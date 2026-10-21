# Incremento 5.26 — padrões (`pattern`)

Estado: implementado e revisado localmente em 20/10/2026 (branch `feat/edisvg-lote-5-restante`). Introduz **projeto v23** e **blueprint v12**; Rig continua v4. Segunda frente de "SVG avançado": depois de `use`/`symbol` (5.25), filtros e máscaras de luminância/pintadas seguem em incrementos próprios.

## Lacuna e decisão de modelo

Padrões (tiles repetidos) eram recusados na importação e não existiam na autoria. A decisão foi tratar o padrão como **terceira variante da pintura tipada** de cada canal (`gradients.fill`/`gradients.stroke`, união `paintServerSchema = gradiente | padrão`), em vez de um campo paralelo. Com isso, herança em grupos, overrides de componente, estilos, a regra "cor sólida em `attrs` substitui a pintura daquele canal", cópia/reparenting e o pool de 256 definições por conteúdo continuam sendo uma regra só. O TypeScript apontou cada consumidor que supunha "linear ou radial" (painel, Lottie, um teste); os arquivos JavaScript legados foram auditados à mão.

Perfil do tile (`patternSchema`, estrito):

- `units` (`patternUnits`) e `contentUnits` (`patternContentUnits`), retângulo `x/y/width/height` positivo, `viewBox` + `preserveAspectRatio` opcionais (com viewBox o conteúdo usa o sistema do viewBox) e `transform` (`patternTransform`) invertível.
- De 1 a 64 formas `path` com cor sólida `#rrggbb` ou `none`: opacidades de preenchimento/contorno/forma, regra, largura, `linecap`, `linejoin` e matriz própria opcional. Sem pinturas aninhadas, texto, imagens, referências ou scripts — o tile desenha igual em qualquer lugar para onde a definição for copiada.
- Até 4000 vértices por tile e 100.000 vértices somando os tiles distintos de uma cena, biblioteca de estilos ou blueprint (cópias idênticas compartilham a definição).
- Identidade `edi-pattern-<sha256>` do conteúdo canônico; o validador do SVG do host confere `edi-pattern-*` como confere os gradientes.

## Integração

- Núcleo `edi-motion`: `graphics/patterns.ts`, união e pool em `graphics/gradients.ts`, tag `pattern` no descritor visual, validação DOM, gate `Padrões requerem blueprint v12` e `INTERACTIVE_VERSION = 12` (v1–v11 continuam aceitos).
- Projeto: `PROJECT_VERSION = 23`; padrões em nó ou estilo sob cabeçalho anterior são recusados (`Padrões tipados requerem projeto v23`, `Estilos com padrões requerem projeto v23`). Arquivos v1–v22 migram com o backup exato existente.
- Renderização única por `describeVisualScene`: canvas, Testar, HTML interativo, React/Next, SVG estático/amostrado e as exportações raster do 5.24 recebem o mesmo `<pattern>`. Lottie recusa com diagnóstico explícito, sem trocar por cor sólida.
- Autoria: o painel "Gradientes e padrões" ganha "Padrão (tile)" por canal. Para um padrão existente, edita unidades, retângulo e matriz e mantém as formas; para um novo, oferece modelos (listras, pontos, xadrez, grade) com cores, tamanho, espessura e ângulo, gerados por `patternFromPreset` como padrões comuns (nada do modelo fica gravado). Aplicar é uma transação; desfazer/refazer restauram o documento exato. O resumo "Efetivo" mostra "padrão".
- Importação (`svg-patterns.ts`): `<pattern>` local com templates `href`/`xlink:href` (até 8 níveis, sem ciclos, herdando atributos e, quando o padrão não tem filhos, o conteúdo do template), grupos com transformação achatados nas matrizes das formas, primitivas convertidas em caminho e apresentação herdada dos ancestrais do `pattern`. Recusa: pintura aninhada ou `currentColor`, texto, imagem, opacidade de grupo (não seria exata ao achatar), URL externa, ciclo, tile sem tamanho, porcentagem em `userSpaceOnUse`, tile sem formas e mais de 64 formas.
- Assistente/MCP: `scene gradients` aceita o padrão no mesmo comando; as instruções descrevem o perfil e a precedência da cor sólida.

## Achados corrigidos durante a revisão

1. **Arquivos v22 seriam recusados.** `parseProject` tem duas listas de versões aceitas (schema e verificação do cabeçalho) e a segunda não recebeu o 22 ao subir para v23 — todo projeto salvo pela versão publicada 0.2.1 deixaria de abrir. O teste de migração v22→v23 pegou; as duas listas agora incluem o 22.
2. **Orçamento agregado de tiles.** O teto de 4000 vértices era por tile; 256 padrões distintos somariam 1 milhão de vértices num blueprint, que não passa pelo orçamento de atributos da cena. O pool de definições agora limita 100.000 vértices de tiles distintos.

Depois, o [full review do lote 5](full-review-2026-10-20.md) (B5) achou que um padrão com `viewBox` e `patternContentUnits="objectBoundingBox"` era importado com as unidades declaradas, mas o SVG as ignora quando há `viewBox`. A importação agora usa o espaço do usuário nesse caso (novo SVG com pixels comparados).

## Gates e evidências

- Núcleo: 3 testes novos (normalização/identidade/elemento, recusas do schema, pool compartilhado com gradientes e teto agregado); 139 no total.
- App: 4 testes novos (modelos, projeto v23 com gates de nó e estilo e migração v22, cor sólida limpando o canal, uma definição para cópias, blueprint v12 com recusa ao rebaixar para v11, recusa Lottie); 262 no total.
- E2E (`tests/e2e/patterns.test.ts`): sete SVGs — tile em `objectBoundingBox`, `userSpaceOnUse` com `patternTransform` e contornos com `linecap`, viewBox com `xMaxYMid meet`, template `xlink:href` com grupo rotacionado, `evenodd` herdado do `pattern`, conteúdo em `objectBoundingBox`, padrão em contorno e em texto — comparados com o desenho **nativo** do Chromium em 2400 pontos, tolerância 2: zero diferenças. Onze recusas. Player visual compartilhado igual à cena estática. Painel: modelo xadrez aplicado em uma edição, `<pattern>` no canvas, desfazer/refazer exatos e Lottie bloqueado com a mensagem do perfil.
- Regressão: 91/91 E2E, consumidor Next de produção, tipos do app e do núcleo, build.

## Limites que permanecem

Tiles sem gradientes, texto, imagens, padrões aninhados ou animação própria; a exportação Lottie recusa padrões. Conteúdo herdado por template usa a apresentação resolvida no padrão de origem. Não há editor gráfico do conteúdo do tile (formas são importadas ou geradas por modelo); editar o tile em si, desenhando nele, fica para o lote 6 (bibliotecas). Não é suporte integral a `pattern` do SVG nem equivalência com o Rive.
