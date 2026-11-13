# Dia de Estrela

Rotina visual para crianças, com passo a passo falado, lembretes gentis, estrelas, baú do dia e loja de recompensas; área dos pais no celular, com aprovação de tarefas e alertas. Regras e decisões em [CLAUDE.md](CLAUDE.md); publicação em [PRODUCAO.md](PRODUCAO.md).

## Abrir localmente

O app usa a central da conta na porta 3011 e seu callback OIDC na porta 3008. Para desenvolvimento persistente, configure os ambientes locais conforme [Minha conta](../conta/PRODUCAO.md), registre os clientes com `pnpm --filter @informach/conta setup:oauth` na base local e execute `pnpm dev:conta` e `pnpm dev:dia-de-estrela`. Não use credenciais ou dados de produção.

O primeiro uso ativa crianças já cadastradas na Minha conta. Ajustes → Aparelhos gera um código para `/conectar` em outra janela. Troca de família fica em `/contexto`; o cookie é só uma preferência, validada a cada pedido.

## Verificar

```bash
pnpm install --frozen-lockfile
pnpm --filter @informach/dia-de-estrela typecheck
pnpm --filter @informach/dia-de-estrela test
pnpm --filter @informach/dia-de-estrela test:integration
pnpm --filter @informach/dia-de-estrela e2e
pnpm exec biome check apps/dia-de-estrela
```

Os dois últimos gates usam o runner comum `scripts/compasso/integration.mjs`, que cria e remove PostgreSQL descartável. O E2E também cria Redis autenticado, registra OIDC e constrói central/app em standalone com artefatos próprios. Não lê credenciais externas da `.env`. A fixture usa PostgreSQL embutido no Windows ou base local isolada no CI, conforme o contrato do runner. O antigo `preview:setup` e o runner próprio foram retirados.

O E2E cobre login central, ativação de uma pessoa existente, primeiro uso, tarefa, pareamento, lembrete, aprovação, bônus, loja e PIN; o segundo cenário usa o teste real do Compasso e duas crianças. Computador, celular e tablet deitado são executados em série. Telas ficam em `apps/conta/tmp/telas`, e falhas em `apps/conta/test-results/compasso-apps/dia-de-estrela`.

Os ensaios de banco verificam isolamento, permissões separadas, revogação durante espera por trava, dispositivos, PIN, arquivos, exportação, exclusão e eventos em tempo real. O backfill histórico fica em `packages/family/src/estrela-backfill.integration.ts` e roda no gate compartilhado `pnpm compasso:test:integration`. Gates e limitações realmente observados ficam no [registro da migração](../../docs/propostas/assinatura-web-2026-11-09/implementacao.md).

## Estrutura

- `src/domain`: lógica pura (motor do dia, relógio da casa, estrelas, rotinas prontas), com testes.
- `src/features/<área>`: `repository.ts` (banco), `actions.ts` (server actions), `components/` (telas), por área: `familia`, `aparelho`, `crianca`, `pais`, `rotina`, `estrelas`, `loja`, `lembretes`, `tempo-real`, `arquivos`, `billing`, `acesso`.
- `src/app/(pais)`: Início, Rotinas, Cofrinho e Ajustes (adulto com conta ou PIN no aparelho).
- `src/app/crianca`: Quem está usando, Hoje, Cofrinho, Loja e PIN (só aparelho conectado).
- `src/app/api`: auth, aparelho (conectar, entrar, sinal), eventos (SSE), voz, foto da meta, exportar, jobs, webhooks, health e ready.
- Schema `dia_de_estrela` em `packages/db/src/schema/dia-de-estrela.ts`, origem `0078_dia_de_estrela`; identidade compartilhada em `0080`–`0082` e contrato final deste app em `0114`–`0116`.
