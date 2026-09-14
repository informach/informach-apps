---
status: resolved
file: packages/billing/src/sweepers.ts
line: 437
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Reconciliar o plano efetivo após uma mudança no Portal

## Review Comment

O novo Portal específico do Missão Saber permite mudar Individual/Família. Se o webhook `customer.subscription.updated` dessa alteração não for aplicado, `reconcileSubscriptionStatuses` consulta apenas `retrieveSubscription`, cujo resumo contém status, fim do período e cancelamento. Não compara nem restaura `providerPriceId` ou `productId`. Um upgrade Individual mensal para Família mensal pode manter exatamente esses três campos; o sweeper retorna sem nenhuma atualização e o app continua limitando a família a um perfil apesar da cobrança maior. O downgrade inverso conserva três perfis e a identificação incorreta do plano. Repetir os jobs não recupera esse estado.

Reconciliar o preço efetivo e o produto do catálogo dedicado usando `retrieveSubscriptionDetails`, já disponível no provider, e os preços do modo configurado. Resolver pelo preço remoto, não por `metadata.product_id` antiga. Manter a checagem de pertencimento ao cliente/app e a releitura sob o lock de ciclo de vida. Um preço não reconhecido não deve gerar um entitlement fabricado. Ainda é necessário aceitar revogação/cancelamento remoto desse preço; porém um local `incomplete`/`unpaid` não pode virar `active`/`trialing` mantendo o produto antigo quando o novo preço é desconhecido. Adicionar testes para mudança de plano/período iguais e webhook omitido, preço estranho sem nova concessão e cancelamento remoto com preço estranho.

Esta raiz é diferente do escritor sem lock corrigido na rodada 007: o lock atual é preservado, mas falta informação de preço/plano no contrato usado pela reconciliação.

## Triage

- Decision: `VALID`
- Notes: Corrigido com leitura de detalhes remotos, resolução pelo preço do modo vigente e atualização do produto/preço dentro do lock de ciclo de vida. Preço desconhecido gera erro observável e impede ativação/renovação de estados Pro; estados revogatórios continuam aplicados. O teste PostgreSQL percorre 23 assinaturas, recupera o plano com metadata obsoleta, rejeita 23 ativações de preço desconhecido e confirma cancelamento sem Pro.
- Verification: Delta e teste relidos na revisão independente final; integração de 30 testes aprovada pelo agente principal após o guard final; check independente de 13 arquivos aprovado. Ver [relatório](../reviews/production-architecture.md).
