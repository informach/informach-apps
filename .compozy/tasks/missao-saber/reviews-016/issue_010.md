---
status: resolved
file: packages/emails/src/dispatch.ts
line: 532
severity: medium
author: claude-code
provider_ref:
---

# Issue 010: Alertar quando as tentativas de e-mail se esgotam

## Review Comment

Erros transitórios esgotados terminavam como failed no ledger sem log error. Isso era especialmente difícil de detectar em auth: a resposta pública preserva o anonimato da conta e corpos de OTP não são guardados para reenvio pelo sweeper. A ausência de entrega ficava sem o alerta operacional previsto para falhas.

O dispatcher registra um error com ID da entrega, categoria, classificação e número de tentativas. Não inclui endereço, OTP ou corpo. Mantém estados e retornos; não alerta quando um retry posterior tem sucesso. A documentação esclarece a necessidade de pedir novo código/link após uma falha de transporte.

Verificação: `packages/emails/src/__tests__/dispatch.test.ts`: alerta terminal e ausência de falso alerta após recuperação. `test/backend-auth-review.integration.ts`: auth.handler, dispatcher e PostgreSQL reais, somente transporte externo substituído por 503; contas existentes/inexistentes permanecem com HTTP 200 e corpos não são persistidos.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Suítes finais: 210 testes unitários do app, 79 de integração, 16 jornadas E2E e 112 testes de e-mails aprovados. Build, TypeScript, Biome e auditorias de conteúdo aprovados. Cobertura e limites em README.md.
