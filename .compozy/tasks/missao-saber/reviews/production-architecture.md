# Revisão independente da arquitetura de produção

Data: 13/09/2026. Escopo: preparação do primeiro deploy do Missão Saber, com Stripe de teste local e real em produção, conforme instrução do usuário. Esta revisão não executou mutações em infraestrutura nem em código-fonte.

## Estado da revisão

Parecer final favorável à arquitetura revisada: três achados novos registrados em [reviews-008](../reviews-008/_meta.md), um alto e dois médios, foram corrigidos e relidos. Rodada encerrada com três resolvidos e zero pendentes. Não foram encontrados novos bloqueadores no delta final. Recomendação da revisão: **Clean — ready to merge** no escopo revisado; a promoção em produção continua sujeita à conclusão dos builds e das verificações operacionais do deploy. Este documento não atesta um deploy concluído nem aprovação editorial humana.

## Escopo e dependências

Aplicadas as skills `cy-review-round` e `cy-final-verify`. Foram lidos PRD, TechSpec, tarefas, ADR 0001 e os 23 achados resolvidos das rodadas anteriores para deduplicação. O explorador independente `production_map`, exigido pela skill, mapeou os imports e a propriedade dos invariantes. O review priorizou configuração de ambiente, autenticação/Redis, Sentry, auditoria, ações, readiness, jobs, reconciliação de cobrança, portal dedicado e persistência do envelope dos e-mails.

- O app valida os valores do ambiente antes de inicializar os serviços. A produção exige origens HTTPS iguais, Stripe real, e-mail real, Redis, Sentry, webhook de e-mail assinado, quatro preços e configuração própria do Portal.
- Better Auth usa o Redis com prefixo do app e limites explícitos nos endpoints de autenticação. A implementação mantém o modo de exclusão global desabilitado conforme a decisão arquitetural já existente.
- Jobs de cobrança têm autorização por segredo, lease Redis e checkpoint com verificação de propriedade. Os cursores são por ID e reiniciam após o ciclo; os locks PostgreSQL por responsável continuam cobrindo releitura, chamada remota e gravação. O lock de manutenção não substitui o lock de ciclo de vida.
- A migração 0043 adiciona três colunas nullable ao envelope de e-mail e não apaga dados. O retry recupera remetente e link assinado de origem, relevante porque a fila é compartilhada entre apps. Migrations precisam anteceder o código novo em produção.
- Instrumentações cliente, servidor e edge passam eventos de erro pelo sanitizador. Usuário, corpo, cookies, extras, breadcrumbs, variáveis de stack e parâmetros SQL são removidos. Replay e tracing estão desativados. O túnel do Sentry respeita a política de conexão same-origin do app.

## Achados registrados

1. [Issue 001, alta — resolvida](../reviews-008/issue_001.md): a reconciliação recupera preço/plano usando detalhes remotos e catálogo do modo vigente. Preço desconhecido não ativa nem estende Pro com o produto antigo, mas ainda permite aplicar revogação/cancelamento.
2. [Issue 002, média — resolvida](../reviews-008/issue_002.md): hooks explícitos por chamada observam falhas de auditoria sem depender da inicialização de outra rota, preservando o comportamento best-effort e a compatibilidade dos outros apps.
3. [Issue 003, média — resolvida](../reviews-008/issue_003.md): as boundaries existente e global capturam exceções de render no Sentry, conservando o sanitizador e a recuperação em português sem exibir detalhes da exceção.

## Correções durante a revisão e observações

- A query global de retry incluía e-mails de autenticação sem corpo persistido antes de aplicar `LIMIT`, permitindo que registros não reenviáveis ocupassem indefinidamente a primeira página. Foram adicionados filtros de categoria/corpo na query; a integração confirmou que um recibo posterior a 55 OTPs sem corpo é reenviado com o envelope correto.
- O retry global não pode contornar a coordenação do dunning corrigida na rodada 007. A categoria `billing.payment-failed` foi excluída do retry genérico, deixando a regeneração para o job que valida estado e mantém o lock de ciclo de vida.
- `customArgs.informach_category` foi padronizado no primeiro envio e no retry. Não se registrou uma suposta rejeição HTTP400: a [referência primária do SendGrid](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event) descreve sobrescrita de argumentos com nomes reservados no webhook, e o parser já aceita a categoria nativa em array.
- A configuração Railway histórica apontava `/api/health`. O agente principal configurou o novo serviço via API com `/api/ready`. A promoção e o estado publicado precisam ser confirmados no relatório de deploy. Os processadores de e-mail já ativos em Cozya/Agenda também precisam receber o código compartilhado novo antes de processarem o envelope do Missão; o agente principal informou que esses builds estão em andamento.
- O timeout da Stripe foi explicitado em 30 segundos com dois retries para limitar o trabalho remoto frente ao lease de manutenção. A retomada não grava checkpoints depois de perder a posse do lease.
- Nenhuma revisão pedagógica humana foi simulada. A configuração financeira real não remove o bloqueio editorial de comercialização.

## Evidências de verificação

`make lint` não executou porque `make` não está instalado neste Windows; o repositório usa Biome. O check inicial durante a edição encontrou erros de formatação, sem gerar achados de estilo. A execução independente final de Biome conferiu 13 arquivos alterados e terminou com `Checked 13 files in 30ms. No fixes applied.`, exit 0.

