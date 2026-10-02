# Revisão completa do Missão Saber — rodada 016

Revisão de 02/10/2026, aprofundando a [rodada 015](../reviews-015/README.md). Foram confirmados **13 problemas novos: quatro de gravidade alta e nove média**, além de seis recorrências de problemas já registrados. As correções foram implementadas conforme a autorização do usuário. Esta rodada altera **seis itens em seis missões e um desafio de aprofundamento**, além dos fluxos funcionais descritos abaixo.

**Os 13 problemas novos e as seis recorrências foram corrigidos e verificados no escopo descrito.** As mudanças estão locais; não houve commit, deploy ou alteração de dados de produção.

**Atualização após a autorização para implementar as propostas:** as seis oportunidades abaixo também foram entregues. O [relatório de implementação e verificação final](improvements.md) registra os comportamentos, os 348 novos itens, a migração aditiva e os testes atuais. O catálogo passou a 3.308 itens; as contagens e evidências abaixo preservam o momento da revisão original.

## Principais achados

| Registro | Gravidade | Correção |
| --- | --- | --- |
| [001](issue_001.md) | Alta | Preservar o rascunho escrito durante o salvamento. |
| [002](issue_002.md) | Média | Persistir o apoio de leitura junto com a resposta. |
| [003](issue_003.md) | Alta | Retomar a missão usando a trilha do ano escolar vigente. |
| [004](issue_004.md) | Média | Mostrar orientação quando não há revisões na trilha atual. |
| [005](issue_005.md) | Média | Conter apelidos e tabelas em telas estreitas. |
| [006](issue_006.md) | Média | Levar o foco ao novo enunciado ao continuar. |
| [007](issue_007.md) | Média | Tratar recusas ao solicitar e reenviar códigos. |
| [008](issue_008.md) | Média | Aplicar a desativação do resumo ao lote já selecionado. |
| [009](issue_009.md) | Média | Retornar falha HTTP quando o resumo semanal falha. |
| [010](issue_010.md) | Média | Alertar quando as tentativas de e-mail se esgotam. |
| [011](issue_011.md) | Alta | Aceitar a validade da enumeração dos padrões de paridade. |
| [012](issue_012.md) | Alta | Preservar necessidades essenciais no exercício de orçamento. |
| [013](issue_013.md) | Média | Permitir concluir que não há ultrapassagem nos dez termos. |

Os registros individuais contêm reprodução, causa, alteração e teste correspondente. A mudança em `packages/emails` se limita a observabilidade de falhas finais de transporte e sua documentação; o comportamento de autenticação que evita revelar a existência de uma conta foi preservado.

## Recorrências corrigidas, sem duplicar issues

| Registro anterior | Caso encontrado nesta rodada | Resultado |
| --- | --- | --- |
| [015/004](../reviews-015/issue_004.md) | A sessão interrompida era legível pelo serviço, mas a tela apresentava somente o aviso, sem as respostas. | Componente de respostas compartilhado entre conclusão e interrupção. Avaliação interrompida permite reler a resposta enviada, mantendo a retenção do gabarito. |
| [015/008](../reviews-015/issue_008.md) | `inducao-2-7` pedia localizar a falha da prova dos cavalos sem fornecer o argumento. | Enunciado apresenta os primeiros k, os últimos k e a alegada interseção; o estudante dispõe dos dados necessários. |
| [012/005](../reviews-012/issue_005.md) | Dois erros → acerto → pular questão revivia o alerta familiar. Um novo erro isolado também reaproveitava erros anteriores à recuperação. | A contagem ignora pulos/reflexões e considera somente erros após o último acerto, mantendo a exigência de duas sessões distintas. |
| [002/001](../reviews-002/issue_001.md) | `argumentacao-em-1-8` perguntava o que «basta» para refutar uma afirmação universal, mas recusava falhar para infinitos/todos os n. | Distratores passaram a ser exemplos favoráveis, que de fato não refutam uma afirmação universal. |
| [015/014](../reviews-015/issue_014.md) | Feedback de `polinomios-1-8` dizia «só um valor é zero», embora o polinômio tenha raízes 1, 2 e 3. | Distingue raiz de polinômio nulo usando p(0)=−6. |
| [015/013](../reviews-015/issue_013.md) | `modelos-financeiros-1-8` exigia igualdade entre saldos sem estabelecer capital inicial igual. | Explicita o mesmo capital de R$ 1.000, a taxa e a ausência de aportes, retiradas e custos. |

A comparação entre avaliações também deixou de afirmar que os percursos sempre usam questões diferentes: o banco é fixo e pode repetir itens. O texto orienta comparar estratégias e condições das tentativas, sem apresentá-las como nota oficial.

## Oportunidades priorizadas

As seis propostas foram implementadas após esta revisão. A tabela preserva o diagnóstico e o planejamento originais; as entregas e a evidência final estão no [relatório de implementação](improvements.md).

