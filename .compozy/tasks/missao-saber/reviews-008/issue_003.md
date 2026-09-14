---
status: resolved
file: apps/missao-saber/src/app/error.tsx
line: 2
severity: medium
author: claude-code
provider_ref:
---

# Issue 003: Capturar erros de render tratados pelas boundaries React

## Review Comment

A instrumentação nova inicializa o SDK e `onRequestError`, porém a boundary existente `error.tsx` não recebe nem envia a exceção, e o app não possui `global-error.tsx`. Uma falha de render em componente cliente pode ser capturada pela boundary e exibir a tela de recuperação sem passar pelo tratamento de erro não capturado do navegador. Falhas do root layout também precisam da boundary global. Isso deixa telas quebradas fora da cobertura do Sentry configurado para produção.

A [documentação oficial do SDK](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup.md#capture-react-render-errors) exige captura explícita na boundary para erros de render React. Receber a prop `error` na boundary existente e capturá-la em `useEffect`; adicionar uma boundary global com `html`/`body` que também faça a captura. Reutilizar o sanitizador configurado e preservar a mensagem de recuperação em português sem expor o erro bruto.

## Triage

- Decision: `VALID`
- Notes: A boundary existente recebe error e o captura em useEffect. A boundary global foi adicionada com html/body, captura equivalente e recuperação em português, sem exibir a exceção. Ambas utilizam o SDK já configurado com o sanitizador.
- Verification: Boundaries relidas conforme a documentação primária; typecheck do app passou na execução independente, e os 12 packages passaram na execução final do agente principal. Check independente de 13 arquivos aprovado. Ver [relatório](../reviews/production-architecture.md).
