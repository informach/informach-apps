---
status: resolved
file: apps/missao-saber/src/components/auth-form.tsx
line: 90
severity: medium
author: claude-code
provider_ref:
---

# Issue 007: Tratar recusas ao solicitar e reenviar códigos

## Review Comment

Os fluxos de recuperação e reenvio de confirmação avançavam ou anunciavam o código sem examinar `result.error`. Ao atingir o limite do servidor (HTTP 429), a interface prometia uma etapa que não havia sido aceita. Confirmações de OTP também mostravam erro genérico de código para o limite de tentativas.

Solicitações e reenvios agora verificam o erro antes de avançar. O limite de tentativas recebe a mensagem específica, também nas confirmações. Respostas bem-sucedidas continuam neutras para preservar a proteção contra enumeração de contas.

Verificação: `e2e/review-experience.spec.ts`: consome três solicitações reais para um endereço inexistente e envia a quarta pelo formulário; exige 429, mensagem de limite e ausência do campo de OTP. Nenhum e-mail externo é enviado.

## Triage

- Decision: `VALID`
- Notes: Correção implementada e verificada em 02/10/2026. Suítes finais: 210 testes unitários do app, 79 de integração, 16 jornadas E2E e 112 testes de e-mails aprovados. Build, TypeScript, Biome e auditorias de conteúdo aprovados. Cobertura e limites em README.md.
