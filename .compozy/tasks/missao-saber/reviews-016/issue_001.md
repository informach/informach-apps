---
status: resolved
file: apps/missao-saber/src/features/learning/components/notebook.tsx
line: 31
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Preservar o rascunho escrito durante o salvamento

## Review Comment

O formulário permanecia editável enquanto salvava uma descoberta, mas a conclusão da requisição chamava `setText("")` incondicionalmente. Se o estudante começasse outra anotação durante a espera, a resposta do primeiro salvamento apagava o novo rascunho.

A limpeza agora acontece somente se o texto atual ainda for o texto enviado. A anotação enviada continua sendo salva e a nova escrita permanece no campo.

Verificação: `e2e/review-experience.spec.ts`: retarda apenas a entrega da resposta da action real, escreve outro texto e confere a descoberta persistida e o rascunho. Antes, o campo retornava vazio; o teste deve passar nos dois projetos de navegador.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Suítes finais: 210 testes unitários do app, 79 de integração, 16 jornadas E2E e 112 testes de e-mails aprovados. Build, TypeScript, Biome e auditorias de conteúdo aprovados. Cobertura e limites em README.md.
