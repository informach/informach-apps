---
status: resolved
file: apps/missao-saber/src/features/content/skills/investimentos.ts
line: 105
severity: high
author: claude-code
provider_ref:
---

# Issue 013: Determinar premissas das comparações financeiras

## Review Comment

Algumas comparações declaravam conclusões que não decorriam dos dados. inflacao-3-8 inferia inflação familiar maior sem informar os pesos; cenarios-4-8 escolhia arbitrariamente qual limitação era a principal; investimentos-4-7 inferia risco total apenas da concentração; investimentos-3-8 tratava taxa anual de 3% como retorno no prazo menor e concluía inadequação sem comparadores. Taxas de administração em investimentos-1-8, -5-2 e renda-variavel-4-5 também não indicavam a base de incidência.

Os exercícios agora fornecem pesos (a cesta familiar resulta em 6,5% contra 5%), perguntam especificamente pela premissa de renda, distinguem concentração de risco, identificam a taxa anual aplicável sem supor o rendimento de seis meses e explicitam taxa sobre capital inicial ao fim do período. Exemplo da ambiguidade removida: 8%−1,5%=6,5%, mas descontar 1,5% do saldo após render 8% dá 6,38%.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
