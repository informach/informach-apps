# Encerramento financeiro Compasso

Plano técnico em execução, 10/11/2026. O corte interno dos dois desenvolvedores continua separado do recurso permanente de encerramento da conta. Nenhuma chamada de cancelamento real foi feita neste incremento.

## Implementação local atual

`billing/closure` e `account/closure-billing` agora implementam a etapa permanente do Compasso, ainda em validação integrada e sem jobs/rota pública. A **0149_compasso_closure_receipts**, gerada pelo Drizzle, acrescenta somente os recibos financeiros por operação/cliente: ator, revisão congelada, impressão do escopo e confirmação. Não é uma segunda fonte de consentimento; o coordenador continua dono da autorização e das posses. Recibos já concluídos permitem repetir uma etapa interrompida sem repetir cancelamentos ou conceder créditos novamente.

A seleção inclui contas do pagante em famílias anteriores, mesmo sem cliente Stripe; não confunde o outro adulto com o pagante. Usa páginas de 100, conserva os identificadores de conta/destino e não incorpora saldo mutável ao hash. Reserva ativa do ator, mesmo vencida ou oriunda de bônus sem cliente no provedor, impede conclusão. Reserva de outro adulto na mesma carteira não é apropriada pela operação.

O executor compartilha a conciliação atual de assinatura/plano e a liquidação de recargas. Recupera solicitações admitidas com suas chaves e validade originais, solicita cancelamento de mudanças futuras, encerra os objetos remotos e relê os fatos. Só grava o recibo quando não há checkout, recarga, pagamento ou alteração pendente, nem assinatura renovável. A etapa PostgreSQL final fecha o mandato comercial e mantém contratos históricos, períodos pagos, créditos, extrato e destinatário de pagamentos tardios. As franquias mensais de um período anual pago continuam cobertas depois do cancelamento.

Clientes e fatos legados são preservados. Qualquer contrato, checkout ou pagamento legado ainda pendente bloqueia a preparação para revisão financeira: os seis contratos internos serão conciliados/encerrados no corte operacional finito já autorizado. Esse tratamento evita restaurar o motor de migração comercial gradual retirado após o esclarecimento do titular. A homologação do corte deve comprovar que não há renovação antiga antes de habilitar o encerramento público.

Desistir antes do consentimento não chama o provedor e não fecha o mandato. Dependências Stripe são resolvidas somente quando existem clientes Compasso a encerrar; conta sem cobrança não precisa de Stripe configurado. Desabilitar vendas não deve impedir manutenção financeira: a composição dos jobs ainda precisa separar esses acessos do bloqueio de checkout.

## Fronteiras

- O coordenador `account/closure` autoriza a etapa após consentimento; billing seleciona clientes/contas do próprio pagante pelo contrato de `personal-scope.ts`. Ser membro de uma família não autoriza encerrar a cobrança de outro pagante. Produtos independentes ficam fora.
- O domínio billing não deve importar o coordenador account, do qual já é dependência. Primitivas financeiras recebem autoridade congelada de servidor e retornam inventário/recibo financeiros; a composição account traduz esses resultados ao contrato genérico de etapas.
- Preparação é leitura sob revisão/operação exatas. Sua impressão identifica clientes, contas e destinos de crédito; não inclui conteúdo, dados de cartão ou segredo. Saldo de uma carteira familiar preservada não deve invalidar o plano quando outro adulto usa créditos legitimamente.
- Encerramento desativa renovações e novas operações comerciais desse pagante. Períodos pagos, créditos e proveniência financeira permanecem; não fazer estorno, reembolso, expiração nova ou apagamento de extrato. O Compasso já resolve cobertura e concessão mensal por períodos financeiros, inclusive contratos cancelados.

## Implementação seguinte

1. Inventariar em páginas os clientes web próprios, contas Compasso, pedidos de checkout/recarga, mudanças programadas e reservas. Guardar apenas IDs/versões e impedimentos na prévia; usar as mesmas fontes existentes, sem duplicar regras de propriedade.
2. Na execução confirmada, serializar por conta comercial com o mesmo lifecycle lock usado por checkout/plano. Revalidar a autoridade congelada antes do trabalho externo. Recuperar pedidos com resposta perdida antes de concluir que não houve pagamento; prazo local vencido não comprova ausência de captura.
3. Resolver mudanças de plano em curso, inclusive criação de schedule com resposta perdida. A lista remota precisa incluir schedules `not_started` e `active`, checkouts abertos e contratos ainda ausentes da projeção local. Cancelamento remoto não gera fatura final nem proração. Falha/corrida não certifica fechamento; repetir com o mesmo escopo e idempotência.
4. Reconciliar fatos reais após cancelamento. Não reutilizar indiscriminadamente `closeRemoteBillingForSubject`: sua atualização local marca todos os contratos como cancelados e foi concebida para outra integração. O adapter Compasso deve preservar os estados históricos e períodos pagos, fechar a conta comercial adequada e conservar os destinos das recargas tardias.
5. Reservas de IA do ator precisam estar resolvidas antes do recibo. Prazo expirado ainda com status ativo bloqueia; liberação precisa passar pelo motor financeiro. Nunca liberar a reserva de outro adulto só porque o pagante encerrou sua participação. A retomada anterior ao consentimento não cancela contratos nem fecha contas comerciais.
6. A etapa PostgreSQL final verifica a mesma seleção, fatos conciliados e ausência de operações pendentes. Efeitos/recibo são atômicos no coordenador. Família só desvincula depois dos recibos de billing e dos cinco apps. Auditoria não inclui mensagens cruas do provedor.

