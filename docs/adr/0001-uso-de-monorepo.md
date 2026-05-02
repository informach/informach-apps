# 0001 — Uso de monorepo para a plataforma informach

- **Status:** Aceita
- **Data:** 2026-05-01
- **Decisores:** Time de plataforma

## Contexto

A plataforma informach abriga múltiplos produtos web independentes (`agenda-da-turma`, `cozya`, `admin`, e outros que possam surgir) que compartilham fundações comuns: autenticação, billing, banco de dados, design system, telemetria. Precisamos decidir como organizar esses produtos no controle de versão e na tooling.

Duas alternativas foram consideradas:

1. **Repositórios separados** com pacotes publicados via registry interno.
2. **Monorepo único** com workspaces e task runner.

## Decisão

Adotar **monorepo único** gerenciado por `pnpm` workspaces + Turborepo, com layout fixo em `apps/*` (deployáveis) e `packages/*` (bibliotecas internas, nunca publicadas).

## Justificativa

- Mudança em `packages/billing` que afeta três apps sai num único PR, com tipos atualizados em todos os consumidores e uma rodada de CI.
- Refatorações cross-app são triviais; o histórico fica unificado.
- `workspace:*` elimina cerimônia de versionamento interno.
- Turborepo cobre cache local + remoto e detecta ciclos de dependência.

## Consequências

- **Aceitas:** tooling mais sofisticado (workspace manager + task runner) e blast radius maior em mudanças de configuração compartilhada.
- **Mitigações:** Turborepo paraleliza e cacheia builds; CI verde é gate obrigatório para merge.
- Apps **não** podem importar de outros apps (lógica compartilhada vira package). Packages **não** podem importar de apps.

## Referências

- `docs/arquitetura-monorepo.md` — referência transversal completa.
- `docs/arquitetura-apps.md` — convenções por app.
- `docs/arquitetura-packages.md` — convenções por package.
