# Revisão funcional e matemática do Missão Saber

Revisão de 02/10/2026, com correções no código autorizadas pelo usuário. O app tinha problemas reais de correção de respostas, clareza dos enunciados e funcionamento. Foram identificados e corrigidos 15 problemas novos — 11 de gravidade alta e quatro média — e uma recorrência editorial já registrada na rodada 002.

Foram alterados 97 itens do catálogo em 60 unidades de conteúdo, além da introdução de uma missão. As alterações estão locais; esta revisão não publicou uma versão do app.

## O exemplo relatado

O problema foi confirmado em `fracoes-formatos-2`. O campo já informava metros, mas o corretor exigia que a resposta repetisse a unidade. Além disso, o teclado decimal solicitado no celular dificultava escrever a barra da fração e a entrada `1 / 2` era recusada pelo parser.

Agora o campo permite escrever frações, explica a notação com barra e aceita `0,5`, `0.5`, `1/2`, `2/4` e `1 / 2`, sem exigir `m`. Escrever a unidade continua permitido. A mudança funciona também em sessões iniciadas com a versão antiga da questão. O enunciado passou a estabelecer explicitamente uma fita de um metro; assim, a metade solicitada é inequivocamente 0,5 m.

## Abrangência

| Conteúdo inventariado | Quantidade |
| --- | ---: |
| Cursos | 14 |
| Habilidades | 58 |
| Missões | 291 |
| Bancos de diagnóstico e simulado | 28 |
| Itens, incluindo 336 reservados | 2.960 |
| Múltipla escolha | 1.705 |
| Resposta numérica | 905 |
| Ordenação | 175 |
| Justificativa escrita | 175 |

A revisão percorreu os enunciados, gabaritos e soluções do catálogo e suas fábricas, confrontando a pergunta com os dados disponíveis na tela, as alternativas e a regra de correção. Também verificou explicações e rubricas de justificativa. A leitura secundária de todas as pistas e devolutivas não foi uniforme: aprofundou os trechos suspeitos e os itens alterados, com validação estrutural automatizada para o catálogo inteiro. A análise não equivale a uma homologação pedagógica presencial com estudantes nem a uma certificação de ausência de outros defeitos.

Na funcionalidade, foram examinados entrada e correção de respostas, sequência das missões, retomada, histórico, troca de trilha/perfil, diagnóstico e simulado, manutenção de conteúdo, desafio familiar, laboratórios, caderno, relatórios, autenticação e retorno da assinatura. As jornadas de navegador percorrem os fluxos principais em desktop e emulação de celular; não abrem individualmente as 2.960 questões.

## Problemas e correções

| Registro | Gravidade | Problema confirmado e resultado da correção |
| --- | --- | --- |
| [001](issue_001.md) | Alta | Frações e unidades: campo e corretor passam a aceitar a notação prometida, sem exigir a unidade do rótulo. |
| [002](issue_002.md) | Média | `R$ 6,00` era recusado, embora `6 R$` passasse. O prefixo monetário brasileiro é aceito quando corresponde à unidade do item. |
| [003](issue_003.md) | Média | Histórico mostrava IDs em JSON nas respostas de ordenação. Agora mostra os passos em português na ordem enviada. |
| [004](issue_004.md) | Alta | Trocar de trilha tornava inacessível a sessão interrompida. Ela permanece consultável como histórico, sem aceitar novas respostas. |
| [005](issue_005.md) | Alta | Questões invalidadas ainda contavam no desafio familiar e na comparação de avaliações. A exclusão por versão do item agora é compartilhada. |
| [006](issue_006.md) | Alta | Confirmação de pagamento consultava o estado apenas uma vez. A tela repete as consultas até confirmar ou atingir seu limite. |
| [007](issue_007.md) | Média | Laboratório sem salvamento prometia guardar anotações. O texto agora informa corretamente quando é necessário salvar e quando os dados são temporários. |
| [008](issue_008.md) | Alta | 25 enunciados dependiam de dados de uma questão anterior que já não estava visível. Os dados necessários foram incorporados à própria pergunta. |
| [009](issue_009.md) | Alta | Oito questões de ordenação rejeitavam a troca de passos independentes. Agora só exigem as dependências matematicamente necessárias. |
| [010](issue_010.md) | Alta | Regras gerais esqueciam fator zero, reta vertical/horizontal ou igualdade na distância. Esses casos foram explicitados. |
| [011](issue_011.md) | Alta | Duas justificativas invertiam o efeito de render juros enquanto se paga em parcelas. Foram corrigidas as condições e a conclusão matemática. |
| [012](issue_012.md) | Alta | Faltavam hipóteses para furos em dobraduras, mínimo não negativo, percurso do cavalo, diferença zero, espelho e fórmula de Euler. Os enunciados agora delimitam os casos. |
| [013](issue_013.md) | Alta | Comparações financeiras omitiam pesos, base de taxas ou faziam inferências sem dados. Foram fornecidas as premissas e restringidas as conclusões ao que pode ser calculado. |
| [014](issue_014.md) | Alta | Explicações contradiziam a desigualdade triangular, exageravam a sobra de dominós ou dependiam da posição de alternativas embaralhadas. As justificativas foram corrigidas. |
| [015](issue_015.md) | Média | Alternativas exibiam `307.20000000000005` e decimais inconsistentes com o português. A apresentação foi corrigida sem alterar o cálculo pretendido. |

A recorrência do [problema de garantias da rodada 002](../reviews-002/issue_001.md) apareceu em outros itens de gavetas: dizer apenas que uma quantidade “basta” admite também quantidades maiores. Foram especificados o mínimo suficiente ou a garantia mais forte em 18 itens comerciais e nos templates reservados correspondentes. O achado não foi duplicado como um novo registro.