| Prioridade | Oportunidade e evidência | Próxima entrega concreta | Esforço |
| --- | --- | --- | --- |
| P1 | **Conclusão da trilha.** Simulando todos os itens percorridos e nenhuma revisão vencida, os 14 cursos voltam à primeira missão em modo mission. `recommendation.ts` termina em `lessons[0]`. | Estado explícito de percurso concluído, próxima revisão e opções de aprofundamento; repetir uma missão deve ser uma escolha clara. | Médio |
| P1 | **Recuperação com questões novas.** A autonomia usa a primeira tentativa e famílias variadas. Se o estudante já viu todas as questões de uma habilidade com erros/pistas, repetir respostas não gera nova evidência independente. Essa regra conservadora evita confundir memória com aprendizagem. | Acrescentar itens de transferência e recuperação com famílias reais; explicar ao responsável o que já foi observado e o que ainda falta observar. | Alto, sobretudo autoria |
| P1 | **Representações visuais na avaliação.** A missão 4 de funções promete ler gráficos, mas os oito itens apresentam texto/fórmulas. `espaco-2-6` cobra o número de planificações do cubo. | Gráficos com tabela/descrição acessível e comparação de planificações desenhadas, cobrando interpretação em vez de apenas memorização. | Médio/alto |
| P2 | **Coerência da data de revisão.** A tela apresenta o dia, enquanto o motor conta intervalos a partir do horário. Praticar às 8h no dia exibido pode não avançar uma revisão marcada para 20h. A regra por instante está coberta por testes e não foi alterada sem uma decisão de produto. | Escolher e comunicar uma política: dia de calendário ou horário explícito; alinhar recomendação, tela e teste. | Médio |
| P2 | **Caderno com contexto.** As descobertas são textos livres, limitados a 100 registros por perfil, sem ligação à missão. | Oferecer vínculo opcional com a questão, pesquisa e uma política clara para arquivo/limite; preservar edição e rascunho. | Médio |
| P2 | **Capacidade do resumo semanal.** O job percorre destinatários sequencialmente e carrega o histórico integral por perfil; o cron tem limite de 1.200 segundos. Não foi demonstrada uma pane por volume. | Medir tempo por lote com carga representativa e, conforme resultado, adotar paginação com cursor/checkpoint, mantendo deduplicação e descadastro. | Médio |

As [evidências estruturadas](opportunity-evidence.json) registram o retorno da recomendação nos 14 cursos e o exemplo de data/horário. O cenário de conclusão é sintético e verifica a função de recomendação; não afirma que um aluno real concluiu todos os cursos num dia.

## Abrangência e método

O inventário continua com **14 cursos, 58 habilidades, 291 missões, 28 bancos e 2.960 itens**, sendo 1.705 de escolha, 905 numéricos, 175 de ordenação e 175 de justificativa. O problema original de fração/unidade permanece corrigido e é exercitado pela jornada dos quatro formatos.

Esta rodada aprofundou alternativas, feedbacks, desafios e premissas em argumentação, lógica, polinômios, funções, recorrências, modelos financeiros, equações, geometria plana/espacial, estruturas numéricas, trigonometria e indução, com leitura focal de finanças intermediárias. Também examinou progressão inicial, mudança de ano, recomendação, revisão e recuperação. **Não foi uma segunda leitura manual integral de todos os feedbacks dos 33 packs.** A auditoria estrutural alcançou todo o catálogo; a validação matemática adicional concentrou-se nos achados e contraexemplos.

Na funcionalidade, foram lidos os caminhos de autenticação, propriedade dos dados, perfis, sessões, idempotência, histórico, caderno, laboratórios, relatórios, manutenção editorial, billing compartilhado, webhooks, descadastro e métricas. Os novos testes de navegador exercitam gravação concorrente com edição, apelidos longos, foco, histórico interrompido e limite real de recuperação de senha. Os testes existentes cobrem exploração pública, cadastro/verificação, prática, quatro formatos, laboratório, família, assinatura e troca de perfil.

O review foi confrontado com PRD, techspec, plano comercial e registros das rodadas anteriores. A decisão comercial de disponibilizar conteúdo sem aprovação editorial prévia prevalece sobre o gate do desenho original. Marcações antigas ainda abertas em `_tasks.md` não foram interpretadas isoladamente como funcionalidades ausentes.

| Área de requisito | Conferência nesta rodada |
| --- | --- |
| Disponibilidade, autoria e manutenção | Catálogo completo, hashes, versões, suspensões e exclusões de evidência; sem reinstalar gate editorial. |
| Formatos de resposta e correção | Suíte dos quatro formatos, frações/unidades, testes de alternativas e contraexemplos matemáticos. |
| Progressão e apoio ao estudante | Mudança de ano, leitura assistida, foco, revisão e alertas familiares; oportunidades de conclusão/recuperação documentadas. |
| Jornada familiar e assinatura | Perfis, relatórios, caderno, retomada e testes locais dos fluxos existentes de cobrança; sem transações externas. |
| Acompanhamento e operação | Relatos, exclusão/exportação, descadastro, observabilidade e job semanal. |
| Design e publicação | Responsividade e jornadas em Chromium desktop/celular; publicação e homologação externa não executadas. |

