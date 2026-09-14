---
status: resolved
file: apps/missao-saber/src/features/learning/repository.ts
line: 313
severity: medium
author: claude-code
provider_ref:
---

# Issue 004: Manter missões pausadas acessíveis além das últimas 30 sessões

## Review Comment

`history()` limita `recent` às trinta sessões mais recentes, incluindo concluídas. A tela Hoje procura uma missão pausada somente nesse recorte (`app/(app)/hoje/page.tsx:19`), e não existe outra lista paginada de sessões. Uma missão pausada deixa de ter qualquer caminho de retomada na interface depois de trinta sessões mais recentes concluídas. Ela continua no banco e pode ser aberta conhecendo o UUID, mas o aluno recebe uma nova missão em vez da retomada prometida.

Reprodução em navegador e PostgreSQL de preview local: criei uma missão pausada e trinta sessões de diagnóstico completas mais recentes, com respostas copiadas da avaliação completa do próprio usuário de teste. Esperei a tela Hoje terminar de renderizar. Resultado: `retainedInDatabase=1`, `resumeLinks=0`; o botão disponível era “Começar descoberta”. O usuário de teste e seus dados foram removidos ao final. Harness local ignorado: `apps/missao-saber/tmp/review-2/navigation.mjs`.

Separar a consulta de missões em andamento do histórico recente e oferecer acesso às demais sessões por paginação/filtro. Para a sugestão Hoje, consultar uma sessão não concluída diretamente, com ordenação determinística, sem permitir que concluídas consumam sua janela. Preservar a autorização por perfil e o snapshot. Testar pausa antiga seguida de mais de trinta conclusões, retomada e acesso após cancelamento.

## Triage

- Decision: `VALID`
- Notes: Causa: pausas dependiam do recorte de 30 sessões recentes. Correção: consulta própria para a pausa e diagnóstico anterior; página /historico com cursor UUID e comparação integral de (created_at,id) no PostgreSQL. Extensão necessária: serviço, página, navegação e testes. A paginação preserva microssegundos, filtra o perfil e retorna apenas resumos, sem snapshot/gabarito.
- Verification: [relatório da remediação](../reviews/remediation-007.md) e [revisão independente](../reviews/remediation-007-independent.md). Testes finais, lint focado, typecheck, migração descartável e build aprovados; check global fora do escopo continua falhando e está discriminado no relatório.
