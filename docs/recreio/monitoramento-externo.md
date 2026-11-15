# Monitoramento externo do alfa

Decisão de 15/11/2026: o titular não disponibilizou orçamento de uptime no Sentry. Os monitores 10959593/10959594 permanecem desligados. Não aumentar orçamento nem desativar monitores de outros produtos.

## Implementação e aceite

- [x] `scripts/recreio/monitoramento.mjs`: consultar somente os dois `/api/ready` públicos, sem login, cookies ou banco. Três tentativas com prazo de 10 s, corpo limitado e recusa de redirecionamentos. Registrar somente classificadores, duração e instante.
- [x] `scripts/recreio/monitoramento.test.mjs`: fixtures HTTP reais no GitHub para prontidão, falha, resposta inválida, limites, prazo, repetição e transporte sanitizado.
- [x] `.github/workflows/recreio-monitoramento.yml`: verificação a cada cinco minutos e execução manual; sem instalar o monorepo ou acessar arte/dados de famílias. Credenciais de ingestão dos dois projetos Sentry em secrets separados, sem tokens de leitura/administração.
- [x] Provar prontidão e recebimento dos dois eventos informativos pela execução manual; falhas reais devem reprovar o job e produzir evento de erro com agrupamento estável.
- [ ] Conferir execução agendada após integração na `main` e registrar links/instantes. Não afirmar entrega de notificação humana apenas com ingestão no Sentry.

O GitHub agenda com cadência mínima de cinco minutos, mas pode atrasar ou descartar execuções sob carga. Em repositórios públicos, a agenda pode ser desligada após 60 dias sem atividade. A verificação exige acompanhamento do próprio workflow; não oferece detecção garantida em 60 s. A vigia interna do Bastidores continua necessária. Falhas usam a cota existente de eventos de erro do Sentry; esta solução não cria monitores de uptime nem aumenta orçamento. Falha da ingestão também reprova o job.

Referência do transporte: [protocolo oficial de envelopes do Sentry](https://develop.sentry.dev/sdk/telemetry/envelopes/). O evento tem mensagem, impressão de agrupamento e classificadores fixos. Não contém corpo HTTP, URL visitada por usuário, cabeçalhos, IP, conta, perfil, mundo ou exceção recebida.

## Evidência

Candidato `41b9d8ec`: [sete testes aprovados](https://github.com/informach/informach-apps/actions/runs/43713305550). [Prova manual 43713356684](https://github.com/informach/informach-apps/actions/runs/43713356684) às 12:20 UTC de 15/11: Recreio pronto em 302 ms e Morada em 269 ms, ambos na primeira tentativa. Recebimento dos eventos `d202fdf99ca14a0081be2cee6db4f1f5` e `efe55a7889cf4d0bb75adb71254c46e5` confirmado pela consulta ao Sentry. Isso comprova a ingestão; não comprova entrega de notificação a uma pessoa. Execução agendada aguarda integração na `main`.
