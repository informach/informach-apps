# Stripe: passos manuais para o corte Compasso

Atualizado em 13/11/2026. A pedido do titular, esta sessão apenas documenta o
Stripe; nenhuma API Stripe foi chamada. O plugin Railway está conectado, mas não
substitui a conferência financeira no Stripe. Não enviar chaves pelo chat nem
salvá-las neste repositório público.

## Conferir o catálogo existente

No Dashboard da conta Stripe correta, selecionar primeiro **modo de teste** e
depois **live**, conferindo cada um separadamente. O registro de 11/11 em
[PRODUCAO.md](PRODUCAO.md#stripe-provisionado-em-11112026) já contém catálogo nos
dois modos: procurar esses recursos antes de criar qualquer outro. Os IDs
registrados são históricos; a presença de variáveis no Railway não prova que o
catálogo continue correto ou que sua chave tenha permissão.

| Item | Moeda/valor | Tipo |
| --- | --- | --- |
| Assinatura mensal Compasso | BRL 49,90 | Recorrente mensal |
| Assinatura anual Compasso | BRL 499,00 | Recorrente anual |
| Recarga de 100 créditos | BRL 14,90 | Pagamento único |
| Recarga de 300 créditos | BRL 39,90 | Pagamento único |
| Recarga de 1.000 créditos | BRL 99,90 | Pagamento único |

Confirmar que os cinco preços estão ativos, pertencem ao produto Compasso e
correspondem às variáveis `COMPASSO_*_PRICE` da Conta. Conferir a configuração
exclusiva apontada por `STRIPE_PORTAL_CONFIGURATION_ID`: somente atualização do
meio de pagamento e comprovantes. Cancelamento e troca de assinatura passam pela
Conta, que aplica autorização, períodos pagos e recibos de recuperação.

O teste sem cartão de 14 dias, dois adultos/quatro dependentes, os 20 créditos
do teste e os 200 mensais pertencem ao domínio da aplicação. Não criar um segundo
trial ou franquia no Dashboard para compensar configuração local.

## Conferir credenciais e obrigações antigas

Em `@informach/conta` no Railway, conferir `STRIPE_MODE=prod`, chave live restrita,
os cinco preços e o portal do mesmo modo. Inserir segredos diretamente no
provedor. A chave de runtime precisa atender as operações usadas de customers,
Checkout, subscriptions e subscription schedules e a leitura dos fatos
financeiros; conferir permissões pelo fluxo real. Administração de produtos e
webhooks deve ser feita no Dashboard ou com credencial operacional separada.
Não ampliar a chave da aplicação para acesso total para provisionar o catálogo.

Antes do corte, levantar por pagante os contratos antigos, períodos efetivamente
pagos e suas faturas, faturas abertas, estornos, contestações, pagamentos em
liquidação, Checkouts e agendas pendentes. Conciliar esse inventário com banco,
fila e carteiras, preservando cobertura e saldo. O fim de uma assinatura antiga
não pode antecipar cobrança sobre um período já pago; a maior data paga dos
contratos aceitos deve orientar a continuidade familiar.

O script somente de leitura `scripts/compasso/titular-reconciliation.mts`, descrito
no runbook, gera bloqueios e termina com código 2 quando há divergências. Executá-lo
em terminal autorizado, com credenciais em arquivo privado fora do repositório;
não colar o relatório com dados pessoais em issues, logs públicos ou no chat.
O comando necessita também de acesso seguro ao banco real: a conexão OAuth do
plugin Railway retorna nomes de variáveis, sem revelar seus valores.

Não arquivar preços, apagar clientes ou remover webhooks antigos em lote.
Preservar os contratos e eventos que ainda precisam de conciliação. Edi e
Recreio continuam independentes. Cada adulto aceita pessoalmente o próprio
contrato; o agente não presta esse consentimento nem simula a compra real.

## Cadastrar o webhook quando a Conta estiver pronta

Primeiro concluir DNS/TLS, migrations coordenadas e `/api/ready` da Conta,
mantendo `COMPASSO_BILLING_ENABLED=false`. Depois, em Workbench/Webhooks do modo
correto, cadastrar ou conferir **um único destino da Conta**:

`https://conta.informach.com.br/api/webhooks/stripe`

Usar a versão `2026-04-22.dahlia`, a mesma do provisionador versionado. Selecionar
os eventos abaixo, cuja fonte é `COMPASSO_STRIPE_EVENTS` em
[`stripe-provision.mts`](../../scripts/compasso/stripe-provision.mts):

```text
checkout.session.completed
checkout.session.expired
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
invoice.payment_action_required
invoice.voided
invoice.marked_uncollectible
payment_intent.succeeded
payment_intent.payment_failed
payment_intent.canceled
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
subscription_schedule.created
subscription_schedule.updated
subscription_schedule.released
subscription_schedule.canceled
subscription_schedule.completed
```

Revelar o signing secret desse destino e gravá-lo diretamente como
`STRIPE_WEBHOOK_SECRET` na Conta. Não reutilizar o segredo de outro app, do modo
de teste ou da CLI Stripe. Conferir entrega assinada, persistência e reentrega;
HTTP 200 comprova persistência do trabalho, não concessão de crédito. Erros devem
continuar visíveis e recuperáveis. Não abrir vendas se houver eventos pendentes
ou discrepâncias financeiras.

## Ordem para finalizar

1. Inventário financeiro e conciliação sem bloqueios, restauração do backup real,
   CI verde, DNS e plano Railway revisado. A retirada esperada dos sete crons está
   em [INFRAESTRUTURA.md](INFRAESTRUTURA.md); qualquer outra destruição exige parar.
2. Na manutenção coordenada, parar escritores antigos e aguardar jobs em andamento,
   resolver reservas, obter backup final e somente então liberar o migrator.
3. Implantar Conta e cinco consumidores com vendas desligadas; conferir readiness,
   OIDC e os workers. Configurar o webhook e seu segredo conforme acima.
4. Ativar os jobs centrais e de domínio, confirmar execução em `ops.job_runs`,
   retirar os sete crons financeiros substituídos e atualizar a monitoração.
   Conferir reentregas dos endpoints antigos durante a janela.
5. Reconciliar novamente. Só então liberar a admissão comercial para os titulares
   internos, que formam a família, aceitam os próprios contratos e decidem a
   continuidade. A flag comercial também governa esses novos compromissos.
6. A titular faz uma compra real pequena; conferir Checkout, webhook, conciliação,
   crédito, extrato e ausência de cobrança sobreposta antes de anunciar conclusão.

Para automatizar a conferência em terminal próprio, `stripe-provision.mts --mode
dev|prod` é somente de leitura. `--apply` escreve no Stripe e deve ser uma decisão
explícita do operador. O script é idempotente, mas sua execução não substitui os
aceites, a conciliação histórica ou a compra de homologação. Nesta sessão ele não
foi executado.
