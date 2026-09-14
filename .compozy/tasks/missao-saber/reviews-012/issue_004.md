---
status: resolved
file: apps/missao-saber/src/app/(app)/manutencao/page.tsx
line: 39
severity: medium
author: claude-code
provider_ref:
---

# Issue 004: Tornar relatos tratados e seu histórico consultáveis

## Review Comment

A tela busca `contentReports()` sem filtros e carrega `reportHistory()` somente para os IDs retornados. O repository limita essa seleção a `open`/`investigating` (`content-maintenance/repository.ts:56`). Ao marcar como tratado e atualizar a página, o relato sai da seleção e seu histórico de investigação/resolução deixa de ter qualquer caminho administrativo de consulta. A paginação `pagina` existente pagina decisões de conteúdo, não relatos. O responsável comum vê apenas a última `resolution` em `/familia`, o que não substitui o histórico de suporte para o mantenedor.

Adicionar filtro de situação com consulta paginada de relatos tratados, ou uma rota de detalhe autorizada que continue acessível após a resolução. Nessa consulta, apresentar as atualizações ordenadas e o contexto correspondente; manter a fila de pendências como visão inicial. Isso atende F5.2 e o entregável explícito de filtros de relatos sem tornar o histórico público.

O teste atual confirma que `reportHistory([id])` conserva duas linhas e que o relato resolvido desaparece de `contentReports()`, mas não demonstra que uma pessoa consegue consultar esse histórico pelo app. Cobrir investigação → resolução → reload → abrir o tratado e rever as duas atualizações, mais recusa para conta sem autorização.

## Triage

- Decision: `RESOLVED`
- Notes: A manutenção oferece abas de pendentes e tratados, paginação e histórico de suporte; os relatos resolvidos continuam consultáveis.
