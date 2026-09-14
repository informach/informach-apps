---
status: resolved
file: apps/missao-saber/src/features/product-metrics/repository.ts
line: 42
severity: medium
author: claude-code
provider_ref:
---

# Issue 003: Esperar o fim do dia 13 para incluir a coorte

## Review Comment

A janela de retorno inclui os dias civis 7 até 13, mas a elegibilidade usa `first_date <= today - 13`. Isso inclui a família durante todo o próprio dia 13, quando ela ainda tem horas para retornar. Exemplo: primeira missão em 31/08, consulta em 13/09 às 09h de São Paulo; o código já aumenta `retentionEligible`, embora a janela só termine em 14/09 às 00h. O painel diz que só apresenta janelas encerradas e pode mostrar prematuramente ausência de retorno. F5.6 e `METRICAS-PRODUTO.md` exigem coortes maduras.

Usar a comparação estrita `first_date < today - 13`, ou equivalente `first_date <= today - 14`, mantendo todos os cálculos em `America/Sao_Paulo`. Adicionar casos nos limites de dias 6, 7, 13 e 14, incluindo instantes próximos da meia-noite UTC que pertencem ao dia anterior no Brasil. Congelar/injetar o instante de referência para tornar esses testes determinísticos.

O teste atual usa primeira conclusão em 20/08 e retorno em 28/08; em 13/09 ambos já estão longe da fronteira. Ele passa sem detectar este erro de elegibilidade.

## Triage

- Decision: `RESOLVED`
- Notes: A coorte entra apenas no dia local 14, com fronteira calculada na data local. Os testes cobrem dias 6, 7, 13 e 14, inclusive a meia-noite de São Paulo.
