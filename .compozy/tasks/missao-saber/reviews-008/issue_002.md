---
status: resolved
file: apps/missao-saber/src/lib/observability.ts
line: 21
severity: medium
author: claude-code
provider_ref:
---

# Issue 002: Detectar falha de auditoria sem depender da rota de autenticação

## Review Comment

`audit()` importa `logAuditEvent` e conecta um `.catch()` que parece observar erros de persistência. Porém `packages/auth/src/audit.ts` captura internamente a falha do insert e só chama os hooks configurados por `createAuth()`. As rotas de billing/job/e-mail inicializam seus serviços sem importar `lib/auth.ts` nem chamar `createAuth`; portanto a configuração `authObservability` pode nunca existir naquele processo/bundle. Nessa execução, um insert de auditoria rejeitado resolve a Promise normalmente e nenhum log/Sentry é emitido. Isso deixa o monitoramento novo cego justamente em endpoints externos e crons.

Fazer a persistência do hook billing/email observar sua própria falha, ou fornecer configuração explícita de observabilidade ao helper de auditoria que não dependa da inicialização de outra rota. Preservar comportamento best-effort e sanitização: a falha da auditoria deve ser reportada sem impedir webhook/envio e sem vazar payload, SQL ou credenciais. Testar o hook isoladamente, sem criar a instância de auth, com o insert rejeitado.

## Triage

- Decision: `VALID`
- Notes: O helper compartilhado recebe hooks opcionais por chamada, conservando o default anterior para outros apps. O hook Missão injeta authObservability explicitamente, sem depender da criação da instância de auth. Dois testes verificam falha de persistência sem inicialização e compatibilidade com hooks globais existentes.
- Verification: Helper, wiring e testes relidos; agente principal executou o workspace incluindo os dois testes novos de auditoria; check independente de 13 arquivos aprovado. Ver [relatório](../reviews/production-architecture.md).