## Conferências matemáticas independentes

- As 24 permutações de cada uma das oito ordenações revistas foram confrontadas com as sequências válidas: 192 casos, incluindo a rejeição de ordens que violam dependências.
- Nove testes extraem os dados do enunciado visível e recalculam o resultado, sem recorrer à questão anterior ou à explicação para obter dados que faltariam ao estudante.
- Os 905 itens numéricos aceitam o próprio resultado correto formatado em português. Antes da correção, o item de meio metro falhava nessa conferência.
- As famílias iniciais/comerciais tiveram 460 casos de equivalência de alternativas numéricas examinados; não foi identificada duplicata numérica correta rejeitada nesses casos.
- Foram geradas 99.000 combinações dos 99 templates reservados avançados, sem alternativas textualmente duplicadas. Esse teste verifica unicidade de alternativas, não demonstra sozinho a validade matemática de todos os valores possíveis.
- A inversão sobre parcelamento foi conferida descontando 12 parcelas de R$ 100 a 1% ao mês, pagas no fim de cada mês: valor presente de R$ 1.125,507747, inferior a R$ 1.200. São premissas do exercício, não uma recomendação financeira pessoal.
- Contraexemplos simples confirmaram os erros das regras gerais: multiplicar `0 < 1` por zero produz a desigualdade falsa `0 < 0`; entre `(0,0)` e `(3,0)`, a distância é igual à variação horizontal, não maior.

## Versionamento e sessões existentes

O [manifesto das alterações](content-changes.json) identifica os 97 itens e as 60 unidades com mudanças em itens. Ao todo, 61 unidades tiveram revisão de versão: 55 missões e seis bancos. A diferença é `coordenadas-em-2`, cuja mudança é na introdução. O registro de revisão dos 2.960 itens foi atualizado após a leitura das alterações e está íntegro: zero hashes pendentes e zero órfãos.

Novas sessões usam o conteúdo revisado. Sessões anteriores preservam seus enunciados, respostas e versões congeladas; seus textos não foram reescritos retroativamente. A correção de leitura de números e da unidade é compartilhada e atende também essas sessões antigas. Uma eventual invalidação editorial de outras versões antigas no ambiente publicado é uma operação de manutenção de conteúdo, não executada nesta revisão local.

## Verificação final

VERIFICATION REPORT
-------------------
Claim: Correções locais verificadas no escopo funcional e de conteúdo descrito.
Command: Comandos completos na tabela abaixo.
Executed: 02/10/2026, após as alterações.
Exit code: 0 em todos os comandos listados.
Output summary: `Tests 201 passed (201)`; `Tests 73 passed (73)`; `10 passed (1.6m)`; build `Compiled successfully`; três ferramentas de auditoria aprovadas; TypeScript e Biome aprovados.
Warnings: Avisos existentes do PostgreSQL sobre nomes de constraints longos e de cor do terminal (`NO_COLOR`/`FORCE_COLOR`); não indicam falha da aplicação.
Errors: Nenhum na execução final.
Verdict: PASS

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @informach/missao-saber test` | 201 testes passaram, 13 arquivos. |
| `pnpm --filter @informach/missao-saber test:integration` | 73 testes passaram, 17 arquivos, PostgreSQL local descartável. |
| `pnpm --filter @informach/missao-saber e2e` | 10 jornadas passaram; build de produção aprovado, desktop e celular. |
| `pnpm --filter @informach/missao-saber typecheck` | Código de saída 0. |
| `pnpm exec biome check apps/missao-saber/src apps/missao-saber/e2e apps/missao-saber/test/functional-review.integration.ts apps/missao-saber/tools/advanced-content-audit.tool.ts apps/missao-saber/tools/full-review-responses.tool.ts` | `Checked 212 files. No fixes applied.` |
| `pnpm --filter @informach/missao-saber exec vitest run --config vitest.tools.config.ts tools/full-review-responses.tool.ts tools/advanced-content-audit.tool.ts tools/review-digests.tool.ts` | Três auditorias passaram; `PENDENTES=0 REVISADOS=2960 ORFAOS=0`. |
| `git diff --check` | Código de saída 0. |

As regressões novas incluem 40 testes unitários, três de integração e duas execuções do teste de confirmação de pagamento. Os testes anteriores foram preservados e a jornada dos quatro formatos foi ampliada para o caso relatado e o histórico de ordenação.

As execuções iniciais localizaram os defeitos antes das correções. Durante a última validação, também foram corrigidos um seletor do teste que ignorava o ícone do resumo, o isolamento por IP das contas de teste e o hash de revisão de uma dica modificada. Nenhuma proteção de produção foi relaxada para fazer testes passarem.

## Limites operacionais

Não houve deploy, migração de produção, envio real de e-mail ou cobrança. O retorno de pagamento foi verificado pela tela e suas consultas em ambiente local; não foi repetida a homologação externa de Stripe/SendGrid. Emulação de celular confirma o HTML e as interações no Chromium; não substitui teste físico de todos os teclados de Android/iOS.

O armazenamento de sessões versionadas, a separação entre conteúdo público e gabarito, a proteção por família e as suítes com banco descartável ofereceram boas bases para corrigir os problemas sem reescrever o histórico dos estudantes. Nenhuma alteração foi feita no arquivo pessoal `.claude/settings.local.json`, que já estava modificado.

Os arquivos `issue_001.md` a `issue_015.md` contêm as reproduções e as correções. A situação consolidada da rodada fica em [_meta.md](_meta.md).