O validador inicialmente aceitava o placeholder `price_TODO`; a falha observada no teste foi corrigida reutilizando a validação de preços do package config. A nova execução independente de `pnpm --filter @informach/missao-saber test -- src/lib/environment.test.ts src/lib/telemetry.test.ts` aprovou os 15 testes, exit 0. `pnpm --filter @informach/billing test -- src/__tests__/sweepers-reconcile.test.ts src/__tests__/sweepers.test.ts` aprovou os 18 testes existentes, exit 0.

`pnpm --filter @informach/missao-saber test:integration` aprovou quatro arquivos e 30 testes, incluindo os três novos contratos de produção: 23 assinaturas percorridas em páginas com recuperação de plano, revogação com preço desconhecido, fila com 55 OTPs sem corpo e envelope do app de origem, e identidade editorial verificada. As migrations foram aplicadas ao banco local descartável `missao_review_985e0b3f796b4d319c0ad431771f3270`, removido no final. Notices históricos do PostgreSQL trataram extensões já existentes e truncagem de nome de uma constraint; nenhum erro de migration ocorreu.

O novo `pnpm --filter @informach/missao-saber typecheck` também terminou com exit 0. Na revisão final foram relidos o guard que bloqueia estados Pro quando o preço é desconhecido, a regressão de 23 assinaturas `unpaid` sem nova concessão e os testes de auditoria sem inicialização de auth. As boundaries de erro com captura Sentry e os hooks explícitos também foram conferidos.

Após esse delta, o agente principal informou nova execução aprovada de `pnpm test` (sete tarefas, incluindo 47 testes do app, 193 do billing, 107 de e-mails e os dois novos de auditoria), `pnpm typecheck` (12 packages) e integração (30 testes). Essa evidência é identificada como execução do agente principal; não foi duplicada pelo revisor. O revisor conferiu novamente o código, os testes relevantes e o check focado. O check global do workspace possuía falhas históricas fora do escopo na verificação anterior; este parecer não declara esse gate global limpo.

O agente principal informou que as migrations de produção 0040–0043 foram aplicadas após restauração de backup para verificação. O revisor não executou nem certificou de forma independente as operações externas; o relatório de deploy deve registrar o resultado dos serviços e das verificações publicadas.

## Complemento após o primeiro smoke de produção

Foram relidos os deltas limitados solicitados pelo agente principal, sem novo achado e sem criação de rodada vazia. A rodada 008 permanece com três resolvidos e zero pendentes.

- `next.config.ts` remove `output: standalone`, tornando a saída coerente com o comando de execução `next start` usado pelo serviço.
- `requirePageUser` aponta para `redirectIfUnauthenticated` do helper compartilhado. As cinco páginas afetadas usam o mesmo `getCurrentUser`, incluindo a filtragem de usuário banido; a ausência de sessão resulta em redirecionamento. Actions e API continuam usando o helper que lança `UnauthorizedError`, tratado no limite de ações. Essa mudança elimina o erro operacional espúrio produzido pela renderização paralela de layout/página, sem retirar os controles de acesso.
- O catch do webhook Stripe preserva assinatura inválida como HTTP400 e encaminha as demais exceções a `reportError`, usando o sanitizador Sentry existente. A resposta HTTP500 continua necessária para o retry do provider.
- `maintenance-cron.sh` confere `/api/ready` antes da manutenção, possui limites de conexão/duração, termina com código não zero nas falhas e envia ao Sentry mensagens constantes sem corpo de requisição, dados pedagógicos ou segredo de cron. `production.py configure-cron` injeta a versão do script na configuração, com a imagem do curl fixada por digest e agendamento de cinco minutos.

O agente principal informou a verificação do cron no container fixado: sucesso com exit 0 e falha controlada com exit 1, com recebimento confirmado do evento `MISSAO-SABER-2`, posteriormente resolvido. Informou também typecheck dos 12 packages e Biome de 148 arquivos aprovados após os deltas; E2E e smoke do segundo deploy estavam em andamento. Esses checks não foram repetidos pelo revisor. A leitura independente cobriu os helpers de autenticação, as cinco páginas, o webhook, o sanitizador, os comandos de execução e a configuração efetiva do cron.

Sentry Uptime não foi ativado porque a conta atingiu a quota. O monitor configurado é o cron no Railway; este relatório não o apresenta como um serviço externo de uptime independente do Railway. A confirmação final da versão publicada e do segundo smoke pertence ao relatório de deploy.

```text
VERIFICATION REPORT
-------------------
Claim: Arquitetura revisada sem achados pendentes; três correções relidas e artefatos da rodada 008 consistentes.
Command: Biome check focado em 13 arquivos; Python pathlib/yaml.safe_load leu issue_*.md e _meta.md, verificando nomes, frontmatter, severidades, status, contagens e links locais; releitura do delta e dos testes.
Executed: 2026-09-13, após o guard final de preço desconhecido e a conclusão das correções.
Exit code: 0
Output summary: Checked 13 files in 30ms. No fixes applied.; PASS: 3 resolved issues; metadata 3/3/0; links valid.
Warnings: make não disponível; check global com falhas históricas fora do escopo; deploy ainda em andamento.
Errors: Nenhum achado de arquitetura pendente no escopo revisado.
Verdict: PASS
```
