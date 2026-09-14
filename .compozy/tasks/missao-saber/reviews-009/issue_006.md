---
status: resolved
file: apps/missao-saber/src/features/learning/components/player.tsx
line: 34
severity: medium
author: claude-code
provider_ref:
---

# Issue 006: Permitir encerrar sessões suspensas sem perder o histórico

## Review Comment

Quando uma sessão em andamento é suspensa, o Player conserva as respostas e oferece apenas voltar para Hoje. Não existe ação para encerramento parcial nem estado que diferencie abandono voluntário de uma interrupção operacional. A sessão fica incompleta indefinidamente e o usuário não recebe a saída explícita exigida por F1.4 quando não existe substituição adequada.

Adicionar uma operação idempotente, autorizada pelo responsável/perfil e protegida contra respostas concorrentes, que encerre a sessão como interrompida por manutenção sem fabricar acerto ou domínio. Preservar snapshot e tentativas; excluir somente evidências invalidadas. A interface deve mostrar o motivo e a consequência antes da confirmação. Testar suspensão após respostas parciais, repetição da ação, corrida com resposta e presença no histórico/exportação.

## Triage

- Decision: `VALID`
- Notes: Falta um estado terminal distinto de conclusão. Será criada uma operação idempotente, autorizada e serializada pelos locks das fontes, com campos próprios de interrupção, preservação de snapshot/tentativas e uma confirmação explícita no player.
