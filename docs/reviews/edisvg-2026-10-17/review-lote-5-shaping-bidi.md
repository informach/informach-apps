# Incremento 5.31 — shaping complexo verificável e direção automática

Estado: implementado e revisado localmente em 20/10/2026 (branch `feat/edisvg-lote-5-restante`). Primeira metade da frente de tipografia do [review integral](full-review-2026-10-18.md) ("shaping complexo, bidi e textPath"). O texto em caminho fica para o 5.32. Entra no projeto v23 e no blueprint v12, ainda não publicados.

## Lacuna

O [5.8](review-lote-5-tipografia.md) verificava apenas a cobertura cmap. Uma fonte podia ter todos os glifos de um texto árabe ou índico sem as substituições OpenType que juntam ou reordenam as letras. O exportador aceitava, e o consumidor mostrava letras isoladas ou fora de ordem. Na direção, só havia `ltr`/`rtl` fixos, e texto dinâmico em outro sistema de escrita ficava com a direção do texto autoral.

## Contrato

- **Leitura OpenType** (`inspectFontLayoutScripts`, `fontLayoutScripts` em `/assets`): para GSUB e GPOS, o sistema de idioma padrão de cada script e as tags de feature que ele aplica (ou a união dos sistemas, se não houver padrão). Todos os offsets e contagens são verificados. Como a cobertura, é separada do carregamento: uma tabela malformada não impede abrir a fonte e vira diagnóstico explícito (`UnsupportedLayoutTableError`). O resultado fica em cache com a entrada validada dos bytes.
- **Scripts com formas contextuais** (`SHAPING_SCRIPTS`): árabe, siríaco, n'ko, mongol, adlam, os índicos (tags atuais "2" e legadas), cingalês, khmer, birmanês e tibetano, cada um com as features que exigem (por exemplo `init`/`medi`/`fina` nos de junção e `half`/`blwf`/`pres`/... nos índicos). Latim, grego, cirílico, hebraico, tailandês e CJK leem certo só com glifos cmap e não entram na lista.
- **Regra**: o grupo de caracteres é desenhado pela primeira fonte da cadeia que o cobre (como no 5.8). O script verificado é o que um shaper selecionaria, na ordem do HarfBuzz: as tags do próprio script, depois `DFLT`, `dflt` e `latn`. É preciso que ele aplique pelo menos uma das features contextuais. O relatório ganha `unshapedCount`/`unshaped` (script, fonte e motivo), e `covered` passa a exigir que não haja falhas. `assertTextCoverage`, usado por Testar, pelos exports portáteis e pelo compilador interativo, recusa com a explicação.
- **Direção automática** (`textDirection: "auto"` no nó de texto, no conteúdo interativo e no visual portátil): a direção base vem do primeiro caractere forte fora de isolamentos (regra P2/P3 do algoritmo bidi, com as letras de scripts da direita para a esquerda, mais LRM/RLM/ALM). Neutro resolve para `ltr`. O renderer compartilhado escreve o `direction` resolvido. O player interativo resolve de novo quando um binding troca o texto. `ltr`/`rtl` explícitos continuam no atributo `direction`; os dois modos são exclusivos.
- **Comando** `scene text-direction` com `auto|ltr|rtl` (UI e MCP). O painel de texto ganha "Automática (primeiro caractere forte)". O relatório `get_font_coverage` mostra as falhas de shaping.

## Achados durante a revisão

1. A primeira versão exigia só a entrada do script no GSUB (`arab`). A prova no Chromium mostrou que o HarfBuzz, sem essa entrada, recorre ao `DFLT` e junta as letras do mesmo jeito: as duas fontes desenharam a mesma largura. A regra passou a seguir a ordem de seleção do shaper e a exigir as features contextuais. O fixture negativo passou a renomear `init`/`medi`/`fina`, um defeito que o navegador de fato mostra (letras isoladas, mais largas).
2. O Chromium com `unicode-bidi: plaintext` reordena um parágrafo hebraico como RTL mas ancora como LTR (primeiro caractere em x=417 com âncora em 300). Usar o modo do motor daria resultados diferentes entre consumidores, por isso o EdiSVG resolve a direção e escreve um `direction` explícito.

3. A regressão encontrou um defeito real antigo: o fixture do ZIP React desenhava "مرحبا" com a Noto Sans Math, que cobre as letras árabes mas não as junta. A captura no Chromium mostrou as letras isoladas, idênticas ao isolamento forçado com ZWNJ. Com a fonte árabe na cadeia, o fixture passou a sair unido.
4. As formas de apresentação árabes (U+FB50–FDFF, U+FE70–FEFF) e o alfabeto matemático árabe (U+1EE00–1EEFF) pertencem ao script árabe, mas já são glifos isolados; ficam fora da exigência.

Depois, o [full review do lote 5](full-review-2026-10-20.md) (D1) mostrou que uma fonte maliciosa podia fazer a leitura de GSUB/GPOS repetir registros compartilhados e explodir o trabalho. A leitura agora memoriza cada LangSys e tabela de script, remove duplicatas e divide um orçamento único de leitura; teste com tabela hostil.

## Gates e evidências

- Fixture novo: Noto Sans Arabic Regular sem modificação (OFL, hash e origem em `packages/edi-motion/tests/fixtures/README.md`). Variantes negativas são geradas só em memória e têm os checksums refeitos.
- Núcleo: 155 testes (5 novos; formas pré-moldadas no teste de scripts). Scripts e features reais das duas fontes Noto; árabe aceito, aceito também sem o registro `arab` (cai no `DFLT`, como no shaper) e recusado sem `init/medi/fina`; latim na mesma fonte não exige shaping; tabela malformada mantém a fonte e explica o motivo; resolução da direção (isolados, marcas, neutros, siríaco); renderer escrevendo a direção.
- App: comando `text-direction`, exclusividade com `direction`, gate v23/v12, compilação interativa, recusa no render com verificação de fontes, relatório MCP e cadeia latim + árabe coberta.
- E2E (`tests/e2e/typography.test.ts`): no Chromium, a fonte sem features contextuais desenha a palavra mais larga que a fonte original (letras isoladas), e o compilador recusa esse projeto. O player compartilhado desenha a palavra unida, com a mesma largura da fonte original. A direção automática passa de `ltr` a `rtl` quando o input troca o texto, com a borda direita na âncora. O inspetor aplica a direção automática ao projeto salvo e à prévia.
- Regressão: app 277/277, E2E completo 106/106 (inclui o ZIP React corrigido), consumidor Next 1/1, tipos de app e núcleo, Biome sem erros (avisos legados).

## Limites que permanecem

A verificação não executa shaping: confere que a fonte selecionada declara e aplica as features contextuais do script, não a qualidade dos glifos, ligaturas ou posicionamento de marcas. O shaping continua sendo feito pelo motor da plataforma. Projetos com texto nesses scripts e uma fonte sem as features agora são recusados no Testar e nos exports portáteis. A direção automática vale para o elemento de texto inteiro (todas as linhas), sem isolar parágrafos por linha. Lottie continua recusando texto.
