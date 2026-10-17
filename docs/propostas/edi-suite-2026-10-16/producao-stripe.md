# Stripe da suíte Edi — provisionamento e homologação

Registro de 17/10/2026. O pedido do usuário autorizou corrigir e colocar o Edi em produção; o provisionamento live abaixo prepara a oferta aprovada, sem executar compra real. Habilitar a cobrança no portal continua dependendo dos gates de implantação e integração registrados na [implementação](implementacao.md) e no [runbook](../../../apps/edi/PRODUCAO.md).

## Recursos conferidos na conta existente

| Recurso | Teste | Live |
| --- | --- | --- |
| Produto único da suíte | `prod_VSOVgv0EXZwI60` | `prod_VSOiS2nwlqzGzq` |
| R$ 49,90 por mês | `price_1URUANCvOctqao30n8WcjuOt` | `price_1URUAaCvOctqao30bJ3W3LFA` |
| R$ 499 por ano | `price_1URUAPCvOctqao30DqZLkYaJ` | `price_1URUAcCvOctqao30JBKtrjMW` |
| Customer Portal exclusivo | `bpc_1URTiECvOctqao30rkA72Dsm` | `bpc_1URTvHCvOctqao30EGUwfJfm` |
| Endpoint snapshot exclusivo | Não criado pelo harness local | `we_1URTvJCvOctqao30FcXEPp5m` |

O endpoint live aponta para `https://edi.informach.com.br/api/webhooks/stripe`, com API `2026-04-22.dahlia` e estes eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created` e `charge.dispute.closed`. O segredo exclusivo foi salvo fora do checkout, para transferência segura ao Railway, sem valor neste documento ou no Git.

O Portal permite consultar faturas, atualizar dados e meio de pagamento, cancelar no fim do período e trocar somente entre os dois preços Edi. Após o pedido explícito de usar o CLI, os recursos existentes foram conferidos pelo Stripe CLI e ambos os produtos receberam `statement_descriptor=Edi Hub`, preço mensal padrão e metadata `app=edi`, `kind=subscription`, `tier=suite`, `catalog=edi-suite-v2`. Não foram alterados produtos, preços, Portal ou webhooks dos demais aplicativos. Nenhuma compra live foi feita. A imagem `https://edi.informach.com.br/images/edi-suite-product.png` aguarda publicação HTTP antes de ser associada aos produtos.

Em 17/10, o usuário aprovou explicitamente R$ 49,90/mês e R$ 499/ano. Foram criados novos preços imutáveis com lookup keys `informach_edi_suite_monthly_v2` e `informach_edi_suite_annual_v2`; o mesmo produto e Portal foram mantidos em cada modo. Os preços iniciais de R$ 29,90/R$ 299 foram arquivados após conferir zero assinaturas live e somente assinaturas de teste encerradas. O preço padrão e a lista permitida do Portal passaram para os novos IDs. O catálogo central, a página pública, a conta e o Hub usam os valores de `packages/config/src/products.ts`. O arquivo local protegido de configuração de produção foi regenerado com os novos IDs e `EDI_BILLING_ENABLED=false`.

A chave live usada permite configurar o catálogo, Portal e webhook, mas a consulta de conta `GET /v1/account` pelo CLI retornou `more_permissions_required`. Nova conferência às 10:42 UTC de 17/10 verificou as duas credenciais live distintas já disponíveis nos apps e na configuração existente do CLI; ambas recusaram a leitura. Não foi possível obter `charges_enabled`, `details_submitted` nem pendências da conta por esses acessos. A ferramenta principal de navegador continuou falhando na inicialização; os acessos alternativos por Chrome DevTools e Playwright abriram o Dashboard, mas ambos exigiram login, sem sessão autenticada disponível. Nenhuma permissão foi ampliada, nenhum login foi iniciado e nenhuma compra live foi feita para contornar a limitação.

Posteriormente, em **17/10/2026**, o titular confirmou no Dashboard em modo produção: **“Pagamentos ativos, sem pendências”**. Essa é a confirmação do titular sobre o estado exibido pelo Dashboard; não equivale à leitura automática dos campos `charges_enabled` e `details_submitted`, que continuou indisponível à chave restrita.

