# Evidências da implementação

Execuções em 11/09/2026, America/Sao_Paulo; alguns arquivos usam UTC já em 12/09. Banco e app locais, contas fictícias e e-mail sandbox/memória. O [README da revisão](README.md) preserva a linha de base anterior.

## Automação

| Verificação | Comando/ambiente | Resultado observado |
| --- | --- | --- |
| App | `pnpm --filter @informach/agenda-da-turma test` | 478/478, 36 arquivos; execução final às 21:48. |
| Auth / billing / e-mail | `test` dos três filtros, em execução conjunta | 216/216, 185/185 e 106/106. |
| Tipos | `typecheck` dos filtros agenda-da-turma, auth, billing, emails e db | Exit 0 nos cinco; checagem adicional do app e no build. |
| PostgreSQL | `pnpm --filter @informach/agenda-da-turma test:integration` | 16/16; última execução às 21:48, após proteção da identidade compartilhada com outros apps. |
| Modelo real | `AGENDA_RUN_AI_EVAL=1`, `test:ai-eval` | 15/15, `openai/gpt-4o`, cerca de 32 segundos no corpus. |
| Navegador | `playwright test --config playwright.routine.config.ts` | 1/1, cerca de 1,4 minuto; Edge/Chromium, 390 × 844, duas contas e dois contextos. |
| Build | `build` do app, NODE_ENV=production, URLs HTTPS coerentes, Redis configurado | Exit 0; compilação final em 85 s, TypeScript em 24,6 s, rotas geradas. |
| Formatação | Biome nos arquivos afetados do app e packages; `git diff --check` | Sem erros; verificação final após os ajustes. |
| Runner | `routine:job`, com segredo de cron e app locais | Um lote, zero destinatários habilitados, zero envio/falha. Entregas são verificadas na integração com e-mail em memória. |
| Métricas | `pnpm --filter @informach/agenda-da-turma pilot:report` | Exit 0; dados locais sintéticos e nenhuma fatura paga no resultado. |

Os primeiros testes de navegador encontraram timeout da compilação a frio, seletor de teste inadequado e reaproveitamento de input controlado entre etapas. Ajustados o timeout local, o seletor por papel acessível e a identidade dos formulários, o cenário passou. Não houve relaxamento de autenticação, CSP ou autorização.

## Fluxos observados

1. Cadastro, OTP, Free e criança somente com nome. Um comunicado fictício gerou autorização em 16/09/2026, passeio em 18/09/2026 às 08h e material sem prazo, marcado a confirmar. Revisão e gravação de três providências pelo navegador.
2. Repetição do POST retornou `replay: true` e `alreadyConfirmed: true`, com o mesmo recado. Ledger posterior: uma concessão de cinco créditos, um consumo de um crédito e uma reserva confirmada. Nenhum segundo débito.
3. Titular Pro sintético e convidado Free verificado: convite apenas para criança A; criança B não apareceu ao convidado. Conclusão ficou visível ao titular, revogação removeu leitura e a exclusão só aconteceu após o link de e-mail sandbox.
4. Downgrade preservou histórico. Exportação retornou perfis próprios e seções de atividades/recados, sem tokens privados ou bytes dos anexos.
5. Enter e espaço abriram o detalhe do item existente no calendário; Escape fechou e devolveu o foco ao botão de origem.
6. CSP enforced presente no header local, com nonce no HTML. O cenário familiar não gerou violações CSP, erros de página, hidratação ou troca de input controlado. Fora do cenário houve aviso de preload de CSS no desenvolvimento; não constitui medição de performance de produção.
7. Conferência adicional da exclusão após incluir o alcance Informach: digitar EXCLUIR sem marcar entendimento manteve o botão desabilitado; marcar entendimento habilitou a solicitação. O link de e-mail excluiu a conta sintética original. Teste no PostgreSQL confirmou que uma assinatura ativa em outro app bloqueia a exclusão e preserva o plano Agenda.

## Artefatos

- [Rotina móvel](implementation-routine-mobile.png).
- [Histórico após conclusão pelo segundo adulto](implementation-family-mobile.png).
- [Oferta e demonstração em desktop](implementation-offer-desktop.png).
- [Saídas do corpus sintético](implementation-ai-evaluation.json): ações, datas, alertas, duração e tokens, sem conteúdo escolar real.

Capturas inspecionadas visualmente, sem rolagem horizontal em 390 px. Incluem controles do servidor de desenvolvimento. A navegação inferior é fixa ao viewport; na captura da página inteira pode aparecer antes do fim do documento.

## Limites

O build otimizado passou. Servi-lo localmente com `next start -p 3012` foi rejeitado pela revisão automática de aprovação, com o único motivo `blocked by policy`. Não houve tentativa de contornar o bloqueio. Os testes de navegação usaram o servidor de desenvolvimento já em execução, com CSP ativada; runtime de produção fica para homologação.

Não foram medidos Core Web Vitals em aparelho representativo, entrega push real, entrega live do SendGrid, compra/renovação Stripe ou conectores institucionais. O corpus confirma os casos de regressão definidos; não comprova precisão em documentos reais, disponibilidade operacional ou disposição de pagar. Procedimentos em [OPERACAO.md](../OPERACAO.md), [PILOTO.md](../PILOTO.md) e [INTEGRACOES.md](../INTEGRACOES.md).
