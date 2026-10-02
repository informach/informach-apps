---
status: resolved
file: apps/missao-saber/src/features/content/commercial-curriculum.ts
line: 130
severity: medium
author: claude-code
provider_ref:
---

# Issue 015: Apresentar decimais sem caudas binárias ou notação inconsistente

## Review Comment

A geração de alternativas mostrava artefatos de ponto flutuante: bank:diagnostic:olitef-n1-12 incluía 307.20000000000005, resultado binário de 384×0,8. Também apareciam 62.5% e 2.4 m onde o restante do produto usa notação brasileira.

A autoria agora formata essas alternativas com decimal() e vírgula, preservando os valores matemáticos. O teste usa o banco realmente publicado: a alternativa fica «307,2» e a resposta correta continua «320». Isso verifica apresentação e correção juntas, sem confundir a cauda binária com erro no gabarito.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
