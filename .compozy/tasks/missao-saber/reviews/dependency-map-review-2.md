# Mapa de dependências e revisão independente — segunda revisão completa

Data: 13/09/2026, 15:08 UTC. Revisor: agente `review_dependency_billing`.
Escopo: implementação não commitada do Missão Saber, compartilhados alterados e fronteiras de cobrança/autenticação/e-mail. Apenas leitura da fonte. Esta nota não cria uma nova rodada canônica nem declara a implementação pronta.

## Mapa da implementação

| Entrada | Domínio / dependência | Persistência / efeito |
| --- | --- | --- |
| RSCs e actions do novo app | `lib/auth.ts` → `@informach/auth` / Better Auth; `lib/action.ts` exige usuário verificado e autenticação recente nas ações de responsável | `core.users`, `core.sessions`, `core.accounts`, `core.verifications`; conta Informach global, perfis pedagógicos por app |
| Hoje/Jornada/Revisão/Simulado/Player | `features/learning/service.ts` → catálogo autoral/motor/recomendação → `learning/repository.ts` | `missao_saber` famílias, perfis, sessões congeladas, tentativas, pistas, notas; correção e autorização no servidor |
| Laboratório | schemas/matemática/componentes → `labs/repository.ts` | Experimentos por perfil/ferramenta com revisão otimista |
| Editorial | allowlist + sessão recente → serviço/repositório → catálogo/hash | Decisões append-only; locks de publicação e criação de sessão; relatos abertos separados do histórico |
| Escolher plano | `family/actions.ts` (editorial, sessão recente) → `billing/service.ts` → `@informach/billing/checkout` | Customer isolado por app; provedor Stripe cria Checkout; assinatura só aparece localmente com webhook |
| Portal de assinatura | action com sessão recente → serviço do app → `@informach/billing/portal` | Busca customer do mesmo usuário/app; Stripe hospeda gerenciamento |
| Encerrar e apagar | action → `closeBillingAndFamily` → `closeRemoteBillingForSubject` → provider `closeCustomerSubscriptions` → `clearFamily` | Expira checkouts, cancela assinaturas remotas, grava IDs encerrados em metadata financeira, remove dados pedagógicos |
| Webhook Stripe | corpo limitado + assinatura → `handleBillingEvent` → dispatcher compartilhado | Rejeita customer estrangeiro; coordena por responsável; guarda tombstones; idempotência persistida |
| Job de cobrança | bearer de tamanho/valor constante → `maintainBilling` → reconcile/dunning compartilhados | Atualiza assinaturas; e-mails idempotentes; atualmente não entra no lock de lifecycle |
| E-mail | `lib/emails.ts` → `@informach/emails` (dispatch/templates/unsubscribe/webhook) | Deliveries/supressões/preferências compartilhados; modo local sem transporte real |
| Webhook SendGrid | limite de corpo + ECDSA/janela temporal + Zod → serviço de e-mails | Estados de entrega, supressões e descadastro; incompatibilidade de categoria descrita abaixo |
| Exportação | endpoint → autenticação recente → `exportFamily` | Só dados pertencentes ao responsável; avaliações incompletas sem correção |

`@informach/config` adiciona app e quatro produtos. `@informach/db` adiciona schema/migrations 0040 e 0041, exports de operadores e pool de locks. `@informach/billing` adiciona encerramento remoto opt-in, guard de assinaturas encerradas, tratamento explícito de supressão no dunning e isolamento de faturas. Pacotes continuam consumidos como fonte TypeScript; Next transpila os compartilhados e Turbo inclui as cinco variáveis `MISSAO_*`. Não há importação entre apps no novo app. O exame de Cozya/Agenda abaixo é de integração da conta compartilhada.

## Achados novos confirmados

### H1 — Múltiplos checkouts do mesmo responsável continuam pagáveis

Severidade proposta: **high**.
Ponto principal novo: `apps/missao-saber/src/features/billing/service.ts:72`–74.
Dependências: `packages/billing/src/checkout.ts:63`, `:279` e `:283`.

O lock termina assim que a URL do Checkout é criada. O único bloqueio posterior é a existência de assinatura local active/trialing/past_due; nenhum estado representa um checkout ainda aberto. A chave idempotente contém produto e janela de cinco minutos. Duas abas podem, portanto, abrir Individual mensal e Família mensal antes do pagamento, ou duas sessões do mesmo produto em janelas distintas, e conservar duas URLs pagáveis. Pagar ambas cria duas assinaturas/cobranças; `getProSubscription` escolhe somente uma delas com `limit(1)`. Serializar a criação não evita o caso sequencial.

