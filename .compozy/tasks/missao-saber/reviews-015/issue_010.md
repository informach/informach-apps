---
status: resolved
file: apps/missao-saber/src/features/content/skills/equacoes-em.ts
line: 432
severity: high
author: claude-code
provider_ref:
---

# Issue 010: Considerar zero e casos verticais nas regras gerais

## Review Comment

equacoes-em-5-8 mandava separar apenas fator positivo/negativo ao multiplicar uma inequação por expressão de sinal desconhecido. O fator pode ser zero: x=0 satisfaz x<1, mas a multiplicação por x produz 0<0 e perde essa solução. coordenadas-5-10 ensinava colinearidade dividindo por Δx, sem tratar três pontos na mesma vertical; coordenadas-em-3-9 e -4-10 aplicavam −1/m a horizontais/verticais. coordenadas-3-9 ainda exigia distância estritamente maior que cada diferença, o que falha entre (0,0) e (3,0).

As regras e os exemplos agora tratam zero, vertical/horizontal e igualdade. Contraexemplos independentes e derivações estão registrados no relatório; as missões afetadas foram versionadas.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
