---
status: resolved
file: apps/missao-saber/src/features/billing/repository.ts
line: 26
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Reservar locks fora do pool usado pelos callbacks

## Review Comment

Na versão inicial de `withBillingLifecycle()`, cada operação reservava uma conexão de `db.transaction()` para manter o advisory lock, mas chamava `operation()` sem passar essa transação. Os callbacks reais de checkout, webhook e exclusão usam o `db` global novamente. O pool de consultas tem `max: 10` (`packages/db/src/client.ts`). Dez responsáveis distintos podem ocupar suas dez conexões com transações que aguardam consultas no mesmo pool; essas consultas não conseguem uma conexão, e as transações não terminam até que os callbacks terminem. O try-lock por responsável não impede o caso entre responsáveis diferentes. Isso pode bloquear também navegação e webhooks do processo, mesmo sem bloqueio de linhas no PostgreSQL.

Usar a conexão já reservada nos callbacks ou separar um pool pequeno de coordenação que não consuma o pool das consultas. Manter a exclusão entre instâncias e limitar o orçamento de conexões. Cobrir uma quantidade de operações de responsáveis diferentes superior ao tamanho do pool, cada uma executando consultas reais, com prazo limitado; preservar também a rejeição de duas operações concorrentes do mesmo responsável.

## Triage

- Decision: `VALID`
- Notes: Implementador confirmou o problema e adicionou `@informach/db/withDatabaseLock` com pool independente de duas conexões; `withBillingLifecycle` passou a usá-lo. Orçamento de doze conexões por processo documentado. Código revisto integralmente e integração independente aprovada em 13/09/2026 às 11:43:15 America/Sao_Paulo: 14 testes, incluindo doze responsáveis executando consultas reais dentro de locks com prazo de cinco segundos; concorrência do mesmo responsável continua sendo rejeitada. Exit 0, banco descartável removido. O ensaio avulso inicial do revisor falhou na compilação do harness, antes de abrir banco; não foi usado como evidência de reprodução.
