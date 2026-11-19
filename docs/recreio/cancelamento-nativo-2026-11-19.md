# Recreio: cancelamento de renovação no servidor

Schema inicial candidato em `packages/db/src/schema/recreio-renovacao.ts`:
uma operação por assinatura, FK da origem comercial já existente e vínculo
opcional ao encerramento do mesmo solicitante. Aceite, tentativa, observação
e confirmação são fatos separados; confirmação requer resultado/prazo/SHA,
sem lease ativo. Datas finitas e contadores acompanham a primeira tentativa.
Não há escritor, job ou ação pública neste marco. Segue geração pelo GitHub;
nenhum SQL foi criado manualmente ou aplicado em produção.

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
