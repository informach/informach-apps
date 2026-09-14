---
status: resolved
file: apps/missao-saber/src/features/learning/engine.ts
line: 69
severity: high
author: claude-code
provider_ref:
---

# Issue 003: Não usar diversidade de famílias como etapas de revisão

## Review Comment

O intervalo de revisão é escolhido por `families.size`, que mede diversidade de estratégias e não retenção ao longo do tempo. Concluir `porcentagem-1` com seis acertos independentes em uma única sessão em 10/09/2026 às 12h UTC produz `independentFamilies: 6`, `level: "building"` e `dueAt: "2026-10-10T12:00:00.000Z"`. A primeira prática, portanto, já agenda a próxima para 30 dias depois e pula as revisões de 1, 3, 7 e 14 dias previstas na proposta. O erro afeta diretamente a retenção que o motor pretende promover.

Separar diversidade/transferência da habilidade e sucesso em revisões espaçadas. A primeira prática deve agendar a revisão inicial; só uma recuperação posterior, realizada em intervalo adequado e com os critérios de ajuda definidos, deve avançar a etapa. Erro ou ajuda devem encurtar o intervalo conforme a política. Adicionar casos de teste para uma aula com várias famílias no mesmo dia e para revisões bem-sucedidas em dias posteriores, evitando que várias respostas seguidas avancem o calendário artificialmente.

## Triage

- Decision: `VALID`
- Notes: `spacedDue()` separa dias de recuperação da diversidade de famílias. Reproduções independentes em 13/09/2026 confirmaram primeira prática de porcentagem em 10/09 com revisão em 11/09; acertos nos vencimentos posteriores produziram intervalos de 3, 7, 14 e 30 dias. A sequência anterior de seis respostas no mesmo dia deixou de pular para 30 dias. Testes existentes: 26 passed.
