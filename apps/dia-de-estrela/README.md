# Dia de Estrela

Rotina visual para crianças, com passo a passo falado, lembretes gentis, estrelas, baú do dia e loja de recompensas; área dos pais no celular, com aprovação de tarefas e alertas. Regras e decisões em [CLAUDE.md](CLAUDE.md); publicação em [PRODUCAO.md](PRODUCAO.md).

## Abrir localmente

Precisa de um PostgreSQL local (o `DATABASE_URL` da raiz, `.env`, ou na linha de comando). Redis é opcional fora de produção.

```bash
pnpm install
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm --filter @informach/dia-de-estrela preview:setup
pnpm dev:dia-de-estrela   # http://localhost:3008
```

O `preview:setup` cria um banco descartável `estrela_preview_<id>`, aplica as migrations e grava `apps/dia-de-estrela/.env.local` com e-mail em sandbox (os códigos de acesso ficam em `tmp/emails`) e Stripe desligado.

Para testar o tablet: crie a conta em `/entrar`, faça o primeiro uso, gere um código em Ajustes → Aparelhos e abra `/conectar` noutra janela anônima (ou noutro aparelho da rede).

## Verificar

```bash
pnpm --filter @informach/dia-de-estrela typecheck
pnpm --filter @informach/dia-de-estrela test              # domínio, PIN, arquivos, contraste…
DATABASE_URL=… pnpm --filter @informach/dia-de-estrela test:integration   # Postgres descartável
DATABASE_URL=… pnpm --filter @informach/dia-de-estrela e2e                # build + Playwright
pnpm exec biome check apps/dia-de-estrela
```

O E2E roda a jornada completa (cadastro, primeiro uso, tarefa, pareamento por código, lembrete, passo a passo, aprovação, bônus, loja, PIN) e o "Quem está usando?" em computador, celular (Pixel 7) e tablet deitado (1194×834), e salva as telas em `tmp/telas`.

## Estrutura

- `src/domain`: lógica pura (motor do dia, relógio da casa, estrelas, rotinas prontas), com testes.
- `src/features/<área>`: `repository.ts` (banco), `actions.ts` (server actions), `components/` (telas), por área: `familia`, `aparelho`, `crianca`, `pais`, `rotina`, `estrelas`, `loja`, `lembretes`, `responsavel`, `tempo-real`, `arquivos`, `billing`, `acesso`.
- `src/app/(pais)`: Início, Rotinas, Cofrinho e Ajustes (adulto com conta ou PIN no aparelho).
- `src/app/crianca`: Quem está usando, Hoje, Cofrinho, Loja e PIN (só aparelho conectado).
- `src/app/api`: auth, aparelho (conectar, entrar, sinal), eventos (SSE), voz, foto da meta, exportar, jobs, webhooks, health e ready.
- Schema `dia_de_estrela` em `packages/db/src/schema/dia-de-estrela.ts`, migração `0078_dia_de_estrela`.