Revisar a ordem de travas com concessão mensal (`subscription → wallet`) e gasto (`wallet → family → participation`), sem executar I/O externo em transações longas. O bloqueio comercial por conta deve abranger leitores/reconciliadores que criam schedules, para impedir recriação após o cancelamento.

## Evidência parcial

O provider `closeCustomerSubscriptions` agora percorre schedules futuros/ativos além de checkouts e assinaturas, com iteração paginada, orçamento operacional e timeout por chamada. Os parâmetros `invoice_now: false` e `prorate: false` são explícitos também para schedules: os defaults desses endpoints não são iguais. A implementação usa Stripe 22.1.0/API `2026-04-22.dahlia`, preservando o lockfile.

Três testes na fronteira HTTP do SDK instalado passaram: 107 checkouts, 103 schedules, cancelamento sem fatura/proração, repetição sem nova mutação e falhas concorrentes de checkout/schedule. Log `.codex-compasso-stripe-closure-schedules.log`. Essa evidência do provider é distinta da validação do adapter financeiro e não muda contratos reais.

Referências conferidas pelo Context7 contra os tipos instalados: [cancelamento de schedules](https://docs.stripe.com/api/subscription_schedules/cancel), [liberação de schedules](https://docs.stripe.com/api/subscription_schedules/release) e [cancelamento de assinaturas](https://docs.stripe.com/api/subscriptions/cancel). Liberar um schedule deixa sua assinatura ativa; não substitui encerrar as renovações.

## Gates restantes

Admissão comercial e congelamento foram serializados pela mesma chave por ator. O helper de cobrança adquire essa chave junto com a da conta em uma única conexão de coordenação; não aninhar helpers, pois isso poderia esgotar o pool de duas conexões. A transição de participação espera a operação previamente admitida registrar seu resultado; uma compra posterior observa a participação congelada e é recusada. Reconciliação de obrigações existentes continua usando a trava da conta. A barreira foi verificada em PostgreSQL real, incluindo a espera observada em `pg_blocking_pids` e quatro atores concorrentes. Gate de 10/11: billing 67/13, account 23/4 e auth 30/5; banco descartável removido. Tipos de db/auth/billing passaram. Logs `.codex-compasso-commercial-freeze-pg.log` e `.codex-compasso-commerce-freeze-types.log`.

PostgreSQL real: titular versus outro adulto, grupos anteriores, mais de uma página, reservas órfãs, pagamento tardio, franquia anual após cancelamento, crédito preservado e recibos idempotentes. Fronteira Stripe: schedule sem projeção, falha entre efeito e confirmação, perda de resposta e corrida de checkout. Coordenador: retomada sem cancelamento, posse vencida, tentativa duplicada, confirmação antiga e nenhum efeito sobre Edi. Depois, revisão integrada e homologação Stripe de teste; o corte live continua sendo a etapa operacional final.

### Rodadas de banco de 10/11

A primeira rodada teve billing **72 aprovados/1 timeout** em um teste anterior de inventário de saída, limite de 5 segundos. A repetição ampliada passou **75/14** em billing, incluindo outro adulto, período anual após cancelamento, resposta perdida, recarga paga/tardia, reserva antiga sem cliente Stripe e 102 contas históricas. Account passou **24/25**, com timeout de 5 segundos no caso anterior de solicitações concorrentes. Os novos casos de retomada sem provedor e composição financeira/familiar passaram; o gate conjunto ainda não está aprovado. Dois casos adicionais de recuperação de schedule foram escritos depois dessa rodada e aguardam execução. Tipos billing/account passaram; log `.codex-compasso-financial-closure-types.log`.

Durante a investigação, a máquina tinha cerca de 740 MB livres e uma operação `pack-objects` de `artes-3d` usava aproximadamente 5,8 GB. Mais tarde havia cerca de 420 MB livres. Esse trabalho externo foi preservado. A pressão de memória foi observada, mas não foi estabelecida como causa exclusiva dos timeouts. Não foram aumentados os limites, desabilitados testes ou reduzidas garantias. Repetir a verificação serial com evidência de recursos; a homologação integrada permanece pendente.

A repetição serial passou: **77/14 em billing** e **25/4 em account**, logs `.codex-compasso-financial-billing-repeat-pg.log` e `.codex-compasso-financial-account-repeat-pg.log`. Os dois casos de schedule também passaram. A regressão unitária financeira passou **239/32**, log `.codex-compasso-financial-unit-regression.log`. Depois da 0150, a rodada conjunta passou **78/14 e 27/4**, incluindo recibos por seleção revalidada; detalhes em [retomada](encerramento-retomada.md). As falhas anteriores permanecem registradas, sem alteração dos limites dos testes.

Na Conta, admissão de vendas e manutenção foram separadas: cancelar compromissos, conciliar fatos e receber webhooks não dependem de `COMPASSO_BILLING_ENABLED`, mas exigem suas credenciais. Novos compromissos continuam bloqueados. Configuração live segue recusada no ambiente local mesmo com a flag desligada. Conta passou **29 testes em cinco arquivos** e typecheck, logs `.codex-compasso-conta-maintenance-unit.log` e `.codex-compasso-conta-maintenance-types.log`. A interface ainda precisa de novo ensaio visual após a composição pública do encerramento.
