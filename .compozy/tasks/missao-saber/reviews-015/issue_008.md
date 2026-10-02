---
status: resolved
file: apps/missao-saber/src/features/content/skills/cenarios.ts
line: 37
severity: high
author: claude-code
provider_ref:
---

# Issue 008: Tornar cada pergunta compreensível sem a tela anterior

## Review Comment

O Player mostra somente a questão atual e retoma pela quantidade de respostas salvas. Enunciados como «Na mesma análise, quantos depósitos serão feitos?» (cenarios-1-2), «O ponto anterior e sua imagem...» (simetria-1-2) e «No orçamento anterior...» (orcamento-n2-5-2) escondiam dados indispensáveis numa tela que já não podia ser consultada. Ao recarregar, sequer havia garantia de o estudante lembrar esse contexto.

Foram reescritos os 20 itens encontrados nas habilidades avançadas e cinco no conteúdo inicial para informar valores, restrições e condições no próprio enunciado. Os casos estão identificados no manifesto content-changes.json. Nove verificações independentes extraem os números do enunciado visível e calculam a resposta sem ler o item anterior nem a explicação.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Rodada final: 201 testes unitários, 73 de integração e 10 jornadas E2E aprovados; build, TypeScript, Biome e auditorias de conteúdo aprovados. Detalhes e limites em README.md.
