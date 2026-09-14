---
status: resolved
file: apps/missao-saber/src/app/(app)/hoje/page.tsx
line: 23
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Usar o diagnóstico para orientar o próximo passo

## Review Comment

A página afirma que o diagnóstico orienta o treino e ajuda a escolher o próximo passo, mas `recommended` usa somente habilidades com revisão vencida e IDs de aulas concluídas. As evidências de diagnóstico são excluídas de `skillStates()` de forma adequada para não certificar domínio, porém não há outra regra que transforme seus acertos/erros em orientação. O diagnóstico concluído só altera o texto do botão para "Refazer diagnóstico", e o Player mostra a contagem de acertos e as explicações. Assim, duas pessoas com resultados diagnósticos opostos recebem a mesma primeira recomendação se têm o restante do histórico igual, contrariando a função de diagnóstico prevista no PRD.

Criar uma decisão de orientação distinta de domínio, baseada no diagnóstico mais recente e completo da trilha selecionada. Mostrar a habilidade sugerida, a ponte de pré-requisito quando pertinente e a razão da sugestão, respeitando disponibilidade editorial e acesso. Um resultado forte pode orientar avanço sem registrar domínio; erros e "ainda não sei" devem priorizar apoio. Testar resultados distintos com o mesmo histórico de missões e confirmar recomendações distintas/coerentes, inclusive após troca de trilha.

## Triage

- Decision: `VALID`
- Notes: `recommend()` agora usa o diagnóstico completo para sugerir apoio sem atribuir domínio, respeitando as aulas disponíveis. Hoje mostra o motivo; a conclusão do diagnóstico recebe `nextStep` do servidor e exibe tabela por habilidade e ação para a próxima missão. Execução independente com o motor real via tsx em 13/09/2026 confirmou que diagnósticos distintos recomendam `fracoes-1` e `porcentagem-1` com o restante do histórico igual. Integração PostgreSQL às 11:26:37 aprovou a conclusão e `nextStep`, juntamente com retenção/liberação de correção (9 testes, exit 0). A inspeção visual final permanece requisito geral de F5.
