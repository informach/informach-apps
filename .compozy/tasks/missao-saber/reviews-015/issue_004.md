---
status: resolved
file: apps/missao-saber/src/features/learning/repository.ts
line: 82
severity: high
author: claude-code
provider_ref:
---

# Issue 004: Permitir consultar sessões encerradas ao trocar de trilha

## Review Comment

Trocar de trilha interrompe as sessões abertas. O histórico oferecia «Retomar percurso», mas assertCurrentSessionAccess só dispensava validação da trilha para sessões concluídas, não para interrompidas. Abrir um diagnóstico Canguru E após trocar para OBMEP N1 gerava COURSE e impedia consultar o histórico.

Tratar sessão interrompida como histórico imutável para leitura, preservando ownership e rejeição de novas respostas. Exibir «Encerrado» e «Ver percurso» no histórico. A integração reproduziu COURSE antes; agora permite sessionView, rejeita resposta com INTERRUPTED e recusa outra família com NOT_FOUND.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
