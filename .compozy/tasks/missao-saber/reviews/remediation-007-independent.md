# Revisão independente da remediação — reviews-007

Revisor: `/root/review_remediation_007`. Data: 13/09/2026. Escopo: correções dos cinco achados da rodada 007 e seus consumidores compartilhados. Esta revisão não altera código-fonte nem issues e não cria a rodada 008. Segue `cy-review-round` e `cy-final-verify`.

Parecer de código: favorável no escopo das cinco correções, sem novos achados pendentes após a releitura dos refinamentos de H1, H3 e H4. Zero achados novos critical/high/medium/low; nenhuma rodada 008 criada. A execução final de testes, browser, typecheck e build pertence ao agente principal; este parecer não substitui essas evidências nem declara o pipeline global aprovado.

## Contexto e mapa

Foram lidos `_prd.md`, `_techspec.md`, `_tasks.md`, os critérios da skill e as issues das rodadas 001–007. Não existe diretório `adrs/` nesta tarefa. Os 18 achados anteriores foram considerados para evitar duplicação. A análise priorizou os arquivos de implementação do ciclo de cobrança, depois schema/migração, consumidores de e-mail e histórico pedagógico.

| Caminho | Responsabilidade e dependências relevantes |
|---|---|
| `billing/service.ts` do app → `@informach/billing/checkout.ts` → `checkout-lifecycle.ts` | A ação valida família/preço, retém o lock do responsável e reserva uma intenção persistida antes de iniciar o Checkout remoto. |
| `billing.checkout_intents` → `core.users` e `billing.customers` | Uma intenção por cliente, parâmetros duráveis e FK restritiva que impede excluir a identidade durante cobrança possível. A migração 0042 cria essa estrutura de forma aditiva. |
| `providers/stripe.ts` | Recupera sessões por ID ou histórico paginado, verifica assinatura remota, expira links anteriores e preserva a sessão compatível. O prazo e os metadados também seguem para Stripe. |
| `subscriptions.ts` → provider → cliente/assinaturas locais | Recupera resultado desconhecido antes do encerramento, cancela estado remoto, grava tombstones e só então libera a guarda e permite apagar dados do app. |
| Webhook do app → lock → dispatcher → liquidação da intenção | Evento desconhecido/estrangeiro é rejeitado no limite do app. Liberação da guarda precisa referir-se somente ao cliente do evento sob seu lock. |
| `maintenance.ts` → factory → `sweepers.ts` | Reconciliação e dunning usam o mesmo lock durante releitura, consulta remota, gravação e envio. Candidatos antigos não são autoridade. |
| Cozya/Agenda → guard de outras assinaturas → Better Auth | Guard de intenção oferece resposta antecipada; a FK protege a exclusão efetiva caso o guard tenha ocorrido antes do checkout. A implementação instalada de Better Auth executa `beforeDelete` antes de `internalAdapter.deleteUser`. |
| `emails/dispatch.ts` → parsers dos três apps → `emails/webhook.ts` | `informach_category` evita colisão com o campo do provedor. A entrega persistida prevalece sobre argumentos/categorias; arrays são normalizados antes do descadastro. |
| Hoje/histórico → serviço → repositório → sessão versionada | Pausa consultada separadamente, resumo sem snapshot/gabarito, histórico paginado e autorizado por responsável/perfil; leitura de sessão permanece independente da assinatura. |
| `weeklyEvidence` → Hoje/relatório da família | Hoje e seis datas civis anteriores em São Paulo, com limite superior no instante da consulta, para todas as métricas. |

## Refinamentos encontrados durante a revisão

Os três pontos abaixo pertencem às raízes já registradas em 007, portanto foram comunicados para correção na mesma rodada.

