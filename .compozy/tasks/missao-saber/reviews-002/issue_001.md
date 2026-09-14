---
status: resolved
file: apps/missao-saber/src/features/content/combinatorics.ts
line: 137
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Pedir o mínimo torna única a resposta sobre garantias

## Review Comment

Oito itens do princípio das gavetas admitem mais de uma alternativa correta porque perguntam apenas quantos objetos "bastam" ou "pelo menos quantos" sem pedir o menor número suficiente ou a garantia mais forte. Em `gavetas-1-2`, tanto 13 quanto 24 pessoas garantem duas no mesmo mês. Em `gavetas-1-3`, tanto 10 quanto 12 peças garantem quatro de uma das três cores, mas `gradeAnswer(item, "12")` retorna `correct: false`. O aluno pode receber correção negativa por uma resposta matematicamente válida.

Revisar `gavetas-1-2`, `gavetas-1-3`, `gavetas-1-4`, `gavetas-1-5`, `gavetas-2-1`, `gavetas-2-2`, `gavetas-2-4` e `gavetas-2-5`. Nos limiares, perguntar explicitamente pelo menor número que garante o resultado. Nas distribuições de quantidade fixa, pedir a maior quantidade cuja presença em algum grupo é garantida, ou o menor valor possível para o tamanho do grupo mais numeroso. As explicações já abordam os limiares; o enunciado precisa fazer a mesma pergunta. Acrescentar verificação editorial que confronte alternativas com a condição matemática, além de comparar o gabarito com uma fórmula.

## Triage

- Decision: `VALID`
- Notes: Os oito enunciados agora pedem explicitamente mínimo suficiente ou maior garantia. Revisão textual e execução independente em 13/09/2026 confirmaram `clarifiedGuarantees: 8`; gabaritos e distratores continuam coerentes com os novos enunciados. Testes existentes: 26 passed.
