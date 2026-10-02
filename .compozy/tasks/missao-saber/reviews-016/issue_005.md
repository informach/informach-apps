---
status: resolved
file: apps/missao-saber/src/components/profile-switcher.tsx
line: 42
severity: medium
author: claude-code
provider_ref:
---

# Issue 005: Conter apelidos e tabelas em telas estreitas

## Review Comment

Um apelido de 24 letras maiúsculas, permitido pelo formulário, expandia o cabeçalho e outros blocos. Em viewport de 320 pixels, Hoje media 562 pixels de conteúdo e a missão chegava a 492. Isso deslocava controles e comprometia a devolutiva no celular.

O grupo do cabeçalho e o seletor admitem encolhimento, o nome compacto é truncado e os títulos e textos familiares quebram palavras longas. Ajustes equivalentes cobrem Hoje, Família, Meu espaço e anotações. A tabela do relatório também impedia o cartão de encolher: o cartão agora usa min-width: 0 para que a rolagem permaneça dentro da tabela, sem expandir a página.

Verificação: `e2e/review-experience.spec.ts`: mede scrollWidth nas páginas e na devolutiva com o maior apelido permitido, incluindo navegador móvel, e verifica a continuação. A reprodução anterior ultrapassava a largura visível.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Suítes finais: 210 testes unitários do app, 79 de integração, 16 jornadas E2E e 112 testes de e-mails aprovados. Build, TypeScript, Biome e auditorias de conteúdo aprovados. Cobertura e limites em README.md.
