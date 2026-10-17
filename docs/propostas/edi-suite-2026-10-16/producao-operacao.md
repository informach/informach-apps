# Operação e provisionamento Edi — 17/10/2026

Pedido vigente: corrigir os bloqueios e colocar o Hub em produção. Este registro separa configuração remota de implantação e testes efetivamente executados. A branch de implementação é `fix/edi-production`; ainda não houve publicação desktop nesta etapa.

## Infraestrutura provisionada

Projeto Railway `informach-apps` (`f4da4285-5b98-48b5-b03e-5be02f4e7c56`), ambiente `production` (`174b2cb0-e1cd-410c-8764-d913e3af18d3`).

| Recurso | Identidade | Estado nesta etapa |
| --- | --- | --- |
| Portal `@informach/edi` | `da22f05d-2044-445b-bcb2-8e2d0d0c73ce` | Criado; build/start/pre-deploy e variáveis configurados; deploy final pendente |
| `cron-edi-reconcile` | `71ccb512-eb51-470d-b6ef-e5adb3af4bad` | Criado, agenda `*/5 * * * *`, sem imagem ativa antes da validação da cobrança |
| PostgreSQL compartilhado | serviço `Postgres` existente | Conexão privada do Edi resolvida; leitura operacional confirmou migration `0068` e ausência das tabelas Edi antes do migrator |
| Migrator compartilhado | `82e23ee0-49ab-4046-90c3-6a0b6dd677e1` | Migrations `0069`–`0071` ainda precisam ser aplicadas |
| Sentry | projeto `edi`, organização Informach existente | Projeto/DSN e alerta padrão criados; instrumentação implementada e testada; ingestão real depende do deploy |

O Edi usa o mesmo PostgreSQL, com tabelas nos schemas de identidade/cobrança/Edi. Não exige Redis: rate limiting de autenticação persiste no PostgreSQL. O migrator escreve no banco, sem uma conexão direta portal→migrator. O cron usa `CRON_SECRET` por referência ao Edi e faz POST em `/api/jobs/reconcile`, com timeout de 60 segundos e falha HTTP não mascarada.

A configuração SendGrid foi inicialmente referenciada ao Cozya, depois copiada para uma variável independente do Edi para eliminar essa dependência entre serviços. A conta provedora é reutilizada. Consulta real confirmou `informach.com.br` validado no SendGrid e webhook de entrega compartilhado ativo em `cozya.informach.com.br`; seu handler verifica a assinatura antes de persistir os eventos no banco compartilhado. Ainda falta confirmar uma entrega OTP do Edi ao destinatário autorizado.

O domínio `edi.informach.com.br` foi adicionado com destino `6u2rq0z9.up.railway.app`. O titular criou CNAME/TXT na Cloudflare. A propriedade e o certificado TLS foram validados pelo Railway; o proxy Cloudflare foi identificado durante a propagação e foi solicitado ajuste para Somente DNS. Isso não comprova a prontidão HTTP do portal.

O primeiro deploy do código anterior (`f3bfbd3`) foi acionado durante a configuração e falhou no pre-deploy OAuth com `ZodError`, antes da configuração completa de segredos. Não houve promoção saudável. O próximo deploy deve usar o commit corrigido após o migrator.

A configuração passou para `.railway/railway.ts` após a API rejeitar o Config Path TOML. O plano foi revisado sem exclusões nem mudanças em outros serviços. A aplicação `iac-change-set/174b2cb0-e1cd-410c-8764-d913e3af18d3/5fd6a2efa00f19ac935024ab54d99f28` confirmou somente espera de checks do GitHub, reinício por falha e serviço sem suspensão automática. A configuração declara a parcial `edi`; a consulta de ownership ainda não listou propriedade persistida. Isso não equivale a um deploy saudável.

## Evidências locais e pendências

