---
status: resolved
file: apps/missao-saber/src/app/(app)/familia/page.tsx
line: 80
severity: medium
author: claude-code
provider_ref:
---

# Issue 005: Contar erros observados ao indicar dificuldade repetida

## Review Comment

`state.attempts >= 2 && !state.lastCorrect` conta tentativas totais, não repetições de dificuldade. Um estudante que acerta uma questão e erra apenas a seguinte já aparece em “Dificuldades repetidas”. A execução do `skillStates()` real com esse par produziu `{"wrong":1,"repeated":["fracoes"]}`. Um histórico de muitos acertos seguido de um erro isolado tem o mesmo resultado; e não há janela temporal apesar de a mensagem falar em repetição “recente”. Isso dá uma orientação didática equivocada ao responsável, contrariando F5.4.

Definir e calcular uma regra observável sobre as evidências válidas: por exemplo, pelo menos duas dificuldades em atividades/encontros distintos dentro de uma janela documentada, separando erro objetivo, ausência de resposta e uso de pistas conforme a política didática. Manter a exclusão de evidências invalidadas e avaliações em andamento. Não inferir recorrência da contagem total de tentativas e do último resultado.

Cobrir um acerto + um erro (sem recorrência), dois erros distintos, recuperação posterior e dificuldade antiga fora da janela. A suíte atual de engine não testa a projeção `repeatedDifficulty`, que foi implementada diretamente no componente servidor.

## Triage

- Decision: `RESOLVED`
- Notes: Dificuldade repetida exige erros objetivos em duas sessões distintas na janela de 28 dias e desaparece após evidência correta posterior. Reflexões e evidências excluídas não geram o alerta.
