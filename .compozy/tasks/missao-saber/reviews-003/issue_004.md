---
status: resolved
file: apps/missao-saber/src/features/labs/components/labs.tsx
line: 93
severity: medium
author: claude-code
provider_ref:
---

# Issue 004: Preservar a investigação ao pausar o laboratório

## Review Comment

O desafio de 20–30 minutos em `/laboratorio` é apresentado como "PODE PAUSAR", mas malha, barras e grupos existem apenas em `useState`, sem salvamento. Sair para o caderno pelo próprio link "Guardar minha investigação" ou recarregar a página descarta a figura/valores, e a volta restaura o retângulo e distribuições iniciais. Isso interrompe a comparação de exemplos que o desafio pede e não cumpre a retomada anunciada.

Salvar um rascunho de investigação por perfil e ferramenta, no servidor ou em armazenamento local explicitamente limitado a esse contexto. Restaurar a configuração ao voltar, oferecer reinício deliberado e integrar a limpeza de dados. O texto/anotação pode continuar no caderno; preservar também a representação manipulada. Testar alterar uma malha, navegar ao caderno, voltar/recarregar e retomar o mesmo desenho, além de verificar que outro perfil não herda o rascunho.

## Triage

- Decision: `VALID`
- Notes: Persistência no servidor por perfil/ferramenta, revisão otimista, comparação estrutural de JSONB e instrução de salvamento manual verificadas. Integrações independentes PostgreSQL aprovaram restauração, isolamento, conflito e exportação. E2E executado pelo implementador aprovou em desktop/mobile alterar a malha, salvar, ir ao caderno, guardar texto e voltar ao laboratório com a célula removida preservada. Teste e arquivo `.last-run.json` aprovados relidos pelo revisor em 13/09/2026.