O commit `3c90cdc` foi publicado na branch `fix/edi-production` e abriu o [PR #6](https://github.com/informach/informach-apps/pull/6) em draft. A alteração pessoal em `.claude/settings.local.json` ficou fora do commit. Os workflows de CI, banco, Electron e mídia/upgrade Windows foram iniciados no GitHub; os resultados remotos ainda precisam ser conferidos antes do merge.

A primeira execução remota aprovou [banco/portal](https://github.com/informach/informach-apps/actions/runs/39025609082) e [Electron nos seis apps](https://github.com/informach/informach-apps/actions/runs/39025609077). O [CI geral](https://github.com/informach/informach-apps/actions/runs/39025609141) passou em lint/tipos e encontrou sete falhas de transição no FFmpeg Linux. A causa foi reproduzida em Docker e corrigida na ordem de extensão do último quadro; testes originais mantidos e cobertura acrescentada para velocidades 0,5×/2×. Depois da correção, os quatro gates locais gerais foram repetidos com exit 0: 21 tarefas de tipos, 19 de testes mais 31 testes do tooling e 12 builds; o lint manteve 462 warnings e 66 infos, sem erros. A suíte de mídia própria passou com 173 testes. Detalhes e limites em [producao-windows.md](producao-windows.md); o CI remoto do novo commit ainda precisa passar.

No commit `89b84fa`, o [segundo CI](https://github.com/informach/informach-apps/actions/runs/39026445657) aprovou os testes gerais, migrations e integração Cozya, mas três suítes da integração Missão Saber falharam ao importar o template TSX de e-mail. A falha foi reproduzida localmente: os configs de integração/ferramentas ainda selecionavam JSX pelo transformador antigo, enquanto o lockfile usa Vite 8. Os três configs agora usam Oxc com runtime automático. A integração completa passou com 25 arquivos e 104 testes em PostgreSQL local descartável, removido ao final. Não houve alteração de regras comerciais ou dados dos produtos existentes. O PR foi retirado de draft para revisão; merge e implantação continuam condicionados aos checks remotos.

A revisão automática CodeRabbit não foi executada: o serviço informou limite de arquivos/capacidade do plano. Seu status não representa aprovação de código. A inspeção final dos contratos, licença, SDK e adaptações dos editores encontrou duas corridas de finalização no EdiCaptura, corrigidas com três regressões que falharam antes e passaram depois. A suíte completa do aplicativo passou com 43 testes; detalhes em [producao-jobs.md](producao-jobs.md). Essa inspeção não substitui a homologação de hardware e de todas as funcionalidades legadas.

O titular confirmou uma sessão paralela de identidade visual no checkout original. As correções finais de produção passaram a ser verificadas em checkout isolado, preservando manifests, lockfile e componentes em edição pela outra sessão. Essas alterações visuais não devem ser incorporadas ao PR operacional sem a sua própria revisão e verificação.

- `pnpm build:edi`: exit 0, standalone e pre-deploy empacotados.
- `pnpm edi:test:integration --portal`: exit 0; 3 testes auth, 12 licença/dispositivo e 7 cobrança/concorrência, migrations completas em PostgreSQL descartável; pre-deploy repetido e encerramento da conexão; readiness, página, 10 assets, sessão, conta, device flow e cobrança desabilitada por HTTP.
- Backup `age` recuperado em processo separado e corrupção rejeitada, conforme [distribuição](distribuicao-piloto.md).
- Rodada geral final antes do PR, após as correções Stripe e de exportação/empacotamento: `pnpm check` exit 0 (2.110 arquivos; 462 warnings e 66 infos, nenhum erro); `pnpm typecheck` exit 0 (21 tarefas e tooling); `pnpm test` exit 0 (19 tarefas e 31 testes do tooling); `pnpm build` exit 0 (12 tarefas, com variáveis fictícias de build equivalentes ao CI, sem credenciais reais); `pnpm audit --prod` sem vulnerabilidades conhecidas. Os avisos não foram ocultados nem convertidos em uma alegação de lint sem warnings. A [verificação Windows](producao-windows.md) registra separadamente a suíte com o bundle próprio e os layouts NSIS; o CI ainda precisa instalar e atualizar os seis apps.
- `pnpm edi:test:native`: exit 0 nos seis apps; gate, licença offline assinada, expiração e bloqueio de IPC com perfis e chaves efêmeros, sem instalação/publicação.
- Não há cobrança real de teste, instalação em perfis pessoais nem release público nesta etapa.
- O [guia de desenvolvimento](../../desenvolvimento-edi.md) solicitado pelo titular foi criado e ligado às referências permanentes. Revisão documental confirmou 14 links locais, 59 referências de comandos e 16 blocos PowerShell; o exemplo de geração Ed25519 foi executado em fixture e recusou sobrescrita sem alterar a identidade. Isso não é uma alegação de nova homologação funcional.

## Integração do conjunto visual autorizado

Em 17/10, o titular autorizou incluir na próxima subida os trabalhos da sessão paralela e confirmou o conjunto como finalizado: identidade/páginas/Hub Edi, home institucional, conteúdo legal e contato público por Instagram. Foi capturado um snapshot de 132 arquivos (80 alterações rastreadas e 52 novos arquivos), excluindo `.claude/settings.local.json`. A integração ocorreu no worktree isolado, preservando o checkout original e as correções de produção posteriores ao ponto de origem. Nos três conflitos do SDK/Hub, foram mantidos tanto o adapter de filesystem físico quanto o progresso de instalação.

O conjunto integrado passou `pnpm install --frozen-lockfile`, `pnpm check` (461 warnings e 66 infos, sem erros), `pnpm typecheck`, `pnpm test`, `pnpm build` e `pnpm audit --prod` sem vulnerabilidades conhecidas. A integração PostgreSQL descartável passou 22 testes e o smoke standalone, agora verificando também os retornos de cadastro aos planos mensal/anual. O ciclo nativo dos seis apps passou com a nova interface; a regressão do launcher Windows é registrada separadamente no documento Windows.

A inspeção no Chromium verificou home, login, cadastro, conexão e downloads Edi em 1440 e 390 px: dez combinações com HTTP 200, sem erro JavaScript nem rolagem horizontal, incluindo alternância de preço e abas de autenticação. Home, Termos e Privacidade institucionais passaram nas duas larguras, incluindo os cinco painéis de escolha, navegação do menu móvel, imagens carregadas e ausência de links públicos `mailto:`. Capturas e logs ficam em `.cache/edi-production/design-browser/`, `design-browser.log` e `design-site-browser.log`. Esses testes usam banco/perfis descartáveis e não enviam e-mails nem cobram. Os gates remotos precisam aprovar o commit integrado antes do merge/deploy.

## Complemento da sessão paralela

O titular pediu a inclusão de mais alterações antes da publicação. Um segundo snapshot, com 61 arquivos incrementais em relação ao primeiro, foi capturado sem modificar o checkout de origem. O lote traz estados e ações de acesso do Hub, mensagens de falha, limites de dispositivos lidos do contrato, refinamentos de acessibilidade e conteúdo do portal/site, ícones Windows e desativação dos traces de conteúdo dos agentes da Agenda. Não houve exclusão de registros históricos do banco. Os dois conflitos em testes foram conciliados mantendo a leitura física do ASAR e a proteção de conta/retorno aos planos.

A revisão da integração identificou uma corrida entre a consulta inicial da versão e a aquisição da trava: outro atualizador podia concluir nesse intervalo e a versão anterior ainda seria instalada. A versão assinada passa a ser relida sob a trava antes do download. A regressão usa arquivos, assinaturas e locks reais, falha antes da correção e passa depois. A consulta antecipada continua evitando pedir o fechamento de uma ferramenta aberta que já está atualizada. O Hub também informa uma falha ao sair quando não consegue acessar o cofre local. A abertura de ferramentas pelo Hub foi corrigida e verificada com Electron real, conforme o [registro Windows](producao-windows.md#abertura-de-ferramentas-pelo-hub).

Depois das correções, `pnpm check` passou (2.161 arquivos, 461 warnings e 66 infos, nenhum erro), `pnpm typecheck` passou (21 tarefas e tooling), `pnpm test` passou (19 tarefas e 31 testes do tooling) e `pnpm build` passou (12 tarefas). O smoke Chromium foi repetido nas dez combinações Edi e seis institucionais, sem erros JavaScript nem overflow; o mesmo harness executou os 22 testes PostgreSQL e o standalone com 11 assets. `pnpm edi:test:native` passou a verificação física de inventário, os dois launchers GUI e o ciclo de licença dos seis aplicativos. Logs: `.cache/edi-production/design2-final-*.log`, `design2-browser-{portal,site}.log` e `native-manager-full-final.log`; capturas em `design2-browser/`. A conferência de origem confirmou 145 arquivos capturados preservados, incluindo o complemento documental recebido depois do segundo snapshot. Esses resultados permitem enviar a revisão ao CI; os gates remotos do novo commit, merge e produção continuam pendentes.

O site institucional agora observa mudanças em `@informach/config`, `@informach/ui` e nos arquivos raiz de build pelo `watchPatterns` versionado, além dos próprios arquivos. Isso acompanha a nova dependência de preços, domínios e contato centralizados. Os crons genéricos e a exceção de reconciliação Edi foram conciliados no runbook compartilhado.

## Imagem Stripe

Arquivo final: `apps/edi/public/images/edi-suite-product.png` (PNG 1254 × 1254, 75.581 bytes), destinado à URL `https://edi.informach.com.br/images/edi-suite-product.png`. Em 17/10/2026 a imagem anterior, gerada por `image_gen` na paleta antiga, foi substituída por uma composição da nova identidade: mesa escura com grade, logotipo "edi" com as cinco barras, a frase "Cinco ferramentas, uma bancada." e os cinco ícones da suíte. Ela foi renderizada no Chromium a partir dos mesmos glifos de `packages/config/src/edi-brand.ts` e das fontes da suíte, sem preços, selos ou alegações funcionais. A associação nos produtos teste/produção continua dependendo de confirmação pelo Stripe CLI após a imagem responder publicamente com HTTP 200.