Uma consulta mínima e somente de leitura às cinco cobranças live mais recentes confirmou pagamento real bem-sucedido em **14/10/2026 às 11:43:44 UTC**, na conta compartilhada já usada pelos demais aplicativos. A checagem foi feita às 10:07 UTC de 17/10. Isso comprova processamento recente, sem comprovar o estado atual de `charges_enabled` ou ausência de pendências. Nenhum cliente, cartão, valor ou dado bancário foi incluído na evidência.

## Tooling reproduzível

`pnpm exec tsx scripts/edi/stripe-provision.mts --mode dev` consulta o estado e imprime apenas IDs/configuração pública e mudanças propostas. `--apply` cria os recursos ausentes. O modo `prod` exige chave live; o modo `dev`, chave test. A variável é `STRIPE_SECRET_KEY`, carregada pelo operador a partir do cofre/arquivo local ignorado, sem passar o valor em argumentos ou no chat.

Para preparar o endpoint, adicionar `--webhook-url https://edi.informach.com.br/api/webhooks/stripe --secrets-output <arquivo-fora-do-repositorio>`. O arquivo é criado exclusivamente para o novo segredo; não usar arquivo existente. O script recusa destino dentro do repositório, múltiplos recursos Edi ambíguos, preço divergente e Portal que permita preço alheio à oferta aprovada. A execução repetida reutiliza recursos via metadata/lookup keys e idempotency keys, sem alterar configuração divergente silenciosamente. Um endpoint existente não fornece seu segredo novamente pela API: usar o segredo previamente guardado ou uma rotação deliberada.

`pnpm edi:test:integration --stripe` exige `EDI_STRIPE_TEST_KEY` e executa a homologação real abaixo em PostgreSQL temporário de loopback. Nesse modo, o runner aplica todas as migrations e executa apenas o harness Stripe; o comando sem `--stripe` mantém os testes de banco sem provedor externo. A chave é validada como test antes de qualquer chamada. O script cria clientes sem e-mail no Stripe, usa meios de pagamento de teste e test clocks e exclui somente clientes/clocks identificados pelo próprio `runId`. O catálogo de teste permanece para execuções futuras. O BillingService do harness não tem integração de e-mail.

`pnpm edi:test:integration --stripe-http` também exige a chave de teste, PostgreSQL descartável e o executável `stripe` no PATH. Cria os fixtures via CLI, inicia `stripe listen --latest` com `STRIPE_API_KEY` somente no ambiente do processo filho e recebe HTTP assinado em loopback. O corpo bruto é passado ao mesmo `handleStripeWebhook` usado pelo app. O segredo efêmero do listener é capturado em memória, sem imprimir ou versionar. Esse endpoint de desenvolvimento termina junto ao teste; o webhook live permanente é separado. Não enviar eventos de teste ao portal live nem criar staging apontando ao banco real.

## Evidências de 17/10

`pnpm edi:test:integration --stripe` terminou com exit 0, 11 verificações e limpeza completa no run `d800bb0b-70a9-431c-95f3-b537c4812cc8`, repetido com os preços aprovados de R$ 49,90/R$ 499 após as correções de replay e cancelamento por timestamp:

- Catálogo e Portal restrito validados pela API real; segunda execução do provisionador de teste retornou `changes: []`.
- Criação real de Checkout, reutilização no duplo clique e expiração/abandono sem conceder acesso.
- Primeira assinatura paga em teste, fatura/liquidação lidas pelo adapter e acesso projetado no PostgreSQL.
- Replay de snapshot assinado sem duplicar período pago, evento ou outbox.
- Renovação com test clock estendendo apenas o período efetivamente pago.
- Falha de renovação mantendo somente os fatos financeiros anteriores e retirando acesso em `past_due`.
- Evento ativo antigo não restabelecendo acesso inadimplente após reconciliação.
- Cancelamento por `cancel_at` preservando o período pago e aparecendo na projeção; reativação removendo o agendamento e novo cancelamento sem renovação ao terminar o prazo.
- Reembolso integral suspendendo imediatamente e retirando acesso após leitura financeira.
- Disputa de teste real suspendendo acesso, com suspensão preservada pela reconciliação.
- Assinatura inválida recusada antes de efeitos.

Separadamente, o Checkout hospedado foi preenchido no Chrome com cartão de teste após a mudança de preço: `status=complete`, `payment_status=paid`, assinatura `active`, uma fatura paga de 4990 centavos BRL e retorno observado ao callback HTTP de loopback. O cliente de teste foi removido. Essa evidência cobre a página e o pagamento Stripe, não a jornada de login/licença no serviço publicado.

