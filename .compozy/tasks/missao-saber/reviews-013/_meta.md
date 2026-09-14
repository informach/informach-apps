---
provider: manual
pr:
round: 13
created_at: 2026-09-13T23:01:51Z
---

## Summary

- Total: 5
- Resolved: 5
- Unresolved: 0

## Escopo e parecer

Full review independente do estado comercial atual das fases01–06 do Missão Saber, orientado pelo `PLANO-VERSAO-COMERCIAL.md` e suas fases detalhadas. PRD, TechSpec, tarefas, ADR e rodadas anteriores foram considerados conforme sua vigência. A retirada do fluxo editorial é uma decisão explícita do escopo comercial; referências em migrações e reviews históricos não foram tratadas como dependências ativas.

**Correções concluídas.** Os três achados altos e os dois médios foram corrigidos e revalidados. A homologação real da Stripe em modo teste e a entrega real do OTP pelo SendGrid também foram concluídas após as correções.

Arquivos gerados: `issue_001.md`, `issue_002.md`, `issue_003.md`, `issue_004.md` e `issue_005.md`.

Revalidação independente final em 14/09/2026, 00:32 UTC: os cinco achados e suas bordas complementares foram encerrados. Foram confirmados participação de justificativa pulada, 96 problemas reservados distintos, identidade semântica compartilhada, recuperação de agendamento, fontes legadas e aceitação/entrega sem reenvio. As duas issues adicionais da rodada014 também estão resolvidas. O parecer vigente e a distinção entre código revisado e deployment estão em `../reviews/commercial-final-verification.md`. As observações e reproduções de falha abaixo preservam o histórico da abertura da rodada, antes das correções.

## Mapa da implementação revisada

- Assinatura: ações da família exigem usuário verificado e confirmação recente; serviço isola o customer por app e serializa alterações pelo proprietário. Política de preço/capacidade determina troca imediata ou no fim do período. Stripe usa cobrança pendente antes de aplicar upgrades; downgrade persiste intenção local e aplica a substituta no webhook de exclusão. Portal tem atualização de plano desativada para respeitar a escolha do perfil retido.
- Produção: configuração Railway versiona build/start, readiness e cron; Redis sustenta locks/cursor/autenticação, Sentry recebe erros sanitizados e falhas do cron. Foram inspecionados os helpers de provisionamento, verificação de schema, restauração de backup, envelope do monitor e scripts de evidência dos provedores. Não foram executados contra serviços externos nesta revisão.
- E-mail compartilhado: envelope original persiste remetente e unsubscribe; retry mantém o app de origem, exclui autenticação e delega dunning ao ciclo de billing. Coletor assinado resolve a categoria pela entrega e aceita categoria-array do SendGrid. O novo estado de entrega tem o problema descrito em005.
- Famílias e privacidade: propriedade validada no servidor; operações pedagógicas serializadas pelo proprietário; acesso pago revalidado sob lock de billing; manutenção autorizada por conta verificada; exportação exige sessão recente e omite snapshots/gabaritos; exclusão remove relatos e dados pedagógicos em cascata.
- Conteúdo: missões autorais, bancos reservados, múltiplos formatos, reflexões sem nota automática, exposição compartilhada por família, snapshots de sessões e manutenção por hash. O explorador independente confirmou604 atividades com IDs únicos,61 missões,96 itens reservados em8 bancos e37 justificativas. As contagens não validam por si só a qualidade didática, especialmente002.
- Migrações0044–0049: controles de suspensão e interrupção; resultado formativo com `correct` nullable; `access_enabled` para perfil retido; remoção física de `releases`; relatos versionados/histórico de triagem e marco familiar; `confirmed_at` financeiro com backfill de estados confirmados. O código ativo não depende de editorial. A remoção física de `releases` exige que qualquer rollback use um binário compatível com o schema comercial.

## Evidência de verificação

Foram realizadas reproduções read-only com imports dos módulos reais. O explorador executou as reproduções de catálogo, recomendação e proveniência; o revisor executou diretamente as reproduções de cobrança e e-mail. Nenhum arquivo de fonte, banco ou serviço externo foi alterado.

- Catálogo:604 atividades,61 missões,96 itens reservados,37 justificativas. Regra textual do prefixo correto acertou48/48 itens de simulado.
- Recomendação: evidência contendo todos os itens objetivos praticados do OLITEF ainda recomenda/revisa `fracoes-formatos`;16 missões continuam incompletas na regra da Jornada.
- Proveniência: snapshot v1 resolve uma origem na versão corrente e passa a resolver nenhuma após avanço do banco para v2; snapshot legado com itens de missões também não resolve origem.
- Cobrança: função real `switchPlan`, adapter em memória retornando assinatura ainda agendada, confirmou `remainsScheduled: true` e `pendingCleared: true`. A inspeção do adapter Stripe confirma ausência de reativação; a documentação oficial confirma o contrato do campo.
- E-mail: função real `handleSendgridEvent`, único evento `processed`, confirmou gravação de `delivered`. Não foi enviado e-mail.

VERIFICATION REPORT
-------------------
Claim: Lint/formatação dos seis arquivos centrais dos achados passam sem alterações.
Command: `pnpm exec biome check packages/billing/src/plan-changes.ts packages/billing/src/providers/stripe.ts packages/emails/src/webhook.ts apps/missao-saber/src/features/learning/recommendation.ts apps/missao-saber/src/features/content/catalog.ts apps/missao-saber/src/features/content/commercial-curriculum.ts`
Executed: 2026-09-13, nesta revisão.
Exit code: 0
Output summary: `Checked 6 files in 40ms. No fixes applied.`
Verdict: PASS

VERIFICATION REPORT
-------------------
Claim: Reproduções de cobrança e SendGrid executam sobre funções reais, sem I/O externo.
Command: Código via stdin em `node node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs --input-type=module`.
Executed: 2026-09-13, nesta revisão.
Exit code: 0
Output summary: Cobrança manteve cancelamento e limpou intenção; SendGrid promoveu `processed` a `delivered`.
Verdict: FAIL (comportamentos funcionais descritos nas issues003 e005 reproduzidos).

A primeira tentativa de executar via `pnpm exec tsx` não encontrou o binário no pacote raiz; foi repetida com o TSX já instalado no workspace. Nenhuma dependência foi instalada. Esta revisão não repetiu suites integrais, E2E, migrations, deploy ou homologação real de provedores e não certifica estado remoto. As evidências existentes foram consideradas sem converter sua ausência em novos defeitos presumidos.

Após triagem, processar a rodada com `compozy fix-reviews --name missao-saber`.
