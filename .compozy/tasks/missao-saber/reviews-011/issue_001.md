---
status: resolved
file: apps/missao-saber/src/features/learning/repository.ts
line: 226
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Bloquear sessões pagas quando o direito expira

## Review Comment

`startSession()` revalida a assinatura e a posição do perfil sob o lock do ciclo de cobrança, mas uma sessão já criada deixa de passar por essa política. `readSession()`, `recordAnswer()` e `recordHint()` verificam propriedade, manutenção e conclusão, sem consultar `getAccess()` ou `allowedProfileIds()`. Assim, basta abrir missões pagas antes de uma inadimplência, cancelamento efetivo ou downgrade; depois que o estado canônico revoga o acesso, o perfil ainda recebe o enunciado completo, pede pistas e continua gravando respostas. Perfis excedentes após um downgrade têm o mesmo caminho. O teste de cancelamento em `learning.integration.ts` preserva deliberadamente a leitura de uma sessão incompleta, mas não tenta responder depois da revogação.

Preservar histórico e tentativas concluídas, mas distinguir uma leitura histórica de uma sessão paga ainda ativa. Antes de expor o próximo item e antes de aceitar resposta ou pista, recalcular o direito e a posição do perfil a partir do snapshot. As mutações precisam participar de `withBillingLifecycleWait()` para não correr em paralelo com webhook ou troca de plano. Adicionar testes para sessão paga aberta antes de `past_due`/`canceled`, perfil desativado pelo downgrade e corrida entre resposta e revogação.

## Triage

- Decision: `RESOLVED`
- Notes: As sessões incompletas revalidam assinatura, perfil e trilha sob o lock do ciclo de cobrança antes de ler, responder ou pedir pista; sessões concluídas continuam disponíveis como histórico. A integração cobre past_due, cancelamento, perfil excedente e corrida com revogação.

