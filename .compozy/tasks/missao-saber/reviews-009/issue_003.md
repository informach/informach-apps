---
status: resolved
file: apps/missao-saber/src/features/learning/service.ts
line: 91
severity: high
author: claude-code
provider_ref:
---

# Issue 003: Não bloquear o simulado por lições que ele não utiliza

## Review Comment

Para um simulado, `sourceLessons` recebe todas as lições do curso. O gerador de `assessment()`, porém, seleciona questões apenas da última lição de cada habilidade. Pausar `fracoes-1`, que não fornece nenhuma questão ao simulado, faz `contentIsSuspended()` rejeitar o simulado inteiro; como frações é compartilhada, a mesma pausa pode derrubar os simulados das quatro trilhas. A página de simulados continua exibindo o botão ativo e só apresenta o erro depois do clique.

Gerar avaliações a partir de fontes disponíveis e transportar exatamente a proveniência dos itens selecionados. Se não houver banco suficiente, a interface deve apresentar indisponibilidade explícita; uma lição sem questão no snapshot não pode bloquear o percurso. Aplicar a mesma decisão ao diagnóstico, à tela de simulados, ao início transacional e à retomada. Testar pausa de fonte usada, pausa de lição não usada e suspensão concorrente com o início.

## Triage

- Decision: `VALID`
- Notes: O bloqueio consulta um conjunto maior que o snapshot real. A avaliação será montada somente com fontes disponíveis, carregará a lista exata dessas fontes e a mesma lista será validada na interface, no início e na retomada.
