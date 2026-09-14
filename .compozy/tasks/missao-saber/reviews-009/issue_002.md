---
status: resolved
file: apps/missao-saber/src/features/learning/repository.ts
line: 330
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Relacionar invalidações às questões de avaliações mistas

## Review Comment

`history()` monta a chave de invalidação como `contentControl.lessonId@version:itemId` e a compara com `session.lessonId@version:itemId`. Nas missões normais os identificadores coincidem, mas diagnóstico e simulado gravam `diagnostic:<curso>` ou `exam:<curso>` na sessão enquanto a manutenção registra a lição de origem, por exemplo `porcentagem-2`. Assim, uma questão confirmada como inválida continua contribuindo nos simulados concluídos, inclusive para `skillStates()`, relatório familiar e revisão espaçada.

Persistir ou reconstruir de forma inequívoca a proveniência de cada item da avaliação, incluindo lição e revisão de origem, e aplicar o filtro central por essa identidade. O vínculo deve continuar válido para snapshots antigos e não deve invalidar uma questão corrigida em uma revisão posterior. Adicionar integração que conclua uma avaliação mista, invalide um item de origem e confira que somente essa evidência desaparece dos cálculos.

## Triage

- Decision: `VALID`
- Notes: A identidade sintética da avaliação perde a relação com a lição de origem. Cada item misto passará a carregar proveniência interna e a invalidação usará também a impressão do item original, com reconstrução pelo catálogo para snapshots anteriores.