1. **H1 — não transferir a guarda para uma consulta local sem atomicidade.** A primeira remediação apagava a intenção assim que o webhook projetava a assinatura. Cozya/Agenda podem passar seus guards antes de a intenção existir, aguardar outra limpeza e executar o delete após essa projeção. Remover a FK nessa janela deixa uma assinatura remota ativa com a identidade apagada. A solução acordada mantém a FK durante todo o ciclo pagável e exige confirmação remota atual para liberá-la. Também evita varrer intenções de outros responsáveis a partir do lock de um único evento. Uma intenção apenas reservada (`requestStarted=false`) não deve passar pela recuperação que pode criar uma sessão remota.

2. **H4 — preservar precisão do cursor.** A primeira paginação convertia `timestamptz` para `Date`/ISO, descartando microssegundos de `now()` do PostgreSQL. Com 36 linhas no instante `2026-09-13T15:00:00.123456Z`, o limite de página com ID 17 virava `.123Z`; a comparação retornava zero linhas restantes, quando deveria retornar 16. A solução acordada usa apenas o UUID como cursor e relê o par `(created_at,id)` no banco, em subconsulta do mesmo perfil.

3. **H3 — propagar o contrato aos consumidores compartilhados.** Os parsers de Cozya e Agenda ainda aceitavam só string; o de Cozya também removia o novo `informach_category` com `.strip()`. A mudança do dispatcher é global, portanto esses dois parsers e seus testes também precisam aceitar/preservar o contrato atualizado.

Releitura final em 13/09/2026, aproximadamente 15:50 UTC: os três refinamentos estão no código. H1 retém a intenção após projeção, limita a liquidação ao cliente do evento e não recupera/cria sessão a partir de reserva não iniciada. Sessão aberta ou completa sem subscription ID permanece protegida; nos demais casos a remoção exige `prepareSubscriptionCheckout`, cuja consulta remota rejeita qualquer assinatura não terminal. H4 compara o cursor UUID com a âncora do mesmo perfil no PostgreSQL; o teste agora grava microssegundos reais e verifica todas as 36 sessões, sem duplicação nem snapshot. H3 aceita string/array e preserva `informach_category` nos três apps, com regressões específicas dos parsers. Também foi relido o teste de proteção FK após webhook e nova assinatura após término confirmado. A execução desses testes está a cargo do agente principal.

## Critérios do PRD e áreas técnicas

| Critério | Avaliação da remediação |
|---|---|
| 1. App, responsável, isolamento e PostgreSQL | Guarda do ciclo de cobrança protege a identidade compartilhada; consultas pedagógicas continuam exigindo perfil próprio. |
| 2. Catálogo autoral piloto | Correções não alteram questões, faixa de anos, status editorial ou separação dos arquivos oficiais. Validação pedagógica humana continua uma etapa externa. |
| 3. Missões, diagnóstico, revisão e retomada | H4 restaura acesso a pausas antigas; resumos omitem gabaritos; snapshot e correção permanecem no caminho existente. H5 corrige evidências semanais sem mudar a regra de domínio. |
| 4. Experiência e ferramentas | Novo acesso “Meu histórico” apresenta percurso concluído/pausado e navegação entre páginas. Verificação responsiva final cabe ao ensaio de browser. |
| 5. Assinatura e acesso ao histórico | H1 impede oferecer links concorrentes, inclusive após resposta perdida; H2 protege o encerramento contra jobs. O histórico não recebe novo gate pago. |
| 6. Rotina, privacidade e editorial | H3 preserva descadastros e supressões; guarda FK exige resolução da cobrança antes da exclusão global. Demais controles permanecem no escopo original. |
| 7. Verificação e operação | Migração 0042, regressões PostgreSQL/provider/parser/motor e browser precisam constar no relatório final do agente principal. Nenhum deploy ou provedor real foi acionado pelo revisor. |

