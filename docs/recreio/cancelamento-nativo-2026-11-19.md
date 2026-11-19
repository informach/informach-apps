# Recreio: cancelamento de renovação no servidor

Aceite/consulta nativos em candidata: login recente irrestrito, próprio contrato
e namespace, ciclo antes da TX, repetição devolvendo o recibo original. Propostas
não enviadas são encerradas junto do aceite; propostas já enviadas exigem seu
conciliador original. A presença do pedido bloqueia novas trocas desse contrato
no servidor e na leitura da tela. Aceitar não chama Stripe nem confirma parada.
O evento estrito `renewal_cancellation_accepted` e a inclusão na cópia pessoal
usam somente os campos declarados; referências do provedor não saem no DTO.
Sete casos nativos e quatro de entrada qualificados em 44617521395 e quality
44617534421/96a9b76a; direitos/upgrade passaram 44617528305. CI compartilhada
44617539778 ainda em curso na última consulta. O provider candidato usa o SDK
fixado, confere cliente/origem/namespace, lê antes de repetir e depois de alterar
somente `cancel_at_period_end`. Data anterior é preservada; agenda/troca ainda
pendente requer conciliação original. Observação não concede acesso. Casos HTTP
novos ainda aguardam gate. Não há action, tela ou worker compostos.

A geração corrigida 44614009506/1270360b foi adotada sem editar os três
arquivos: 0237, 238 recibos candidatos. Prefixo e predecessor conferidos,
todas as tabelas anteriores idênticas e as duas UNIQUEs referenciadas já
presentes. [Proveniência e hashes](evidencias/migracao-renovacao-44614009506.json).
Os quatro testes de integridade preparados usam contrato nativo sintético
conciliado; ainda não provam confirmação no provedor ou ação pública.

A primeira geração 44612780165/809f40b5 foi preservada como evidência, mas
não integrada: a validação de IDs opacos precisava conservar underscores,
também presentes nas fixtures dos adapters existentes. Os três arquivos
gerados foram descartados sem edição e o journal candidato anterior foi
restaurado antes da nova geração. O recibo original marca `adopted=false`.
A validação continua limitada e recusa URLs, caminhos e controle; identidade,
origem e namespace ainda serão conferidos antes de qualquer I/O financeiro.

Schema inicial candidato em `packages/db/src/schema/recreio-renovacao.ts`:
uma operação por assinatura, FK da origem comercial já existente e vínculo
opcional ao encerramento do mesmo solicitante. Aceite, tentativa, observação
e confirmação são fatos separados; confirmação requer resultado/prazo/SHA,
sem lease ativo. Datas finitas e contadores acompanham a primeira tentativa.
O escritor de aceite está descrito acima; job e ação pública continuam pendentes.
Nenhum SQL foi criado manualmente ou aplicado em produção.

Parte do encerramento F7 e da homologação F6. Implementação autorizada no
fechamento da plataforma, sem depender do Morada D3–D8. Nenhuma ativação por
este documento; testes pesados somente no GitHub.

A renovação programada no Stripe pode ser reativada até o fim do período.
O portal financeiro atual admite cancelamento; não basta bloquear um botão no
Recreio para concluir encerramento de conta. A configuração futura será limitada
a dados de pagamento/faturas, com cancelamento controlado pelo servidor. Não
assumir que desativar uma configuração revogue sessões já emitidas: a documentação
consultada não comprova isso. O corte exige inventariar clientes, tentativas e
capacidades antigas antes de admitir encerramentos/vendas.

Referências primárias consultadas por Context7: [cancelamento Stripe](https://docs.stripe.com/billing/subscriptions/cancel),
[configuração do portal](https://docs.stripe.com/api/customer_portal/configurations/create)
e [sessão do portal](https://docs.stripe.com/api/customer_portal/sessions/object).
Manter SDK 22.1.0/API `2026-04-22.dahlia`; exemplos atuais de outra versão não
autorizam atualização automática de dependências.

- [ ] Persistir pedido durável próprio `renewal_cancellations`: pagante, grupo,
  namespace, contrato/compra/origem, revisão/preço/período observados, referências
  privadas do provedor, aceite/login/fonte e estados aceito/tentativa/confirmado/
  conferência. FK composta pode usar `recreio_billing_contract_funding_scope`,
  que já existe. Uma operação de encerramento pode originar o pedido, vinculada
  ao mesmo solicitante/tipo pela UNIQUE de `rights_operations` já existente.
- [ ] Preparar/confirmar com conta nativa recente, inclusive sem jogador e com
  vendas desligadas. Ciclo financeiro antes da TX; escopo relido sob trava;
  nenhuma chamada externa sob travas de linhas. Não usar login do operador ou
  fabricar autenticação do pagante num job.
- [ ] Admitir a tentativa antes do I/O. Provider próprio só cancela renovação
  de cliente/assinatura atuais do Recreio e namespace correto; confere origem,
  preço, agenda, estado e datas. Resposta perdida exige leitura antes de repetir;
  ausência/incompletude é conferência, nunca confirmação. Não criar cobrança,
  crédito, reembolso, pró-rata ou fatura final.
- [ ] Integrar planos futuros já admitidos: não cancelar uma agenda ativa por
  um método que encerre imediatamente a assinatura e retire tempo pago. Ler e
  resolver sua operação original; agendas não iniciadas e ativas exigem seus
  tratamentos próprios. Preservar períodos e fatos financeiros confirmados.
- [ ] Reconciliador técnico com lease, fonte/escopo, repetição idempotente,
  expiração de reserva e falha observável. Impedir novas trocas enquanto a
  interrupção da renovação desse contrato estiver pendente ou confirmada.
- [ ] Tela, ação, estados e cópia pessoal da conta. Faturas/pagamento continuam
  disponíveis no portal restrito, inclusive durante/depois do encerramento.
- [ ] Ampliar a política de catálogo de modo explícito, sem alterar os defaults
  dos demais consumidores de billing. Provisionar/conferir a configuração
  restrita antes do corte; a conta de homologação é isolada de produção.
- [ ] Provar concorrência/revogação, outro pagante/app/namespace, respostas
  perdidas, eventos tardios, agendas, preservação do período pago, interface,
  APIs Sandbox reais e o corte de capacidades antes da ativação. Conectar o
  recibo à coordenação de encerramento; não tratar o pedido como já liquidado.
