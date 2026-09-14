---
status: resolved
file: apps/missao-saber/src/features/family/actions.ts
line: 58
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Encerramento deve alcançar checkouts ainda em aberto

## Review Comment

`clearAction()` considera a cobrança encerrada quando `cancelBillingForSubject()` retorna `failed: 0`, e então apaga a família. Esse método compartilhado consulta apenas as assinaturas já gravadas no banco local (`packages/billing/src/subscriptions.ts:175–193`). Ele não expira sessões de Checkout nem procura assinaturas no provedor que ainda aguardam webhook. Assim, o responsável pode abrir um checkout, voltar ao app, executar “ENCERRAR E APAGAR” e depois concluir o pagamento na aba original. A ação declara cancelamento imediato, mas o checkout continua apto a criar uma assinatura e o webhook a ativa depois da exclusão. Um pagamento já concluído cujo webhook esteja atrasado produz a mesma lacuna. Checkout e exclusão também não compartilham uma exclusão mútua de ciclo de vida.

Coordenar o encerramento com a criação de checkout e com o provedor: impedir novas sessões durante a operação, expirar as sessões abertas deste cliente/app, reconciliar e cancelar assinaturas do provedor antes de concluir a exclusão, e preservar um estado que permita tratar falhas/reentregas sem reativar cobrança após o encerramento. Se o estado externo não puder ser confirmado, manter os dados e informar que o encerramento ainda não terminou. Cobrir checkout aberto, webhook atrasado e concorrência entre iniciar checkout e encerrar, usando adaptador de provedor controlado e banco descartável; não criar cobranças reais.

## Triage

- Decision: `VALID`
- Notes: Correção final relida: encerra checkouts/assinaturas no provedor com paginação, limpa intenções futuras antes do cancelamento e registra `closedSubscriptionIds` persistentes no cliente de cobrança. O guard opt-in ignora eventos dessas assinaturas, inclusive em invoices, e permanece após recriar a família; webhook, checkout e encerramento compartilham a coordenação. Integrações independentes PostgreSQL aprovaram concorrência do mesmo responsável, recusa de checkout sem família, assinatura ainda não projetada, eventos ativos atrasados e acesso gratuito após recriar a família. Última execução: 13/09/2026 11:43:15 America/Sao_Paulo, 14 testes, exit 0, banco removido. Provedor de fechamento foi controlado no teste; nenhuma cobrança real executada. O problema de capacidade do pool descoberto em F5 está registrado separadamente em reviews-005/issue_001.
