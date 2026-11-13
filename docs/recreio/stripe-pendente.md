# Recreio — o que falta fazer no Stripe

Pedido do titular em 13/11/2026: documentar, sem executar configurações no Stripe. Nenhum recurso Stripe foi consultado, criado ou alterado nesta frente.

O alfa fechado usa concessões auditadas; não precisa de cobrança. A integração comercial pertence ao Marco 2 e ainda exige código no Recreio: cadastrar produtos no Dashboard não cria Checkout, portal de cobrança ou endpoint de webhook no aplicativo. Recreio e Morada continuam fora do Compasso e da Suíte Edi.

## Catálogo a conferir e provisionar

Referência vigente: [`PRODUCTS`](../../packages/config/src/products.ts), quatro entradas com `price_TODO_recreio_*`. Os valores abaixo são os do catálogo atual, não evidência de preços existentes no provedor.

| Plano / ID interno | Valor BRL | Recorrência | Cobertura |
| --- | ---: | --- | --- |
| `recreio_individual_monthly` | R$ 59,90 | mês | Um perfil |
| `recreio_individual_annual` | R$ 599,00 | ano | Um perfil |
| `recreio_family_monthly` | R$ 127,90 | mês | Até quatro perfis simultâneos |
| `recreio_family_annual` | R$ 1.279,00 | ano | Até quatro perfis simultâneos |

Quando começar a implementação comercial:

1. Conferir conta Stripe, modo de teste/live e os valores/condições aprovados. Reutilizar a conta existente; não alterar produtos, contratos, webhooks ou clientes de Compasso/Edi.
2. Inventariar produtos/preços existentes antes de criar. Preparar dois produtos, Individual e Família, cada um com preços mensal/anual em BRL. Não criar duplicatas se já existirem recursos correspondentes.
3. Registrar os quatro IDs `price_...` de teste e os quatro IDs live separadamente nas entradas corretas do catálogo. O código rejeita `price_TODO_*`. Os produtos Recreio ainda não registram variáveis próprias de preço: é necessário atualizar o catálogo ou implementar esse contrato de variáveis com testes, antes de documentar nomes como se já funcionassem.
4. Conferir situação fiscal, dados comerciais e conta bancária no Dashboard antes de vendas live. Não inferir que estejam validados porque outros produtos usam a mesma conta.

## Código que precisa existir antes de configurar o webhook

- Checkout com preços do catálogo validados no servidor, ator/perfil e cobertura conferidos. Não aceitar preço ou tier arbitrário do navegador.
- Gestão/cancelamento de assinatura e Customer Portal, com retorno para a origem do Recreio.
- Endpoint próprio de webhook, consumindo os contratos de `@informach/billing`, verificando o corpo bruto e `stripe-signature`, com processamento idempotente e isolamento `app=recreio`. O Recreio ainda não expõe essa rota: não cadastrar um endereço que retorna 404, nem usar o endpoint da Conta/Edi.
- Mapeamento entre customer, assinatura, pagante e perfis Recreio; conciliação, inadimplência, revogação e regras de troca Individual/Família. Não transformar a concessão do alfa em assinatura automaticamente.
- Regras explícitas para cancelamento, reembolso e contestação; integrar os eventos financeiros pertinentes sem conceder acesso só pela resposta do Checkout. `decidirAcesso` continua sendo a decisão de acesso.

O handler compartilhado fica em [`packages/billing/src/webhooks`](../../packages/billing/src/webhooks/index.ts). A existência desse handler não significa que a composição HTTP/comercial do Recreio esteja pronta.

## Configuração no Dashboard e no Railway, depois do código

1. Registrar a URL HTTPS real do endpoint de webhook do Recreio, após implantá-lo e conferir o roteamento. Anotar o caminho efetivamente implementado no runbook.
2. Assinar os eventos exigidos pela composição: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`; incluir os eventos de reembolso/contestação previstos pelas regras financeiras implementadas. O Stripe filtra por tipos, não por aplicativo: o handler precisa ignorar com segurança eventos de clientes/assinaturas sem vínculo ao Recreio.
3. Guardar a chave da API, o segredo de assinatura `whsec_...` desse endpoint e o ID da configuração do Customer Portal somente no provedor. Os nomes convencionais compartilhados são `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `STRIPE_PORTAL_CONFIGURATION_ID`; a composição/env/IaC do Recreio ainda precisa incorporá-los. Segredos de teste e live e segredos de endpoints diferentes não são intercambiáveis.
4. Criar uma configuração do Customer Portal que permita apenas os produtos/opções Recreio homologados. Conferir comportamento de cancelamento e troca de plano; não reutilizar silenciosamente a configuração de outro produto.
5. Ativar vendas somente depois da homologação e da liberação comercial/jurídica. Não mudar `RECREIO_ACCESS_MODE` como substituto da integração: essa variável muda a apresentação, não concede direito de jogar.

## Homologação necessária

Em Stripe de teste e com contas isoladas: assinatura mensal/anual dos dois tiers, pagamento recusado, autenticação adicional quando exigida, renovação, cancelamento, troca de plano, inadimplência/recuperação, reembolso/contestação e entrega duplicada/fora de ordem do webhook. Conferir assinatura inválida, replay idempotente, isolamento entre apps e acesso decidido pelo estado persistido. Não cobrar cartão real para ensaiar.

Registrar IDs públicos de produto/preço, modo consultado, URL do endpoint e resultados sem chaves, dados pessoais ou dados de cartão. Somente depois espelhar a configuração live e conferir a primeira entrega assinada. Até lá, manter os placeholders e a cobrança indisponível, preservando o acesso por concessão auditada do alfa.
