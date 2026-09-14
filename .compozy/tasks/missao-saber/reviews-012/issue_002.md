---
status: resolved
file: apps/missao-saber/src/features/learning/components/player.tsx
line: 29
severity: medium
author: claude-code
provider_ref:
---

# Issue 002: Preservar a identidade do relato após recarregar

## Review Comment

O `requestKey` do relato existe somente em `useState(() => crypto.randomUUID())`; `reported` e o formulário também são reiniciados no remount. Se o servidor persistir o relato e a resposta se perder, recarregar a missão e reenviar o mesmo item/categoria cria uma nova chave e uma segunda linha. Mesmo depois de um envio confirmado, recarregar volta a oferecer o envio como se nada tivesse sido registrado. A unicidade de `(userId, requestKey)` e o replay do repository protegem apenas retries da mesma montagem. A duplicação aumenta a recorrência e consome o limite diário, violando expressamente o critério F5 de reenvio e recarregamento sem eventos duplicados.

Persistir/restaurar a intenção de envio e o resultado para o contexto da atividade, ou estabelecer uma identidade semântica de relato no servidor que permita distinguir retry de um novo problema intencional. Não guardar dados pessoais ou texto de estudante em armazenamento de terceiros. A interface deve recuperar um relato já recebido, e um payload diferente não deve reaproveitar silenciosamente a identidade anterior.

O teste `family-observation.integration.ts:78–79` chama `saveReport()` duas vezes com o mesmo objeto; não cobre perda da resposta nem reload do componente. Acrescentar uma jornada que persista o primeiro POST, simule falha de transporte, recarregue e reenvie, conferindo uma linha e uma ocorrência na fila.

## Triage

- Decision: `RESOLVED`
- Notes: A sessão devolve relatos já registrados e o player restaura categoria e detalhe após recarregar. Repetir o mesmo conteúdo com outra requestKey devolve o relato existente; outra categoria continua permitida. Integração e E2E cobrem o comportamento.
