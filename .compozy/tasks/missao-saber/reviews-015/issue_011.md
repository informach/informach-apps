---
status: resolved
file: apps/missao-saber/src/features/content/skills/juros.ts
line: 567
severity: high
author: claude-code
provider_ref:
---

# Issue 011: Corrigir a conclusão sobre rendimento durante parcelamento

## Review Comment

As soluções de juros-4-10 e equivalencia-temporal-4-10 invertiam o efeito do rendimento do saldo. Com preço à vista de R$ 1.200 e 12 parcelas de R$ 100, afirmavam que poder render juros durante o prazo tornava parcelar mais caro. Com totais iguais, sem outras taxas e pagamentos em dia, rendimento líquido positivo favorece adiar os pagamentos; sem rendimento, os totais equivalem.

Conferência independente: descontar 12 pagamentos mensais de R$ 100 a 1% ao mês, no fim de cada mês, dá valor presente de R$ 1.125,507747, menor que R$ 1.200. As amostras agora distinguem desconto à vista, taxa embutida e rendimento do saldo até cada vencimento, sem transformar o exercício em recomendação pessoal.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
