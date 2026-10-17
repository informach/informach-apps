# Contexto e regras do repositório

Este é o ponto de entrada permanente para trabalhar no repositório `informach-apps`, também chamado historicamente de `informach-platform`. Leia este guia antes de alterar arquivos. O [estado do trabalho](docs/estado-do-repositorio.md) registra a frente atual e aponta para as pendências, sem misturar trabalho em andamento com regras permanentes.

## Antes de começar

1. Confira a branch, `git status` e o diff. Preserve alterações existentes; não assuma que pertencem à tarefa atual.
2. Leia o estado do trabalho e os guias da área afetada. Use o contexto já documentado; não peça ao usuário para explicar novamente o repositório ou os provedores.
3. Confira scripts e versões nos manifests, no lockfile e nos workflows. Documentação de versões candidatas não autoriza atualizar dependências automaticamente.
4. Identifique quais apps consomem um package antes de mudá-lo. Alterações compartilhadas precisam verificar os consumidores afetados.
5. Confira acesso e estado dos serviços antes de ações operacionais. Ter um runbook ou uma variável configurada não comprova conexão, deploy ou funcionamento em produção.

As instruções locais de `AGENTS.md` e `CLAUDE.md` complementam este guia dentro de suas áreas. Decisões atuais e guias específicos prevalecem sobre resumos antigos; divergências devem ser corrigidas e registradas, não resolvidas por suposição. O pedido atual do usuário define o escopo e a autorização da tarefa.

## Mapa dos produtos

O código fica no repositório privado `informach/informach-apps`. Os aplicativos web são serviços separados no Railway, no projeto `informach-apps`, com o domínio da casa `informach.com.br` e subdomínios por produto. Reutilize a infraestrutura existente quando o contrato permitir; não proponha outro provedor ou outro banco como padrão.

| Diretório | Papel | Desenvolvimento local |
| --- | --- | --- |
| `apps/agenda-da-turma` | Rotina escolar, titular, perfis de crianças e adultos convidados com permissões por criança; sem Better Auth organizations | Porta 3001 |
| `apps/cozya` | Receitas, planejamento de refeições e compras; conta individual, sem organizations | Porta 3002 |
| `apps/admin` | Scaffold administrativo, ainda sem integração completa de auth, billing e banco | Porta 3003 |
| `apps/informach-site` | Site institucional, termos e privacidade; sem auth, billing, banco ou IA | Porta 3004 |
| `apps/missao-saber` | Preparação para olimpíadas escolares, com assinatura e perfis familiares | Porta 3005 |
| `apps/edi` | Portal, conta, cobrança, autenticação e licenças da suíte Edi; destino `edi.informach.com.br` no Railway | Porta 3006; implantação pendente conforme runbook |
| `apps/edi-hub` | Central desktop de instalação, acesso e atualização da suíte | Electron, sem porta web fixa |
| `apps/ediaula`, `apps/edicaptura`, `apps/edifoto`, `apps/edipdf`, `apps/edisvg` | Cinco ferramentas criativas em desenvolvimento | Electron, sem porta web fixa |

O cadastro de apps web fica em `packages/config/src/apps.ts` e `domains.ts`. O catálogo desktop, as identidades Windows e a participação na suíte ficam em `packages/config/src/edi-tools.ts`. Não criar listas paralelas como fonte de verdade.

## Arquitetura e responsabilidades

