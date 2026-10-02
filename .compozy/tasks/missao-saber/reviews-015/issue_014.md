---
status: resolved
file: apps/missao-saber/src/features/content/skills/caminhos.ts
line: 195
severity: high
author: claude-code
provider_ref:
---

# Issue 014: Corrigir explicações que contradizem a situação matemática

## Review Comment

caminhos-2-6 dizia «reto não quer dizer mais curto» ao comparar caminho reto AC=10 com AB+BC=4+5=9. Isso contradiz a desigualdade triangular se as medidas usam a mesma unidade. O enunciado agora compara duas estradas, uma delas curva; não atribui 10 ao segmento reto.

A amostra de composicao-de-figuras-5-10 dizia que no tabuleiro 3×3 sempre sobra exatamente um quadradinho, qualquer que seja a disposição dos dominós. A impossibilidade vem da paridade: 2k não pode ser 9, mas arrumações com três dominós podem deixar três quadrados isolados. A prova agora distingue esses fatos.

Em gavetas-2-3, a explicação referia «primeiro conjunto» e «respectivamente» apesar de as alternativas serem embaralhadas. Agora identifica os conjuntos pelos elementos, preservando a correspondência entre opção e explicação.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