Segurança: nenhuma nova exposição de gabarito ou autorização cruzada identificada nos DTOs e consultas examinados. Correção/concorrência: os refinamentos acima foram os pontos concretos adicionais. Desempenho: histórico usa página limitada; consultas remotas percorrem todas as páginas necessárias; locks continuam no pool separado. Erros: falhas externas retêm guarda/dados; dunning só avança após entrega confirmada. Manutenibilidade: comportamento de cobrança é opt-in e mantém o contrato anterior dos demais apps. Testes: foram lidos os cenários de perda de resposta, expiração, webhook, encerramento, paginação e categoria assinada; a aprovação executável exige os logs finais. Arquitetura: a FK nova representa uma guarda operacional temporária para usuário, sem alterar owner polimórfico ou retenção das tabelas fiscais; essa exceção ao guia do billing precisa ficar documentada. Operação: preços reais, migração do ambiente de implantação, webhooks e provedor em modo de teste continuam etapas de liberação, não efeitos desta revisão.

## Evidência independente de precisão

O revisor executou somente SELECTs com CTE no PostgreSQL local, sem criar tabela nem alterar dados de aplicação. A primeira tentativa com role `postgres` falhou porque essa role não existe; a execução correta usou `informach`.

```text
VERIFICATION REPORT
-------------------
Claim: A comparação por âncora mantida no PostgreSQL preserva as linhas empatadas em microssegundos.
Command: docker exec informach-postgres psql -U informach -d postgres -Atc "WITH sessions AS (SELECT '2026-09-13T15:00:00.123456Z'::timestamptz AS created_at, i AS id, 1 AS profile_id FROM generate_series(1,36) i) SELECT count(*) AS remaining_after_page_1 FROM sessions WHERE profile_id=1 AND (created_at,id) < (SELECT created_at,id FROM sessions WHERE id=17 AND profile_id=1);"
Executed: 2026-09-13, durante esta revisão, antes da releitura final.
Exit code: 0
Output summary: 16; a comparação anterior com timestamp .123Z retornou 0.
Warnings: none
Errors: none na execução correta
Verdict: PASS — limitado à semântica da comparação SQL; não substitui a integração da função real.
```

A leitura do SDK instalado confirmou a API `2026-04-22.dahlia` e o campo `expires_at`; a documentação embarcada informa prazo entre 30 minutos e 24 horas após criar a sessão. Os parâmetros persistidos usam uma hora. Não houve chamada à Stripe nem ao SendGrid pelo revisor.

## Verificação focada do revisor

```text
VERIFICATION REPORT
-------------------
Claim: Os 23 arquivos de implementação selecionados para esta revisão passam no Biome após os refinamentos.
Command: pnpm exec biome check packages/billing/src/checkout-lifecycle.ts packages/billing/src/checkout.ts packages/billing/src/providers/stripe.ts packages/billing/src/providers/types.ts packages/billing/src/subscriptions.ts packages/billing/src/config.ts packages/billing/src/index.ts packages/billing/src/sweepers.ts packages/db/src/schema/billing.ts packages/emails/src/webhook.ts packages/emails/src/dispatch.ts apps/missao-saber/src/features/billing apps/missao-saber/src/features/learning/engine.ts apps/missao-saber/src/features/learning/service.ts apps/missao-saber/src/features/learning/repository.ts 'apps/missao-saber/src/app/(app)/historico/page.tsx' apps/missao-saber/src/app/api/webhooks/sendgrid/route.ts apps/cozya/src/features/account/repository.ts apps/cozya/src/features/emails/schemas.ts apps/agenda-da-turma/src/features/account/repository.ts apps/agenda-da-turma/src/lib/sendgrid-webhook.ts
Executed: 2026-09-13, após reler os refinamentos finais.
Exit code: 0
Output summary: Checked 23 files in 51ms. No fixes applied.
Warnings: none
Errors: none
Verdict: PASS — somente lint/formatação dos arquivos indicados.
```

O principal ponto positivo é a proteção acompanhar o estado remoto e a identidade durante todo o ciclo que ainda pode cobrar, além de reaproveitar a mesma coordenação nos jobs. Nenhuma alteração de fonte foi feita por este revisor; somente este parecer foi criado. Não há afirmação de aprovação de Stripe/SendGrid reais, produção, revisão pedagógica humana ou check global do monorepo.