- Monorepo pnpm + Turborepo. Apps vivem em `apps/`; bibliotecas internas, em `packages/`, com scope `@informach/*` e dependências `workspace:*`.
- Apps não importam apps. Packages não importam apps. Packages expõem contratos por `exports` e são consumidos como TypeScript fonte, sem build ou `dist/` versionado próprio.
- Apps web usam Next.js App Router e React. Rotas e Server Actions concretas ficam no app; domínio, serviços, repositórios e testes são agrupados por funcionalidade. Adapters Next de packages ficam em subpaths apropriados.
- Desktop usa Electron, main/preload/renderer separados e contratos compartilhados. O SDK Edi centraliza sessão, licença, integridade e atualização; não duplicar esses mecanismos em cada ferramenta.
- `@informach/db` concentra schema e migrations; `auth`, identidade; `billing`, Stripe e créditos; `emails`, envio e entrega; `ai-core`, infraestrutura IA; `config`, catálogos; `ui`, componentes e tokens.
- `edi-contracts` contém contratos públicos; `edi-desktop`, integração local; `edi-licensing`, regras e persistência exclusivas do servidor; `edi-releases`, catálogo público assinado. Desktop nunca importa banco ou segredos de servidor.
- PostgreSQL é compartilhado, com schemas por domínio. Isolamento de conta, app e permissões deve aparecer nas consultas, não apenas na interface. A existência de RBAC genérico não substitui permissões específicas por criança ou dispositivo.
- Better Auth, Stripe, SendGrid, Redis e Sentry seguem os contratos dos packages e de cada app. Providers e variáveis são configurados na composição do app; não duplicar clientes ou políticas comerciais em componentes.
- IA paga passa pela reserva e confirmação/liberação de créditos, preservando o `runId` entre billing, execução e telemetria. Não embutir credenciais nos clientes.

## Onde ler os detalhes

| Trabalho | Referência |
| --- | --- |
| Estrutura, dependências e CI/CD | [Arquitetura do monorepo](docs/arquitetura-monorepo.md) |
| Organização e contratos dos packages | [Arquitetura dos packages](docs/arquitetura-packages.md) e `packages/<package>/CLAUDE.md`, quando existir |
| Apps Next.js | [Arquitetura web](docs/arquitetura-apps.md), [regras dos apps](apps/AGENTS.md) e guia local |
| Ferramentas Electron e novas ferramentas Edi | [Arquitetura desktop](docs/arquitetura-desktop.md) e [regras dos apps](apps/AGENTS.md) |
| Executar, desenvolver e testar o Hub e as ferramentas | [Guia de desenvolvimento Edi](docs/desenvolvimento-edi.md) |
| Auditoria, dados pessoais e logs | [Política de auditoria](docs/audit-payload-policy.md) |
| Deploy, provedores e migrations em produção | [Runbook de deploy](docs/deploy-runbook.md) e configuração Railway do app |
| Missão Saber publicado | [Operação do Missão Saber](apps/missao-saber/PRODUCAO.md) |
| Portal Edi e implantação | [Operação do Edi](apps/edi/PRODUCAO.md) |
| Instaladores e atualizações Edi | [Distribuição do piloto](docs/propostas/edi-suite-2026-10-16/distribuicao-piloto.md) |
| Lotes, evidências e pendências Edi | [Implementação da suíte](docs/propostas/edi-suite-2026-10-16/implementacao.md) |

Consulte também os guias locais de [Agenda da Turma](apps/agenda-da-turma/CLAUDE.md), [Cozya](apps/cozya/CLAUDE.md) e [site institucional](apps/informach-site/CLAUDE.md) quando essas áreas forem afetadas. Não carregar todos os históricos de propostas para uma alteração pequena.

## Ambiente e comandos

`package.json` define `engines`, `packageManager` e scripts; `pnpm-lock.yaml` fixa a resolução; os workflows indicam o ambiente verificado. `.nvmrc`, manifest e CI usam Node 24.15.0. Não usar uma versão menor só porque aparece em um guia antigo. Tratar divergências de configuração explicitamente.

