---
status: resolved
file: apps/missao-saber/src/features/content/commercial-curriculum.ts
line: 1420
severity: high
author: claude-code
provider_ref:
---

# Issue 003: Escrever soluções-modelo que atendam às próprias rubricas

## Review Comment

As 36 justificativas geradas usam o mesmo `sampleResponse`: citam a introdução da missão e dizem que em seguida aplicam a relação a “um exemplo compatível”, mas não apresentam esse exemplo, cálculo ou caso, nem concluem a afirmação específica pedida. Isso falha em dois critérios da rubrica comum — conectar a relação ao caso e chegar a uma conclusão explícita — e deixa o estudante sem uma solução-modelo real. Por exemplo, a resposta de uma questão sobre a soma de dois ímpares não representa os números, não efetua a soma e não demonstra por que o resultado é par.

Autorar uma solução específica para cada prompt, com argumento matemático completo, exemplo ou representação pertinente e conclusão que retome a pergunta. Ajustar as rubricas quando habilidades diferentes exigirem critérios diferentes. A conferência deve comparar cada solução-modelo com cada item da sua rubrica, em vez de validar somente tamanho e presença de texto.

## Triage

- Decision: `RESOLVED`
- Notes: Foram escritas 37 respostas-modelo específicas, com caso matemático, encadeamento e conclusão. As rubricas recebem foco por habilidade, as respostas são distintas e o catálogo revisado é protegido por um ledger de hashes.