Reprodução executada com catálogo real (preços de fixture), funções reais de checkout/customer e PostgreSQL descartável migrado; somente o provedor de Checkout foi substituído por coletor de chamadas. Duas chamadas sequenciais para o mesmo customer retornaram:

```json
{"repro":"two_open_checkout_sessions","sessions":["cs_1","cs_2"],"providerCalls":2,"differentKeys":true}
```

Corrigir com lifecycle persistente de checkout por customer/app: retomar uma sessão compatível e ainda aberta ou expirar a anterior antes de criar outra, resolvendo pagamento concluído com webhook atrasado pelo provedor. A exclusão mútua deve cobrir a transição, não apenas a emissão da URL. Cobrir troca de produto, passagem da janela idempotente, resposta perdida e pagamento remoto ainda não projetado. Este achado é distinto da antiga issue F4 de expirar sessões durante exclusão: aqui a duplicação acontece sem exclusão.

### H2 — Reconcile consegue reativar uma assinatura já encerrada

Severidade proposta: **high**.
Ponto principal novo: `apps/missao-saber/src/features/billing/maintenance.ts:9`.
Mutação relevante: `packages/billing/src/sweepers.ts:450` (WHERE apenas pelo ID local).

Checkout, exclusão e webhook compartilham `withBillingLifecycle`; o job não. O reconcile seleciona uma assinatura e aguarda o provedor sem preservar o estado local nem checar o tombstone na escrita. Uma consulta que capturou estado remoto active antes do encerramento pode concluir depois que `closeRemoteBillingForSubject` gravou canceled, reescrevendo active. O guard de `closedSubscriptionIds` existe apenas no dispatcher de webhooks, e não impede essa gravação. Recriar a família pode recuperar acesso pago indevido até o próximo reconcile, e o estado exibido contradiz o encerramento já confirmado. Dunning também não participa da coordenação e pode trabalhar sobre candidatos capturados antes da limpeza.

Reprodução executada em PostgreSQL descartável: assinatura inicialmente past_due; `retrieveSubscription` representa a resposta active capturada e fica retida; encerramento grava canceled/tombstone; a resposta é liberada. Resultado:

```json
{"repro":"stale_reconcile_after_closure","closedStatus":"canceled","finalStatus":"active","tombstone":["sub_review"],"sweeper":{"scanned":1,"reconciled":1,"mismatches":1,"errors":0}}
```

Corrigir a coordenação por responsável também no processamento de cada candidato do job, recarregando estado sob o lock e respeitando o encerramento antes de efeitos externos/gravações. Alternativamente, uma escrita condicionada por versão/tombstone precisa impedir a resposta obsoleta; não basta conferir antes do `await` remoto. Cobrir resposta atrasada do reconcile e dunning versus encerramento. A recomendação operacional de não sobrepor jobs não evita concorrência com a ação da família. Raiz distinta das anteriores: escritor assíncrono adicional fora do protocolo de lifecycle.

### H3 — Webhook rejeita o formato documentado de categorias do SendGrid

Severidade proposta: **high**.
Ponto principal novo: `apps/missao-saber/src/app/api/webhooks/sendgrid/route.ts:22`.
Dependências: `packages/emails/src/dispatch.ts:342`/`:379` e `packages/emails/src/webhook.ts:20`/`:108`.

O dispatcher envia `categories: [input.category]`. A documentação oficial informa que categorias enviadas como array retornam como array no webhook. A rota aceita somente `category: z.string()` e recusa o lote inteiro com 400, antes de gravar entregas/supressões/descadastros. O teste de integração atual usa uma string e, por isso, não detecta a incompatibilidade. O campo `category` também é um campo do provedor, não um nome seguro para argumento próprio sem normalização explícita.

Fonte primária conferida em 13/09/2026: [SendGrid Event Webhook Reference — category](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event).

Reprodução contra a função POST real da rota, com chave ECDSA gerada localmente, timestamp atual e assinatura válida. Evento bounce com `category: ["billing.payment-failed"]`:

```json
{"repro":"signed_documented_category_array","status":400,"body":"Invalid events","databaseUsed":false}
```

Corrigir o schema/normalização para strings e arrays documentados e definir resolução segura da categoria interna, de preferência pela delivery identificada ou por argumento próprio com nome sem colisão. Testar a rota assinada com os formatos do provedor, incluindo lote e persistência da supressão/descadastro. Raiz distinta da antiga issue F4 que descartava metadata: o campo agora é preservado, mas seu tipo recusa payloads legítimos.

