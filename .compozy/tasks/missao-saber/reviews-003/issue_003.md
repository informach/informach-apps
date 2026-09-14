---
status: resolved
file: apps/missao-saber/src/app/(app)/revisao/page.tsx
line: 41
severity: medium
author: claude-code
provider_ref:
---

# Issue 003: Recomendar para revisão uma aula que possa ser aberta

## Review Comment

A escolha da aula de revisão prioriza itens não vistos sem filtrar status editorial, assinatura ou perfil elegível. Caso a aula 1 de uma habilidade esteja aprovada e concluída, mas a aula 2 ainda seja rascunho, o CTA "Reencontrar esta ideia" escolhe a aula 2 e termina em erro `EDITORIAL`, mesmo existindo uma aula aprovada para rever. Após mudança de plano o mesmo fluxo pode oferecer uma aula bloqueada sem explicar o motivo. A tela Hoje também considera toda aula gratuita disponível, inclusive quando retirada editorialmente.

Compartilhar a regra de disponibilidade entre as sugestões de Hoje/Revisão e o início de sessão. Primeiro filtrar aulas que podem ser abertas e depois preferir novidade; se não houver nenhuma, mostrar um estado explícito com a ação pertinente. A validação de servidor deve continuar existindo. Testar primeira aula aprovada/segunda em revisão, retirada de aula gratuita e redução de plano, sem oferecer um CTA de treino que apenas falha.

## Triage

- Decision: `VALID`
- Notes: Hoje e Revisão passaram a compartilhar `availableLessons()`, que exclui retirada e exige aprovação por hash/acesso para conteúdo pago; `reviewLesson()` só escolhe entre essas opções. Execução independente via tsx em 13/09/2026 aprovou exclusão de aula gratuita retirada e fallback para a única aula publicada quando todos os seus itens já foram vistos. Código das duas páginas relido e fluxo de recomendação alinhado.
