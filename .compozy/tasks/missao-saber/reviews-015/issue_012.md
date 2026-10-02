---
status: resolved
file: apps/missao-saber/src/features/content/skills/composicao-de-figuras.ts
line: 242
severity: high
author: claude-code
provider_ref:
---

# Issue 012: Explicitar as hipóteses necessárias para uma resposta única

## Review Comment

Diversos enunciados omitiam condições das quais o gabarito dependia:

- Furos após dobrar papel não são necessariamente 2^n buracos separados se o corte toca uma dobra ou borda. Afeta composicao-de-figuras-3-2, -4-10 e formas-e-posicoes-5-8, além da introdução e template reservado.
- paridade-3/4/5-7 pede o menor número a somar sem restringir sinal. Para 74 e divisor 9, −2, −11 e −20 também funcionam; sem limite inferior não existe mínimo. Agora pede inteiro não negativo.
- invariantes-5-5 precisava exigir que o cavalo visite cada casa exatamente uma vez; permitindo repetições, o argumento de impossibilidade não vale. invariantes-5-6 precisava admitir diferença zero entre números iguais.
- semelhanca-3-5 precisava usar a altura dos olhos, com chão horizontal e base no mesmo nível, no problema do espelho.
- O template reservado de espaco usava Euler sem restringir a poliedro convexo.

As condições agora constam dos enunciados. As respostas numéricas originais foram preservadas; o domínio em que elas são justificadas ficou explícito.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
