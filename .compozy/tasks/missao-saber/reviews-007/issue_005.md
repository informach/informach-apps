---
status: resolved
file: apps/missao-saber/src/features/learning/engine.ts
line: 116
severity: medium
author: claude-code
provider_ref:
---

# Issue 005: Usar sete datas locais no indicador de dias da semana

## Review Comment

`weeklyEvidence()` seleciona as últimas 168 horas e depois conta datas em São Paulo. Esse intervalo pode conter partes de oito datas civis. A tela Hoje exibe o resultado sobre um total fixo de sete (`app/(app)/hoje/page.tsx:75`), produzindo “8/7 dias”, e o relatório familiar também apresenta oito dias nos “últimos sete dias”. Não é necessário nenhum dado futuro ou duplicação para ocorrer.

Reprodução pelo motor real: `now=2026-09-13T15:00:00Z`; uma tentativa em 06/09 às 16h UTC e uma às 12h UTC em cada dia de 07 a 13/09. Todas pertencem à janela de 168 horas, mas abrangem oito datas brasileiras. Resultado: `{"total":8,"correct":8,"withHelp":0,"practiceDays":8,"sessions":8}`.

Definir a janela em datas locais: hoje e os seis dias anteriores em `America/Sao_Paulo`, com limite superior no momento da consulta. Usar a mesma convenção nas tentativas e nos dias do relatório. Não limitar apenas o contador a sete, pois isso mantém tentativas de uma data extra nos demais indicadores. Cobrir limites de meia-noite, oito datas dentro de 168 horas e ausência de evidências.

## Triage

- Decision: `VALID`
- Notes: Causa: 168 horas atravessavam oito datas locais. Correção: hoje e seis datas civis anteriores de São Paulo, sem registros posteriores ao instante da consulta; mesma seleção para todas as métricas. Testes reproduziram 8/7 antes da correção e cobrem meia-noite, limite exato, troca de mês e vazio.
- Verification: [relatório da remediação](../reviews/remediation-007.md) e [revisão independente](../reviews/remediation-007-independent.md). Testes finais, lint focado, typecheck, migração descartável e build aprovados; check global fora do escopo continua falhando e está discriminado no relatório.
