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
novos passaram quality 44620033752/8af11a7c. O worker f89b6ac5 passou
commercial-reconciliation 44620899730 e quality 44620905768. Integração geral
44620911792 segue em curso na última consulta. Actions e tela estão em
candidata posterior, ainda sem qualificação.

44619419508/37bec465 apontou falhas de estreitamento TypeScript no provider:
o helper que lança erro precisava de declaração de função explícita para que
o compilador reconhecesse os ramos inalcançáveis. Corrigido sem assertions,
casts ou redução das conferências; a rodada original permanece reprovada.

Worker em candidata: reserva individual de três minutos, ciclo financeiro antes
das TX, tentativa/auditoria antes da rede, confirmação/auditoria/agendamento de
conciliação atômicos e releitura da origem nos dois lados do I/O. Logout não
anula aceite durável; nenhuma sessão é fabricada. Falhas usam enumeração e
backoff até uma hora, sem corpo de erro do provedor. Contadores e datas originais
são conservados. Testes novos de PostgreSQL/SDK incluem concorrência, resposta
perdida, auditoria indisponível e executor antigo; aguardam qualificação remota.

`POST /api/jobs/renovacoes` exige o segredo operacional; conferência/falha parcial
retorna 503. `RECREIO_RENEWAL_JOBS_MODE=off` por padrão, separado do catálogo de
novas vendas e da conciliação geral. Para interromper contratos existentes,
bastam modo/chave Stripe compatíveis (inclusive chave restrita), sem exigir
preços, portal ou webhook. Agenda/alertas e configuração do serviço continuam
pendentes; nada foi habilitado por esta candidata.

A tela candidata apresenta os quatro estados, exige checkbox separado e permite
consultar o mesmo UUID após resposta perdida. O aceite não envia Stripe. Pedidos
e dados financeiros próprios permanecem acessíveis durante o encerramento.
`RECREIO_PORTAL_RENEWAL_MODE=native` seleciona a política de portal somente para
faturas/pagamento; o padrão `legacy` e os demais consumidores não mudam. O aceite
público também exige worker habilitado e SHA de build válido. Homologação precisa
conferir a configuração real e o inventário de capacidades antigas antes do corte.

O provisionador Sandbox pode preparar um portal separado `native-v2`, sem alterar
o `native-v1` existente, via `sandbox_native_renewals=true`; isso não configura o
app nem desativa sessões antigas. A nova jornada usa apenas pré-condições SQL
sintéticas e prova o aceite/browser e a apresentação dos estados, sem afirmar
pagamento ou confirmação remota. Capturas móveis aguardam qualificação/inspeção.

A revisão encontrou três guardas `modo===dev` restantes no envio/recuperação de
aumentos, reduções e cancelamento de agenda. Foram substituídas pela conferência
contra `env.STRIPE_MODE`; as travas, origem/namespace, catálogo e limite de novos
envios permanecem. A composição Live anterior não comprovava esses três fluxos.
Nova qualificação está pendente; não houve ativação Live.

f160b445 passou quality 44622226513 e conciliação 44622231617. A jornada
44622219026 falhou nos quatro casos anteriores de compra por `script-src eval`:
o componente novo importava a versão pelo módulo de schemas Zod. A versão foi
separada em arquivo sem dependências de execução e o navegador passou a usar
somente esse arquivo; os validadores continuam no servidor. Não relaxar CSP nem
filtrar a violação. Repetição remota obrigatória, inclusive jornada de renovação
que a falha anterior impediu de executar. Integração do worker f89b6ac5 passou
44620911792; configuração/agenda de produção continuam intactas.

A repetição 44623222188/a9c052a8 executou as jornadas sem a violação de CSP,
mas a nova jornada falhou num seletor textual ambíguo (estado e data começavam
por “Pedido recebido”). Corrigida para conferir o papel acessível `status` e
seu texto completo, sem retirar a asserção. Nova repetição obrigatória.

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