- Instalação reproduzível: `pnpm install --frozen-lockfile`.
- Web por app: `pnpm dev:<app>`, `pnpm build:<app>`, `pnpm start:<app>`, conforme scripts existentes na raiz.
- Desktop por app: `pnpm --filter @informach/<app> dev` ou `build`, conforme o manifest do app.
- Qualidade transversal: `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Biome é o padrão de lint/formatação; não introduzir outro linter por ferramenta.
- Teste focado: `pnpm --filter @informach/<workspace> exec vitest run <arquivo>`; E2E seguem os scripts próprios de cada app.
- Migrations: `pnpm db:generate` e `pnpm db:migrate`. O segundo também executa o backfill de tarefas e a inicialização do storage Mastra definidos no script da raiz.
- Edi no Windows: `pnpm edi:test:integration`, `pnpm edi:test:native` e `pnpm edi:test:package --installer`. O smoke HTTP standalone usa `pnpm build:edi` seguido de `pnpm edi:test:integration --portal`.

Escolha verificações proporcionais à mudança. Testes de interface e banco usam perfis, arquivos e bases isolados; não reutilize dados de produção. Mudança apenas documental exige revisão de fatos, caminhos, links e diff, não uma alegação de nova homologação funcional.

## Deploy e segurança operacional

- Cada web app tem sua configuração Railway versionada e usa a raiz do monorepo. O Edi e seu cron usam `.railway/railway.ts` (IaC, parcial `edi`); os demais mantêm suas configurações existentes. Revisar o plano do Railway antes de aplicar e rejeitar alterações em recursos fora da frente. Respeite `PORT`, a interface de rede e o start standalone adotado pelo app. Não alterar serviços existentes para adaptar um novo produto.
- O migrator compartilhado é separado dos apps. `/api/ready` protege a promoção de um build cujo banco esteja atrás; `/api/health` identifica o processo/commit e não comprova prontidão do banco. Não remover essa barreira para passar um deploy.
- Mudanças de schema passam pelo fluxo Drizzle e por revisão de compatibilidade. Não reescrever migrations aplicadas nem usar `db:push` em produção. `ai_mastra` pertence ao Mastra e fica fora do `schemaFilter` do Drizzle.
- Segredos ficam no provedor ou em arquivos locais ignorados, nunca em documentação, histórico Git, logs, screenshots, renderer ou `NEXT_PUBLIC_*`. Documente nomes, finalidade e local de configuração, não valores.
- Webhooks verificam assinatura antes de efeitos e precisam de idempotência. O acesso depende da regra comercial do produto: no Edi, fatos de pagamento e licença assinada, não apenas `status === "active"`.
- A suíte Edi usa GitHub Releases público em `informach/edi-releases` somente para instaladores e manifesto. O código permanece privado. O ambiente de publicação é `edi-release` do repositório de código.
- No piloto Edi aprovado, assinaturas criptográficas próprias Ed25519 substituem a contratação de Authenticode/CDN; não equivalem a publicador certificado pelo Windows. Isso não remove a assinatura comercial Stripe nem autoriza desligar proteções do sistema.
- Uma nova versão desktop é publicada pelo fluxo de tag/release `edi-v*`, não por qualquer push de código. A atualização não força o fechamento de trabalhos abertos. Login, licença e Stripe dependem do portal/backend Railway, não do GitHub.
- Implementação, testes locais, configuração remota, deploy, publicação e cobrança são estados distintos. Confirme cada um antes de declarar sucesso. Commit, merge e push exigem autorização da tarefa e os gates acordados; não forçar merge com falhas ocultas.

## Manutenção obrigatória da documentação

Atualizar a documentação faz parte da entrega, na mesma alteração que modifica o comportamento ou a operação. Não deixar esse trabalho para uma futura explicação do usuário.

- **Regras comuns, provedores ou organização:** atualizar este `AGENTS.md` e a referência de arquitetura afetada. `CLAUDE.md` deve apontar para este guia, sem criar uma política concorrente.
- **Domínio, deploy, variáveis, scripts, migrations ou integração:** atualizar o runbook/guia da área e os exemplos seguros correspondentes. Conferir os comandos contra o manifest e os caminhos contra o checkout.
- **Decisão de produto ou segurança:** registrar motivo, escopo e condições no documento da frente; atualizar a orientação vigente quando substituir uma decisão anterior.
- **Andamento ou passagem de sessão:** atualizar `docs/estado-do-repositorio.md` e o registro detalhado da frente, com a data, o que está implementado/verificado, pendências e próximo passo. Contagens e evidências ficam no registro detalhado, não copiadas em todos os guias.
- **Fim da tarefa:** revisar se documentação, código e configuração continuam coerentes; preservar mudanças não relacionadas. Informar verificações realmente executadas e limitações, sem chamar proposta ou preparação de sistema concluído.

Antes de perguntar por um dado, consultar sua referência. Perguntar somente por decisões novas, informação realmente ausente ou acesso que não está disponível; nunca solicitar que o usuário cole segredos no chat.
