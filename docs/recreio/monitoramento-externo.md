# Monitoramento externo do alfa

Decisão de 15/11/2026: o titular não disponibilizou orçamento de uptime no Sentry. Os monitores 10959593/10959594 permanecem desligados. Não aumentar orçamento nem desativar monitores de outros produtos.

## Implementação e aceite

- [ ] `scripts/recreio/monitoramento.mjs`: consultar somente os dois `/api/ready` públicos, sem login, cookies ou banco. Três tentativas com prazo de 10 s, corpo limitado e recusa de redirecionamentos. Registrar somente classificadores, duração e instante.
- [ ] `scripts/recreio/monitoramento.test.mjs`: fixtures HTTP reais no GitHub para prontidão, falha, resposta inválida, limites, prazo, repetição e transporte sanitizado.
- [ ] `.github/workflows/recreio-monitoramento.yml`: verificação a cada cinco minutos e execução manual; sem instalar o monorepo ou acessar arte/dados de famílias. Credenciais de ingestão dos dois projetos Sentry em secrets separados, sem tokens de leitura/administração.
- [ ] Provar prontidão e recebimento dos dois eventos informativos pela execução manual; falhas reais devem reprovar o job e produzir evento de erro com agrupamento estável.
- [ ] Conferir execução agendada após integração na `main` e registrar links/instantes. Não afirmar entrega de notificação humana apenas com ingestão no Sentry.

O GitHub agenda com cadência mínima de cinco minutos, mas pode atrasar ou descartar execuções sob carga. Em repositórios públicos, a agenda pode ser desligada após 60 dias sem atividade. A verificação exige acompanhamento do próprio workflow; não oferece detecção garantida em 60 s. A vigia interna do Bastidores continua necessária. Falhas usam a cota existente de eventos de erro do Sentry; esta solução não cria monitores de uptime nem aumenta orçamento. Falha da ingestão também reprova o job.

Referência do transporte: [protocolo oficial de envelopes do Sentry](https://develop.sentry.dev/sdk/telemetry/envelopes/). O evento tem mensagem, impressão de agrupamento e classificadores fixos. Não contém corpo HTTP, URL visitada por usuário, cabeçalhos, IP, conta, perfil, mundo ou exceção recebida.
