---
status: resolved
file: apps/missao-saber/src/app/(app)/familia/page.tsx
line: 23
severity: medium
author: claude-code
provider_ref:
---

# Issue 001: Permitir sair da conta sem refazer a autenticação

## Review Comment

A única ação visível de `authClient.signOut()` está em `PrivacyControls`, dentro da área da família. Porém `Family()` retorna antes desse componente quando a sessão tem dez minutos ou mais. O usuário continua autenticado para estudar e consultar dados pedagógicos, mas perde o botão para encerrar a sessão. O fallback e `/entrar` só oferecem autenticação, portanto sair pelo fluxo da interface exige primeiro saber a senha ou obter outro código. Em um aparelho compartilhado, o responsável ou estudante precisa conseguir fechar a sessão existente imediatamente, mesmo sem acesso às credenciais naquele momento.

Colocar uma ação de saída no layout autenticado ou no fallback da área da família, sem a exigência de sessão recente. Manter a confirmação adicional nas operações de dados, cobrança e exclusão. Testar sessão com idade superior a dez minutos: a área sensível continua bloqueada, sair permanece disponível, e a próxima visita autenticada redireciona para login.

## Triage

- Decision: `VALID`
- Notes: `SignOut` está agora no footer do layout autenticado e permanece disponível no fallback da família. E2E executado pelo implementador envelhece a sessão onze minutos, invalida cache da sessão, confirma família/exportação bloqueadas, aciona saída e confirma redirecionamento de `/hoje` para login. Seis cenários desktop/mobile aprovados; código, `.last-run.json` aprovado e screenshots com o botão de saída foram conferidos pelo revisor em 13/09/2026. Dados e operações sensíveis continuam exigindo autenticação recente.
