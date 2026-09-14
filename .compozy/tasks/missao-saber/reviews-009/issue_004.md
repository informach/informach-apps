---
status: resolved
file: packages/db/src/migrations/0044_bouncy_chat.sql
line: 13
severity: high
author: claude-code
provider_ref:
---

# Issue 004: Manter a migração compatível com o binário anterior

## Review Comment

A tabela editorial estava vazia, portanto não há dados de aprovação úteis a migrar. Ainda assim, `DROP TABLE releases CASCADE` na mesma migration que introduz `content_controls` quebra o binário atualmente publicado: ele consulta `releases` em todo dashboard. O runbook aplica migrations antes de publicar o código dependente. Durante a troca, ou se a nova versão falhar e ocorrer rollback, a versão anterior passa a responder com erro de banco.

Separar a mudança em expand/contract. A migration desta entrega deve criar `content_controls` sem remover `releases`; depois de a versão nova estar saudável e a janela de rollback terminar, uma migration posterior pode apagar a tabela vazia sem `CASCADE` amplo. Isso preserva apenas compatibilidade operacional temporária, não o fluxo editorial. Validar upgrade a partir do snapshot 0043 com consultas do binário anterior e rollback da aplicação.

## Triage

- Decision: `VALID`
- Notes: Remover a tabela no passo expand inviabiliza a versão anterior e um rollback. A migration desta entrega criará o controle operacional e os novos campos, mantendo a tabela antiga apenas como compatibilidade temporária de binário, sem qualquer uso pelo produto novo.