As evidências que sustentam esta rodada são comportamentais: a perda do rascunho foi reproduzida com action e banco reais; o descadastro foi testado entre a seleção do lote e a entrega; os 32 padrões de paridade e as três raízes foram calculados independentemente do gabarito; falha de transporte foi simulada somente na fronteira com o provedor.

## Versionamento e sessões anteriores

O [manifesto](content-changes.json) registra os seis itens e as seis missões com versão incrementada. O desafio de recorrências foi alterado no pack, fora do ledger de itens. Hashes foram atualizados somente depois da leitura das alterações; a auditoria final retornou `PENDENTES=0 REVISADOS=2960 ORFAOS=0`. Os 905 resultados numéricos formatados em português são aceitos pelo corretor.

Sessões já iniciadas mantêm seus enunciados e gabaritos congelados. Textos novos valem para sessões novas; a correção do catálogo não reescreve tentativas anteriores. Eventual invalidação de versões antigas no ambiente publicado não foi executada nesta revisão.

## Verificação

VERIFICATION REPORT
-------------------
Claim: Correções locais verificadas no escopo funcional e de conteúdo descrito.
Command: Comandos completos na tabela abaixo.
Executed: 02/10/2026; última jornada E2E concluída às 11h12, horário de São Paulo.
Exit code: 0 em todos os comandos finais listados.
Output summary: `Tests 210 passed (210)`; `Tests 79 passed (79)`; `16 passed (1.5m)`; `Tests 112 passed (112)`; build `Compiled successfully`; Biome `Checked 242 files. No fixes applied.`; ledger sem pendências.
Warnings: Avisos existentes do PostgreSQL sobre nomes longos de constraints e de cor do terminal (NO_COLOR/FORCE_COLOR); aviso de normalização CRLF/LF na documentação de e-mails.
Errors: Nenhum na execução final. Logs de falha de transporte são esperados nos testes que a provocam deliberadamente.
Verdict: PASS

| Comando | Evidência final |
| --- | --- |
| `pnpm --filter @informach/missao-saber test` | 210 testes, 15 arquivos. |
| `pnpm --filter @informach/missao-saber test:integration` | 79 testes, 20 arquivos, PostgreSQL local descartável removido ao terminar. |
| `pnpm --filter @informach/missao-saber e2e` | 16 jornadas em desktop/celular; inclui build de produção e remoção do banco descartável. |
| `pnpm --filter @informach/emails test` | 112 testes, oito arquivos. |
| `pnpm --filter @informach/missao-saber typecheck` | Exit 0. |
| `pnpm --filter @informach/emails typecheck` | Exit 0. |
| `pnpm exec biome check apps/missao-saber/src apps/missao-saber/e2e apps/missao-saber/test apps/missao-saber/tools packages/emails/src/dispatch.ts packages/emails/src/__tests__/dispatch.test.ts` | 242 arquivos; sem erros e sem ajustes pendentes. |
| `pnpm --filter @informach/missao-saber exec vitest run --config vitest.tools.config.ts tools/full-review-responses.tool.ts tools/advanced-content-audit.tool.ts tools/review-digests.tool.ts` | Três auditorias; zero resultados numéricos corretos rejeitados, zero duplicatas reservadas encontradas, `PENDENTES=0 REVISADOS=2960 ORFAOS=0`. |
| `git diff --check` | Exit 0. |

Os 417 testes das quatro suítes acima incluem os testes existentes. Esta rodada acrescentou nove testes unitários do app, seis de integração e três cenários E2E executados em dois projetos; também fortaleceu dois testes existentes do dispatcher de e-mails.

As execuções vermelhas anteriores comprovaram a perda do rascunho, transbordamento, perda de foco, falhas de continuidade/apoio, envio após descadastro e sucesso HTTP indevido. Durante a validação foi ajustado um cenário de teste: a missão de frações é compartilhada entre as trilhas e deve permanecer aberta; o diagnóstico exclusivo foi usado para exercitar interrupção. Também foi substituído `findLastIndex` por uma operação compatível com a configuração TypeScript existente. Nenhum teste foi removido ou desabilitado para obter aprovação.

Logs locais: `apps/missao-saber/tmp/review16-unit-final.log`, `review16-integration-final.log` e `review16-e2e-final.log`; reproduções backend e testes do pacote de e-mails em `.cache/missao-backend-*.log`. Esses caminhos são evidências temporárias, não dependências do produto. As regressões permanentes estão na suíte normal.

## Limites e aspectos preservados

Não houve deploy, migração de produção, cobrança ou envio externo. Stripe/SendGrid foram exercitados por contratos e transportes locais; sua homologação externa não foi repetida. Chromium com emulação móvel não substitui teclado físico Android/iOS, Safari ou testes com leitores de tela. PWA/offline recebeu leitura de código, sem uma nova homologação completa offline. Não foi feito teste de carga nem certificação formal de alinhamento à BNCC/olimpíadas.

A separação entre gabarito e conteúdo público, os snapshots versionados, as travas por responsável e os bancos descartáveis continuam oferecendo proteção importante. O arquivo pessoal `.claude/settings.local.json`, já modificado antes do trabalho, foi preservado.

A revisão demonstra os defeitos encontrados e a eficácia das correções testadas; não certifica ausência de qualquer outro problema.
