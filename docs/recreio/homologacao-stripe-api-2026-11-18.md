# Recreio — ensaio externo das APIs de cobrança

Candidata operacional, ainda sem prova externa aprovada. A primeira execução
`44346183437`/`20943598` parou na tipagem, antes de criar qualquer recurso:
a validação do ID de preço foi explicitada para retirar `undefined` do tipo.
`sandbox_plans=true` no workflow
Recreio executa `homologar:stripe-agendas` somente no GitHub, com a chave de
teste existente e conta esperada. Antes de criar recursos, confere novamente
o catálogo comum e executa tipos e testes dos adapters de agenda. Não conecta
ao banco de produção nem configura serviços.

O ensaio cria um relógio de teste e um customer sem dados de pessoas reais;
usa o token oficial `tok_visa`. Abre um contrato Família mensal pela API e
exige fatura paga no valor aprovado. Configura a redução para Individual no
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
[limites da automação de interfaces](https://docs.stripe.com/automated-testing).