## Conta compartilhada e exclusão entre apps

`lib/auth.ts` do Missão desabilita exclusão global e oferece encerramento apenas dos dados do produto. Cozya (`src/lib/auth.ts:128`) e Agenda (`src/features/account/deletion.ts:7`) já chamam `hasOtherAppSubscriptions` antes de excluir a conta global. Ambas as queries excluem o próprio app e incluem active/trialing/past_due/unpaid/incomplete/paused; por serem genéricas, alcançam assinaturas locais do Missão sem mudar uma lista de apps. Não encontrei ausência da proteção para assinaturas já projetadas.

Limite relevante ligado ao H1: um checkout aberto ou pagamento ainda não projetado não aparece nessas consultas. Uma exclusão global originada em outro app pode passar antes do pagamento de uma URL de Missão ainda válida. A correção do lifecycle de checkout deve considerar essa fronteira, em vez de tratar somente assinatura já local. Não foi executada exclusão real de conta de nenhum app ou banco de uso normal.

Autenticação utiliza rate limit persistido em DB, e-mail verificado, origem configurada e cookie assinado. A sessão recente continua exigida para cobrança/exportação/exclusão; logout fica acessível fora dessa janela. Rotas de jobs, Stripe e SendGrid possuem verificações próprias. Nenhum achado adicional de bypass foi confirmado nessa leitura.

## Evidências e limites da revisão

PRD, TechSpec, tarefas e 18 issues antigas (rounds 001–006) consultados; as três raízes acima não eram os defeitos registrados anteriormente. Os critérios 1, 5, 6 e a parte operacional de 7 foram confrontados com seus fluxos; conteúdo/motor/UX estão sob revisão principal em paralelo. As migrations dos dois ensaios de billing só foram aplicadas em uma base local nova, de nome restrito `missao_review_<32hex>`, que foi removida no `finally`. Nenhuma mudança de fonte, deploy, e-mail real ou cobrança foi feita por este revisor.

```text
VERIFICATION REPORT
-------------------
Claim: H1 e H2 reproduzidos em PostgreSQL isolado com funções reais
Command: Harness inline via pnpm --filter @informach/billing exec node --import tsx --input-type=module
Executed: 13/09/2026, nesta revisão, antes da escrita desta nota
Exit code: 0
Output summary: providerCalls=2, differentKeys=true; closedStatus=canceled, finalStatus=active; Disposable review database removed
Warnings: Notices conhecidos das migrations (extensões já presentes e identificador PostgreSQL truncado)
Errors: none
Verdict: PASS (reprodução dos defeitos, não aprovação da implementação)

VERIFICATION REPORT
-------------------
Claim: H3 reproduzido pela função POST real, sem acesso a DB
Command: Harness inline via pnpm --filter @informach/missao-saber exec node --import ../../packages/billing/node_modules/tsx/dist/loader.mjs --input-type=module
Executed: 13/09/2026, nesta revisão, antes da escrita desta nota
Exit code: 0
Output summary: signed_documented_category_array; status=400; body=Invalid events; databaseUsed=false
Warnings: Harness substitui somente o marcador server-only no cache de módulos; fonte da rota permanece intacta
Errors: none no ensaio final; duas tentativas anteriores de inicialização falharam antes da chamada de POST e não são evidência do achado
Verdict: PASS (reprodução do defeito, não aprovação da implementação)

VERIFICATION REPORT
-------------------
Claim: Lint/format limpos nos 27 arquivos de fronteiras revisados
Command: pnpm exec biome check apps/missao-saber/src/features/billing apps/missao-saber/src/features/family apps/missao-saber/src/lib apps/missao-saber/src/app/api packages/billing/src/subscriptions.ts packages/billing/src/webhooks/index.ts packages/billing/src/webhooks/invoice.ts packages/billing/src/sweepers.ts packages/billing/src/providers/stripe.ts packages/db/src/locks.ts
Executed: 13/09/2026, 15:08 UTC
Exit code: 0
Output summary: Checked 27 files in 48ms. No fixes applied.
Warnings: none
Errors: none
Verdict: PASS (somente esse recorte)
```

Recomendação para o escopo: **Needs fixes before merge** pelos três achados high. Os ensaios não equivalem a homologação com Stripe/SendGrid reais. Verificação ampla e redação da rodada canônica ficam a cargo da revisão principal.
