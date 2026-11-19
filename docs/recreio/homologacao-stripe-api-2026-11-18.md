# Recreio — ensaio externo das APIs de cobrança

Candidata operacional. A primeira execução
`44346183437`/`20943598` parou na tipagem, antes de criar qualquer recurso:
a validação do ID de preço foi explicitada para retirar `undefined` do tipo.

`44346637491`/`63bebd25` concluiu o ensaio externo: Família mensal pago em
R$ 127,90, agenda idempotente no mesmo contrato, renovação Individual paga em
R$ 59,90, cancelamento efetivo, estorno inicial reconhecido pelo leitor comum
e limpeza confirmada. Artefato baixado com tamanho e SHA-256 conferidos e
recibo inspecionado: [evidência](evidencias/stripe-api-agendas-44346637491.json).
Essa prova cobre a API e os recursos sintéticos descritos abaixo.

`sandbox_plans=true` no workflow
Recreio executa `homologar:stripe-agendas` somente no GitHub, com a chave de
teste existente e conta esperada. Antes de criar recursos, confere novamente
o catálogo comum e executa tipos e testes dos adapters de agenda. Não conecta
ao banco de produção nem configura serviços.

O ensaio cria um relógio de teste e um customer sem dados de pessoas reais;
usa o token oficial `tok_visa`. A versão aprovada abriu Família mensal pela API.
A candidata seguinte começa em Individual e acrescenta upgrade proporcional
com `pending_if_incomplete`: `tok_chargeCustomerFail` provoca falha de cobrança,
o preço antigo precisa permanecer, e o replay deve apontar à mesma fatura.
Depois quita a fatura com o método de teste válido e exige aplicação/pagamento
compatíveis com a prévia no mesmo segundo de proporcional. Essa extensão passou
em `44348172426`/`3f725d4f`: Individual inicial R$ 59,90, proporcional quitado
de R$ 68,00 depois da recusa, replay na mesma fatura, redução/renovação posterior,
cancelamento efetivo, estorno inicial detectado e limpeza confirmada. Artefato
de 1.404 bytes baixado com SHA-256 conferido e recibo inspecionado:
[evidência do upgrade](evidencias/stripe-api-upgrade-44348172426.json).
Trocas que mudam periodicidade, créditos remanescentes de anual e suas origens
financeiras ainda exigem casos e conciliação próprios. Esta prova é mensal.

O ensaio configura a redução para Individual no
mesmo contrato com `createStripeRecreioPlanSchedules`, verifica replays e
avança o relógio. Exige a fase efetiva, a fatura renovada no valor aprovado e
a origem inicial preservada. Depois agenda cancelamento no fim pago, avança
até sua execução e estorna o pagamento inicial. O leitor financeiro comum
precisa detectar os períodos e o estorno real de teste.

A origem usada é uma fixture identificada como `provider_fixture`; não existe
compra ou aceite correspondente no app. O recibo registra explicitamente
`nativeCheckoutCompleted=false`, `nativePlanChangeAccepted=false` e
`nativeGameAccessProven=false`. Este ensaio da API não conclui a homologação
do Checkout hospedado, das telas, da seleção familiar, do worker nativo ou da
entrega de webhook. O CAPTCHA do Checkout continua pendente de validação humana.

O inventário do próprio relógio/customer é limitado e validado por modo e tag
da execução antes de limpar. Agendas ativas são liberadas, contratos pendentes
cancelados sem nova cobrança e o relógio excluído com confirmação. Falha de
limpeza preserva a falha original. Artefatos guardam só IDs de correlação,
estados, valores da tabela aprovada e origem da fonte; erros usam tipos,
códigos e nomes de parâmetros, sem respostas integrais ou URLs financeiras.

Fontes primárias: [relógios de teste](https://docs.stripe.com/billing/testing/test-clocks),
[métodos sintéticos e recusa após anexar](https://docs.stripe.com/testing#declined-payments),
[limites da automação de interfaces](https://docs.stripe.com/automated-testing).
