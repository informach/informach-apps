---
status: resolved
file: apps/missao-saber/src/features/learning/repository.ts
line: 128
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Revalidar assinatura na transação que inicia a missão

## Review Comment

`begin()` calcula `paid` e `profileAllowed` no dashboard e aplica `lessonAvailability()` antes de chamar o repositório. A transação de `startSession()` revalida propriedade, curso e suspensão, mas não consulta novamente a assinatura nem o limite de perfis. Um webhook de inadimplência/downgrade pode ser confirmado entre essas duas etapas e a transação ainda congela no snapshot uma missão paga. Além disso, o `startSession()` exportado aceita diretamente qualquer lição paga sem contexto de entitlement.

Isso contraria o critério F1.2 de aplicar a política canônica também na transação e deixa um TOCTOU no controle pago. Coordenar o início com o mesmo lock de ciclo de vida da cobrança e reler, dentro da operação protegida, o plano efetivo e a posição autorizada do perfil. O repositório não deve possuir um caminho capaz de persistir a sessão sem essa decisão transacional. Cobrir downgrade, `past_due` e início concorrentes, além de uma chamada interna que tente ignorar o serviço.

## Triage

- Decision: `VALID`
- Notes: O cálculo de acesso feito antes da transação permite TOCTOU e o repositório exportado não repete a autorização. O início será serializado pelo mesmo advisory lock do ciclo de cobrança, relerá assinatura e posição do perfil e fará a decisão canônica antes de persistir o snapshot.