Às 10:03 UTC, a inspeção do Customer Portal hospedado no Chrome confirmou o plano mensal de R$ 49,90, a alternativa anual de R$ 499,00 e a ausência de outros produtos. O cancelamento foi confirmado pelo navegador e conferido na API: `cancel_at` igual ao fim do período corrente, mantendo a assinatura ativa até essa data. O fixture de assinatura paga foi criado pelo CLI somente em modo teste, e o cliente foi removido ao concluir.

O harness financeiro usa requisições Stripe API `2026-04-22.dahlia`. A conta ainda serializa os objetos da Events API consultados nesse teste com versão histórica `2022-08-01`; esses snapshots foram entregues ao handler real com assinatura local de teste.

`pnpm edi:test:integration --stripe-http` terminou com exit 0 e limpeza completa no run `689df922-944c-498f-b794-13bb701cb859`, também usando os preços novos. O CLI entregou `invoice.paid`, `customer.subscription.created` e `charge.refunded` por HTTP com assinatura autêntica; a primeira compra concedeu acesso, o reembolso suspendeu e revogou acesso, e assinatura inválida retornou 400 sem efeitos. `stripe listen --latest` dessa versão do CLI emitiu snapshots `2026-09-30.endive`; as consultas financeiras do app continuaram em Dahlia. Isso comprova o transporte do provedor até o handler em loopback, sem usar o endpoint live. O endpoint permanente foi criado explicitamente com snapshot Dahlia; nenhuma alteração da versão global da conta foi feita. Conferir o HTTP publicado e as entregas live após implantação continua sendo um gate separado.

Verificações do código: typecheck de `@informach/billing`, `@informach/edi`, `@informach/edi-hub` e tooling Edi; 27 arquivos/205 testes do billing, incluindo regressões de catálogo/Portal e cancelamento programado, e três testes do catálogo central após a alteração de preço. As verificações gerais do monorepo e o deploy ficam no registro principal para não duplicar contagens.

## Correções encontradas

A API omite `features.subscription_update.products` no Portal quando não há expansão explícita. O leitor agora pede `expand: ["features.subscription_update.products"]`; antes, recusava uma configuração correta e bloqueava todo Checkout Edi. O teste reproduz a resposta dependente de expansão e continua recusando preço externo.

A lógica do webhook foi extraída para `webhook-handler.ts` com dependências tipadas. A composição do app continua fornecendo o BillingService e o leitor reais; o harness usa o mesmo handler, banco, assinatura e reconciliação sem carregar as dependências de UI/Next/e-mail no processo de teste.

Um replay de evento adverso já reconciliado ainda reativava a suspensão, apesar de não criar nova outbox. Isso poderia bloquear novamente uma conta recuperada até a próxima reconciliação periódica. A suspensão agora depende da inserção efetiva da outbox na mesma transação. A regressão falhou antes da correção (`suspended false → true`, `revision 1 → 2`) e passou depois; `pnpm edi:test:integration` confirmou OAuth, licença e os sete casos de reconciliação em banco descartável. A execução Stripe real também verificou que replay de reembolso não altera a projeção já reconciliada.

O cancelamento pela página hospedada do Portal retornou `status=active`, `cancel_at` igual ao fim do período pago e `cancel_at_period_end=false`. O leitor financeiro, o provider compartilhado e o webhook agora reconhecem esse timestamp como cancelamento no fim do período, preservando status e tempo pago. Datas customizadas anteriores ou posteriores ao fim desse período não são convertidas indiscriminadamente para o booleano; esse contrato continua representando somente o período atual. A reativação limpa tanto o timestamp quanto o flag legado. A regressão reproduziu a perda do agendamento antes da correção e verifica os dois formatos e as datas fora do período. A [referência do objeto Subscription](https://docs.stripe.com/api/subscriptions/object) distingue data agendada, flag legado e data do pedido de cancelamento.

Referências oficiais: [testes e meios de pagamento de teste](https://docs.stripe.com/testing), [simulações com test clocks](https://docs.stripe.com/billing/testing/test-clocks/simulate-subscriptions), [configuração do Customer Portal](https://docs.stripe.com/api/customer_portal/configurations/create) e [webhooks e versões](https://docs.stripe.com/webhooks).
