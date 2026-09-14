---
status: resolved
file: apps/missao-saber/src/features/learning/repository.ts
line: 255
severity: medium
author: claude-code
provider_ref:
---

# Issue 005: Reter correção de avaliações também nas outras leituras

## Review Comment

`sessionView()` oculta o feedback de simulado/diagnóstico até a conclusão, mas `history()` retorna todas as tentativas com `correct` sem verificar `sessions.completedAt`. `dashboard()` transforma essas linhas em total semanal de acertos e estados de habilidade imediatamente, e `exportFamily()` também retorna `correct` das tentativas de avaliações em andamento. Ao conectar as telas e a exportação, essas superfícies revelam se uma resposta ainda não entregue estava certa (por exemplo, comparando o total de acertos antes/depois), contrariando a política declarada do simulado. Não se trata de acesso entre famílias; é uma inconsistência entre as leituras da mesma avaliação.

Centralizar a política de visibilidade da correção: avaliações incompletas não devem influenciar agregados de desempenho ou domínio, e a exportação pode incluir respostas enviadas sem o resultado de correção até a entrega. Depois da conclusão, liberar as evidências de forma consistente. Acrescentar um teste de integração que responda parte de um simulado, consulte sessão/dashboard/exportação e confirme que a correção fica retida em todas essas superfícies, sendo liberada após finalizar.

## Triage

- Decision: `VALID`
- Notes: Correção verificada no código e em PostgreSQL descartável. Execução independente de `pnpm --filter @informach/missao-saber test:integration`, em 13/09/2026 às 11:26:37 America/Sao_Paulo, aprovou 9 testes (exit 0), incluindo diagnóstico antes/depois da conclusão e simulado incompleto, com consultas a sessão, histórico e exportação. A correção fica nula/ausente antes da entrega e volta a ser visível depois. Banco gerado removido pelo próprio runner; nenhum banco de produção alterado.
