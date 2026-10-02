---
status: resolved
file: apps/missao-saber/src/features/learning/repository.ts
line: 502
severity: medium
author: claude-code
provider_ref:
---

# Issue 002: Persistir o apoio de leitura junto com a resposta

## Review Comment

A leitura em voz alta era registrada por uma requisição separada. Se essa marca falhasse e o estudante enviasse a resposta, inclusive a última, a avaliação podia terminar com `readingSupport=false`, embora houvesse uso de áudio. Esperar a Promise não resolvia uma marca recusada ou perdida.

O cliente preserva o fato de que houve leitura e o envia com a resposta. O servidor registra o apoio na mesma transação da tentativa, antes da conclusão. Declarações falsas ou ausentes não apagam apoio anterior; replay não duplica tentativas. A escuta da avaliação é desabilitada durante o envio para não iniciar depois de capturar o payload.

Verificação: `test/review16-pedagogy.integration.ts`: dois casos com PostgreSQL real, leitura na primeira ou na última resposta sem marca separada, conclusão e replay. Ambos esperavam true e recebiam false antes da correção.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Suítes finais: 210 testes unitários do app, 79 de integração, 16 jornadas E2E e 112 testes de e-mails aprovados. Build, TypeScript, Biome e auditorias de conteúdo aprovados. Cobertura e limites em README.md.
