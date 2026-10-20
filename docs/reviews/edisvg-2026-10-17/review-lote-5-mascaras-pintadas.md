# Incremento 5.28 — máscaras de luminância e pintadas

Estado: implementado e revisado localmente em 20/10/2026 (branch `feat/edisvg-lote-5-restante`), dentro do projeto **v23**/blueprint **v12** ainda não publicados. Fecha as quatro frentes de "SVG avançado" do [review integral](full-review-2026-10-18.md): `use`/`symbol` (5.25), padrões (5.26), filtros (5.27) e máscaras.

## Lacuna e decisão

A máscara existente (5.6/5.12) é uma **silhueta alpha**: a fonte desenhada em branco, com a própria opacidade TRS. A importação exigia `mask-type="alpha"` explícito e preenchimento sólido sem contorno — mas o padrão do SVG é **luminância**, e a maioria das máscaras reais usa conteúdo branco, gradientes ou contornos.

`effects.mask` ganha `mode` opcional: `silhouette` (ausente = comportamento e formato anteriores), `alpha` ou `luminance`. Os modos pintados desenham a fonte com sua **pintura efetiva** — cor, gradiente ou padrão, opacidades e contorno —, resolvida pela mesma regra de canal da autoria (pintura tipada define o canal; cor sólida limpa a herdada), percorrendo os grupos ancestrais. Isso é necessário porque o conteúdo de um `<mask>` não herda do lugar onde a fonte está. Fonte pintada com filtro é recusada em vez de ser desenhada sem ele.

## Integração

- Núcleo: `graphics/effectPaint.ts` (`effectSourcePaints`, `isPaintedMask`) resolve a pintura das fontes; `createVectorEffectContext` recusa máscara pintada sem pintura (o que denuncia qualquer construtor que esqueça de passá-la); o quadro carrega `mode` e `paint`; a região ganha folga de contorno (meia largura × limite de miter 4 × maior estiramento da matriz fonte→alvo); `<mask>` usa `mask-type` do modo e a pintura da fonte no lugar do branco. A identidade do quadro inclui modo e pintura.
- Os seis construtores de contexto passam a pintura: descritor visual, runtime, validação do documento (com o gate `Modos de máscara requerem blueprint v12`), `sceneEffects` do editor, prévia de composição e prévia de gestos (que herda do contexto). Projeto: modo sob cabeçalho anterior a v23 é recusado.
- Painel de efeitos: **Modo da máscara** (silhueta, alpha da pintura, luminância da pintura); silhueta continua gravando a máscara sem `mode`.
- Importação: `mask-type` alpha ou luminance (ausente = luminance). Alpha com cor sólida e sem contorno continua no perfil de silhueta, idêntico ao anterior; luminância, gradientes, padrões e contornos usam o modo pintado. A fonte oculta gerada grava todos os valores iniciais de pintura explicitamente, para não herdar do grupo portador. Conteúdo de definições passa a resolver `url(#…)` locais de gradiente/padrão. A região precisa conter a silhueta mais a folga do contorno; cores semitransparentes (`rgba`) devem vir em `fill-opacity`/`stroke-opacity`.

## Achados corrigidos durante a revisão

1. **Herança indevida na fonte importada.** A fonte recebia só as propriedades declaradas na definição; uma ausente (por exemplo `fill-opacity`) seria herdada do grupo portador na cena. Agora os valores iniciais do SVG são gravados explicitamente.
2. **Prévia de composição sem pintura.** O editor monta um contexto próprio para a composição; ele não passava a pintura e a máscara pintada era recusada no canvas. A recusa do contexto revelou o caminho esquecido.
3. **Pintura `url(#…)` dentro da `<mask>`.** O conteúdo de definições não passa pela varredura principal, então gradientes e padrões nele eram recusados como atributo desconhecido. O leitor de apresentação resolve agora esses casos, e a leitura de `style` aceita as propriedades da própria definição (`mask-type`).

## Gates e evidências

- Núcleo: 2 testes (herança/regra de canal/recusa de filtro; elemento pintado vs silhueta, `mask-type` e região exata com folga de contorno, recusa sem pintura); 144 no total. App: 1 teste (comando compartilhado, renderização, gates v23/v12 e silhueta sem `mode`); 267 no total.
- E2E (`tests/e2e/painted-masks.test.ts`): oito SVGs — luminância padrão, gradiente, cinza com `fill-opacity`, alpha de gradiente radial com `style="mask-type:alpha"`, contorno, padrão, máscara e alvo transformados, pintura herdada do próprio `<mask>` — comparados com o desenho **nativo** do Chromium em 2400 pontos, tolerância 2: zero diferenças. Três recusas. Player compartilhado igual à cena estática, com `mask-type` luminância, pintura em `url(#edi-gradient-…)` e atualização do quadro ao animar a fonte. Painel: modo luminância aplicado em uma edição, cópia viva no canvas e desfazer exato. O teste antigo de recusas deixou de recusar as duas máscaras de luminância (agora suportadas e cobertas aqui).
- Regressão: 99/99 E2E, consumidor Next de produção, tipos e build.

## Limites que permanecem

A fonte continua sendo uma única forma/caminho (sem grupos ou texto como conteúdo de máscara), no mesmo viewport do alvo. `maskUnits="objectBoundingBox"`, `maskContentUnits="objectBoundingBox"`, região que recorta a fonte e fonte com filtro seguem recusados. A opacidade dos pais da fonte não entra (como no perfil de silhueta). Lottie e as exportações SVG/HTML de timeline continuam recusando recortes e máscaras.
