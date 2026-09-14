---
status: resolved
file: apps/missao-saber/src/features/learning/recommendation.ts
line: 51
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Contabilizar a participação nas reflexões para concluir missões

## Review Comment

`history()` exclui corretamente tentativas com `result = reflection` de `evidence`, pois uma justificativa aberta não recebe acerto automático (`learning/repository.ts:475–477`). Entretanto, `recommend()` e `reviewLesson()` consultam somente essa evidência e exigem que todos os itens da missão tenham sido vistos. A Jornada faz a mesma comparação em `src/app/(app)/jornada/page.tsx:17–22`. Assim, responder a reflexão e concluir a sessão não permite concluir a missão na trilha: seu item formativo nunca entra no conjunto considerado.

O catálogo atual contém 37 missões com reflexão. Na reprodução com os módulos reais e uma projeção em que todos os itens objetivos do OLITEF já foram respondidos, `recommend()` e `reviewLesson()` continuam escolhendo `fracoes-formatos`, enquanto 16 missões do curso continuam incompletas na regra da Jornada. Esse estado também ocorre depois de enviar todas as reflexões, porque elas continuam fora de `evidence`. A recomendação insiste em missões concluídas e o estudante não vê o avanço que realizou.

Separar evidência objetiva de participação/conclusão. Disponibilizar à recomendação e à Jornada os itens efetivamente respondidos, incluindo reflexões, ou um registro de conclusão compatível com a versão da missão; manter reflexões fora do cálculo de acerto/autonomia. Cobrir o fluxo completo de missão com justificativa, conclusão exibida e escolha da próxima missão, além da revisão sem repetição indevida da primeira missão formativa.

## Triage

- Decision: `UNREVIEWED`
- Notes:

## Resolution

O histórico agora separa `evidence`, usado para acerto e autonomia, de `attemptedItemIds`, usado para participação e conclusão. Jornada, recomendação, Hoje e Revisão recebem também as reflexões respondidas, sem convertê-las em acertos. Testes unitários e de integração confirmam que uma missão com reflexão termina e deixa de ser recomendada, enquanto a reflexão permanece fora da evidência objetiva. `71` testes do app e `44` integrações passaram.
